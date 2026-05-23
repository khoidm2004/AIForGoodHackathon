import { PipelineState } from "../state/pipeline.state";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { groqClient } from "../../services/groq.client";
import { getRetryHistory, type RetryAttempt } from "./simplify.node";

interface FormattedOutput {
  attempt: number;
  false?: string;
  true?: string;
  details?: {
    similarityScore?: number;
    reason?: string;
    missingItems?: string[];
  };
}

function formatRetryHistory(history: RetryAttempt[]): FormattedOutput {
  if (history.length === 0) {
    return { attempt: 0 };
  }

  // Find the first failed attempt and the successful one
  const failedAttempt = history.find((h) => !h.passed);
  const successAttempt = history.find((h) => h.passed);

  // If no successful attempt, return last attempt with false
  if (!successAttempt) {
    const lastAttempt = history[history.length - 1]!;
    return {
      attempt: lastAttempt.attempt,
      false: lastAttempt.prompt,
      details: {
        similarityScore: lastAttempt.similarityScore,
        reason: lastAttempt.reason,
        missingItems: lastAttempt.missingItems,
      },
    };
  }

  // If successful on first try
  if (!failedAttempt) {
    return {
      attempt: successAttempt.attempt,
      true: successAttempt.prompt,
      details: {
        similarityScore: successAttempt.similarityScore,
      },
    };
  }

  // Has both failed and successful attempts
  return {
    attempt: successAttempt.attempt,
    false: failedAttempt.prompt,
    true: successAttempt.prompt,
    details: {
      similarityScore: successAttempt.similarityScore,
      reason: failedAttempt.reason,
      missingItems: failedAttempt.missingItems,
    },
  };
}

export async function outputNode(state: PipelineState): Promise<Partial<PipelineState>> {
  const history = getRetryHistory();
  const formattedResult = formatRetryHistory(history);

  let llmAnswer = "";

  // Only call LLM to answer if review passed
  if (state.reviewPassed) {
    const response = await groqClient.invoke([
      new SystemMessage(
        "You are an output gatherer. Process the simplified context and provide an answer. " +
        "Return a JSON object with 'answer' field containing your response.",
      ),
      new HumanMessage(
        `Original input:\n${state.originalMessage}\n\n` +
        `Simplified context (attempt ${formattedResult.attempt}):\n${state.simplifiedMessage}`,
      ),
    ]);
    llmAnswer = typeof response.content === "string" ? response.content : "";
  }

  const finalOutputObj = {
    ...formattedResult,
    status: state.reviewPassed ? "approved" : "failed",
    answer: llmAnswer || null,
    originalMessage: state.originalMessage,
    preprocessedMessage: state.preprocessedMessage,
  };

  const finalOutput = JSON.stringify(finalOutputObj, null, 2);

  return { finalOutput };
}
