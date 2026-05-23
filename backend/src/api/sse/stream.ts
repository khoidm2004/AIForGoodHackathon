import { Response } from "express";

/**
 * Initialize SSE headers on the response.
 * Must be called before any sendChunk / closeSSE calls.
 */
export function initSSE(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
}

/**
 * Send a single SSE data chunk.
 */
export function sendChunk(res: Response, data: string): void {
  res.write(`data: ${data}\n\n`);
}

/**
 * Send a named SSE event with optional data.
 */
export function sendEvent(res: Response, event: string, data: string): void {
  res.write(`event: ${event}\ndata: ${data}\n\n`);
}

/**
 * Close the SSE stream by sending a final [DONE] event and ending the response.
 */
export function closeSSE(res: Response): void {
  res.write("data: [DONE]\n\n");
  res.end();
}
