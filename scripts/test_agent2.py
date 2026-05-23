"""
Test Agent 2 (context_simplifier) with 3 sample prompts at low / medium / high.

Run from project root:
    python scripts/test_agent2.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Project root on sys.path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from agents.context_simplifier import simplify_context

PROMPTS = [
    {
        "name": "Prompt 1",
        "text": (
            "Okay so before I forget, Daniel from HyperNova Robotics still hasn't replied about the CUDA container issue on the MI50 workstation, and meanwhile my mom keeps asking whether I'm visiting  Vietnam this summer, but anyway the actual thing I wanted to ask is whether a multi-agent pipeline  should store intermediate summarized prompts into pgvector immediately or only after validation passes,  because currently Agent B keeps flagging harmless noisy text as hallucinations whenever users randomly  mention things like climbing gyms in Espoo, Pokémon teams, coffee recipes, old Lenovo tablets, or relationship drama in the same paragraph as embedded systems architecture discussions, and I'm not even sure whether the issue comes from embedding drift, poor chunking strategy,  or the fact that Ollama context windows start degrading after very long conversational chains.\n"
        ),
    },
    {
        "name": "Prompt 2",
        "text": (
            "I know this sounds messy because I was brainstorming while waiting for the train from Kauniainen, but currently the stack is React frontend, FastAPI gateway, Ollama for local inference, PostgreSQL plus pgveand maybe LangChain although I honestly don't even know if I need it, and the actual problem I'm trying to is reducing noisy prompts before they reach downstream agents because during testing with long user ramblespecially when people include irrelevant details like company names, relationship drama, GPU specs, coffee recor Pokémon teams — token usage explodes while the core intent is usually just one sentence hidden somewhere in the middle."

        ),
    },
    {
        "name": "Prompt 3",
        "text": (
        "Honestly this started from something completely unrelated because Emily from QuantixAI mentioned during coffee near Aalto University that nutrition tracking apps are all boring, and then while I was debugging CUDA container issues on my old MI50 machine I randomly thought it would be funny to combine camera-based calorie estimation, Jetson-powered crash detection, and a multi-agent workflow where Agent Alpha parses sensor and image input, Agent Beta checks hallucinations and confidence thresholds, Agent Gamma rewrites outputs into simplified embeddings before storing them into a vector DB, except now the architecture document became like 17 pages long even though the original goal was literally just making an MVP impressive enough for machine learning infrastructure internship interviews in Finland."
        ),
    },
]

LEVELS = ("low", "medium", "high")


def run_one(name: str, text: str, level: str) -> None:
    print(f"\n{'=' * 72}")
    print(f"{name}  |  level={level}")
    print("=" * 72)
    print("\n--- ORIGINAL ---")
    print(text)

    result = simplify_context(text, compression_level=level, min_precheck_threshold=0.60)

    print("\n--- PREPROCESSED (after Phase 1 PII mask) ---")
    print(result.preprocessed) #here for test

    print("\n--- SANITIZED (kept clauses, verbatim) ---")
    print(result.sanitized_prompt or "(empty)")
    
    print("\n--- METADATA ---")
    print(f"  algorithm:     {result.algorithm}")
    print(f"  pii_tags:      {result.pii_tags}")
    print(f"  clauses:       {result.compressed.get('clause_count')} total, "
          f"{result.compressed.get('kept_count')} kept")
    print(f"  similarity:    {result.precheck_similarity:.3f}")
    print(f"  post_check:    {result.post_check_passed}")
    print(f"  needs_retry:   {result.needs_retry}")

    if result.compressed.get("removed_parts"):
        print("\n--- REMOVED ---")
        for part in result.compressed["removed_parts"][:5]:
            preview = part[:80] + ("..." if len(part) > 80 else "")
            print(f"  - {preview}")
        if len(result.compressed["removed_parts"]) > 5:
            print(f"  ... +{len(result.compressed['removed_parts']) - 5} more")

    if result.compressed.get("active_files"):
        print(f"  active_files:  {result.compressed['active_files']}")
    if result.compressed.get("errors"):
        print(f"  errors:        {result.compressed['errors']}")


def main() -> None:
    print("Agent 2 — 3 prompts × 3 levels (low / medium / high)\n")

    for prompt in PROMPTS:
        for level in LEVELS:
            try:
                run_one(prompt["name"], prompt["text"], level)
            except Exception as e:
                print(f"\nERROR [{prompt['name']} / {level}]: {e}")
                raise

    print(f"\n{'=' * 72}")
    print("Done.")


if __name__ == "__main__":
    main()
