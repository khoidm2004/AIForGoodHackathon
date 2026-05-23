## MCP Tools: code-review-graph

**ALWAYS use code-review-graph MCP tools BEFORE Grep/Glob/Read.**

| Tool                        | Use when                                 |
| --------------------------- | ---------------------------------------- |
| `detect_changes`            | Reviewing code changes                   |
| `get_review_context`        | Source snippets for review               |
| `get_impact_radius`         | Blast radius of a change                 |
| `get_affected_flows`        | Execution paths impacted                 |
| `query_graph`               | Tracing callers, callees, imports, tests |
| `semantic_search_nodes`     | Finding functions/classes by name        |
| `get_architecture_overview` | High-level codebase structure            |
| `refactor_tool`             | Planning renames, finding dead code      |

**Workflow:** Graph auto-updates on file changes. Use `detect_changes` for review, `get_affected_flows` for impact, `query_graph` pattern="tests_for" for coverage.

---

## AI Harness Multi-Agent Workflow

When a task is assigned, agents execute in this order:

1. **Planner** — Reads task, breaks into numbered subtasks (≤10 lines)
2. **Coder** — Implements only what Planner specified, minimal code, flags blockers
3. **Reviewer** — Reviews changes, blocks and returns to Coder if 🔴 issues found, appends entry to `CHANGELOG_AI.md` on approval, does NOT rewrite code

**Rules:** Short responses, no refactoring outside scope, no architectural changes unless asked, each agent does only its defined role.

**Agent files:** `.claude/agents/ai-harness-{planner,coder,reviewer}.md`

---

## Project Context

// TODO:

---

## Validation

After changes: `npm run lint` + `npx tsc --noEmit`. Use code-review-graph for impact analysis.
