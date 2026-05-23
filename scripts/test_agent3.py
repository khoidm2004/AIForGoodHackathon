#!/usr/bin/env python3
"""Test Agent 3 reviewer against various scenarios."""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parents[1]))

from agents.reviewer import review_agent3
from agents.context_simplifier import simplify_context

TEST_CASES = [
    {
        "name": "Should PASS - good compression",
        "original": "Okay so before I forget, Daniel from HyperNova Robotics still hasn't replied about the CUDA container issue on the MI50 workstation, and meanwhile my mom keeps asking whether I'm visiting  Vietnam this summer, but anyway the actual thing I wanted to ask is whether a multi-agent pipeline  should store intermediate summarized prompts into pgvector immediately or only after validation passes,  because currently Agent B keeps flagging harmless noisy text as hallucinations whenever users randomly  mention things like climbing gyms in Espoo, Pokémon teams, coffee recipes, old Lenovo tablets, or relationship drama in the same paragraph as embedded systems architecture discussions, and I'm not even sure whether the issue comes from embedding drift, poor chunking strategy,  or the fact that Ollama context windows start degrading after very long conversational chains.",
        "sanitized": " but anyway the actual thing I wanted to ask is whether a multi-agent pipeline should store intermediate summarized prompts into pgvector immediately or only after validation passes",
        "agent2_hint": "low",
        "expected_pass": True
    },
    {
        "name": "Average score - decent medium compression",
        "original": "I know this sounds messy because I was brainstorming while waiting for the train from Kauniainen, but currently the stack is React frontend, FastAPI gateway, Ollama for local inference, PostgreSQL plus pgvector and maybe LangChain although I honestly don't even know if I need it, and the actual problem I'm trying to solve is reducing noisy prompts before they reach downstream agents because during testing with long user rambles especially when people include irrelevant details like company names, relationship drama, GPU specs, coffee recipes or Pokemon teams, token usage explodes while the core intent is usually just one sentence hidden somewhere in the middle.",
        "sanitized": "Currently the stack is React frontend, FastAPI gateway, Ollama for local inference, PostgreSQL plus pgvector, and maybe LangChain although not sure if needed. The problem is reducing noisy prompts before they reach downstream agents because token usage explodes while the core intent is usually just one sentence.",
        "agent2_hint": "medium",
        "expected_pass": True
    },
    {
        "name": "Should FAIL - Low score",
        "original": "Honestly this started from something completely unrelated because Emily from QuantixAI mentioned during coffee near Aalto University that nutrition tracking apps are all boring, and then while I was debugging CUDA container issues on my old MI50 machine I randomly thought it would be funny to combine camera-based calorie estimation, Jetson-powered crash detection, and a multi-agent workflow where Agent Alpha parses sensor and image input, Agent Beta checks hallucinations and confidence thresholds, Agent Gamma rewrites outputs into simplified embeddings before storing them into a vector DB, except now the architecture document became like 17 pages long even though the original goal was literally just making an MVP impressive enough for machine learning infrastructure internship interviews in Finland.",
        "sanitized": "Emily mentioned during coffee that nutrition tracking apps are all boring",  
        "agent2_hint": "high",
        "expected_pass": False
    }
]

def run_tests():
    for case in TEST_CASES:
        print(f"\n{'='*60}")
        print(f"Test: {case['name']}")
        
        # Simulate Agent 2 output or use real
        if 'sanitized' in case:
            class MockResult:
                sanitized_prompt = case['sanitized']
            result = MockResult()
        else:
            from agents.context_simplifier import simplify_context
            r = simplify_context(case['original'], case['agent2_hint'])
            result = r
        
        review = review_agent3(case['original'], result, use_llm=True)
        
        print(f"  Original: {case['original'][:60]}...")
        print(f"  Sanitized: {result.sanitized_prompt[:60] if hasattr(result, 'sanitized_prompt') else result[:60]}...")
        print(f"  Approved: {review.approved} (expected: {case['expected_pass']})")
        print(f"  Similarity: {review.similarity_score:.3f}")
        print(f"  Reason: {review.reason[:80]}...")
        
        # Assert
        status = " PASS" if review.approved == case['expected_pass'] else " FAIL"
        print(f"  Test {status}")

if __name__ == "__main__":
    run_tests()