import { PipelineState } from "../state/pipeline.state";

export async function incrementRetryNode(state: PipelineState): Promise<Partial<PipelineState>> {
  // Enable Agent 2 on retry so simplify → review loop actually re-compresses
  return { retryCount: 1, shouldSimplify: true };
}
