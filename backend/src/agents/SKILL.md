# Agent 2 & Agent 3 — Question Simplification Pipeline

## Overview

Agent 2 (Simplifier) and Agent 3 (Reviewer) run in the LangGraph pipeline. Purpose: take a long/messy prompt from the user → condense it into a **clear question** → review whether it matches the intent → output JSON for another service to process.

---

## Architecture

```
preprocess → simplify (Agent 2) → review (Agent 3)
                ↑                        ↓
                └── increment-retry ←── FAIL (retryCount < 3)
                                         ↓
                                       PASS → output → __end__
                                         ↓
                                FAIL 3 times → __end__ (no output node)
```

### Conditional Edges (pipeline.graph.ts:18-22)

```typescript
.addConditionalEdges("review", (state) => {
  if (state.reviewPassed) return "output";     // Agent 3 approved
  if (state.retryCount < 3) return "increment-retry"; // retry with higher compression
  return "__end__";                             // all retries exhausted → end
})
```

---

## Files

| File | Role |
|------|------|
| `lib/context-simplifier.ts` | Agent 2 logic: prefilter (PII mask) → algorithmic clause filtering → LLM simplify question |
| `lib/reviewer.ts` | Agent 3 logic: quick checks → LLM review intent preservation |
| `lib/patterns.ts` | Regex patterns (PII, code, errors, filenames) |
| `lib/similarity.ts` | Lexical cosine similarity (bag-of-words) |
| `lib/llm-chat.ts` | Call Groq LLM |
| `nodes/simplify.node.ts` | Graph node for Agent 2 + **module-level retryHistory** |
| `nodes/review.node.ts` | Graph node for Agent 3, writes to retryHistory |
| `nodes/output.node.ts` | Format output JSON from retryHistory |
| `nodes/increment-retry.node.ts` | Increment retryCount, set shouldSimplify |
| `graphs/pipeline.graph.ts` | LangGraph wiring |
| `state/pipeline.state.ts` | PipelineAnnotation (state schema) |

---

## Agent 2 — Simplifier (`context-simplifier.ts`)

### Job
Take a long prompt → return a **short, clear question** that the next agent can answer directly.

### Pipeline
1. **Prefilter** (rule-based): strip non-ASCII, repeated words, mask PII (`[REDACTED_EMAIL]`, ...)
2. **Algorithmic compress** (SVT → Top-k → NoisyKNN): score salience per clause, filter
3. **LLM simplify** (always runs): receives **full preprocessed text** → rephrase into a question

### Compression Levels
| Level | When | Behavior |
|-------|------|----------|
| `medium` | First run (retryCount=0) | Balanced simplification |
| `high` | Retry (retryCount>0) | Very concise, 1-2 sentences |

### Output: `Agent2Result`
```typescript
interface Agent2Result {
  preprocessed: string;      // After prefilter (PII masked)
  sanitizedPrompt: string;   // Final question (LLM output)
  compressed: Record<...>;   // Metadata (algorithm, files, errors, constraints)
  piiTags: string[];         // PII types found
  precheckSimilarity: number;
  postCheckPassed: boolean;
  needsRetry: boolean;
  clauses: Clause[];
  keptClauses: string[];
  algorithm: string;
}
```

---

## Agent 3 — Reviewer (`reviewer.ts`)

### Job
Check whether Agent 2 summarized the user's intent correctly. APPROVE or FAIL.

### Pipeline
1. **Quick checks** (deterministic):
   - Empty/too short output → FAIL
   - PII still present → FAIL
   - Lexical similarity < threshold → FAIL (threshold adaptive by length ratio)
2. **LLM review**: compare original vs simplified, check core intent preservation

### Review Criteria (for question simplification)
- **APPROVE** if: question matches intent, keeps key decisions/constraints
- **APPROVE** even when minor details are lost (that is the purpose of simplify)
- **FAIL** only when: intent is completely wrong or the core question is missing

### Output: `ReviewResult`
```typescript
interface ReviewResult {
  approved: boolean;
  confidence: number;        // 0-1
  similarityScore: number;   // Lexical cosine
  checks: Record<string, boolean>;
  missingItems: string[];
  reason: string;
  suggestions: string[];
}
```

---

## Retry History

### Where is it stored?
**Module-level array** in `simplify.node.ts`:
```typescript
const retryHistory: RetryAttempt[] = [];
```

It is **NOT** in `PipelineState` (LangGraph state). Reason: keep state simple, avoid changing the annotation.

### When is it written?
`review.node.ts` calls `addAttemptToHistory()` after EVERY Agent 3 review — whether pass or fail.

### When is it reset?
`simplifyNode()` calls `resetPipelineTracking()` when `retryCount === 0` (first run).

### Who reads it?
`output.node.ts` calls `getRetryHistory()` to format output JSON.

### Relation to graph conditional edges
```
review → (state.reviewPassed?)
  YES → output node → reads getRetryHistory() → formats JSON
  NO + retryCount < 3 → increment-retry → simplify → review (adds to history)
  NO + retryCount >= 3 → __end__ (output node does NOT run → history only in memory)
```

**Current issue:** When all 3 retries fail, the graph goes straight to `__end__` without passing through the `output` node → `finalOutput` in state is only raw simplifiedMessage (from the last review node), not JSON format.

---

## Output JSON Format

### On pass (output node runs)
```json
{
  "attempt": 2,
  "false": "question rejected on attempt 1",
  "true": "question approved on attempt 2",
  "details": {
    "similarityScore": 0.57,
    "reason": "reason for reject on attempt 1",
    "missingItems": ["..."]
  },
  "answer": "LLM answer to the simplified question",
  "originalMessage": "user's original prompt",
  "preprocessedMessage": "after preprocess (fix typos)"
}
```

### Pass on first attempt
```json
{
  "attempt": 1,
  "true": "condensed question",
  "details": { "similarityScore": 0.57 },
  "answer": "...",
  "originalMessage": "...",
  "preprocessedMessage": "..."
}
```

### All retries failed (output node does NOT run)
`state.finalOutput` = raw simplifiedMessage (plain text, not JSON).
→ **Needs fix**: add a format node before `__end__`, or always route the graph through output.

---

## How to use output in another service

Another service receives `result.result` (string) from `runPipeline()`:
```typescript
const pipelineResult = await runPipeline({ message: userPrompt, simplify: true });
const output = JSON.parse(pipelineResult.result);

// Get the simplified question
const simplifiedQuestion = output.true;   // passed question
const failedAttempt = output.false;        // rejected question (if retried)

// Use simplified question for the answering agent
const answer = output.answer;
```

---

## Config

| Env | Used for | Default |
|-----|----------|---------|
| `GROQ_API_KEY` | All LLM calls | required |
| — | Model: `meta-llama/llama-4-scout-17b-16e-instruct` | hardcoded in groq.client.ts |

---

## Technical notes

1. **Module-level state** (retryHistory, lastAgent2Result): safe only for single-threaded use. Concurrent requests will race.
2. **Lexical similarity**: bag-of-words cosine, not semantic embeddings. Low scores when rephrasing long→short are normal.
3. **LLM simplify receives full preprocessed text**: not output from algorithmic filtering, so the LLM sees full context.
4. **shouldSimplify**: default `false`. Pipeline service sends `true` when the user wants simplify. `increment-retry` sets it back to `true` on retry.
