
## 2026-10-07 — Remove openrouter.client.ts, migrate Agent 2/3 to Groq (medium)

Deleted `backend/src/services/openrouter.client.ts` and re-pointed Agent 2
(`llm-chat.ts`) and Agent 3 (`reviewer.ts`) at Groq. Added a second export
`groqJsonClient` (temperature 0) to `backend/src/services/groq.client.ts`
so the original `groqClient` (0.7, used by preprocess/output) is left
untouched while the two JSON-parsing agents get deterministic output.
`llm-chat.ts` now calls `groqJsonClient.invoke(messages)` directly with no
try/catch (preserves the error-vs-parse-failure asymmetry the analysis
flagged); `reviewer.ts` only had its import and call site swapped from
`openRouterChat` to `chat`, its existing try/catch fallback wrapper left
intact. Appended one `CHANGELOG_AI.md` entry.

Files changed: `backend/src/services/groq.client.ts`,
`backend/src/agents/lib/llm-chat.ts`, `backend/src/agents/lib/reviewer.ts`,
deleted `backend/src/services/openrouter.client.ts`, `CHANGELOG_AI.md`.

Test results (from `backend/`):

```
$ npx tsc --noEmit
exit=0

$ grep -rni openrouter . --include="*.ts" --include="*.json" --include="*.md" | grep -v node_modules
(no output, grep exit=1)

$ npx prettier --check src/agents/lib/llm-chat.ts src/services/groq.client.ts
Checking formatting...
All matched files use Prettier code style!
exit=0

$ npm run lint
sh: eslint: command not found
exit=127   (expected/environmental — eslint not installed)

$ npm run format:check
Checking formatting...
[warn] src/agents/lib/context-simplifier.ts
[warn] src/agents/lib/patterns.ts
[warn] src/agents/lib/reviewer.ts
[warn] src/agents/nodes/output.node.ts
[warn] src/agents/nodes/review.node.ts
[warn] src/agents/nodes/simplify.node.ts
[warn] src/agents/SKILL.md
Code style issues found in 7 files.
exit=1   (same 7 pre-existing files as baseline, no regression)
```

`git diff --stat` confined to the 4 planned files + `CHANGELOG_AI.md`; no
file in the must-not-touch list (pipeline.graph.ts, pipeline.state.ts,
increment-retry.node.ts, similarity.ts, patterns.ts, context-simplifier.ts,
preprocess.node.ts, output.node.ts, package.json/package-lock.json,
SKILL.md, documentation/) was touched.

Result: **PASS**

## 2026-10-07 — Fix cross-request data leak + add per-agent `trace` to pipeline response (hard)

Two-part hard task: (A) fixed a pre-existing, reproduced cross-request data leak in `simplify.node.ts`'s module-level retry-history tracking (`lastAgent2Result`, `currentAttemptNumber`, `retryHistory` were process-wide globals) by moving them into a new `AsyncLocalStorage`-based per-request context, `backend/src/agents/state/run-context.ts`, wrapped around `pipelineGraph.invoke()` in `pipeline.service.ts`. (B) Added a new top-level `data.trace: TraceEntry[]` field to `POST /api/pipeline/run`'s response — one `preprocess` entry, one `simplify`+`review` pair per attempt (including rejected attempts), one `output` entry — assembled in `pipeline.service.ts` from the request's own `runContext.retryHistory` (never the old global-reading `getRetryHistory()`).

Files changed: `backend/src/agents/state/run-context.ts` (new), `backend/src/agents/nodes/simplify.node.ts`, `backend/src/services/pipeline.service.ts`, `backend/src/types/index.ts`, `backend/src/agents/SKILL.md`, `documentation/api-endpoints.md`, `documentation/multi-agent-workflow.md`. `review.node.ts`/`output.node.ts` deliberately untouched (confirmed byte-identical via `git diff`).

Verified independently (not just trusting the coder's report):
- `git diff --stat` / `git status --short` confined to exactly the 7 files above + new `run-context.ts` + non-code `artifacts/*` — nothing in the must-not-touch list touched.
- Read all changed files: no module-level mutable retry-history state remains in `simplify.node.ts`; `pipeline.service.ts` reads `runContext.retryHistory` directly; `trace` is a sibling of `result`/`steps`, never nested inside `result`.
- Re-ran `/tmp/trace-probe/probe.ts` myself (`npx ts-node -T --compiler-options '{"module":"commonjs","strict":false,"declaration":false,"declarationMap":false}' /tmp/trace-probe/probe.ts` from `backend/`), confirmed GREEN with 27/27 PASS, 0 FAIL/SKIP, ending `RESULT: ALL CHECKS PASSED`.
- Extra confidence check: temporarily reverted `pipeline.service.ts`'s `runContextStorage.run()` wrapper back to a plain `pipelineGraph.invoke(...)` call, reran the probe — it went RED (`FAIL A: does NOT mention reqbravo -- LEAK`, `FAIL ... one review each -- 0/0`), proving the probe is actually sensitive to the fix. Restored the file (`cp` from backup) and reran — GREEN again, output below.
- `npx tsc --noEmit` exit 0; `npm run build` exit 0; `npm run format:check` lists exactly the same 7 pre-existing files as the analysis baseline (no new dirty files); `npm run lint` → `sh: eslint: command not found`, exit 127 (environmental, pre-existing, not a regression).
- `documentation/api-endpoints.md`'s diff reviewed: previously-false "output only runs when review passes" claim corrected to "Always runs, including when every retry failed"; new `trace`/`TraceEntry` docs match the actual `TraceEntry` type in `types/index.ts` field-for-field.

Test result (actual probe output, GREEN run):
```
--- concurrent: A (slow simplify) then B 50ms later ---
PASS  A: mentions own tag reqalpha
PASS  A: does NOT mention reqbravo
PASS  A: steps unchanged  -- ["preprocess","simplify","review","output"]
PASS  A: no trace nested in result
PASS  A: trace[0] is preprocess  -- {"stage":"preprocess","text":"hello this is reqalpha speaking, how do i deploy the reqalpha service and its caching layer to production?"}
PASS  A: last entry is output  -- {"stage":"output","text":"stub answer for reqalpha"}
PASS  A: >=1 simplify, one review each  -- 1/1
PASS  A: every trace text belongs to this request
PASS  A: every entry has a string text
PASS  B: mentions own tag reqbravo
PASS  B: does NOT mention reqalpha
PASS  B: steps unchanged  -- ["preprocess","simplify","review","output"]
PASS  B: no trace nested in result
PASS  B: trace[0] is preprocess  -- {"stage":"preprocess","text":"hello this is reqbravo speaking, how do i deploy the reqbravo service and its caching layer to production?"}
PASS  B: last entry is output  -- {"stage":"output","text":"stub answer for reqbravo"}
PASS  B: >=1 simplify, one review each  -- 1/1
PASS  B: every trace text belongs to this request
PASS  B: every entry has a string text
--- sequential sanity ---
PASS  seqA: mentions own tag reqalpha
PASS  seqA: does NOT mention reqbravo
PASS  seqA: steps unchanged  -- ["preprocess","simplify","review","output"]
PASS  seqA: no trace nested in result
PASS  seqA: trace[0] is preprocess  -- {"stage":"preprocess","text":"hello this is reqalpha speaking, how do i deploy the reqalpha service and its caching layer to production?"}
PASS  seqA: last entry is output  -- {"stage":"output","text":"stub answer for reqalpha"}
PASS  seqA: >=1 simplify, one review each  -- 1/1
PASS  seqA: every trace text belongs to this request
PASS  seqA: every entry has a string text
RESULT: ALL CHECKS PASSED
```

RED run (after temporarily reverting the AsyncLocalStorage wrapper, to prove probe sensitivity):
```
PASS  A: mentions own tag reqalpha
FAIL  A: does NOT mention reqbravo  -- LEAK
PASS  A: steps unchanged  -- ["preprocess","simplify","review","output"]
PASS  A: no trace nested in result
PASS  A: trace[0] is preprocess
PASS  A: last entry is output
FAIL  A: >=1 simplify, one review each  -- 0/0
...
RESULT: FAILURES PRESENT
```

Static gates:
```
$ npx tsc --noEmit        -> exit 0
$ npm run build           -> exit 0
$ npm run format:check    -> warns on exactly 7 pre-existing files (context-simplifier.ts, patterns.ts, reviewer.ts, output.node.ts, review.node.ts, simplify.node.ts, SKILL.md), exit 1 (baseline, no regression)
$ npm run lint            -> sh: eslint: command not found, exit 127 (environmental)
```

Result: **PASS**.
