import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { BaseMessage } from "@langchain/core/messages";

export type OpenRouterModel = "agent2" | "agent3";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

function getConfig(agent: OpenRouterModel): { apiKey: string; model: string } {
  const apiKey = process.env.OPENROUTER_API_KEY ?? "";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  if (agent === "agent2") {
    return { apiKey, model: process.env.OPENROUTER_MODEL_AGENT_2 ?? "deepseek/deepseek-v4-flash" };
  }
  return { apiKey, model: process.env.OPENROUTER_MODEL_AGENT_3 ?? "qwen/qwen3-8b" };
}

function toOpenRouterRole(msg: BaseMessage): string {
  if (msg instanceof AIMessage) return "assistant";
  if (msg instanceof SystemMessage) return "system";
  return "user";
}

/**
 * Invoke OpenRouter with agent-specific model via native fetch.
 * - "agent2" → strong reasoning model (deepseek-v4-flash) — for simplify/rewrite
 * - "agent3" → light model (qwen3-8b) — for review/supervision
 */
export async function openRouterChat(
  agent: OpenRouterModel,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<string> {
  const { apiKey, model } = getConfig(agent);

  const body = JSON.stringify({
    model,
    messages,
    temperature: 0,
  });

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${text.slice(0, 200)}`);
  }

  const json = (await response.json()) as {
    choices: Array<{ message: { content: string | null } }>;
  };
  return json.choices?.[0]?.message?.content ?? "";
}

/**
 * Convert LangChain BaseMessage array to plain role/content objects for the fetch API,
 * then call openRouterChat. Used by code that already constructs LangChain messages.
 */
export async function openRouterChatFromLangChain(
  agent: OpenRouterModel,
  langchainMessages: BaseMessage[],
): Promise<string> {
  const plain = langchainMessages.map((m) => ({
    role: toOpenRouterRole(m) as "system" | "user" | "assistant",
    content: typeof m.content === "string" ? m.content : "",
  }));
  return openRouterChat(agent, plain);
}

/**
 * Stream a chat completion from OpenRouter, yielding text chunks incrementally.
 * Uses the OpenAI-compatible SSE streaming protocol.
 */
export async function openRouterChatStream(
  agent: OpenRouterModel,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  onChunk: (chunk: string) => void,
): Promise<string> {
  const { apiKey, model } = getConfig(agent);

  const body = JSON.stringify({
    model,
    messages,
    temperature: 0,
    stream: true,
  });

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${text.slice(0, 200)}`);
  }

  if (!response.body) {
    throw new Error("OpenRouter stream: no response body");
  }

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  // node-fetch / native fetch both expose body as a ReadableStream or Node.js Readable
  const reader = response.body as unknown as AsyncIterable<Uint8Array>;
  for await (const rawChunk of reader) {
    buffer += decoder.decode(rawChunk, { stream: true });
    const lines = buffer.split("\n");
    // Keep the last (potentially incomplete) line in buffer
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;

      let parsed: { choices?: Array<{ delta?: { content?: string | null } }> };
      try {
        parsed = JSON.parse(payload) as typeof parsed;
      } catch {
        continue;
      }

      const content = parsed.choices?.[0]?.delta?.content;
      if (content) {
        fullText += content;
        onChunk(content);
      }
    }
  }

  return fullText;
}
