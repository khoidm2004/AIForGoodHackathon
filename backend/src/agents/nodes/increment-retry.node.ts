import { PipelineState } from '../state/pipeline.state';

export async function incrementRetryNode(state: PipelineState): Promise<Partial<PipelineState>> {
  return { retryCount: 1 };
}
