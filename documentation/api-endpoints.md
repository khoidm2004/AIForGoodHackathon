# API reference (frontend)

Base URL for local development:

```text
http://localhost:3000
```

In production, use the deployed backend host (for example `https://api.your-domain.com`). Confirm the exact URL with the backend team.

All JSON endpoints accept and return `application/json` unless noted otherwise.

---

## Response envelope

Successful responses:

```json
{
  "success": true,
  "data": { }
}
```

Error responses (server errors):

```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

Rate-limited responses (`429 Too Many Requests`):

```json
{
  "error": "Too many requests, please try again later."
}
```

---

## CORS and headers

- CORS is enabled for browser clients.
- Send requests with `Content-Type: application/json` when a body is required.
- Authentication is not enforced yet (`authMiddleware` is a pass-through). Plan for future auth headers; do not rely on a public API staying unauthenticated in production.

---

## Endpoints

### Health check

Use to verify the API is up (load balancers, app startup, status pages).

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/health` |
| **Auth** | None |
| **Rate limit** | No |

**Response `200`**

```json
{
  "status": "ok"
}
```

**Example**

```ts
const res = await fetch(`${BASE_URL}/health`);
const body = await res.json();
// { status: "ok" }
```

---

### Warmup

Lightweight readiness probe. Use before calling heavier endpoints if you want to confirm routing works.

| | |
|---|---|
| **Method** | `GET` |
| **Path** | `/warmup` |
| **Auth** | None |
| **Rate limit** | No |

**Response `200`**

```json
{
  "ready": true
}
```

**Example**

```ts
const res = await fetch(`${BASE_URL}/warmup`);
const body = await res.json();
// { ready: true }
```

---

### Run pipeline

Runs the text pipeline: preprocess → simplify → review (with retries) → output. This is the main endpoint for sending user messages and receiving the processed result.

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/api/pipeline/run` |
| **Auth** | Placeholder middleware (none required today) |
| **Rate limit** | Yes — **100 requests per 15 minutes** per client IP |

#### Request body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `message` | `string` | Yes | — | User text to process. Must be non-empty (`min` length 1). |
| `simplify` | `"low"` \| `"medium"` \| `"high"` | No | `"medium"` | How aggressively to simplify. `high` = strong compression (similarity threshold 0.75). `medium` = balanced (0.5). `low` = light compression, preserve more wording (0.15). |

**Example body**

```json
{
  "message": "explain quantum computing in simple terms",
  "simplify": "medium"
}
```

#### Success response `200`

```json
{
  "success": true,
  "data": {
    "result": {
      "status": "approved",
      "attempt": 2,
      "simplifiedMessage": "...",
      "answer": "...",
      "review": { }
    },
    "steps": ["preprocess", "simplify", "review", "output"],
    "trace": [
      { "stage": "preprocess", "text": "explain quantum computing in simple terms" },
      { "stage": "simplify", "attempt": 1, "text": "What is quantum computing?" },
      {
        "stage": "review",
        "attempt": 1,
        "text": "What is quantum computing?",
        "passed": false,
        "similarityScore": 0.31,
        "reason": "Key decision not preserved",
        "missingItems": ["simple terms"]
      },
      { "stage": "simplify", "attempt": 2, "text": "Explain quantum computing simply." },
      {
        "stage": "review",
        "attempt": 2,
        "text": "Explain quantum computing simply.",
        "passed": true,
        "similarityScore": 0.62,
        "reason": "Similarity 0.62 well above threshold 0.5 — skipped LLM review"
      },
      { "stage": "output", "text": "Quantum computing uses qubits..." }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data.result` | `object` | Parsed pipeline output (`status`, `attempt`, `simplifiedMessage`, `answer`, `review`, and optional `previousRejectedSimplifiedMessage`). |
| `data.steps` | `string[]` | Pipeline stages that were part of this run. Useful for debugging or UI step indicators. |
| `data.trace` | `TraceEntry[]` | Per-agent trace of this run: one `preprocess` entry, then one `simplify` + `review` pair per attempt (including rejected attempts), then one `output` entry. See the `TraceEntry` fields below. |

#### `TraceEntry` fields

| Field | Type | Description |
|-------|------|-------------|
| `stage` | `"preprocess"` \| `"simplify"` \| `"review"` \| `"output"` | Which pipeline stage produced this entry. |
| `text` | `string` | The text produced/considered at this stage. For `review`, this duplicates the corresponding `simplify` attempt's text on purpose — the review step evaluates that same text, it doesn't produce new text. |
| `attempt` | `number` (optional) | Present on `simplify`/`review` entries. **Not a unique identifier** — do not dedupe or group trace entries by `attempt` alone; use array order instead. |
| `passed` | `boolean` (optional) | Present on `review` entries; whether that attempt was approved. |
| `similarityScore` | `number` (optional) | Present on `review` entries when a similarity score was computed. |
| `reason` | `string` (optional) | Present on `review` entries; human-readable explanation of the pass/fail decision. |
| `missingItems` | `string[]` (optional) | Present on `review` entries when the review flagged specific missing content. |

Because `trace` repeats text across stages, responses are roughly **3-5x larger** than before this field was added. Frontends should render the trace lazily or behind a collapsed/expandable section rather than always expanding it.

**Pipeline behavior (for UI copy / loading states)**

1. **preprocess** — Fixes typos and grammar.
2. **simplify** — Redacts PII and compresses text; aggressiveness follows `simplify` (`low` / `medium` / `high`).
3. **review** — Validates output; on failure, simplify may retry up to 3 times.
4. **output** — Always runs, including when every retry failed; builds the final `result` object.

If review fails after every retry, `result.status` is `"failed"`, `result.answer` is `null`, and every `review` entry in `data.trace` has `passed: false`. Treat that `"failed"` status as a soft failure and show a friendly message in the UI.

#### Error responses

| Status | When | Body shape |
|--------|------|------------|
| `400` | Invalid JSON body | Express parser error (may not use `success` envelope) |
| `429` | Rate limit exceeded | `{ "error": "Too many requests, please try again later." }` |
| `500` | Validation failure, pipeline error, or unhandled exception | `{ "success": false, "error": "<message>" }` |

Invalid request bodies (for example missing or empty `message`) currently surface as `500` with a Zod validation message in `error`. The frontend should validate `message` client-side before calling the API.

#### Examples

**fetch**

```ts
const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export async function runPipeline(
  message: string,
  simplify: "low" | "medium" | "high" = "medium",
) {
  const res = await fetch(`${BASE_URL}/api/pipeline/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, simplify }),
  });

  if (res.status === 429) {
    const { error } = await res.json();
    throw new Error(error ?? "Rate limited");
  }

  const body = await res.json();

  if (!res.ok || !body.success) {
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }

  return body.data as { result: Record<string, unknown>; steps: string[]; trace: TraceEntry[] };
}
```

**axios**

```ts
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3000",
  headers: { "Content-Type": "application/json" },
});

export async function runPipeline(
  message: string,
  simplify: "low" | "medium" | "high" = "medium",
) {
  const { data } = await api.post("/api/pipeline/run", { message, simplify });
  if (!data.success) throw new Error(data.error ?? "Pipeline failed");
  return data.data as { result: Record<string, unknown>; steps: string[]; trace: TraceEntry[] };
}
```

---

## TypeScript types (copy into frontend)

```ts
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
}

export type SimplifyLevel = "low" | "medium" | "high";

export interface PipelineRunRequest {
  message: string;
  simplify?: SimplifyLevel;
}

export type TraceStage = "preprocess" | "simplify" | "review" | "output";

export interface TraceEntry {
  stage: TraceStage;
  text: string;
  attempt?: number;
  passed?: boolean;
  similarityScore?: number;
  reason?: string;
  missingItems?: string[];
}

export interface PipelineRunResponse {
  result: Record<string, unknown>;
  steps: string[];
  trace: TraceEntry[];
}

export interface HealthResponse {
  status: "ok";
}

export interface WarmupResponse {
  ready: true;
}
```

---

## Environment variables (frontend)

| Variable | Example | Purpose |
|----------|---------|---------|
| `VITE_API_URL` | `http://localhost:3000` | Backend base URL (Vite). Use your bundler’s env prefix if not on Vite. |

Backend default port is **3000** (`PORT` in `backend/.env`).

---

## Quick test checklist

1. `GET /health` → `{ "status": "ok" }`
2. `GET /warmup` → `{ "ready": true }`
3. `POST /api/pipeline/run` with `{ "message": "hello world" }` → `success: true` and non-empty `data.result`
4. `POST /api/pipeline/run` with `{ "message": "" }` → should be blocked in the UI; API returns an error if sent
5. Confirm rate-limit headers if you display retry UX (`RateLimit-*` standard headers on `/api/pipeline/*`)

---

## Changelog

Contact the backend team when new routes are added. This document reflects the routes registered in `backend/src/app.ts` as of the last update.
