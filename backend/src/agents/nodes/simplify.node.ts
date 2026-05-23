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

const SIMILARITY_THRESHOLDS: Record<string, number> = {
  low: 0.2,
  medium: 0.5,
  high: 0.85,
};

export function getSimilarityThreshold(level: string, retryCount: number): number {
  const base = SIMILARITY_THRESHOLDS[level] ?? 0.5;
  // Each retry lowers threshold slightly (minimum floor of 0.15)
  const reduction = retryCount * 0.1;
  return Math.max(0.15, base - reduction);
}

export async function simplifyNode(state: PipelineState): Promise<Partial<PipelineState>> {
  if (state.retryCount === 0) {
    resetPipelineTracking();
  }

  currentAttemptNumber = state.retryCount + 1;

  // No compression level set → skip simplification
  if (!state.compressionLevel) {
    lastAgent2Result = undefined;
    return { simplifiedMessage: state.preprocessedMessage };
  }

  // Map user level to internal compression: first try uses user's level, retries decrease
  const retryLevels: Record<string, CompressionLevel[]> = {
    high: ["high", "medium", "low"],
    medium: ["medium", "low", "low"],
    low: ["low", "low", "low"],
  };
  const levels = retryLevels[state.compressionLevel] ?? retryLevels.medium!;
  const compressionLevel = levels[Math.min(state.retryCount, 2)]!;

  const threshold = getSimilarityThreshold(state.compressionLevel, state.retryCount);
  const result = await simplifyContext(state.preprocessedMessage, compressionLevel, threshold);
  lastAgent2Result = result;

  return { simplifiedMessage: result.sanitizedPrompt || state.preprocessedMessage };
}
