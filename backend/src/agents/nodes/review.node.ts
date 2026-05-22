import { PipelineState } from '../state/pipeline.state';

export async function reviewNode(state: PipelineState): Promise<Partial<PipelineState>> {
  const passed = state.simplifiedMessage.length > 0;
  return { reviewPassed: passed, finalOutput: state.simplifiedMessage };
}
