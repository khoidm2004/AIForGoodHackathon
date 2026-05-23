import { openRouterChat, openRouterChatStream } from "../../services/openrouter.client";

export async function chat(
  messages: Array<{ role: "system" | "user"; content: string }>,
): Promise<string> {
  return openRouterChat("agent2", messages);
}

export async function chatStream(
  messages: Array<{ role: "system" | "user"; content: string }>,
  onChunk: (chunk: string) => void,
): Promise<string> {
  return openRouterChatStream("agent2", messages, onChunk);
}
