from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from core.openrouter import chat
from core.similarity import compute_similarity
from config import REVIEWER_MODEL

# Reuse PII patterns from context_simplifier
from agents.context_simplifier import (
    EMAIL_RE, PHONE_RE, AGE_RE, NAME_RE, LOCATION_RE, FILENAME_PATTERN
)

@dataclass
class ReviewResult:
    approved: bool
    confidence: float  # 0.0-1.0
    similarity_score: float
    checks: dict[str, bool]
    missing_items: list[str]
    reason: str
    suggestions: list[str]  # Cho retry hint


def _as_list(value: Any) -> list[str]:
    """Normalize LLM/list-like fields into a clean list of strings."""
    if value is None:
        return []
    if isinstance(value, list):
        return [_as_text(item) for item in value if _as_text(item)]
    if isinstance(value, tuple | set):
        return [_as_text(item) for item in value if _as_text(item)]
    text = _as_text(value)
    return [text] if text else []


def _as_text(value: Any) -> str:
    """Normalize LLM scalar fields so callers never receive dict/list as reason."""
    if value is None:
        return ""
    if isinstance(value, str):
        text = value.strip()
        if text.startswith("{") and text.endswith("}"):
            try:
                parsed = json.loads(text)
                return _as_text(
                    parsed.get("reason")
                    or parsed.get("explanation")
                    or parsed.get("message")
                    or parsed.get("summary")
                    or parsed
                )
            except json.JSONDecodeError:
                return text
        return text
    if isinstance(value, dict):
        for key in ("reason", "explanation", "message", "summary", "detail"):
            if key in value:
                return _as_text(value[key])
        return "; ".join(f"{key}: {_as_text(val)}" for key, val in value.items() if _as_text(val))
    if isinstance(value, list):
        return "; ".join(_as_text(item) for item in value if _as_text(item))
    return str(value).strip()


def _normalize_checks(value: Any) -> dict[str, bool]:
    """Make the LLM checks payload predictable for downstream retry logic."""
    if not isinstance(value, dict):
        return {"llm_checks_valid": False}
    return {str(key): bool(val) for key, val in value.items()}


def _agent2_payload(agent2_output: Any) -> dict[str, Any]:
    """Accept Agent2Result, top-level dict, or nested Agent 2 compressed output."""
    if hasattr(agent2_output, "sanitized_prompt"):
        compressed = getattr(agent2_output, "compressed", {}) or {}
        return {
            "sanitized_prompt": getattr(agent2_output, "sanitized_prompt", ""),
            "algorithm": getattr(agent2_output, "algorithm", "") or compressed.get("algorithm", ""),
            "compression_level": compressed.get("compression_level", ""),
            "active_files": compressed.get("active_files", []),
            "errors": compressed.get("errors", []),
            "constraints": compressed.get("constraints", []),
            "open_questions": compressed.get("open_questions", []),
            "important_symbols": compressed.get("important_symbols", []),
        }

    if isinstance(agent2_output, dict):
        compressed = agent2_output.get("compressed", {}) or {}
        source = compressed if isinstance(compressed, dict) else {}
        return {
            "sanitized_prompt": agent2_output.get("sanitized_prompt") or source.get("sanitized_prompt", ""),
            "algorithm": agent2_output.get("algorithm") or source.get("algorithm", ""),
            "compression_level": agent2_output.get("compression_level") or source.get("compression_level", ""),
            "active_files": agent2_output.get("active_files") or source.get("active_files", []),
            "errors": agent2_output.get("errors") or source.get("errors", []),
            "constraints": agent2_output.get("constraints") or source.get("constraints", []),
            "open_questions": agent2_output.get("open_questions") or source.get("open_questions", []),
            "important_symbols": agent2_output.get("important_symbols") or source.get("important_symbols", []),
        }

    return {"sanitized_prompt": str(agent2_output or "")}


def _quick_checks(original: str, sanitized: str) -> tuple[bool, ReviewResult | None]:
    """Phase 1: Hard deterministic checks."""
    
    # Empty output
    if not sanitized or len(sanitized.strip()) < 5:
        return False, ReviewResult(
            approved=False, confidence=1.0, similarity_score=0.0,
            checks={"empty": False}, missing_items=["sanitized_prompt"],
            reason="Output is empty or too short", suggestions=["Check Agent 2 pipeline"]
        )
    
    # PII remaining
    pii_patterns = [EMAIL_RE, PHONE_RE, AGE_RE, NAME_RE, LOCATION_RE]
    found_pii = []
    for pattern in pii_patterns:
        if pattern.search(sanitized):
            found_pii.append(pattern.pattern[:20] + "...")
    
    if found_pii:
        return False, ReviewResult(
            approved=False, confidence=1.0, similarity_score=0.0,
            checks={"pii_clean": False}, missing_items=found_pii,
            reason="PII detected in output", suggestions=["Increase PII masking in Agent 2"]
        )
    
    # Severe semantic drift (similarity < 0.3)
    sim = compute_similarity(original, sanitized)
    if sim < 0.3:
        return False, ReviewResult(
            approved=False, confidence=0.9, similarity_score=sim,
            checks={"semantic_similarity": False}, missing_items=["core_intent"],
            reason=f"Semantic drift too severe ({sim:.2f} < 0.3)",
            suggestions=["Agent 2 over-compressed; retry with lower threshold"]
        )
    
    return True, None  # Pass quick checks


def _extract_key_elements(text: str) -> dict[str, list[str]]:
    """Extract structured elements from text for comparison."""
    
    elements = {
        "filenames": FILENAME_PATTERN.findall(text),
        "errors": re.findall(r"\b\w*Error:?\s*[^.\n]*", text, re.IGNORECASE),
        "questions": re.findall(r"[^.?!]*\?[^.?!]*", text),
        "constraints": re.findall(
            r"\b(do not|don't|must|should|never|always|keep|preserve|maintain)\b[^.?!]*[.?!]",
            text, re.IGNORECASE
        ),
        "code_symbols": re.findall(r"\b\w+\(\s*\)", text),  # function calls
        "urls_apis": re.findall(r"\b(api|endpoint|url|http)[^\s]*", text, re.IGNORECASE),
    }
    return elements


def _missing_critical_items(original: str, sanitized: str) -> list[str]:
    """Find obvious critical items that Agent 2 should not drop."""
    original_elements = _extract_key_elements(original)
    sanitized_lower = sanitized.lower()
    missing: list[str] = []

    for category in ("filenames", "errors", "code_symbols"):
        for item in original_elements[category]:
            if item and item.lower() not in sanitized_lower:
                missing.append(f"{category}:{item}")

    for item in original_elements["constraints"]:
        # "don't know if I need X" is uncertainty, not a hard instruction constraint.
        if re.search(r"\bdon't\s+(even\s+)?know\b", item, re.IGNORECASE):
            continue
        if item and item.lower() not in sanitized_lower:
            missing.append(f"constraints:{item}")

    return missing


def _build_review_prompt(
    original: str,
    sanitized: str,
    sim_score: float,
    agent2_meta: dict[str, Any] | None = None,
) -> str:
    """Build LLM prompt for nuanced review."""
    
    orig_elems = _extract_key_elements(original)
    agent2_meta = agent2_meta or {}
    
    return f"""Compare ORIGINAL vs SANITIZED and return ONE valid JSON object only.
Do not use markdown. Do not wrap the JSON in code fences. Do not add headings.

ORIGINAL:
\"\"\"{original[:2000]}\"\"\"

SANITIZED (Agent 2 output):
\"\"\"{sanitized[:1500]}\"\"\"

Pre-computed similarity: {sim_score:.3f}

Extracted from original (for reference):
- Filenames: {orig_elems['filenames'][:10]}
- Errors: {[e[:50] for e in orig_elems['errors'][:5]]}
- Constraints: {orig_elems['constraints'][:5]}
- Questions: {orig_elems['questions'][:3]}

Agent 2 metadata:
- Algorithm: {agent2_meta.get('algorithm', '')}
- Compression level: {agent2_meta.get('compression_level', '')}
- Active files: {agent2_meta.get('active_files', [])}
- Errors: {agent2_meta.get('errors', [])}
- Constraints: {agent2_meta.get('constraints', [])}
- Open questions: {agent2_meta.get('open_questions', [])}
- Important symbols: {agent2_meta.get('important_symbols', [])}

Rules:
1. INTENT: Does sanitized capture the core request/question? (If original asks about weather, sanitized must mention weather)
2. FILES: Are all actively referenced filenames preserved?
3. ERRORS: Are error messages/stack traces kept?
4. CONSTRAINTS: Are "do not/must/keep" requirements preserved?
5. TECHNICAL: Are API names, function calls, important symbols intact?

Decision:
- APPROVE only if ALL critical elements preserved
- FAIL if any constraint dropped or core intent changed

Return exactly this JSON shape:
{{
  "approved": true,
  "confidence": 0.8,
  "checks": {{
    "intent_preserved": true,
    "files_preserved": true,
    "errors_preserved": true,
    "constraints_preserved": true,
    "technical_symbols_intact": true
  }},
  "missing_items": ["specific items Agent 2 dropped"],
  "false_positives": ["items Agent 2 kept that should be dropped"],
  "reason": "one plain-text sentence, not a JSON object",
  "retry_suggestion": "one plain-text hint for Agent 2, not a JSON object"
}}"""


def _extract_json_from_response(text: str) -> dict:
    """Extract JSON from LLM response, stripping markdown fences and thinking tags."""
    body = text.strip()
    # Strip <think>...</think> blocks (qwen3)
    body = re.sub(r"<think>.*?</think>", "", body, flags=re.DOTALL).strip()

    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", body, flags=re.DOTALL)
    if fenced:
        body = fenced.group(1).strip()

    # Find the JSON object
    start = body.find("{")
    end = body.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise json.JSONDecodeError("No JSON object found", body, 0)
    return json.loads(body[start : end + 1])


def _fallback_review(original: str, sanitized: str, sim_score: float, reason: str) -> ReviewResult:
    """Conservative deterministic fallback when the reviewer LLM returns malformed JSON."""
    missing_items = _missing_critical_items(original, sanitized)
    approved = sim_score >= 0.72 and not missing_items
    return ReviewResult(
        approved=approved,
        confidence=0.65 if approved else 0.35,
        similarity_score=sim_score,
        checks={
            "llm_parse": False,
            "semantic_similarity": sim_score >= 0.72,
            "critical_items_preserved": not missing_items,
        },
        missing_items=missing_items,
        reason=f"LLM reviewer returned malformed JSON; used deterministic fallback. {reason}",
        suggestions=["Retry LLM review or use a stronger reviewer model"] if not approved else [],
    )


def llm_review(
    original: str, 
    sanitized: str, 
    sim_score: float,
    agent2_meta: dict[str, Any] | None = None,
    model: str | None = None
) -> ReviewResult:
    """Phase 2: LLM reasoning for nuanced validation."""
    
    resolved_model = model or REVIEWER_MODEL
    
    messages = [
        {
            "role": "system", 
            "content": "You are a precise validator. Output ONLY valid JSON. No markdown, no explanation outside JSON."
        },
        {
            "role": "user",
            "content": _build_review_prompt(original, sanitized, sim_score, agent2_meta)
        }
    ]
    
    try:
        response = chat(messages, model=resolved_model, temperature=0, max_tokens=450)
        result = _extract_json_from_response(response)
        
        # Validate structure
        checks = _normalize_checks(result.get("checks", {}))
        approved = bool(result.get("approved", False))
        reason = _as_text(result.get("reason", ""))
        suggestions = _as_list(result.get("retry_suggestion"))
        
        return ReviewResult(
            approved=approved and all(checks.values()),
            confidence=float(result.get("confidence", 0.5)),
            similarity_score=sim_score,
            checks=checks,
            missing_items=_as_list(result.get("missing_items", [])),
            reason=reason,
            suggestions=suggestions
        )
        
    except (json.JSONDecodeError, ValueError) as e:
        return _fallback_review(original, sanitized, sim_score, f"Parse error: {str(e)[:100]}")


def review_agent3(
    original: str,
    agent2_output: Any,  # Agent2Result or dict
    use_llm: bool = True,
    min_similarity: float = 0.5,
    model: str | None = None,
) -> ReviewResult:
    """
    Main entry for Agent 3 review.
    
    Flow: Quick checks → (optional) LLM review
    """
    agent2_meta = _agent2_payload(agent2_output)
    sanitized = _as_text(agent2_meta.get("sanitized_prompt", ""))
    
    # Phase 1: Quick deterministic checks
    quick_pass, quick_fail = _quick_checks(original, sanitized)
    if not quick_pass:
        return quick_fail
    
    sim = compute_similarity(original, sanitized)
    
    # Phase 2: LLM for nuanced checks
    if use_llm:
        return llm_review(original, sanitized, sim, agent2_meta=agent2_meta, model=model)
    
    # No LLM mode: rule-based final decision
    return ReviewResult(
        approved=sim >= min_similarity,
        confidence=0.7 if sim >= min_similarity else 0.3,
        similarity_score=sim,
        checks={"similarity_threshold": sim >= min_similarity},
        missing_items=[] if sim >= min_similarity else ["elements potentially lost"],
        reason=f"Similarity {sim:.3f} vs threshold {min_similarity}" 
               + ("" if sim >= min_similarity else " - possible over-compression"),
        suggestions=["Enable LLM review for detailed analysis"] if sim < 0.7 else []
    )