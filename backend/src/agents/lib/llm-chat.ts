import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { groqClient } from "../../services/groq.client";

export async function chat(
  messages: Array<{ role: "system" | "user"; content: string }>,
): Promise<string> {
  const langchainMessages = messages.map((m) =>
    m.role === "system" ? new SystemMessage(m.content) : new HumanMessage(m.content),
  );
  const response = await groqClient.invoke(langchainMessages);
  return typeof response.content === "string" ? response.content : "";
}
