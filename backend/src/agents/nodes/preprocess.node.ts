import { PipelineState } from '../state/pipeline.state';

export async function preprocessNode(state: PipelineState): Promise<Partial<PipelineState>> {
  const fixed = state.originalMessage.trim();
  return { preprocessedMessage: fixed };
}
