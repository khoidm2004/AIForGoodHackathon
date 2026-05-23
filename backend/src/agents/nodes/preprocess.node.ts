import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { groqClient } from "../../services/groq.client";
import { PipelineState } from "../state/pipeline.state";

export async function preprocessNode(state: PipelineState): Promise<Partial<PipelineState>> {
  const response = await groqClient.invoke([
    new SystemMessage(
      "You are a text preprocessor. Fix typos and grammar errors in the user message. Return only the corrected text, nothing else.",
    ),
    new HumanMessage(state.originalMessage),
  ]);

  const preprocessedMessage =
    typeof response.content === "string" ? response.content : state.originalMessage;

  return { preprocessedMessage };
}
