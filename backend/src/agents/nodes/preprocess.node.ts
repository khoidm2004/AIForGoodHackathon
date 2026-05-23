import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { openRouterChatFromLangChain } from "../../services/openrouter.client";
import { PipelineState } from "../state/pipeline.state";

export async function preprocessNode(state: PipelineState): Promise<Partial<PipelineState>> {
  const response = await openRouterChatFromLangChain("agent2", [
    new SystemMessage(
      "You are a text preprocessor. Fix typos and grammar errors in the user message. Return only the corrected text, nothing else.",
    ),
    new HumanMessage(state.originalMessage),
  ]);

  const preprocessedMessage = response || state.originalMessage;

  return { preprocessedMessage };
}
