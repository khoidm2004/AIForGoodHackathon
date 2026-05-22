import { PipelineState } from "../state/pipeline.state";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { groqClient } from "../../services/groq.client";

export async function outputNode(
  state: PipelineState,
): Promise<Partial<PipelineState>> {
  const response = await groqClient.invoke([
    new SystemMessage(
      "You are an output gatherer. Gather simplified context and answer based on the simplified context. Return only the final output in the following format: Answer: <answer> Simplified Context: <context>",
    ),
    new HumanMessage(`Answer based on your input:\n${state.originalMessage}\n\nSimplified context:\n${state.simplifiedMessage}`),
  ]);

  const finalOutput =
    typeof response.content === "string"
      ? response.content
      : `Answer: ${state.originalMessage}\nSimplified Context: ${state.simplifiedMessage}`;

  return { finalOutput };
}
