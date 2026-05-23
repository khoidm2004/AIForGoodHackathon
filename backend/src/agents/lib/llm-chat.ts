import { openRouterChat } from "../../services/openrouter.client";

export async function chat(
  messages: Array<{ role: "system" | "user"; content: string }>,
): Promise<string> {
  return openRouterChat("agent2", messages);
}
