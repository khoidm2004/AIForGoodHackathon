import { PipelineState } from "../state/pipeline.state";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { groqClient } from "../../services/groq.client";
import { getRetryHistory, type RetryAttempt } from "./simplify.node";

interface FormattedOutput {
  attempt: number;
  approvedQuestion?: string;
  rejectedQuestion?: string;
  review?: {
    similarityScore?: number;
    reason?: string;
    missingItems?: string[];
  };
}

function formatSimilarityScore(score?: number): number | undefined {
  if (score === undefined) return undefined;
  return Number(score.toFixed(3));
}

function formatRetryHistory(history: RetryAttempt[]): FormattedOutput {
  if (history.length === 0) {
    return { attempt: 0 };
  }

  const failedAttempt = history.find((h) => !h.passed);
  const successAttempt = history.find((h) => h.passed);

  if (!successAttempt) {
    const lastAttempt = history[history.length - 1]!;
    return {
      attempt: lastAttempt.attempt,
      rejectedQuestion: lastAttempt.prompt,
      review: {
        similarityScore: formatSimilarityScore(lastAttempt.similarityScore),
        reason: lastAttempt.reason,
        missingItems: lastAttempt.missingItems,
      },
    };
  }

  if (!failedAttempt) {
    return {
      attempt: successAttempt.attempt,
      approvedQuestion: successAttempt.prompt,
      review: {
        similarityScore: formatSimilarityScore(successAttempt.similarityScore),
      },
    };
  }

  return {
    attempt: successAttempt.attempt,
    rejectedQuestion: failedAttempt.prompt,
    approvedQuestion: successAttempt.prompt,
    review: {
      similarityScore: formatSimilarityScore(successAttempt.similarityScore),
      reason: failedAttempt.reason,
      missingItems: failedAttempt.missingItems,
    },
  };
}

function extractPlainAnswer(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      const parsed = JSON.parse(fenced[1]) as { answer?: string };
      if (parsed.answer) return parsed.answer.trim();
    } catch {
      /* use fenced body as plain text */
    }
    return fenced[1].trim();
  }
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { answer?: string };
      if (parsed.answer) return parsed.answer.trim();
    } catch {
      /* not JSON */
    }
  }
  return trimmed.replace(/^here is.*?:\s*/i, "").trim();
}

export async function outputNode(state: PipelineState): Promise<Partial<PipelineState>> {
  const history = getRetryHistory();
  const formattedResult = formatRetryHistory(history);

  let llmAnswer = "";

  if (state.reviewPassed) {
    const response = await groqClient.invoke([
      new SystemMessage(
        "Answer the user's question based on the simplified context. " +
        "Reply in plain text only. No JSON, no markdown, no code fences.",
      ),
      new HumanMessage(
        `Question:\n${state.simplifiedMessage}\n\n` +
        `Original context (reference):\n${state.originalMessage.slice(0, 1500)}`,
      ),
    ]);
    const raw = typeof response.content === "string" ? response.content : "";
    llmAnswer = extractPlainAnswer(raw);
  }

  const question =
    formattedResult.approvedQuestion ??
    formattedResult.rejectedQuestion ??
    state.simplifiedMessage;

  const finalOutputObj: Record<string, unknown> = {
    status: state.reviewPassed ? "approved" : "failed",
    attempt: formattedResult.attempt,
    question,
    answer: llmAnswer || null,
    review: formattedResult.review,
  };

  if (formattedResult.rejectedQuestion) {
    finalOutputObj.previousRejectedQuestion = formattedResult.rejectedQuestion;
  }

  const finalOutput = JSON.stringify(finalOutputObj, null, 2);

  return { finalOutput };
}
