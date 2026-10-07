# Task

Add a per-agent trace to the pipeline API response: for each stage
(preprocess, simplify/Agent 2, review/Agent 3, output), expose the actual
text produced/evaluated at that stage — not just the stage name. This is
backend groundwork for a new frontend feature (sidebar panel, tracked
separately on `main`) that shows the user what their message looked like
after each agent ran, for reference.

Desired end state: `POST /api/pipeline/run`'s response includes a new
field (alongside the existing `result`/`steps`) that lists, per stage, the
text at that point in the pipeline — including every simplify/review retry
attempt, not just the final one. Document the new field in
`documentation/api-endpoints.md`.

# Difficulty

hard

(Re-filed from `medium` after analysis: the analyzer found and reproduced a
pre-existing cross-request data leak in `simplify.node.ts`'s module-level
retry-history state — see `Artifacts/analysis.md` Fact 9-11. Decision:
**fix the request-scoping bug as part of this task**, before/alongside
adding the trace, rather than shipping the trace on top of a known leak.
Per `Artifacts/analysis.md` Open Question 1, the fix vehicle is
`AsyncLocalStorage` (Node built-in, no new dependency) wrapped around
`pipelineGraph.invoke()` in `pipeline.service.ts`, since `pipeline.state.ts`'s
schema is frozen and can't carry a per-request id.)

# Notes

Facts already confirmed (don't re-derive, build on them):

- `backend/src/services/pipeline.service.ts`'s `runPipeline` calls
  `pipelineGraph.invoke(...)`, which returns the **full** `PipelineState`
  (`originalMessage`, `preprocessedMessage`, `simplifiedMessage`,
  `reviewPassed`, `finalOutput`, `compressionLevel`, `retryCount` — see
  `backend/src/agents/state/pipeline.state.ts`). Today `runPipeline` only
  reads `graphResult.finalOutput` (parsed as JSON) and hardcodes
  `steps: ["preprocess", "simplify", "review", "output"]` as plain stage
  name strings. All the other state fields are discarded.
- `backend/src/agents/nodes/output.node.ts` already imports
  `getRetryHistory()` from `simplify.node.ts`, which returns the **full**
  retry history for the current request: an array of
  `{ attempt, prompt, passed, similarityScore, reason, missingItems }`,
  one entry per simplify+review round. This is the richest existing
  source of "what did simplify produce, and did review pass it" — review
  doesn't produce its own text, it evaluates simplify's `prompt` for that
  attempt, so reuse this rather than inventing a separate review-text
  concept.
- `output.node.ts`'s `formatRetryHistory()` already reduces this same
  history down to a single `approvedSimplifiedMessage` /
  `rejectedSimplifiedMessage` pair for the existing `result.review` field
  — this task asks for the **per-attempt** detail that function currently
  throws away, not a replacement for it.
- This is purely additive: the data needed already exists in memory during
  a single pipeline run (within `simplify.node.ts`'s module-level retry
  history and the graph state). No new computation, no new LLM calls.

Open questions for the analyzer/planner to settle concretely (don't leave
these for the coder to guess at):

- Exact shape of the new field — e.g. an ordered `trace`/`stages` array
  with one entry per actual pipeline step that ran (`preprocess` once,
  then one `simplify`+`review` pair per attempt, then `output`), each
  carrying at minimum the stage name and its text. Name it, shape it, and
  write it into `documentation/api-endpoints.md`'s existing response
  schema section.
- Where is the cleanest place to assemble this — inside `output.node.ts`
  (which already has `getRetryHistory()` and the graph `state`), or in
  `pipeline.service.ts` after `graphResult` comes back? Pick one; don't
  duplicate the assembly logic in both places.
- `simplify.node.ts`'s retry history is module-level mutable state
  (documented elsewhere as "safe only for single-threaded use, concurrent
  requests will race") — confirm this new trace field reads from the
  *same* request's history and doesn't leak another in-flight request's
  data under concurrency; if it's already scoped per-call, say so with
  evidence rather than assuming.

# Constraints

- Do not change `pipeline.graph.ts` edges, `pipeline.state.ts`'s schema,
  `increment-retry.node.ts`, or any algorithm in `lib/` — this is a
  response-shape addition only, not a pipeline behavior change.
- Do not change the existing `result`/`steps` fields' meaning or remove
  anything currently in the response — only add to it, so existing
  frontend code (`main` branch) doesn't break.
- No frontend/sidebar work — that's a separate task on `main`, after this
  one lands.
