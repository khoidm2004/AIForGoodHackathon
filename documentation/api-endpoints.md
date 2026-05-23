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
| `simplify` | `boolean` | No | `false` | When `true`, the simplify step runs on the preprocessed text. When `false`, simplify is skipped and preprocessed text is passed through. |

**Example body**

```json
{
  "message": "explain quantum computing in simple terms",
  "simplify": true
}
```

#### Success response `200`

```json
{
  "success": true,
  "data": {
    "result": "Answer: ...\nSimplified Context: ...",
    "steps": ["preprocess", "simplify", "review", "output"]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data.result` | `string` | Final pipeline output. After a successful review, this is produced by the output step (Groq). Format is typically `Answer: ...` and `Simplified Context: ...` lines. |
| `data.steps` | `string[]` | Pipeline stages that were part of this run. Useful for debugging or UI step indicators. |

**Pipeline behavior (for UI copy / loading states)**

1. **preprocess** — Fixes typos and grammar.
2. **simplify** — Optional simplification when `simplify` is `true`.
3. **review** — Validates output; on failure, simplify may retry up to 3 times.
4. **output** — Only runs when review passes; builds the final `result` string.

If review fails after retries, the graph may end without an output step; `result` may still be set from earlier state. Treat empty or unexpected `result` as a soft failure and show a friendly message in the UI.

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

export async function runPipeline(message: string, simplify = false) {
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

  return body.data as { result: string; steps: string[] };
}
```

**axios**

```ts
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3000",
  headers: { "Content-Type": "application/json" },
});

export async function runPipeline(message: string, simplify = false) {
  const { data } = await api.post("/api/pipeline/run", { message, simplify });
  if (!data.success) throw new Error(data.error ?? "Pipeline failed");
  return data.data as { result: string; steps: string[] };
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

export interface PipelineRunRequest {
  message: string;
  simplify?: boolean;
}

export interface PipelineRunResponse {
  result: string;
  steps: string[];
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
