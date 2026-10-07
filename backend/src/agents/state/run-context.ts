import { AsyncLocalStorage } from "node:async_hooks";
import type { Agent2Result } from "../lib/context-simplifier";

/** One simplify + review round, appended by the review node. */
export interface RetryAttempt {
  attempt: number;
  passed: boolean;
  prompt: string;
  reason?: string;
  similarityScore?: number;
  missingItems?: string[];
}

/**
 * Per-request tracking state for a single pipeline run.
 *
 * These three fields used to be module-level globals in `simplify.node.ts`,
 * which leaked data between concurrent requests (one request's
 * `resetPipelineTracking()` wiped another's in-flight history). The object is
 * created once per `runPipeline()` call and mutated in place by the nodes.
 */
export interface PipelineRunContext {
  retryHistory: RetryAttempt[];
  currentAttemptNumber: number;
  lastAgent2Result: Agent2Result | undefined;
}

export const runContextStorage = new AsyncLocalStorage<PipelineRunContext>();

export function createRunContext(): PipelineRunContext {
  return { retryHistory: [], currentAttemptNumber: 1, lastAgent2Result: undefined };
}

/**
 * Fallback for code that calls `pipelineGraph.invoke()` directly instead of
 * going through `runPipeline()` (ad-hoc scripts). Process-wide, i.e. exactly
 * the old behaviour: fine for one run at a time, NOT concurrency-safe. Every
 * HTTP request goes through `runPipeline()`, which always establishes a real
 * per-request store.
 */
const fallbackContext: PipelineRunContext = createRunContext();

/** The context for the in-flight run, or the shared fallback if none is active. */
export function activeRunContext(): PipelineRunContext {
  return runContextStorage.getStore() ?? fallbackContext;
}
