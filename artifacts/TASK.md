# Task

`backend/src/services/openrouter.client.ts` is outdated and must be removed.
Switch Agent 2 (simplify) and Agent 3 (review) from OpenRouter to the Groq
provider, matching how `backend/src/services/groq.client.ts` already powers
the preprocess and output nodes.

Desired end state: no code references OpenRouter anywhere in `backend/`,
`openrouter.client.ts` is deleted, and Agent 2 / Agent 3 call Groq instead,
with equivalent behavior (same inputs/outputs, same JSON-parsing contracts
in `reviewer.ts` and `context-simplifier.ts`).

# Difficulty

medium

# Notes

Facts already confirmed (don't re-derive these, build on them):

- Exactly two call sites use OpenRouter today:
  - `backend/src/agents/lib/llm-chat.ts` — `chat()` calls
    `openRouterChat("agent2", messages)`. This is Agent 2's LLM call,
    used by `context-simplifier.ts`'s `llmSimplifyQuestion`.
  - `backend/src/agents/lib/reviewer.ts` — `llmReview()` (around line 337)
    calls `openRouterChat("agent3", messages)` directly. This is Agent 3's
    LLM call.
  - Both pass plain `{ role: "system"|"user"; content: string }[]` arrays
    and expect back a plain `string` (the raw model output, which callers
    then JSON-parse themselves via `extractJsonFromResponse`).
- `backend/src/services/groq.client.ts` exports a single shared
  `groqClient` (`ChatGroq`, model hardcoded `"openai/gpt-oss-120b"`,
  `apiKey: config.GROQ_API_KEY`). Current callers (`preprocess.node.ts`,
  `output.node.ts`) use the LangChain call shape:
  `groqClient.invoke([new SystemMessage(...), new HumanMessage(...)])` and
  read `response.content` (a string).
- `backend/src/config/index.ts` (zod schema) already has `GROQ_API_KEY` —
  it does **not** have any `OPENROUTER_*` entry. `openrouter.client.ts`
  reads `process.env.OPENROUTER_API_KEY` / `OPENROUTER_MODEL_AGENT_2` /
  `OPENROUTER_MODEL_AGENT_3` directly via raw `process.env`, bypassing the
  central config entirely — part of why it's "outdated" vs. the rest of
  the codebase.
- OpenRouter used **two different models** on purpose: `agent2` defaulted
  to `deepseek/deepseek-v4-flash` ("strong reasoning... for simplify/
  rewrite") and `agent3` to `qwen/qwen3-8b` ("light model... for review/
  supervision"). The current single shared `groqClient` has **one** model
  for everything. Open question for analyzer/planner: keep one Groq model
  for both agents (simplest, matches how preprocess/output already share
  it), or add per-agent model selection on the Groq side too (closer to
  original intent)? Decide and document the choice; don't silently drop
  the distinction without saying so.
- `backend/.env` is gitignored and not present in this worktree — any
  `OPENROUTER_*` entries a developer has locally become dead config after
  this change; no action needed in the repo itself beyond not requiring
  them in `config/index.ts`.

Constraints:

- This is a provider swap only. Do not change pipeline graph edges
  (`pipeline.graph.ts`), retry logic (`increment-retry.node.ts`,
  `pipeline.state.ts`), or any algorithm in `lib/` (`similarity.ts`,
  `patterns.ts`, `context-simplifier.ts`'s SVT/Top-k/NoisyKNN logic) beyond
  the LLM call itself.
- Preserve the existing JSON-parsing contracts: `reviewer.ts`'s
  `extractJsonFromResponse` / `normalizeChecks` and
  `context-simplifier.ts`'s equivalent still expect the same kind of raw
  string response back from whichever client replaces OpenRouter.
- Delete `backend/src/services/openrouter.client.ts` once nothing imports
  it, and remove any now-unused OpenRouter-only dependency from
  `backend/package.json` (check for one before assuming there is one).
