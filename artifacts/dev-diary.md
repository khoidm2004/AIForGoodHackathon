
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
