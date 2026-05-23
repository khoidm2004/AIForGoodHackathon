import { PipelineState } from "../state/pipeline.state";

export async function simplifyNode(state: PipelineState): Promise<Partial<PipelineState>> {
  if (!state.shouldSimplify) return { simplifiedMessage: state.preprocessedMessage };
  const simplified = state.preprocessedMessage;
  return { simplifiedMessage: simplified };
}
