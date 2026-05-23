import { PipelineState } from "../state/pipeline.state";
import { simplifyContext, type Agent2Result, type CompressionLevel } from "../lib/context-simplifier";
import type { ReviewResult } from "../lib/reviewer";

export interface RetryAttempt {
  attempt: number;
  passed: boolean;
  prompt: string;
  reason?: string;
  similarityScore?: number;
  missingItems?: string[];
}

// Module-level state for tracking across nodes (single-threaded only)
let lastAgent2Result: Agent2Result | undefined;
let currentAttemptNumber = 1;
const retryHistory: RetryAttempt[] = [];

/** Last Agent 2 result for the current graph run (used by review node). */
export function getLastAgent2Result(): Agent2Result | undefined {
  return lastAgent2Result;
}

/** Get current attempt number for tracking. */
export function getCurrentAttempt(): number {
  return currentAttemptNumber;
}

/** Get full retry history. */
export function getRetryHistory(): RetryAttempt[] {
  return [...retryHistory];
}

/** Reset all tracking state (called at start of new pipeline). */
export function resetPipelineTracking(): void {
  currentAttemptNumber = 1;
  retryHistory.length = 0;
  lastAgent2Result = undefined;
}

/** Add an attempt to history. */
export function addAttemptToHistory(
  attempt: number,
  prompt: string,
  reviewResult: ReviewResult,
): void {
  retryHistory.push({
    attempt,
    passed: reviewResult.approved,
    prompt,
    reason: reviewResult.reason,
    similarityScore: Number(reviewResult.similarityScore.toFixed(3)),
    missingItems: reviewResult.missingItems.length > 0 ? reviewResult.missingItems : undefined,
  });
}

export async function simplifyNode(state: PipelineState): Promise<Partial<PipelineState>> {
  // Reset tracking on first run (retryCount = 0)
  if (state.retryCount === 0) {
    resetPipelineTracking();
  }

  // Track attempt number based on retry count
  currentAttemptNumber = state.retryCount + 1;

  if (!state.shouldSimplify) {
    lastAgent2Result = undefined;
    return { simplifiedMessage: state.preprocessedMessage };
  }

  // Compression level: medium (1st try), high (retry)
  const compressionLevel: CompressionLevel = state.retryCount > 0 ? "high" : "medium";
  const result = await simplifyContext(state.preprocessedMessage, compressionLevel, 0.5);
  lastAgent2Result = result;

  return { simplifiedMessage: result.sanitizedPrompt || state.preprocessedMessage };
}
