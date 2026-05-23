import { PipelineState } from "../state/pipeline.state";
import { reviewAgent3 } from "../lib/reviewer";
import { getLastAgent2Result, getCurrentAttempt, addAttemptToHistory } from "./simplify.node";

export async function reviewNode(state: PipelineState): Promise<Partial<PipelineState>> {
  const agent2Output =
    getLastAgent2Result() ??
    ({ sanitized_prompt: state.simplifiedMessage } as Record<string, unknown>);

  const review = await reviewAgent3(state.originalMessage, agent2Output, { useLlm: true });

  const attemptNumber = getCurrentAttempt();

  // Store attempt in module-level history (for output node to access)
  addAttemptToHistory(attemptNumber, state.simplifiedMessage, review);

  return {
    reviewPassed: review.approved,
    finalOutput: state.simplifiedMessage,
  };
}
