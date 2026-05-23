from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from core.openrouter import chat
from core.similarity import compute_similarity, get_model, cosine_similarity_vectors

# PII detection patterns
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[a-z]{2,}", re.IGNORECASE)
PHONE_RE = re.compile(r"\+?[\d\s\-().]{7,15}")
AGE_RE = re.compile(r"\b\d{1,3}\s*(years?\s*old|yo)\b", re.IGNORECASE)
COMPANY_RE = re.compile(r"\b(company|inc|corp|ltd|llc)\b", re.IGNORECASE)
LOCATION_RE = re.compile(r"\b(in|at|from)\s+[A-Z][a-zA-Z]+\b")
NAME_RE = re.compile(r"\b(my name is|i am)\s+[A-Z][a-zA-Z]+\b", re.IGNORECASE)
REPEATED_WORD_RE = re.compile(r"\b(\w+)(\s+\1)+\b", re.IGNORECASE)
NON_ASCII_RE = re.compile(r"[^\x00-\x7F]+")

# Technical content patterns (high salience)
CODE_PATTERN = re.compile(
    r"\b[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*\(.*?\)"  # method calls
    r"|\b[A-Z][a-zA-Z]*Error\b"  # Error types
    r"|\b\w+\.(py|js|ts|jsx|tsx)\b"  # code files
    r"|\b(API|endpoint|handler|route|function|class|def|import|from)\b",  # keywords
    re.IGNORECASE
)
ERROR_PATTERN = re.compile(r"\b(error|exception|traceback|failed|crash|bug|fix|debug|TypeError|ValueError|KeyError|AttributeError|ImportError|RuntimeError)\b", re.IGNORECASE)
QUESTION_PATTERN = re.compile(r"\?|\b(can|could|would|will|is|are|does|do|how|what|why|where|when|who)\s+[a-z]+", re.IGNORECASE)
FILENAME_PATTERN = re.compile(r"\b\w+\.(py|js|ts|json|yaml|yml|toml|md|txt|csv|sql|html|css|scss|jsx|tsx)\b", re.IGNORECASE)
STACK_TRACE_PATTERN = re.compile(
    r"\b(File|at)\s+\S+[:,]\s*line\s*\d+"  # File "path", line 123
    r"|\b\w+Error:\s*.+"  # TypeError: message
    r"|\btraceback\b|\bstack\b",
    re.IGNORECASE
)

FILLERS = {
    "uh", "uhh", "umm", "hmm", "pls", "please", "just", "like",
    "okay", "ok", "so", "actually", "basically", "literally",
    "you know", "i mean", "kind of", "sort of",
}

# Level-specific thresholds
LEVEL_CONFIG = {
    "low": {
        "svt_threshold": 0.16,      # SVT(0.16) — giữ nhiều câu hơn
        "top_k_ratio": 0.92,        # Top-k(92%)
        "dedup_threshold": 0.97,    # NoisyKNN(0.97) — chỉ gộp khi gần trùng hẳn
        "use_llm": False,
    },
    "medium": {
        "svt_threshold": 0.38,      # SVT(0.38)
        "top_k_ratio": 0.68,        # Top-k(68%)
        "dedup_threshold": 0.86,    # NoisyKNN(0.86)
        "use_llm": False,
    },
    "high": {
        "svt_threshold": 0.58,      # SVT(0.58)
        "top_k_ratio": 0.38,        # Top-k(38%)
        "dedup_threshold": 0.72,    # NoisyKNN(0.72)
        "use_llm": True,
    },
}


@dataclass
class Clause:
    """A single clause/segment with its salience score."""
    text: str
    salience: float = 0.0
    is_pii_only: bool = False
    is_filler: bool = False


@dataclass
class Agent2Result:
    preprocessed: str
    compressed: dict[str, Any]
    pii_tags: list[str]
    precheck_similarity: float
    post_check_passed: bool
    needs_retry: bool
    sanitized_prompt: str
    clauses: list[Clause] = field(default_factory=list)  # For debugging
    kept_clauses: list[str] = field(default_factory=list)  # Which clauses were kept
    algorithm: str = ""  # Which algorithm was primarily used


def _contains_pii(text: str) -> bool:
    checks = (EMAIL_RE, PHONE_RE, AGE_RE, NAME_RE, LOCATION_RE)
    return any(p.search(text) for p in checks)


def _is_pii_only_clause(text: str) -> bool:
    """True only when the clause is personal/filler with no real request or task."""
    if QUESTION_PATTERN.search(text):
        return False
    if re.search(r"\b(help|please|need|want|tell|show|explain|fix|refactor|implement)\b", text, re.I):
        return False

    cleaned = text
    for pattern in [EMAIL_RE, PHONE_RE, AGE_RE, NAME_RE, LOCATION_RE, COMPANY_RE]:
        cleaned = pattern.sub("", cleaned)
    cleaned = re.sub(r"\[REDACTED_\w+\]", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    if not cleaned or len(cleaned) < 8:
        return True

    has_technical = bool(
        CODE_PATTERN.search(text)
        or ERROR_PATTERN.search(text)
        or FILENAME_PATTERN.search(text)
        or STACK_TRACE_PATTERN.search(text)
    )
    if has_technical:
        return False

    # Mostly redacted tokens left → personal context only
    redacted_ratio = len(re.findall(r"\[REDACTED_\w+\]", text)) / max(1, len(text.split()))
    if redacted_ratio > 0.3:
        return True

    return _is_filler_clause(cleaned)


def _is_filler_clause(text: str) -> bool:
    """Check if clause is mostly filler words."""
    words = text.lower().split()
    if not words:
        return True
    filler_count = sum(1 for w in words if w.strip(".,!?") in FILLERS)
    return filler_count / len(words) > 0.6


def _split_into_clauses(text: str) -> list[str]:
    """Split text into semantic clauses/sentences."""
    # Split by sentence boundaries
    delimiters = r'(?<=[.!?])\s+|\n+|(?<=\))\s+(?=[A-Z])|(?<=\])\s+(?=[A-Z])'
    parts = re.split(delimiters, text)
    
    clauses = []
    for part in parts:
        part = part.strip()
        if len(part) < 3:
            continue
        # Further split long clauses by commas if they're not in code
        if len(part) > 150 and ',' in part:
            sub_parts = _split_by_comma_smart(part)
            clauses.extend(sub_parts)
        else:
            clauses.append(part)
    return clauses


def _split_by_comma_smart(text: str) -> list[str]:
    """Split by comma but preserve function calls and file paths."""
    result = []
    current = ""
    paren_depth = 0
    
    for char in text:
        if char == '(':
            paren_depth += 1
        elif char == ')':
            paren_depth -= 1
        elif char == ',' and paren_depth == 0:
            if current.strip():
                result.append(current.strip())
            current = ""
            continue
        current += char
    
    if current.strip():
        result.append(current.strip())
    
    return result if result else [text]


def _mask_pii(text: str) -> tuple[str, list[str]]:
    """Mask PII and return tags."""
    tags: list[str] = []

    def _sub(pattern: re.Pattern[str], label: str, source: str) -> str:
        if pattern.search(source):
            tags.append(label)
        return pattern.sub(f"[REDACTED_{label}]", source)

    text = _sub(EMAIL_RE, "EMAIL", text)
    text = _sub(PHONE_RE, "PHONE", text)
    text = _sub(AGE_RE, "AGE", text)
    text = _sub(NAME_RE, "PERSON", text)
    text = _sub(LOCATION_RE, "LOCATION", text)
    text = _sub(COMPANY_RE, "COMPANY", text)
    return text, sorted(set(tags))


def _prefilter(text: str) -> tuple[str, list[str]]:
    """Phase 1: Rule-based prefilter."""
    output = NON_ASCII_RE.sub("", text)
    output = REPEATED_WORD_RE.sub(r"\1", output)
    output = re.sub(r"\s+", " ", output).strip()
    output, pii_tags = _mask_pii(output)
    return output, pii_tags


def _compute_salience(clause: str, task_context: str = "") -> float:
    """
    Compute salience score for a clause.
    Returns score between 0 and 1.
    Higher = more relevant to keep.
    """
    score = 0.0
    text_lower = clause.lower()
    
    # 1. Question/inquiry detection (high value)
    if QUESTION_PATTERN.search(clause):
        score += 0.45

    # 1b. Constraints / requirements
    if re.search(r"\b(must|should|required|do not|don't|never|always|keep|preserve)\b", text_lower):
        score += 0.35
    
    # 2. Code/technical content
    if CODE_PATTERN.search(clause):
        score += 0.30
    if FILENAME_PATTERN.search(clause):
        score += 0.25
    if STACK_TRACE_PATTERN.search(clause):
        score += 0.40
    
    # 3. Error/debugging content
    if ERROR_PATTERN.search(clause):
        score += 0.30
    
    # 4. Has specific technical keywords
    tech_keywords = [
        "function", "class", "method", "api", "endpoint", "route",
        "handler", "controller", "service", "model", "database",
        "query", "request", "response", "auth", "login", "error",
        "exception", "bug", "fix", "debug", "traceback", "import",
        "module", "package", "config", "settings", "env", "variable",
    ]
    for kw in tech_keywords:
        if f" {kw} " in f" {text_lower} " or text_lower.startswith(kw + " "):
            score += 0.15
            break  # Only count once
    
    # 5. Has actionable verbs (for task context)
    action_verbs = ["fix", "implement", "create", "add", "update", "remove", 
                    "refactor", "optimize", "test", "deploy", "build", "run"]
    for verb in action_verbs:
        if f" {verb} " in f" {text_lower} ":
            score += 0.10
            break
    
    # 6. Semantic similarity to task context (if provided)
    if task_context and len(clause) > 10:
        try:
            sim = compute_similarity(clause, task_context)
            score += sim * 0.20  # Weight semantic similarity
        except Exception:
            pass
    
    # 7. Length penalty (very short clauses less useful)
    clause_len = len(clause.split())
    if clause_len < 4:
        score -= 0.15
    elif clause_len > 25:
        score -= 0.05  # Very long might be verbose
    
    # 8. Has PII only (negative)
    if _is_pii_only_clause(clause):
        score -= 0.25
    
    # 9. Mostly filler (negative)
    if _is_filler_clause(clause):
        score -= 0.20
    
    return max(0.0, min(1.0, score))


def _apply_svt(clauses: list[Clause], threshold: float) -> list[Clause]:
    """
    SVT (Sparse Vector Technique): Filter clauses by salience threshold.
    Keep only clauses with score >= threshold.
    """
    return [c for c in clauses if c.salience >= threshold]


def _apply_top_k(clauses: list[Clause], ratio: float) -> list[Clause]:
    """
    Top-k: Keep top ratio% of clauses by salience.
    Always keep at least 1 clause if input not empty.
    """
    if not clauses:
        return []
    
    sorted_clauses = sorted(clauses, key=lambda c: c.salience, reverse=True)
    k = max(1, int(len(sorted_clauses) * ratio))
    return sorted_clauses[:k]


def _apply_noisy_knn(clauses: list[Clause], threshold: float) -> list[Clause]:
    """
    Noisy KNN: Deduplicate clauses by semantic similarity.
    If two clauses are too similar, keep the higher salience one.
    """
    if len(clauses) <= 1:
        return clauses
    
    # Sort by salience (higher first)
    sorted_clauses = sorted(clauses, key=lambda c: c.salience, reverse=True)
    
    kept: list[Clause] = []
    embeddings = []
    
    for clause in sorted_clauses:
        try:
            emb = get_model().encode(clause.text)
        except Exception:
            kept.append(clause)
            continue
        
        # Check similarity to already kept clauses
        is_duplicate = False
        for kept_emb in embeddings:
            sim = cosine_similarity_vectors(emb, kept_emb)
            if sim > threshold:
                is_duplicate = True
                break
        
        if not is_duplicate:
            kept.append(clause)
            embeddings.append(emb)
    
    return kept


def _algorithm_compress(
    text: str,
    level: str,
    task_context: str = "",
) -> tuple[str, list[Clause], list[str], str]:
    """
    Apply algorithmic compression (Top-k + SVT + Noisy KNN).
    Returns: (sanitized_prompt, all_clauses, kept_clause_texts, algorithm_name)
    """
    config = LEVEL_CONFIG[level]
    
    # Step 1: Split into clauses
    raw_clauses = _split_into_clauses(text)
    
    # Step 2: Score salience for each clause
    clauses = []
    for raw in raw_clauses:
        salience = _compute_salience(raw, task_context)
        is_pii = _is_pii_only_clause(raw)
        is_filler = _is_filler_clause(raw)
        clauses.append(Clause(
            text=raw,
            salience=salience,
            is_pii_only=is_pii,
            is_filler=is_filler
        ))
    
    # Step 3: SVT (threshold filter)
    after_svt = _apply_svt(clauses, config["svt_threshold"])
    
    # Step 4: Top-k (rank and select)
    after_topk = _apply_top_k(after_svt, config["top_k_ratio"])
    
    # Step 5: Noisy KNN (deduplication)
    final_clauses = _apply_noisy_knn(after_topk, config["dedup_threshold"])

    # Fallback: never drop everything — keep highest-salience clause
    if not final_clauses and clauses:
        best = max(clauses, key=lambda c: c.salience)
        final_clauses = [best]
    
    # Join kept clauses
    kept_texts = [c.text for c in final_clauses]
    sanitized = " ".join(kept_texts)
    
    algorithm = (
        f"SVT({config['svt_threshold']}) → "
        f"Top-k({config['top_k_ratio']:.0%}) → "
        f"NoisyKNN({config['dedup_threshold']})"
    )
    
    return sanitized, clauses, kept_texts, algorithm


def _llm_compress(
    text: str,
    compression_level: str,
) -> tuple[str, dict[str, Any]]:
    """
    Use LLM for high-compression scenarios.
    Returns: (sanitized_prompt, structured_output)
    """
    system_prompt = (
        "You are a privacy-aware context reducer. HIGH compression mode.\n\n"
        "Your job: STRIP AWAY all unnecessary content, keeping ONLY:\n"
        "1. The core request/question\n"
        "2. Technical references (filenames, errors, function names)\n"
        "3. Constraints or requirements\n\n"
        "This is NOT summarization — do not rephrase.\n"
        "Keep sentences verbatim, just remove whole sentences that are filler/PII-only.\n\n"
        'Return JSON:\n'
        '{"sanitized_prompt": "kept sentences joined", "removed_parts": [...], '
        '"important_symbols": [...], "active_files": [...], "errors": [...], '
        '"constraints": [...], "open_questions": [...]}'
    )
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": text},
    ]
    
    llm_output = chat(messages)
    
    try:
        result = _extract_json_object(llm_output)
        sanitized = str(result.get("sanitized_prompt", "")).strip()
        return sanitized, result
    except Exception:
        # Fallback: return original if LLM fails
        return text, {"sanitized_prompt": text, "error": "LLM parsing failed"}


def _extract_json_object(text: str) -> dict[str, Any]:
    """Extract JSON from LLM output, handling markdown fences and thinking tags."""
    body = text.strip()
    body = re.sub(r"<think>.*?</think>", "", body, flags=re.DOTALL).strip()
    if "```" in body:
        body = re.sub(r"^```(?:json)?\s*", "", body)
        body = re.sub(r"\s*```$", "", body)
        body = body.strip()
    
    start = body.find("{")
    end = body.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in model output.")
    
    return json.loads(body[start : end + 1])


def simplify_context(
    raw_context: str,
    compression_level: str = "medium",
    min_precheck_threshold: float = 0.5,
    task_context: str = "",  # Optional context for semantic similarity
) -> Agent2Result:
    """
    Main entry point for Agent 2: Privacy-aware context simplification.
    
    Three compression levels:
    - LOW: SVT(0.16) → Top-k(92%) → NoisyKNN(0.97), no LLM
    - MEDIUM: SVT(0.38) → Top-k(68%) → NoisyKNN(0.86), no LLM
    - HIGH: SVT(0.58) → Top-k(38%) → NoisyKNN(0.72), then LLM polish
    """
    # Phase 1: Rule-based prefilter
    preprocessed, pii_tags = _prefilter(raw_context)
    
    # Get config for this level
    config = LEVEL_CONFIG.get(compression_level, LEVEL_CONFIG["medium"])
    
    # Phase 2: Algorithmic compression (Top-k + SVT + Noisy KNN)
    sanitized_algo, clauses, kept_clauses, algorithm = _algorithm_compress(
        preprocessed, compression_level, task_context
    )
    
    # Phase 3: LLM for high compression (optional enhancement)
    llm_result = {}
    if config["use_llm"] and compression_level == "high":
        # Use algorithm output as input to LLM for final polish
        llm_sanitized, llm_result = _llm_compress(sanitized_algo, compression_level)
        final_sanitized = llm_sanitized if llm_sanitized else sanitized_algo
    else:
        final_sanitized = sanitized_algo
    
    # Post-check: Validate output
    similarity = compute_similarity(raw_context, final_sanitized) if final_sanitized else 0.0
    pii_remaining = _contains_pii(final_sanitized)
    post_check_passed = (not pii_remaining) and (similarity >= min_precheck_threshold)
    
    # Build structured output
    compressed = {
        "sanitized_prompt": final_sanitized,
        "algorithm": algorithm,
        "compression_level": compression_level,
        "removed_parts": [c.text for c in clauses if c.text not in kept_clauses],
        "kept_clauses": kept_clauses,
        "clause_count": len(clauses),
        "kept_count": len(kept_clauses),
        "important_symbols": [],
        "active_files": FILENAME_PATTERN.findall(final_sanitized),
        "errors": ERROR_PATTERN.findall(final_sanitized),
        "constraints": [],
        "open_questions": [],
    }
    
    # Merge LLM results if available
    if llm_result:
        for key in ["important_symbols", "active_files", "errors", "constraints", "open_questions"]:
            if key in llm_result and llm_result[key]:
                compressed[key] = llm_result[key]
    
    return Agent2Result(
        preprocessed=preprocessed,
        compressed=compressed,
        pii_tags=pii_tags,
        precheck_similarity=similarity,
        post_check_passed=post_check_passed,
        needs_retry=not post_check_passed,
        sanitized_prompt=final_sanitized,
        clauses=clauses,
        kept_clauses=kept_clauses,
        algorithm=algorithm,
    )


# Convenience functions for each level
def simplify_low(text: str, **kwargs) -> Agent2Result:
    """Low compression - keep most content, just remove obvious PII/filler."""
    return simplify_context(text, compression_level="low", **kwargs)


def simplify_medium(text: str, **kwargs) -> Agent2Result:
    """Medium compression - balanced reduction."""
    return simplify_context(text, compression_level="medium", **kwargs)


def simplify_high(text: str, **kwargs) -> Agent2Result:
    """High compression - aggressive reduction, may use LLM."""
    return simplify_context(text, compression_level="high", **kwargs)
