## Project Context

Backend for **PrivacyGuard** (AI For Good Hackathon, Trust & Responsible AI
track): a Node.js/TypeScript/Express service that runs the user's raw chat
message through a sequential multi-agent LangGraph pipeline before an LLM
answers it, to strip sensitive data and noise from the prompt in transit.

**Pipeline:** `preprocess` (Groq grammar/typo fix) → `simplify` (Agent 2:
PII masking, then SVT → Top-k → NoisyKNN clause compression, then a Groq
question rewrite) → `review` (Agent 3: similarity check + optional LLM
intent check; on failure loops back to `simplify`, up to 3 retries) →
`output` (assembles the final JSON). Orchestrated with
`@langchain/langgraph` in `backend/src/agents/graphs/pipeline.graph.ts`;
shared state in `backend/src/agents/state/pipeline.state.ts`.

**HTTP surface:** `GET /health`, `GET /warmup`,
`POST /api/pipeline/run` (body `{ message, simplify?: "low"|"medium"|"high" }`)
— full request/response contract in `documentation/api-endpoints.md`. This
is a JSON API only; there is no UI in this repo/branch — a separate
frontend (on `main`) calls it over `VITE_API_URL`.

**Deep dive:** `documentation/multi-agent-workflow.md` (graph flow, retry
math, compression-level tuning, design trade-offs) and
`backend/src/agents/SKILL.md` (shorter maintainer notes — may drift, prefer
the doc above when they disagree).

---

## AI Harness Multi-Agent Workflow

When a task is assigned, agents execute in this order:

1. **Planner** — Reads task, breaks into numbered subtasks (≤10 lines)
2. **Coder** — Implements only what Planner specified, minimal code, flags blockers
3. **Reviewer** — Reviews changes, blocks and returns to Coder if 🔴 issues found, appends entry to `CHANGELOG_AI.md` on approval, does NOT rewrite code

**Rules:** Short responses, no refactoring outside scope, no architectural changes unless asked, each agent does only its defined role.

**Agent files:** `.claude/agents/ai-harness-{planner,coder,reviewer}.md`

**Task file:** `TASK.md` at repo root holds the current task for the
Planner to read. `CHANGELOG_AI.md` at repo root is append-only — only the
Reviewer writes to it, on approval.

---

## Multi-agent workflow (`/code-task`)

A second, heavier loop for larger or uncertain backend changes — use this
instead of the AI Harness loop above when a task needs real investigation
before a plan can be trusted. Uses its own task file
(`Artifacts/TASK.md`, distinct from the root `TASK.md` above) and its own
agents, so the two loops don't share state.

- Write a task in `Artifacts/TASK.md` with a difficulty (`easy` | `medium` |
  `hard`) and run `/code-task`.
- Only the coordinator (the `/code-task` command, run in the main session —
  not a subagent) writes `Artifacts/state.json`.
- Only the analyzer writes `Artifacts/analysis.md` (its findings for the
  current task; overwritten each run).
- Only the tester — or the coordinator itself on `easy` tasks — appends to
  `Artifacts/dev-diary.md`.
- Agent definitions live in `.claude/agents/` (`analyzer`, `planner`,
  `coder`, `tester`); the coordinator lives in `.claude/commands/code-task.md`.
- Routes: `easy` → planner → coder → done (no analyzer, no tester, no
  retries). `medium` / `hard` → **analyzer → planner → coder → tester** →
  loop or finish.
- The analyzer runs first and investigates: it reads the relevant code and
  data, measures rather than assumes, researches externally when the task
  needs it, and writes `Artifacts/analysis.md`. It produces **facts, not a
  plan**, and verifies the claims `TASK.md` itself makes. The planner reads
  that file directly rather than having it relayed through the coordinator.
- After 2 failed test runs in a row on `medium`/`hard`, the coordinator stops
  and asks you instead of retrying again.
- If an agent dies because the **session/usage limit was hit**, that is a
  pause, not a failure: the coordinator records `status: "paused_rate_limit"`
  in `Artifacts/state.json`, leaves `consecutive_failures` untouched, reports
  what already landed on disk, and stops. Say "continue" once the limit
  resets — it picks up from the interrupted step rather than restarting, and
  never downgrades the model to get around the limit.

### Model policy (a constraint, not a default)
Opus is for **thinking**, never for typing. The reasoning budget is spent
upstream so the plan is detailed enough for a cheaper model to implement.

| difficulty | analyzer | planner | coder | tester |
|---|---|---|---|---|
| `easy` | *(not run)* | `haiku` | `haiku` | *(not run)* |
| `medium` | **`opus`** | `sonnet` | `sonnet` | `sonnet` |
| `hard` | **`opus`** | **`opus`** | `sonnet` | `sonnet` |

- **Only the analyzer and planner may use Opus** — the analyzer on
  `medium`/`hard`, the planner on **`hard` only**.
- On `medium` the expensive thinking is the **analysis**. The analyzer still
  runs on Opus and produces measured facts; the planner's job there is to turn
  those facts into ordered steps, not to re-derive them. If a `medium` task
  turns out to need Opus-level planning, that is a signal it was mis-filed —
  re-file it as `hard`, don't quietly upgrade the planner.
- **Never run the coder or tester on Opus** — not on a retry, not when a task
  looks hard. If the coder struggles, the plan wasn't detailed enough: go
  back to the planner, don't upgrade the coder. On `medium` that re-plan also
  stays on `sonnet`; the two-consecutive-failure stop above is the backstop,
  not a model upgrade.
- Because the coder runs on a smaller model, the planner **must** produce
  explicit step-by-step instructions — exact files, line numbers, values and
  call shapes — so the coder can implement literally without re-deriving
  anything.

- All agents and the coordinator treat this file (`CLAUDE.md`) as the
  source of truth for commands and conventions — they do not duplicate them
  elsewhere.

---

## Validation

All commands run from `backend/` (the Node project lives there, not at the
repo root):

- Lint: `npm run lint` (`eslint src --ext .ts`)
- Type-check: `npx tsc --noEmit`
- Build: `npm run build`

After changes, run lint and type-check before the Reviewer approves.
