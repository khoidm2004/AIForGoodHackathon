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

// low = light compression (lenient review); high = strong compression (stricter review)
const SIMILARITY_THRESHOLDS: Record<string, number> = {
  low: 0.15,
  medium: 0.5,
  high: 0.75,
};

/**
 * Compute pass/fail similarity threshold for a given simplify level.
 *
 * Threshold is FIXED per level (no retry decay), but **scales down with
 * compression ratio**: when output is much shorter than input, lexical
 * cosine drops naturally, so we relax the bar proportionally.
 *
 * `lengthRatio` = sanitized.length / original.length (0..1).
 *   ratio ≥ 0.5  → full base threshold
 *   ratio = 0.25 → 0.75× base
 *   ratio = 0.10 → 0.55× base
 *   ratio ≤ 0.05 → 0.45× base (floor)
 */
export function getSimilarityThreshold(
  level: string,
  _retryCount: number,
  lengthRatio?: number,
): number {
  const base = SIMILARITY_THRESHOLDS[level] ?? 0.5;
  if (lengthRatio === undefined || lengthRatio >= 0.5) return base;

  // Linear scale from 0.45 (very compressed) to 1.0 (ratio = 0.5)
  const scale = Math.max(0.45, 0.45 + (lengthRatio / 0.5) * 0.55);
  return Number((base * scale).toFixed(3));
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
  const result = await simplifyContext(
    state.preprocessedMessage,
    compressionLevel,
    threshold,
    "",
    state.onChunk,
  );
  lastAgent2Result = result;

  return { simplifiedMessage: result.sanitizedPrompt || state.preprocessedMessage };
}
