import { PipelineState } from "../state/pipeline.state";
import { simplifyContext, type Agent2Result, type CompressionLevel } from "../lib/context-simplifier";

let lastAgent2Result: Agent2Result | undefined;

/** Last Agent 2 result for the current graph run (used by review node). */
export function getLastAgent2Result(): Agent2Result | undefined {
  return lastAgent2Result;
}

export async function simplifyNode(state: PipelineState): Promise<Partial<PipelineState>> {
  if (!state.shouldSimplify) {
    lastAgent2Result = undefined;
    return { simplifiedMessage: state.preprocessedMessage };
  }

  const compressionLevel: CompressionLevel = state.retryCount > 0 ? "high" : "medium";
  const result = await simplifyContext(state.preprocessedMessage, compressionLevel, 0.5);
  lastAgent2Result = result;

  return { simplifiedMessage: result.sanitizedPrompt || state.preprocessedMessage };
}
