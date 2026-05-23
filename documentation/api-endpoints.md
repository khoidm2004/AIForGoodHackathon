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

> **This endpoint now streams via Server-Sent Events (SSE).** The response is `text/event-stream`, not JSON. LLM tokens arrive incrementally as `chunk` events; the final result is delivered as a `result` event. See the [SSE event reference](#sse-event-reference) and [examples](#examples-1) below.

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/api/pipeline/run` |
| **Auth** | Placeholder middleware (none required today) |
| **Rate limit** | Yes — **100 requests per 15 minutes** per client IP |
| **Response type** | `text/event-stream` (SSE) |

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

#### SSE event reference

The response is a stream of Server-Sent Events. Each event follows the standard SSE wire format:

```
event: <event-name>\n
data: <JSON-string>\n
\n
```

The final message is always a bare `data: [DONE]` line that signals the stream has ended.

| Event | When | Data shape | Description |
|-------|------|------------|-------------|
| *(unnamed)* | During LLM generation | `{ "type": "chunk", "content": "<token>" }` | One or more tokens from the LLM. Accumulate `content` values in order to build the full response text. |
| `result` | After pipeline completes | `{ "success": true, "data": { "result": "...", "steps": [...] } }` | Final pipeline output. Same shape as the old JSON response. |
| `error` | On mid-stream failure | `{ "success": false, "error": "<message>" }` | Sent only if an error occurs after headers are flushed. |
| *(unnamed)* | Always last | `[DONE]` *(literal string, not JSON)* | Stream terminator. Close the connection after receiving this. |

**`result` event data fields**

| Field | Type | Description |
|-------|------|-------------|
| `data.result` | `string` | Final pipeline output. Format is typically `Answer: ...` and `Simplified Context: ...` lines. |
| `data.steps` | `string[]` | Pipeline stages that ran. Useful for debugging or UI step indicators. |

**Pipeline behavior (for UI copy / loading states)**

1. **preprocess** — Fixes typos and grammar.
2. **simplify** — Simplification stage; streams tokens as they arrive.
3. **review** — Validates output; on failure, simplify may retry up to 3 times.
4. **output** — Only runs when review passes; builds the final `result` string.

If review fails after retries, the graph may end without an output step; `result` may still be set from earlier state. Treat empty or unexpected `result` as a soft failure and show a friendly message in the UI.

#### Error responses

Pre-stream errors (before headers are flushed) still use the standard HTTP + JSON envelope:

| Status | When | Body shape |
|--------|------|------------|
| `400` | Invalid JSON body | Express parser error (may not use `success` envelope) |
| `429` | Rate limit exceeded | `{ "error": "Too many requests, please try again later." }` |
| `500` | Validation failure or unhandled exception before stream starts | `{ "success": false, "error": "<message>" }` |

Mid-stream errors (after headers are flushed) are delivered as an `error` SSE event followed by `[DONE]`.

Invalid request bodies (for example missing or empty `message`) currently surface as `500` with a Zod validation message in `error`. The frontend should validate `message` client-side before calling the API.

#### How chunk accumulation works

The stream sends tokens one at a time. To reconstruct the full LLM output you must **concatenate every `chunk` event's `content` in arrival order**:

```
chunk → "The "
chunk → "capital "
chunk → "of "
chunk → "France "
chunk → "is "
chunk → "Paris."
result → { success: true, data: { result: "...", steps: [...] } }
[DONE]
```

Accumulated text after all chunks: `"The capital of France is Paris."`

The `result` event carries the authoritative final output from the full pipeline (including the output agent's formatting). Use chunk accumulation only to display a live preview while the stream is in progress — once the `result` event arrives, replace the live preview with `data.result`.

#### Examples

**Streaming helper (`runPipelineStream`)**

```ts
// lib/api.ts
const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

/**
 * Calls /api/pipeline/run and streams the response.
 *
 * - onChunk is called for every token as it arrives.
 *   Concatenate the values yourself to build the live preview string.
 * - Resolves with the final { result, steps } from the "result" SSE event.
 */
export async function runPipelineStream(
  message: string,
  simplify: "low" | "medium" | "high" = "medium",
  onChunk: (token: string) => void,
): Promise<{ result: string; steps: string[] }> {
  const res = await fetch(`${BASE_URL}/api/pipeline/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, simplify }),
  });

  // Pre-stream HTTP errors arrive as regular JSON responses.
  if (res.status === 429) {
    const body = await res.json();
    throw new Error(body.error ?? "Rate limited");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `Request failed (${res.status})`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  // `buffer` holds bytes received but not yet split into complete lines.
  let buffer = "";
  // `currentEvent` tracks the most recent "event:" line so the following
  // "data:" line can be dispatched to the right handler.
  let currentEvent = "";
  let finalData: { result: string; steps: string[] } | null = null;

  outer: while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Append decoded bytes to the rolling buffer.
    buffer += decoder.decode(value, { stream: true });

    // SSE messages are newline-delimited. Split on every \n and keep the
    // last (possibly incomplete) segment in the buffer for the next read.
    const lines = buffer.split("\n");
    buffer = lines.pop()!;

    for (const line of lines) {
      if (line.startsWith("event:")) {
        // Store the event name; the data line arrives next.
        currentEvent = line.slice(6).trim();

      } else if (line.startsWith("data:")) {
        const raw = line.slice(5).trim();

        // "[DONE]" is a literal terminator, not JSON — exit immediately.
        if (raw === "[DONE]") break outer;

        const parsed = JSON.parse(raw);

        if (currentEvent === "result") {
          // Final authoritative output — pipeline finished successfully.
          finalData = parsed.data;

        } else if (currentEvent === "error") {
          // Mid-stream error sent after headers were already flushed.
          throw new Error(parsed.error ?? "Stream error");

        } else if (parsed.type === "chunk") {
          // LLM token — forward to caller for live concatenation.
          onChunk(parsed.content);
        }

        // Reset so an event name is never accidentally reused for the
        // next data line.
        currentEvent = "";
      }
    }
  }

  if (!finalData) throw new Error("Stream ended without a result event");
  return finalData;
}
```

**React hook — live typing effect**

```tsx
// hooks/usePipeline.ts
import { useState, useCallback } from "react";
import { runPipelineStream } from "../lib/api";

export function usePipeline() {
  const [liveText, setLiveText] = useState("");   // built token-by-token
  const [finalResult, setFinalResult] = useState(""); // from "result" event
  const [steps, setSteps] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (message: string, simplify: "low" | "medium" | "high" = "medium") => {
      setLoading(true);
      setError(null);
      setLiveText("");     // clear previous live preview
      setFinalResult("");

      try {
        const result = await runPipelineStream(
          message,
          simplify,
          // Append each arriving token to liveText so the UI updates in real-time.
          (token) => setLiveText((prev) => prev + token),
        );
        // Once the result event arrives, switch from live preview to final output.
        setFinalResult(result.result);
        setSteps(result.steps);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { liveText, finalResult, steps, loading, error, run };
}
```

**Component wiring**

```tsx
// components/PipelineChat.tsx
import { usePipeline } from "../hooks/usePipeline";

export function PipelineChat() {
  const { liveText, finalResult, steps, loading, error, run } = usePipeline();

  return (
    <div>
      <button onClick={() => run("Explain quantum entanglement simply")} disabled={loading}>
        {loading ? "Thinking…" : "Ask"}
      </button>

      {/* Show live token stream while the pipeline is running */}
      {loading && liveText && (
        <pre style={{ opacity: 0.6 }}>{liveText}<span className="cursor">▍</span></pre>
      )}

      {/* Replace with final formatted result once the stream completes */}
      {!loading && finalResult && <pre>{finalResult}</pre>}

      {error && <p style={{ color: "red" }}>{error}</p>}

      {steps.length > 0 && (
        <p style={{ fontSize: "0.75rem", color: "gray" }}>
          Steps: {steps.join(" → ")}
        </p>
      )}
    </div>
  );
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
  simplify?: "low" | "medium" | "high";
}

export interface PipelineRunResponse {
  result: string;
  steps: string[];
}

// SSE event payloads for /api/pipeline/run

/** Unnamed SSE event — LLM token chunk */
export interface PipelineChunkEvent {
  type: "chunk";
  content: string;
}

/** Named SSE event: "result" — final pipeline output */
export interface PipelineResultEvent {
  success: true;
  data: PipelineRunResponse;
}

/** Named SSE event: "error" — mid-stream failure */
export interface PipelineErrorEvent {
  success: false;
  error: string;
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

| Date | Change |
|------|--------|
| 2026-05-24 | `POST /api/pipeline/run` migrated from buffered JSON to SSE streaming (`text/event-stream`). LLM tokens now stream as unnamed `chunk` events; final result delivered as named `result` event. TypeScript types updated; `PipelineRunRequest.simplify` corrected to `"low" \| "medium" \| "high"`. |
