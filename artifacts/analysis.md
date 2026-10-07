# Analysis — per-agent `trace` on `POST /api/pipeline/run`

**No false premise in the task itself.** Every substantive claim in `artifacts/TASK.md` held up against the current code, with two corrections (Fact 2 and Fact 4).

**But one of the task's three open questions resolves badly: the concurrency concern is not hypothetical — it is a live, reproducible data-leak bug that already corrupts the existing `result` field today.** I reproduced it against the real compiled graph with stubbed LLMs: request A's response came back containing request B's simplified text and B's similarity score, while A's own status was `failed` (Fact 10). Shipping a `trace` built from `getRetryHistory()` without fixing the scoping would faithfully export another user's prompt text into the trace. This is the single most important finding here and it needs an explicit decision before coding.

## 1. Task restated

Add one new, purely additive top-level field to the `POST /api/pipeline/run` success payload (`data.result` and `data.steps` stay identical in meaning) that exposes the **actual text** at each pipeline stage: Agent 0's preprocessed text, each Agent 2 simplify attempt's output, each Agent 3 review verdict on that attempt, and the final output text — including the retry attempts that `output.node.ts` currently discards. Name and shape the field, assemble it in exactly one place, and document it in `documentation/api-endpoints.md`. No graph/state/algorithm changes; no new LLM calls.

Unambiguous, with one real design decision the task flags and one it does not:
- **Flagged:** where to assemble (`output.node.ts` vs `pipeline.service.ts`). This is *not* a free choice — see Fact 12; the state-schema constraint forces the options.
- **Not flagged:** whether this task also fixes the request-scoping bug. See Facts 10/11 and Open Question 1.

## 2. Established facts

All paths relative to repo root `/Users/dominhkhoi/Project/AI4Good/.claude/worktrees/agent-trace`. All code read at worktree `HEAD = 845d4ad`.

### Fact 1 — `getRetryHistory()`'s exact current shape (TASK open question 1) — CONFIRMED

`backend/src/agents/nodes/simplify.node.ts:5-12`:

```ts
export interface RetryAttempt {
  attempt: number;
  passed: boolean;
  prompt: string;
  reason?: string;
  similarityScore?: number;
  missingItems?: string[];
}
```

`getRetryHistory()` (`simplify.node.ts:30-32`) returns `[...retryHistory]` — a **shallow copy of the array**, sharing the entry objects.

Who fills it: `addAttemptToHistory()` (`simplify.node.ts:42-55`), called from exactly one place, `review.node.ts:19`, **after every review, pass or fail**. Field-by-field:

| field | value | always present? |
|---|---|---|
| `attempt` | `getCurrentAttempt()` → module global `currentAttemptNumber`, set in `simplifyNode` as `state.retryCount + 1` (`simplify.node.ts:95`) | yes, but **can be wrong under concurrency** — Fact 11 |
| `passed` | `reviewResult.approved` | yes |
| `prompt` | `state.simplifiedMessage` at the review node (`review.node.ts:19`) | yes |
| `reason` | `reviewResult.reason` (`ReviewResult.reason` is a required `string`, `reviewer.ts:29`) | yes in practice |
| `similarityScore` | `Number(reviewResult.similarityScore.toFixed(3))` — **already rounded to 3 dp at write time** | yes in practice |
| `missingItems` | `reviewResult.missingItems` or `undefined` when the array is empty (`simplify.node.ts:53`) | **no** — absent on clean passes |

Measured entry (real `reviewer.ts`, stubbed LLM, 3 forced rejections):

```json
{
  "attempt": 1,
  "passed": false,
  "prompt": "attempt1: reqalpha deploy steps?",
  "reason": "LLM rejected and similarity 0.320 < threshold 0.507",
  "similarityScore": 0.32,
  "missingItems": ["constraints:forced"]
}
```

Ordering is strictly `attempt` 1 → 2 → 3 (max 3; `pipeline.graph.ts:21` allows `retryCount` 0,1,2), one entry per simplify+review round. Measured: 3 entries. The history is read exactly **once** per run (by the output node).

### Fact 2 — `prompt` is the **post**-LLM-rewrite text (TASK open question 1) — CONFIRMED

Chain: `review.node.ts:19` → `state.simplifiedMessage` → `simplify.node.ts:116` `result.sanitizedPrompt || state.preprocessedMessage` → `context-simplifier.ts:484` `sanitizedPrompt: finalSanitized` → `context-simplifier.ts:444` `finalSanitized = llmSimplified || sanitizedAlgo`.

So `prompt` is the **Groq question rewrite** (`llmSimplifyQuestion`, `context-simplifier.ts:345-421`), falling back to the algorithmic clause join only if the LLM returned an empty `simplified_question`. Confirmed in the probe: the history entry held the stubbed `simplified_question` string, not the SVT/Top-k/NoisyKNN clause join.

**Correction to TASK.md's framing:** the *pre*-rewrite intermediates are **not available per attempt**. The PII-masked prefilter output (`Agent2Result.preprocessed`), `piiTags`, `keptClauses`, `algorithm` and `precheckSimilarity` live only in the single module global `lastAgent2Result` (`simplify.node.ts:15`, written at `:114`), which is **overwritten on every retry** — only the *last* attempt's metadata survives. A trace wanting per-attempt PII tags or compression metadata cannot get it from existing memory; `prompt` is the only per-attempt text retained. The per-attempt *effective* compression level (`simplify.node.ts:104-110`: `high → high, medium, low`) is **recorded nowhere**.

### Fact 3 — `graphResult.preprocessedMessage` is reliably Agent 0's output (TASK open question 2) — CONFIRMED

Written by exactly one node. Exhaustive grep of writers:

```
backend/src/agents/nodes/preprocess.node.ts:16:  return { preprocessedMessage };
```

(other occurrences are *reads* at `simplify.node.ts:100,113,116`, the annotation at `pipeline.state.ts:5`, and the dead type at `types/index.ts:15`). The reducer is last-write-wins (`pipeline.state.ts:5`: `reducer: (_, b) => b`) and nothing else ever writes it, so no later node can overwrite it. Measured at the end of a 3-attempt run: still the preprocess output, unchanged.

Caveats, both from `preprocess.node.ts:13-14`:
- There is **no cleanup** of the Groq reply. `extractPlainAnswer`/`normalizeAnswer` (`output.node.ts:65-98`) are applied only to the *final answer*, never to `preprocessedMessage`. A real reply like `"Here is the corrected text: ..."` would land in the trace verbatim. Not measurable without a live `GROQ_API_KEY`; flagged as a risk, not a fact.
- If `response.content` is not a string it silently falls back to `state.originalMessage`, so `preprocessedMessage === originalMessage` is a legitimate and indistinguishable value.

### Fact 4 — `runPipeline` today, verbatim

`backend/src/services/pipeline.service.ts` (27 lines, whole file):

```ts
export async function runPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const graphResult = await pipelineGraph.invoke({
    originalMessage: input.message,
    compressionLevel: input.simplify ?? "medium",
  });

  let parsedResult: Record<string, unknown>;
  try {
    parsedResult = JSON.parse(graphResult.finalOutput) as Record<string, unknown>;
  } catch {
    parsedResult = {
      status: "failed",
      attempt: 0,
      question: graphResult.simplifiedMessage || input.message,   // <-- line 17
      answer: null,
      review: { reason: "Could not parse pipeline output JSON" },
    };
  }

  return { result: parsedResult, steps: ["preprocess", "simplify", "review", "output"] };
}
```

Correction to TASK.md ("only reads `graphResult.finalOutput`"): it also reads `graphResult.simplifiedMessage` on line 17. Note the pre-existing inconsistency — the fallback uses key **`question`** while the happy path (`output.node.ts:129`) uses **`simplifiedMessage`**. Do not copy `question` into the new field.

`steps` is a hardcoded literal (line 25); the return type is `PipelineOutput = { result: Record<string, unknown>; steps: string[] }` (`backend/src/types/index.ts:8-11`) — the one type to extend.

### Fact 5 — the output node **always** runs; both in-repo docs say otherwise

`pipeline.graph.ts:18-23`: on `!reviewPassed && retryCount >= 2` the conditional edge returns `"output"`, not `"__end__"`. Measured with 3 forced rejections — `reviewPassed: false`, `retryCount: 2`, and `finalOutput` was still valid JSON:

```json
{ "status": "failed", "attempt": 3, "simplifiedMessage": "attempt3: reqalpha deploy steps?",
  "answer": null,
  "review": { "similarityScore": 0.32, "reason": "LLM rejected and similarity 0.320 < threshold 0.507",
              "missingItems": ["constraints:forced"] },
  "previousRejectedSimplifiedMessage": "attempt3: reqalpha deploy steps?" }
```

Two docs contradict this and must not be trusted:
- `documentation/api-endpoints.md:168` — "**output** — Only runs when review passes" and `:170` — "the graph may end without an output step". **False.**
- `backend/src/agents/SKILL.md:18,26,141,144,179-181` — claims `retryCount < 3` and `__end__` on exhaustion. **False** (and `SKILL.md` is broadly stale: output keys `"true"`/`"false"`/`"details"`, a non-existent `shouldSimplify` field, wrong model). `CLAUDE.md:22-25` already says to prefer `documentation/multi-agent-workflow.md` over `SKILL.md`.

Consequence: `graphResult.finalOutput` is **always** the output node's JSON on any non-throwing run, so the `JSON.parse` catch at `pipeline.service.ts:13` is effectively dead. There is no "output didn't run" case to design the trace around.

### Fact 6 — exactly what `formatRetryHistory` throws away

`output.node.ts:22-63`. With history `[a1 fail, a2 fail, a3 pass]` it keeps `history.find(h => !h.passed)` (→ **a1**) as `rejectedSimplifiedMessage` and `history.find(h => h.passed)` (→ **a3**) as `approvedSimplifiedMessage`. **a2 is dropped entirely**, and `review.similarityScore` comes from the *passed* attempt while `review.reason`/`missingItems` come from the *first failed* attempt (`:58-60`) — the existing `result.review` object already mixes two different attempts.

On the all-failed path (`:30-41`) it reports only the **last** attempt, and because `simplifiedMessage` then falls back to `rejectedSimplifiedMessage` (`:121-124`), `previousRejectedSimplifiedMessage` is a **duplicate of `simplifiedMessage`** — measured in Fact 5. TASK.md's claim that per-attempt detail is thrown away is correct and, if anything, understated.

`formatSimilarityScore` (`output.node.ts:17-20`) re-rounds a value already rounded at `simplify.node.ts:52` — harmless no-op; don't replicate the double-round.

### Fact 7 — the review node produces no text of its own — CONFIRMED

`review.node.ts` (25 lines, whole file) returns only `{ reviewPassed, finalOutput: state.simplifiedMessage }`. It reads `getLastAgent2Result()` (`:7`), computes a threshold (`:10`), calls `reviewAgent3` (`:12`), pushes to history (`:19`). TASK.md is right: the review stage's "text" is the attempt's `prompt`; its own contribution is the verdict (`passed`, `similarityScore`, `reason`, `missingItems`).

`review.node.ts:23` sets `finalOutput` to the **plain** simplified string; the output node overwrites it with JSON at `output.node.ts:138-140`. Since output always runs (Fact 5), the interim plain-string value is never observable from `runPipeline`.

### Fact 8 — the "output stage" text is reachable only through the JSON string

The final answer (`llmAnswer`, `output.node.ts:104-119`) is **not** in graph state. It exists only inside the `finalOutput` JSON as `answer` (`:130`), i.e. `parsedResult.answer` after the service's parse (`string | null` — `null` whenever `state.reviewPassed` is false, `output.node.ts:106`). No other route without changing `pipeline.state.ts` (forbidden).

### Fact 9 — the shared module state is NOT request-scoped (TASK open question 3) — the "maybe it's fine" premise is FALSE

`simplify.node.ts:14-17`:

```ts
// Module-level state for tracking across nodes (single-threaded only)
let lastAgent2Result: Agent2Result | undefined;
let currentAttemptNumber = 1;
const retryHistory: RetryAttempt[] = [];
```

Three process-wide globals. The only reset is `resetPipelineTracking()` (`simplify.node.ts:35-39`), called from exactly one place: `simplify.node.ts:91-93`, `if (state.retryCount === 0) resetPipelineTracking()`. Exhaustive grep confirms no other call site in `backend/src`. `review.node.ts` never resets. There is **no keying by request, no AsyncLocalStorage, no mutex, no serialization** in `pipeline.service.ts`, `pipeline.controller.ts` or `app.ts` — and the rate limiter allows 100 requests / 15 min **per IP** (`rateLimit.middleware.ts:3-9`), so concurrent in-flight runs are expected.

"Reset at the start of each run" is therefore **not** request-scoping: it resets a global another in-flight run is still using.

### Fact 10 — MEASURED: concurrent requests already corrupt the existing `result`

I stubbed `groqClient.invoke` / `groqJsonClient.invoke` (no network) and ran two real `pipelineGraph.invoke()` calls concurrently with controlled latencies, using the actual `pipeline.graph.ts`, `simplify.node.ts`, `review.node.ts`, `output.node.ts`, `context-simplifier.ts` and `reviewer.ts`. Request A ("reqalpha") was forced to fail review 3×; request B ("reqbravo") started ~70 ms in and passed first attempt.

Instrumented timeline (wrappers on the module's exported `addAttemptToHistory` / `getRetryHistory`):

```
t+135ms  simplify   end   req=A
t+178ms  +++ addAttemptToHistory(attempt=1, prompt="reqalpha deploy steps?...",     passed=false)
t+187ms  simplify   start req=B          <-- B's simplifyNode runs resetPipelineTracking()
t+188ms  +++ addAttemptToHistory(attempt=1, prompt="how do i deploy the reqbra...", passed=true)
t+189ms  <<< output node read history, len=1        (B's output — correct)
t+232ms  +++ addAttemptToHistory(attempt=1, prompt="reqalpha deploy steps?...",     passed=false)
t+285ms  +++ addAttemptToHistory(attempt=3, prompt="reqalpha deploy steps?...",     passed=false)
t+286ms  <<< output node read history, len=3        (A's output — corrupted)
```

What A's output node actually read:

```
read #2: [{"attempt":1,"passed":true, "prompt":"how do i deploy the reqbravo servi"},   <-- B's
          {"attempt":1,"passed":false,"prompt":"reqalpha deploy steps?"},
          {"attempt":3,"passed":false,"prompt":"reqalpha deploy steps?"}]
```

Request A's returned response (`retryCount: 2`, `reviewPassed: false`):

```json
{
  "status": "failed",
  "attempt": 1,
  "simplifiedMessage": "how do i deploy the reqbravo service and its caching layer?",
  "answer": null,
  "review": { "similarityScore": 0.849,
              "reason": "LLM rejected and similarity 0.370 < threshold 0.454",
              "missingItems": ["constraints:forced"] },
  "previousRejectedSimplifiedMessage": "reqalpha deploy steps?"
}
```

`result.simplifiedMessage` is **request B's prompt text**, `review.similarityScore` is **B's score**, and `attempt` is wrong. A simpler two-request variant with **no retries at all** produced the same class of failure: A's `result.simplifiedMessage` came back as B's text — `contains own tag "reqalpha"=false, other request's tag "reqbravo"=true`.

So this is a **current production bug in `result`**, not a new risk introduced by the trace. The trace would widen the blast radius (exporting *every* leaked attempt's text rather than one).

### Fact 11 — three distinct leaks, same root cause

Visible in the Fact 10 timeline:

1. **History wipe.** A pushed attempt 1 at t+178; B's `resetPipelineTracking()` at t+187 cleared it; A's final read (t+286) shows only 3 entries, the first of which is B's — A's real attempt 1 is gone.
2. **Foreign entries.** A's output node read B's entry and `history.find(h => h.passed)` (`output.node.ts:28`) selected it.
3. **Wrong attempt numbers.** A's second push recorded `attempt=1` (t+232), not 2, because B's `simplifyNode` had reset the shared `currentAttemptNumber` to 1 (`simplify.node.ts:95`). Both A's and B's first entries read `attempt: 1`, so attempt number cannot disambiguate owners.

A fourth leak is visible by code reading but I did **not** reproduce it: `review.node.ts:7` reads `getLastAgent2Result()`, a single global written at `simplify.node.ts:114`, so Agent 3 can review another request's `Agent2Result` metadata. Treat as an assumption, not a measurement.

*Implementation note found while instrumenting:* monkeypatching the module's *exported* `resetPipelineTracking` did **not** intercept the call from `simplifyNode`, because an intra-module call compiles to a direct local reference in CommonJS. That is why no `>>> reset` line appears in the timeline; the wipe is proven by the missing entry instead. Relevant if the tester tries to stub these.

### Fact 12 — the "where to assemble" choice is constrained, not free (TASK open question 2)

The task forbids changing `pipeline.state.ts`'s schema, so **a trace built inside `output.node.ts` cannot be returned through graph state.** Only three routes exist:

| route | mechanics | notes |
|---|---|---|
| (a) build in `output.node.ts`, embed as a `trace` key inside the `finalOutput` JSON, then lift it to top level in `pipeline.service.ts` (`parsedResult.trace` → `output.trace`, `delete parsedResult.trace`) | works, no state change | transiently puts a key inside `result`; needs the `delete` to keep `result` unchanged |
| (b) build in `output.node.ts`, stash in a **new module-level** export (e.g. `getLastTrace()`) read by the service | works | adds a *fourth* process-wide global — same bug class as Fact 9 |
| (c) build in `pipeline.service.ts` from `graphResult` + an imported `getRetryHistory()` | works; no import cycle (`pipeline.service` → `pipeline.graph` → `simplify.node`; importing `simplify.node` directly adds no cycle) | **strictly the most race-exposed** |

Quantified downside of (c): the output node reads the history at `output.node.ts:101`, *before* its Groq answer call (`:107-116`). Reading it in the service happens after `invoke()` resolves — i.e. after that full Groq round-trip (hundreds of ms to seconds in production; 2 ms with my stub). Every millisecond of that window is extra time for another request's reset/pushes to land. (c) is also inconsistent with the existing `result`, which is built from the earlier snapshot — so `result` and `trace` could disagree within one response.

`getRetryHistory()` returning `[...retryHistory]` means a *later* `length = 0` does not retroactively empty an already-captured array — but a reset **plus new pushes** before the read does corrupt it, exactly as measured.

`graphResult` exposes everything else the trace needs: `originalMessage`, `preprocessedMessage`, `simplifiedMessage`, `reviewPassed`, `compressionLevel`, `retryCount`, `finalOutput` (all of `pipeline.state.ts:4-10`; all verified present on the resolved object).

### Fact 13 — `documentation/api-endpoints.md`: exactly what to extend

Current response-schema section, `documentation/api-endpoints.md:140-170`:
- `:142-156` the JSON example (`data.result` with `status`, `attempt`, `simplifiedMessage`, `answer`, `review`; `data.steps`).
- `:158-161` the two-row field table (`data.result`, `data.steps`).
- `:163-170` "Pipeline behavior" prose — **lines 168 and 170 are factually wrong** (Fact 5).
- `:210` and `:230` the fetch/axios examples, both casting to `{ result: Record<string, unknown>; steps: string[] }`.
- `:256-259` `export interface PipelineRunResponse { result: ...; steps: string[] }` in the "TypeScript types (copy into frontend)" block.

So the new field has **five** places to land in that one file, not one. The file is *outside* `backend/`, so `npm run format:check` (which runs `prettier --check .` from `backend/`) does not inspect it.

### Fact 14 — environment / validation baseline (measured just now)

`node_modules` was **absent**; I ran `npm ci`. From `backend/`:

```
$ npx tsc --noEmit
exit=0                                   <-- clean baseline

$ npm run lint
sh: eslint: command not found
exit=127                                 <-- NOT a regression; see below

$ npm run format:check
[warn] src/agents/lib/context-simplifier.ts
[warn] src/agents/lib/patterns.ts
[warn] src/agents/lib/reviewer.ts
[warn] src/agents/nodes/output.node.ts
[warn] src/agents/nodes/review.node.ts
[warn] src/agents/nodes/simplify.node.ts
[warn] src/agents/SKILL.md
[warn] Code style issues found in 7 files.
exit=1                                   <-- pre-existing baseline, 7 files
```

`CLAUDE.md:96` lists `npm run lint` as a validation command, but **eslint is not a devDependency** (`backend/package.json:21-30`) and **no eslint config exists anywhere** — `find` for `.eslintrc*` / `eslint.config.*` outside `node_modules` returns nothing. `artifacts/dev-diary.md` records the identical `exit=127` and the identical 7-file prettier baseline, so both are established, accepted environmental facts.

**The 3 source files this task is most likely to touch (`output.node.ts`, `review.node.ts`, `simplify.node.ts`) are already in the prettier-failing set.** The tester must compare against this 7-file baseline, not against "clean".

Also: **no test runner** — no `test` script in `package.json`, no test directory, no test framework. Behavioural verification has to be a throwaway script (see §4). `tsconfig.json` has `strict: true` but **not** `noUnusedLocals`/`noUnusedParameters` (which is why `increment-retry.node.ts:3`'s unused `state` compiles).

### Fact 15 — dead/stale code not to build on

- `backend/src/api/dto/pipeline.dto.ts` — `RunPipelineDto { message; userId; simplify?: boolean }`. **Unreferenced** (grep: definition only) and contradicts the live validator (`pipeline.validator.ts`: `{ message: string.min(1), simplify: enum(low|medium|high).default("medium") }`). Do not use it for the new types.
- `types/index.ts:13-20` `PipelineStateData`, `:22-26` `ApiResponse`, `:28-31` `StreamChunk` — all unreferenced. Only `PipelineInput` and `PipelineOutput` are live (`pipeline.service.ts:2`).
- `CHANGELOG_AI.md` is referenced by `artifacts/dev-diary.md` but **no longer exists** (removed by commit `845d4ad "Retire AI Harness workflow in favor of /code-task"`). Don't recreate it.

### Fact 16 — the "no compression level" branch is unreachable via HTTP

`simplify.node.ts:98-101` skips Agent 2 when `!state.compressionLevel` (and sets `lastAgent2Result = undefined`). Unreachable from the endpoint: the validator defaults `simplify` to `"medium"` and `pipeline.service.ts:7` applies `?? "medium"` on top. The trace does not need to model a "simplify skipped" stage.

## 3. Relevant code

Line counts: `pipeline.service.ts` 27, `output.node.ts` 141, `simplify.node.ts` 117, `review.node.ts` 25, `preprocess.node.ts` 17, `increment-retry.node.ts` 5, `types/index.ts` 31.

| file:line | role for this task |
|---|---|
| `backend/src/services/pipeline.service.ts:4-27` | the only producer of the response body; `graphResult` lives here; `steps` hardcoded at `:25` |
| `backend/src/types/index.ts:8-11` | `PipelineOutput` — the type to extend |
| `backend/src/agents/nodes/output.node.ts:100-141` | reads `getRetryHistory()` at `:101`; builds `finalOutput` JSON at `:126-140`; `llmAnswer` at `:104-119` |
| `backend/src/agents/nodes/output.node.ts:22-63` | `formatRetryHistory` — the lossy reduction this task complements (Fact 6) |
| `backend/src/agents/nodes/simplify.node.ts:5-55` | `RetryAttempt`, the three globals, `getRetryHistory`, `resetPipelineTracking`, `addAttemptToHistory` |
| `backend/src/agents/nodes/simplify.node.ts:90-117` | `simplifyNode`: reset at `:91-93`, attempt number at `:95`, per-attempt compression level at `:104-110`, returns `simplifiedMessage` at `:116` |
| `backend/src/agents/nodes/review.node.ts:5-25` | the single writer of history (`:19`); produces no text (Fact 7) |
| `backend/src/agents/nodes/preprocess.node.ts:5-17` | sole writer of `preprocessedMessage` (`:16`); no reply cleanup |
| `backend/src/agents/state/pipeline.state.ts:3-11` | all 7 state fields + reducers; **schema frozen by the task** |
| `backend/src/agents/graphs/pipeline.graph.ts:9-27` | edges; `review → output` on retry exhaustion at `:21-22` |
| `backend/src/api/controllers/pipeline.controller.ts:11-13` | `res.json({ success: true, data: output })` — wraps whatever `runPipeline` returns, no filtering |
| `backend/src/app.ts` (`app.set("json spaces", 2)`) | responses are pretty-printed, so trace text costs ~2 bytes of indent per line |
| `documentation/api-endpoints.md:140-170, 210, 230, 256-259` | the five spots to extend (Fact 13) |

Data flow for a 3-attempt run, with where each candidate trace text comes from:

```
originalMessage      <- invoke() input                       (graphResult.originalMessage)
preprocess           -> preprocessedMessage                  (graphResult.preprocessedMessage)   Fact 3
simplify attempt 1   -> simplifiedMessage                    (history[0].prompt)                 Fact 2
review   attempt 1   -> passed/score/reason/missingItems     (history[0].*)                      Fact 1
simplify attempt 2   ...                                      (history[1].prompt)
review   attempt 2   ...                                      (history[1].*)
simplify attempt 3   ...                                      (history[2].prompt)
review   attempt 3   ...                                      (history[2].*)
output               -> llmAnswer                            (JSON.parse(finalOutput).answer)    Fact 8
```

## 4. Prior art in this repo

- **`getRetryHistory()` / `RetryAttempt`** (`simplify.node.ts:5-12,30-32`) — reuse, don't re-derive. Already imported by `output.node.ts:4` as `import { getRetryHistory, type RetryAttempt } from "./simplify.node"`.
- **`formatSimilarityScore`** (`output.node.ts:17-20`) — existing rounding helper; `similarityScore` is already 3-dp-rounded at write time (`simplify.node.ts:52`), so calling it again is a no-op.
- **`extractPlainAnswer` / `normalizeAnswer`** (`output.node.ts:65-98`) — the existing convention for cleaning an LLM reply before it reaches the client. Nothing equivalent is applied to `preprocessedMessage` (Fact 3 caveat).
- **Response-shape conventions** — `result` uses camelCase keys, omits optional keys entirely (`output.node.ts:134-136` conditionally adds `previousRejectedSimplifiedMessage`), and uses `null` (not `undefined`) for "no answer" (`:130`). `status` is the string pair `"approved"` / `"failed"`.
- **Doc conventions** — `documentation/api-endpoints.md` pairs each endpoint with a JSON example + field table + copy-pasteable frontend TS types; `documentation/multi-agent-workflow.md:344-346` has a "Changelog" footer saying to update it when the output JSON shape changes.
- **No-network probe harness** — no test runner exists (Fact 14), but LLM-free end-to-end verification is cheap and I used it for Facts 5/10/11. Recipe: set `process.env.GROQ_API_KEY`, then `require("<src>/services/groq.client")` and assign over `groqClient.invoke` *and* `groqJsonClient.invoke` with a stub that branches on the system prompt (`"text preprocessor"` / `"question simplifier"` / `"precise validator"` / else = answer), *then* `require("<src>/agents/graphs/pipeline.graph")`, and run `npx ts-node --compiler-options '{"module":"commonjs","strict":false}' /tmp/<file>.ts`. Stub order matters (clients before the graph module). Monkeypatching exported *node-internal* callees does not work (Fact 11 note). My scripts: `/tmp/trace-race/{race,probe2b,probe3}.ts` — ephemeral, outside the repo. `.gitignore` also lists `backend/src/test-pipeline.ts`, `backend/test-run.ps1`, `backend/test-body*.json`, so ad-hoc local probe scripts are an established (if untracked) habit here.
- **`findings/README.md`** — the repo has a convention for parking durable knowledge. The concurrency bug (Fact 10) is exactly the kind of measured result that belongs there rather than only in a per-task file.

## 5. External research

Not needed. No unfamiliar library or published algorithm is involved; the LangGraph behaviour that mattered (last-write-wins reducers, conditional-edge routing, the resolved `invoke()` object containing the full annotated state) was measured directly against the installed `@langchain/langgraph`.

## 6. Risks and traps

1. **The trace will leak other users' prompt text under concurrency.** Fact 10/11, measured. Any trace sourced from `getRetryHistory()` inherits this. The existing `result` already leaks, so it's pre-existing — but a trace makes it more visible and more damaging (it is destined for a user-facing sidebar).
2. **Attempt numbers are not trustworthy as identity.** Fact 11.3 — two different requests both recorded `attempt: 1`. Dedup/grouping keyed on `attempt` can silently merge requests.
3. **Assembling in `pipeline.service.ts` is the most race-exposed option and can disagree with `result`.** Fact 12 — the service reads the globals one full Groq round-trip later than the output node does.
4. **Changing `pipeline.state.ts` is forbidden**, which rules out the otherwise-obvious "return the trace through graph state". Fact 12. Don't let the coder discover this halfway through.
5. **A top-level `data.trace` cannot come straight out of `output.node.ts`.** Its only channel is the `finalOutput` string, which the service parses into `result`. Without an explicit lift+delete, the field lands at `data.result.trace`, which is *not* "alongside `result`/`steps`". Fact 12(a).
6. **Per-attempt metadata beyond `prompt` does not exist in memory.** Fact 2 — per-attempt PII tags, kept clauses, algorithm string and effective compression level are either overwritten (`lastAgent2Result`) or never recorded. If the trace spec promises them, the task stops being "purely additive, no new computation".
7. **`preprocessedMessage` may contain raw LLM chatter** ("Here is the corrected text: …") and may be byte-identical to `originalMessage` on a non-string reply. Fact 3. Reasoned from `preprocess.node.ts:13-14`, not measured (no live API key).
8. **Both in-repo descriptions of the retry/output path are wrong.** `api-endpoints.md:168,170` and `SKILL.md:18,26,141,144`. Fact 5. A coder reading the docs instead of the graph will design a "no output stage" branch that can never happen — and `SKILL.md` will also mislead on `retryCount < 3`, output JSON keys, and `shouldSimplify`.
9. **`npm run lint` fails with exit 127 by design of this environment** (no eslint, no config) and **`npm run format:check` fails on 7 pre-existing files, three of which this task will edit**. Fact 14. A tester treating either as a regression will wrongly fail the task; a coder running `prettier --write` on those files will produce a large unrelated diff.
10. **Payload growth.** `app.set("json spaces", 2)` plus a trace repeating the original, the preprocessed text, up to 3 attempt texts and the answer means roughly 3-5× the current text volume per response. Fine for a hackathon demo; worth a sentence in the doc so the frontend doesn't render it unbounded.
11. **The existing `result.review` already mixes attempts** (score from the passing attempt, reason from the first failing one — Fact 6). Do not "fix" it while adding the trace; the constraints say `result`'s meaning must not change, and the `main`-branch frontend reads it.
12. **The `JSON.parse` fallback at `pipeline.service.ts:13-21` emits `question`, not `simplifiedMessage`.** Fact 4. If the trace is assembled in the service, decide what it contains on that (effectively dead) path rather than letting it throw on a missing `parsedResult.answer`.
13. **Review may skip the LLM entirely.** `reviewer.ts:398-412` returns early when `sim >= max(effectiveMin*1.3, effectiveMin+0.1)`, with `reason: "Similarity 0.813 well above threshold 0.468 — skipped LLM review"` (measured). So a trace entry's `reason` is sometimes a mechanical string and `missingItems` is absent. Don't present `reason` as "the reviewer's explanation" unconditionally.
14. **`documentation/multi-agent-workflow.md` is also drifted** (noticed while checking it; not load-bearing here, but don't copy numbers from it): `:97` states `threshold = max(0.15, base - retryCount * 0.1)` whereas `simplify.node.ts:77-88` has a fixed per-level base with `_retryCount` **unused**; `:242-246`'s level table lists `high` as SVT 0.58 / Top-k 38% / dedup 0.72 against the actual `0.42 / 0.58 / 0.84` (`context-simplifier.ts:58-61`); `:160-172` documents output keys `question` / `previousRejectedQuestion` instead of the actual `simplifiedMessage` / `previousRejectedSimplifiedMessage`.

## 7. Open questions

1. **Does this task also fix the request-scoping bug (Fact 10), or ship the trace on top of a known leak?** A scope decision for the user/coordinator, not something the coder should improvise. Options:
   - *Ship as-is* — the trace can contain another request's text. Not acceptable for a user-facing sidebar, in my reading.
   - *Minimal, contained fix* — thread a per-run collector instead of module globals. `simplify.node.ts`, `review.node.ts` and `output.node.ts` are all editable under the task's constraints (only `pipeline.graph.ts` edges, `pipeline.state.ts` schema, `increment-retry.node.ts` and `lib/` are frozen). Since `pipeline.state.ts` cannot carry a run id, the natural vehicle is `AsyncLocalStorage` (Node built-in, no new dependency) wrapped around `pipelineGraph.invoke()` in `pipeline.service.ts`, with `simplify.node.ts`'s accessors reading from the store and falling back to the current globals when no store is active.
   - **How to settle empirically either way:** re-run the Fact 10 probe (recipe in §4). The pass condition is a one-liner: A's response must contain `reqalpha` and must not contain `reqbravo`, and vice versa. Today it fails; the two-request no-retry variant fails too, so it is not a rare interleaving.
2. **Exact field name and shape** — must be decided and written down, not left to the coder. The facts constrain but don't determine it. One ordered-array shape that maps 1:1 onto available data (Facts 1-8) and nothing else: `trace: [{ stage: "preprocess", text }, { stage: "simplify", attempt, text }, { stage: "review", attempt, text, passed, similarityScore, reason, missingItems? }, …, { stage: "output", text }]` — where `review.text` is the attempt's `prompt` (Fact 7) and `output.text` is `parsedResult.answer` (Fact 8). Sub-questions: does the planner want an `originalMessage` entry at index 0 (available, and the natural first row of a sidebar, but not a "stage")? Flat array or `{ preprocess, attempts: [...], output }`? Flat + `stage`/`attempt` is closer to the existing `steps: string[]` it sits beside.
3. **Which assembly site?** Fact 12 lays out the three mechanically possible routes and why (c) is the most race-exposed. Option (a) is the only one that neither adds a new global nor widens the race window, at the cost of a `delete parsedResult.trace`. The planner must pick one and spell out the lift, because "put it in the service" and "put it in the output node" produce different `result` contents if the lift is forgotten.
4. **Should the wrong prose at `documentation/api-endpoints.md:168,170` be corrected in the same pass?** It is in the exact section being edited and is demonstrably false (Fact 5, settled by the quoted probe output). Strictly out of scope; cheap and in the blast radius.
5. **Is `data.trace` or `data.result.trace` what the `main`-branch sidebar expects?** TASK.md says "alongside the existing `result`/`steps`", which reads as top level, but the consuming code is on another branch and invisible from this worktree (`git ls-tree HEAD` shows only `backend/`, `documentation/`, `artifacts/`, `findings/`, `.claude/`, `CLAUDE.md`, `README.md`, `tsconfig.json`). Settle by asking, or by committing to top-level `data.trace` and documenting it in all five spots of Fact 13 so the frontend task has one source of truth.

---

Recorded 16 established facts (12 measured, 4 code-read) plus 14 risks and 5 open questions. **Most important: the task's "is the module-level retry history request-scoped?" question answers *no*, and I reproduced an actual cross-request data leak in the real graph — request A's response came back with request B's simplified text, B's similarity score and a wrong attempt number, with and without retries. The existing `result` field is already corrupted by this today.**

This should change the approach: the trace cannot be shipped as a pure read of `getRetryHistory()` without either accepting that it can expose another user's prompt, or scoping the run state per request first (AsyncLocalStorage around `pipelineGraph.invoke()` is the only vehicle available, since `pipeline.state.ts` is frozen). Secondary: `npm run lint` fails with exit 127 in this environment and `format:check` already fails on 3 of the files this task touches, so the tester needs that baseline, not "clean".
