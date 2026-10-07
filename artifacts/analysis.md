# Analysis — remove `openrouter.client.ts`, move Agent 2 / Agent 3 to Groq

No false premise found. Every factual claim in `Artifacts/TASK.md` that I checked held up, with **one correction** (the OpenRouter model slugs are *not* stale/invalid — Fact 10) and **one claim that resolves to "nothing to do"** (there is no OpenRouter-only dependency — Fact 8).

## 1. Task restated

Delete `backend/src/services/openrouter.client.ts` and re-point its two live callers — `backend/src/agents/lib/llm-chat.ts` (Agent 2's LLM call, used by `context-simplifier.ts`) and `backend/src/agents/lib/reviewer.ts`'s `llmReview` (Agent 3) — at the existing Groq client, so all four LLM call sites go through `services/groq.client.ts`. Behaviour must be equivalent: both callers must still receive a **raw string** they JSON-parse themselves. Nothing about the graph, retry logic or the `lib/` algorithms may change.

The task is **not ambiguous**, but it hands us one genuine decision: OpenRouter used two models (one per agent); the shared `groqClient` has one. Fact 11 settles that from the repo's own documentation rather than by taste.

## 2. Established facts

### Fact 1 — exactly two live OpenRouter call sites; a third export is dead code
`grep -rni openrouter --include=*.ts backend/`:

```
backend/src/agents/lib/reviewer.ts:5:import { openRouterChat } from "../../services/openrouter.client";
backend/src/agents/lib/reviewer.ts:337:    const response = await openRouterChat("agent3", messages);
backend/src/agents/lib/llm-chat.ts:1:import { openRouterChat } from "../../services/openrouter.client";
backend/src/agents/lib/llm-chat.ts:6:  return openRouterChat("agent2", messages);
```

TASK.md's "around line 337" is exact: `reviewer.ts:337`. Additionally `openRouterChatFromLangChain` (`openrouter.client.ts:65-74`) and its helper `toOpenRouterRole` (`:18-22`) are **imported by nothing**. Only `openRouterChat` is live.

### Fact 2 — the full Agent 2 call chain
- `context-simplifier.ts:5` — `import { chat } from "./llm-chat";`
- `context-simplifier.ts:345-348` — `async function llmSimplifyQuestion(text: string, level: CompressionLevel): Promise<{ sanitized: string; structured: Record<string, unknown> }>`
- `context-simplifier.ts:409-412` — the only `chat()` call in the repo:
  ```ts
  const llmOutput = await chat([
    { role: "system", content: systemPrompt },
    { role: "user", content: text },
  ]);
  ```
- `context-simplifier.ts:414-420` — `try { extractJsonObject(llmOutput) } catch { return { sanitized: text, structured: { ..., error: "LLM parsing failed" } } }`
- `llm-chat.ts` is 7 lines; `chat()` is `(messages: Array<{ role: "system" | "user"; content: string }>) => Promise<string>`.
- Callers: `simplifyContext` (`context-simplifier.ts:440-443`) → `simplifyNode` (`simplify.node.ts:113`).

**Important asymmetry:** the `await chat(...)` at line 409 is *outside* the `try` at line 414. A thrown LLM/network error propagates out of `llmSimplifyQuestion` → `simplifyContext` → `simplifyNode` → the graph (a 5xx). Only *parse* failures are caught. Agent 3 is the opposite: `reviewer.ts:336-356` wraps call **and** parse, so any throw degrades to `fallbackReview`. The replacement must keep the same throw-vs-return behaviour.

### Fact 3 — Agent 3's call site and parse contract
`reviewer.ts:324-356`:
```ts
const messages = [
  { role: "system" as const, content: "You are a precise validator. Output ONLY valid JSON. ..." },
  { role: "user"   as const, content: buildReviewPrompt(original, sanitized, simScore, agent2Meta) },
];
const response = await openRouterChat("agent3", messages);
const result = extractJsonFromResponse(response);   // reviewer.ts:278-293
```
I verified this exact array shape is assignable to `llm-chat.ts`'s `chat()` signature (the `as const` on `role` is what makes it work) by compiling a copy against the repo's own `node_modules` → `tsc` exit 0. **So reviewer.ts can call `chat(messages)` with no change to the messages array.**

### Fact 4 — `groq.client.ts` has no `temperature`; the library default is 0.7
```ts
export const groqClient = new ChatGroq({
  apiKey: config.GROQ_API_KEY,
  model: "openai/gpt-oss-120b",
});
```
`openrouter.client.ts:38` sent `temperature: 0`. From installed `@langchain/groq@0.1.3` `dist/chat_models.cjs`:
```
540:  Object.defineProperty(this, "temperature", { ... value: 0.7 });
602:  this.temperature = fields?.temperature ?? this.temperature;
642:  return { ...params, stop, model: this.model, temperature: this.temperature, max_tokens: this.maxTokens };
```
**Measured: the shared `groqClient` sends `temperature: 0.7`.** `temperature` appears exactly once in the whole repo (`grep -rn temperature --include=*.ts --include=*.md .` → only `openrouter.client.ts:38`). A naive swap silently moves Agent 2's rewrite and Agent 3's JSON verdict from deterministic to stochastic. See R1.

### Fact 5 — `ChatGroq.invoke()` accepts plain `{role, content}[]` directly
Type level, compiled against the repo's `node_modules`, exit 0: `c.invoke(msgs)` with `msgs: Array<{role:"system"|"user";content:string}>` and with the wider `"system"|"user"|"assistant"` union. Runtime, `@langchain/core` coercion maps roles exactly as `toOpenRouterRole` did:
```
system    -> SystemMessage | system | "S"
user      -> HumanMessage  | human  | "U"
assistant -> AIMessage     | ai     | "A"
```

### Fact 6 — `response.content` is always a `string` for this provider
`_generateNonStreaming` builds each generation with `const text = part.message?.content ?? "";` (`chat_models.cjs:771`) — string, possibly `""`, never a content-block array. It is still *typed* `MessageContent`, which is why `preprocess.node.ts:14` and `output.node.ts:117` narrow with `typeof response.content === "string"`.

### Fact 7 — current baseline: type-check clean, **lint broken**, format already dirty
From `backend/` after `npm ci` (196 packages, 5s):
```
$ npx tsc --noEmit        → exit 0, no output
$ npm run lint            → sh: eslint: command not found
$ npm run format:check    → "Code style issues found in 7 files"
```
- `npm run lint` is `eslint src --ext .ts`, but **eslint is in neither `package.json` nor `package-lock.json`** (`grep -c eslint package-lock.json` → `0`). CLAUDE.md tells agents to run lint; that command cannot succeed here.
- `format:check` already fails on HEAD for `context-simplifier.ts`, `patterns.ts`, `reviewer.ts`, `output.node.ts`, `review.node.ts`, `simplify.node.ts`, `agents/SKILL.md` — **pre-existing**.
- `npx tsc --noEmit` is the only working gate, and it passes on HEAD, so any post-change failure is attributable.

### Fact 8 — there is **no** OpenRouter-only dependency to remove
Deps: `@langchain/core`, `@langchain/groq`, `@langchain/langgraph`, `cors`, `dotenv`, `express`, `express-rate-limit`, `helmet`, `zod`. `openrouter.client.ts` uses **native `fetch`** (`:41`) — no SDK. Its only imports are `@langchain/core/messages` (`:1-2`), still used by `preprocess.node.ts:1` and `output.node.ts:2`. **`backend/package.json` needs no edit.** TASK.md asked us to check — checked, answer is no.

### Fact 9 — config / env
- `config/index.ts:6-11` — schema is exactly `{ PORT, NODE_ENV, GROQ_API_KEY, LOG_LEVEL }`. No `OPENROUTER_*`. Confirmed.
- `openrouter.client.ts:9-15` reads `OPENROUTER_API_KEY`, `OPENROUTER_MODEL_AGENT_2`, `OPENROUTER_MODEL_AGENT_3` raw. Confirmed.
- No `backend/.env` and no `.env.example` (`ls -a backend/` → `.dockerignore .prettierignore .prettierrc Dockerfile package-lock.json package.json src tsconfig.json`).
- `config/index.ts:14-17` calls `process.exit(1)` on a schema miss. Measured:
  ```
  $ node -e "require('ts-node').register(); require('./src/services/groq.client')"
  Invalid environment variables: { GROQ_API_KEY: [ 'Required' ] }
  # process dies; nothing after the require runs
  ```
  No `GROQ_API_KEY` is set in this environment. See R4, Q2.

### Fact 10 — correction: the OpenRouter models are real and current
I expected `deepseek/deepseek-v4-flash` to be an invalid slug (which would mean the OpenRouter path was already dead). It is not. Live query of `https://openrouter.ai/api/v1/models` (465 models):
```
deepseek/deepseek-v4-flash -> EXISTS
qwen/qwen3-8b              -> EXISTS
```
"Outdated" means *architecturally* outdated (second provider, second API key, bypasses the central zod config, duplicated role mapping) — **not broken**. Consequence: this swap genuinely gives up a dedicated strong-reasoning model for Agent 2. Worth stating in the changelog.

### Fact 11 — the repo's own docs already prescribe the end state, including the single-model answer
`documentation/multi-agent-workflow.md:291-293`:
> ### `llm-chat.ts`
> Thin wrapper: maps `{ role, content }[]` to LangChain messages and calls `groqClient`. **Shared by Agent 2 simplify, Agent 3 review, preprocess, and output answer generation.**

Also `:9` ("Each 'agent' is either an LLM call (Groq) or a deterministic algorithm module"), `:84`, `:117`, and `backend/src/agents/SKILL.md:206` (`GROQ_API_KEY` | "All LLM calls" | required, one hardcoded model). `grep -rni "openrouter|deepseek|qwen" documentation/ README.md backend/src/agents/SKILL.md backend/Dockerfile` → **zero hits**: the docs never mentioned OpenRouter; the code drifted from the docs. Documented intent: **one shared `groqClient`, one model, reached through `llm-chat.ts` by all four call sites.**

### Fact 12 — a second `ChatGroq` with a different model is trivially available if wanted
`ChatGroqInput` accepts `apiKey`, `model`, `modelName`, `temperature`, `maxTokens`, `stop`, `stopSequences`, `streaming`, `baseUrl`, `timeout`, `defaultHeaders`, `defaultQuery`, `fetch`, `httpAgent`; constructor is `constructor(fields?: ChatGroqInput)`; class extends `BaseChatModel<ChatGroqCallOptions, AIMessageChunk>`. `chat_models.cjs:602-604` confirms `model` wins over `modelName`. I compiled `new ChatGroq({ apiKey, model: "openai/gpt-oss-120b", temperature: 0 })` successfully. A second named export in `groq.client.ts` is a 4-line change with no config implication (both share `config.GROQ_API_KEY`). Groq production chat IDs if a lighter reviewer is wanted: `openai/gpt-oss-120b` (current), `openai/gpt-oss-20b`, `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`.

### Fact 13 — `openai/gpt-oss-120b` does not leak reasoning into `content`
On Groq, gpt-oss models return chain-of-thought in a **separate `reasoning` field**, not inline (gpt-oss uses `include_reasoning`, not `reasoning_format`). `@langchain/groq` reads only `part.message.content` (Fact 6), so reasoning never reaches the parsers. Strictly better than the old `qwen/qwen3-8b` reviewer, which emits inline `<think>` blocks. See R3.

### Fact 14 — the graph and surrounding wiring need no change
`pipeline.graph.ts` (28 lines) imports only the five node modules and wires `__start__ → preprocess → simplify → review →(conditional) output | increment-retry → simplify`, `output → __end__`. No LLM client referenced. `services/pipeline.service.ts` only invokes the compiled graph. `api/routes/warmup.routes.ts` is a static `res.json({ ready: true })` — it does **not** warm an LLM client.

## 3. Relevant code

| File | Lines | Role |
|---|---|---|
| `backend/src/services/openrouter.client.ts` | 1-74 | To delete. Live surface only `openRouterChat` (`:29-59`); `:65-74` + `:18-22` dead. `temperature: 0` at `:38`. |
| `backend/src/services/groq.client.ts` | 1-7 | Shared `ChatGroq`, `model: "openai/gpt-oss-120b"`, `apiKey: config.GROQ_API_KEY`. No `temperature`. |
| `backend/src/agents/lib/llm-chat.ts` | 1-7 | `chat(messages: Array<{role:"system"\|"user";content:string}>): Promise<string>`. Documented home of the role→LangChain mapping. |
| `backend/src/agents/lib/context-simplifier.ts` | 5, 331-343, 345-348, **409-412**, 414-420, 440-443 | Agent 2. Call at 409 is **outside** the try. |
| `backend/src/agents/lib/reviewer.ts` | 5, 278-293, 295-316, 318-357 (**337**) | Agent 3. Messages at 324-334, call at 337, parse 338-342, `fallbackReview` on any throw. |
| `backend/src/agents/nodes/preprocess.node.ts` | 1-17 (6, 13-14) | Reference call shape. |
| `backend/src/agents/nodes/output.node.ts` | 2-3, 107-118 | Same reference shape. |
| `backend/src/config/index.ts` | 6-19 | zod schema; `process.exit(1)` at 16. |
| `backend/package.json` | 9, 13-23 | No OpenRouter dep; `lint` script unrunnable. |

Import graph after the swap: `pipeline.graph → {preprocess,simplify,review,output,increment-retry}.node`; `simplify.node → context-simplifier → llm-chat → groq.client → config`; `review.node → reviewer → (llm-chat or groq.client) → config`.

## 4. Prior art in this repo

- **Canonical Groq call shape** — `preprocess.node.ts:6-14` and `output.node.ts:107-118`: `await groqClient.invoke([new SystemMessage(...), new HumanMessage(...)])` then `typeof response.content === "string" ? response.content : <fallback>`. Reuse it.
- **The role→message mapping has a documented home**: `llm-chat.ts`, per `documentation/multi-agent-workflow.md:293`. `@langchain/core`'s `coerceMessageLikeToMessage` already does it for free (Fact 5).
- **JSON extractors to leave alone**: `reviewer.ts:278-293`, `reviewer.ts:72-79`, `context-simplifier.ts:331-343`, `output.node.ts:73-98`.
- **Changelog convention**: `CHANGELOG_AI.md` append-only, Reviewer-only; its existing Groq entry is a template (and records a now-stale model, `llama-4-scout-17b-16e-instruct`).
- **Formatting**: `backend/.prettierrc` — `printWidth: 100`, double quotes, `trailingComma: "all"`, semicolons, 2-space, LF.

## 5. External research

- `@langchain/groq@0.1.3` typings (`https://unpkg.com/@langchain/groq@0.1.3/dist/chat_models.d.ts`) and compiled source read locally after `npm ci` — Facts 4, 6, 12. Default `temperature` 0.7 at `chat_models.cjs:540`; content coerced to string at `:771`.
- Groq reasoning docs (`https://console.groq.com/docs/reasoning`) — gpt-oss uses `include_reasoning`, reasoning in a separate field. Fact 13.
- Groq model catalog (`https://console.groq.com/docs/models`) — production IDs, Fact 12.
- OpenRouter model list API (`https://openrouter.ai/api/v1/models`) — Fact 10.

## 6. Risks and traps

**R1 — Temperature regression, 0 → 0.7 (highest-impact trap).** `openrouter.client.ts:38` pinned `temperature: 0`; `groq.client.ts` sets none and the library defaults to `0.7` (measured, `chat_models.cjs:540`). Both migrated call sites demand strict JSON (`reviewer.ts:328`; `context-simplifier.ts:405-407`). At 0.7 the model is materially more likely to break the JSON contract, and each failure is **silent**: `context-simplifier.ts:418-419` quietly returns the *unsimplified* input as the "simplified" question, and `reviewer.ts:353-355` quietly downgrades to `fallbackReview`. Review verdicts also stop being reproducible, making the retry loop non-deterministic. Note that setting temperature on the shared client would *also* change preprocess and output — so "where does temperature go" is a real decision (Q1).

**R2 — Error-path asymmetry.** Agent 2's `await chat(...)` is *outside* its `try` (`:409` vs `:414`) → an API throw becomes a request failure. Agent 3's is *inside* (`reviewer.ts:336-356`) → a throw becomes `fallbackReview`. Both are load-bearing and both depend on the replacement **throwing on API error and returning a plain string otherwise**. `ChatGroq.invoke` does throw, so this holds — but if anyone wraps the new call in a `try/catch` returning `""`, Agent 2 silently passes the raw prompt through, PII and all (the LLM rewrite is what strips names, `context-simplifier.ts:401`), and Agent 3 silently records `"No JSON object found"`. **Do not add a swallowing try/catch.**
Secondary: `@langchain/groq` sets groq-sdk `maxRetries: 0` (`:591`) but routes through LangChain's `AsyncCaller` (`this.caller.call`, `:623`), default 6 retries. The raw `fetch` retried **zero** times. Transient failures now take ~6x longer to surface — latency only, but it can look like a hang during testing.

**R3 — Dead `<think>` regex in both parsers (pre-existing; do not "fix" blindly).** `reviewer.ts:280` and `context-simplifier.ts:333` both contain:
```ts
body = body.replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, "").trim();
```
Opening tag `<think>`, closing tag `</redacted_thinking>` — mismatched, so it **never matches**. Aimed at qwen3-8b's inline reasoning. Per Fact 13 it is harmless dead code after the swap. Out of scope, but must not be cited as "reasoning stripping already works".

**R4 — Import-time `process.exit(1)` when `GROQ_API_KEY` is unset.** `reviewer.ts` currently has no transitive path to `config`; after the swap it will. `config/index.ts:16` exits (measured, Fact 9). Not a new failure mode for the server (`preprocess.node.ts:2` already pulls in `config`), but it **will** kill any narrow unit test importing `reviewer.ts` without an env var. Also `GROQ_API_KEY: z.string()` has no `.min(1)`, so an empty `GROQ_API_KEY=` passes zod then throws `"Groq API key not found..."` from the `ChatGroq` constructor (`chat_models.cjs:581-583`) — a more confusing error.

**R5 — `npm run lint` cannot pass.** Measured `sh: eslint: command not found`; eslint appears 0 times in `package-lock.json`. CLAUDE.md instructs running lint. Treat a failure of this exact shape as environmental. Real gate: `npx tsc --noEmit`.

**R6 — Do not run `npm run format`.** `format:check` already reports 7 dirty files on HEAD including `reviewer.ts` and `context-simplifier.ts`. `prettier --write .` would reformat hundreds of unrelated lines and bury the diff.

**R7 — `response.content` must be narrowed.** Typed `MessageContent` even though always a string (Fact 6). `return response.content;` from a `Promise<string>` fails `tsc`. Follow `preprocess.node.ts:14`.

**R8 — Prompts are model-tuned; do not touch.** `buildReviewPrompt` (`reviewer.ts:224-276`) and the level strategies + system prompt (`context-simplifier.ts:349-407`) were written for deepseek/qwen. Rewriting for gpt-oss is out of scope and would make regressions unattributable. (Unrelated pre-existing bug nearby: `context-simplifier.ts:404` has `"${strategy.examples}\n\n"` inside a **double-quoted** string, so the few-shot examples are never interpolated — the literal `${strategy.examples}` is sent. Note it; do not fix it here.)

**R9 — Docs are already ahead of the code, with one stale number.** `documentation/multi-agent-workflow.md:291-293` already describes the post-change design, so it needs no edit. But `backend/src/agents/SKILL.md:206-207` still claims the model is `meta-llama/llama-4-scout-17b-16e-instruct` while `groq.client.ts:6` says `openai/gpt-oss-120b` (commit `7675ac7`). SKILL.md self-identifies as drift-prone; CLAUDE.md says prefer `documentation/`.

**R10 — Module-level mutable state means no concurrent smoke-testing.** `simplify.node.ts:15-17` keeps `lastAgent2Result`, `currentAttemptNumber`, `retryHistory` at module scope; `SKILL.md:213` confirms "safe only for single-threaded use. Concurrent requests will race." Any end-to-end verification must issue requests **serially**.

## 7. Open questions

**Q1 — Where does `temperature: 0` go, if anywhere?** (R1; decide before coding.) (a) Add to the shared `groqClient` — restores determinism for Agent 2/3 *and* silently changes preprocess + output, which have run at 0.7. (b) Per-call — not possible: `ChatGroqCallOptions` is only `headers | tools | tool_choice | response_format` (Fact 12). (c) A second exported `ChatGroq` with `temperature: 0` used only by the two JSON-parsing agents. *Settle empirically:* with a real key, run the `context-simplifier.ts:409` prompt ~10x at 0.7 and 10x at 0 and count how many outputs survive `extractJsonObject`.

**Q2 — How will this be verified beyond `tsc --noEmit`?** No test runner, no `test` script, no `GROQ_API_KEY` here (Fact 9). `.gitignore` shows a developer once had `backend/src/test-pipeline.ts`, `test-body.json`, `test-run.ps1`, `test-body-specific-case.json` — all gitignored and absent. "Equivalent behaviour" is currently unfalsifiable. *Settle:* either the coordinator supplies a `GROQ_API_KEY` for one serial `POST /api/pipeline/run`, or the tester explicitly scopes acceptance to `npx tsc --noEmit` + `grep -ri openrouter backend/src` returning nothing. Decide, don't let the tester improvise.

**Q3 — One Groq model for both agents, or two?** Fact 11 is strong evidence for **one** (docs already specify a single shared `groqClient` for all four call sites); Fact 12 shows two would be cheap. Either way TASK.md requires stating it: the honest framing is "Agent 2 loses a dedicated strong-reasoning model (`deepseek/deepseek-v4-flash`, still a valid live slug per Fact 10) in exchange for one provider and one API key."

**Q4 — Should Agent 3 go through `llm-chat.ts` or import `groqClient` directly?** `documentation/multi-agent-workflow.md:293` says `llm-chat.ts` is shared by Agent 3; Fact 3 confirms `reviewer.ts`'s messages array type-checks against `chat()` unchanged, so this costs one import swap and one call-site rename. Flagging it only because the same doc claims preprocess/output use `llm-chat.ts`, which they do not (`preprocess.node.ts:2`, `output.node.ts:3` import `groqClient` directly) — so the doc is partly aspirational; pick the subset you want rather than chasing full doc conformance inside a provider swap.

### Environment note
`backend/node_modules` was absent; I ran `npm ci` (196 packages) so the type-check could be measured. It is gitignored and the coder/tester will need it. No tracked file was modified — `git status --porcelain` shows only the pre-existing `artifacts/TASK.md` and `artifacts/state.json`.
