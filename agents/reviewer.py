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


def _build_review_prompt(original: str, sanitized: str, sim_score: float) -> str:
    """Build LLM prompt for nuanced review."""
    
    orig_elems = _extract_key_elements(original)
    
    return f"""You are a strict context validation agent. Compare ORIGINAL vs SANITIZED.

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

VALIDATION RULES:
1. INTENT: Does sanitized capture the core request/question? (If original asks about weather, sanitized must mention weather)
2. FILES: Are all actively referenced filenames preserved?
3. ERRORS: Are error messages/stack traces kept?
4. CONSTRAINTS: Are "do not/must/keep" requirements preserved?
5. TECHNICAL: Are API names, function calls, important symbols intact?

DECISION:
- APPROVE only if ALL critical elements preserved
- FAIL if any constraint dropped or core intent changed

Output JSON:
{{
  "approved": boolean,
  "confidence": 0.0-1.0,
  "checks": {{
    "intent_preserved": boolean,
    "files_preserved": boolean,
    "errors_preserved": boolean,
    "constraints_preserved": boolean,
    "technical_symbols_intact": boolean
  }},
  "missing_items": ["specific items Agent 2 dropped"],
  "false_positives": ["items Agent 2 kept that should be dropped"],
  "reason": "detailed explanation if FAIL",
  "retry_suggestion": "specific hint for Agent 2: raise SVT threshold / add constraint keyword check / etc."
}}"""


def _extract_json_from_response(text: str) -> dict:
    """Extract JSON from LLM response, stripping markdown fences and thinking tags."""
    body = text.strip()
    # Strip <think>...</think> blocks (qwen3)
    body = re.sub(r"<think>.*?</think>", "", body, flags=re.DOTALL).strip()
    # Strip markdown code fences
    if "```" in body:
        body = re.sub(r"^```(?:json)?\s*", "", body)
        body = re.sub(r"\s*```$", "", body)
        body = body.strip()
    # Find the JSON object
    start = body.find("{")
    end = body.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise json.JSONDecodeError("No JSON object found", body, 0)
    return json.loads(body[start : end + 1])


def llm_review(
    original: str, 
    sanitized: str, 
    sim_score: float,
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
            "content": _build_review_prompt(original, sanitized, sim_score)
        }
    ]
    
    try:
        response = chat(messages, model=resolved_model)
        result = _extract_json_from_response(response)
        
        # Validate structure
        checks = result.get("checks", {})
        approved = result.get("approved", False)
        
        return ReviewResult(
            approved=approved and all(checks.values()),
            confidence=result.get("confidence", 0.5),
            similarity_score=sim_score,
            checks=checks,
            missing_items=result.get("missing_items", []),
            reason=result.get("reason", ""),
            suggestions=[result.get("retry_suggestion", "")]
        )
        
    except (json.JSONDecodeError, ValueError) as e:
        return ReviewResult(
            approved=False,
            confidence=0.0,
            similarity_score=sim_score,
            checks={"llm_parse": False},
            missing_items=[],
            reason=f"LLM output not valid JSON: {str(e)[:100]}",
            suggestions=["Review prompt formatting"]
        )


def review_agent3(
    original: str,
    agent2_output: Any,  # Agent2Result or dict
    use_llm: bool = True,
    min_similarity: float = 0.5
) -> ReviewResult:
    """
    Main entry for Agent 3 review.
    
    Flow: Quick checks → (optional) LLM review
    """
    sanitized = (
        agent2_output.sanitized_prompt 
        if hasattr(agent2_output, 'sanitized_prompt')
        else agent2_output.get("sanitized_prompt", "")
    )
    
    # Phase 1: Quick deterministic checks
    quick_pass, quick_fail = _quick_checks(original, sanitized)
    if not quick_pass:
        return quick_fail
    
    sim = compute_similarity(original, sanitized)
    
    # Phase 2: LLM for nuanced checks
    if use_llm:
        return llm_review(original, sanitized, sim)
    
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