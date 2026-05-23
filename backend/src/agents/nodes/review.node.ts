import { PipelineState } from "../state/pipeline.state";
import { reviewAgent3 } from "../lib/reviewer";
import { getLastAgent2Result } from "./simplify.node";

export async function reviewNode(state: PipelineState): Promise<Partial<PipelineState>> {
  const agent2Output =
    getLastAgent2Result() ??
    ({ sanitized_prompt: state.simplifiedMessage } as Record<string, unknown>);

  const review = await reviewAgent3(state.originalMessage, agent2Output, { useLlm: true });

  return {
    reviewPassed: review.approved,
    finalOutput: state.simplifiedMessage,
  };
}
