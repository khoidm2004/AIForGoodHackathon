import { groqJsonClient } from "../../services/groq.client";

export async function chat(
  messages: Array<{ role: "system" | "user"; content: string }>,
): Promise<string> {
  const response = await groqJsonClient.invoke(messages);
  return typeof response.content === "string" ? response.content : "";
}
