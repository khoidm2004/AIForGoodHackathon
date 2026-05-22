import { pipelineGraph } from '../agents/graphs/pipeline.graph';
import { PipelineInput, PipelineOutput } from '../types';

export async function runPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const result = await pipelineGraph.invoke({
    originalMessage: input.message,
    shouldSimplify: input.simplify ?? false,
  });
  return {
    result: result.finalOutput,
    steps: ['preprocess', 'simplify', 'review', 'output'],
  };
}
