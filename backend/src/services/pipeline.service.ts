import { pipelineGraph } from "../agents/graphs/pipeline.graph";
import { PipelineInput, PipelineOutput } from "../types";

export async function runPipeline(
  input: PipelineInput,
  onChunk?: (chunk: string) => void,
): Promise<PipelineOutput> {
  const graphResult = await pipelineGraph.invoke({
    originalMessage: input.message,
    compressionLevel: input.simplify ?? "medium",
    onChunk,
  });

  let parsedResult: Record<string, unknown>;
  try {
    parsedResult = JSON.parse(graphResult.finalOutput) as Record<string, unknown>;
  } catch {
    parsedResult = {
      status: "failed",
      attempt: 0,
      question: graphResult.simplifiedMessage || input.message,
      answer: null,
      review: { reason: "Could not parse pipeline output JSON" },
    };
  }

  return {
    result: parsedResult,
    steps: ["preprocess", "simplify", "review", "output"],
  };
}
