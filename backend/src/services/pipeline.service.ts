import { pipelineGraph } from "../agents/graphs/pipeline.graph";
import {
  createRunContext,
  runContextStorage,
  type RetryAttempt,
} from "../agents/state/run-context";
import { PipelineInput, PipelineOutput, TraceEntry } from "../types";

/**
 * Per-stage trace of one run: one `preprocess` entry, then a `simplify` +
 * `review` pair per attempt (rejected attempts included), then one `output`
 * entry. Reads the request's own run context, so it cannot pick up another
 * in-flight request's attempts.
 */
function buildTrace(
  preprocessedMessage: string,
  history: RetryAttempt[],
  answer: unknown,
): TraceEntry[] {
  const trace: TraceEntry[] = [{ stage: "preprocess", text: preprocessedMessage }];

  for (const attempt of history) {
    trace.push({ stage: "simplify", attempt: attempt.attempt, text: attempt.prompt });
    trace.push({
      stage: "review",
      attempt: attempt.attempt,
      text: attempt.prompt,
      passed: attempt.passed,
      similarityScore: attempt.similarityScore,
      reason: attempt.reason,
      missingItems: attempt.missingItems,
    });
  }

  trace.push({ stage: "output", text: typeof answer === "string" ? answer : "" });

  return trace;
}

export async function runPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const runContext = createRunContext();

  const graphResult = await runContextStorage.run(runContext, () =>
    pipelineGraph.invoke({
      originalMessage: input.message,
      compressionLevel: input.simplify ?? "medium",
    }),
  );

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
    trace: buildTrace(
      graphResult.preprocessedMessage,
      runContext.retryHistory,
      parsedResult.answer,
    ),
  };
}
