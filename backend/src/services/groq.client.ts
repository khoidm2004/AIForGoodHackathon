import { ChatGroq } from "@langchain/groq";
import { config } from "../config";

export const groqClient = new ChatGroq({
  apiKey: config.GROQ_API_KEY,
  model: "openai/gpt-oss-120b",
});

export const groqJsonClient = new ChatGroq({
  apiKey: config.GROQ_API_KEY,
  model: "openai/gpt-oss-120b",
  temperature: 0,
});
