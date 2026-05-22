import { ChatGroq } from '@langchain/groq';
import { config } from '../config';

export const groqClient = new ChatGroq({
  apiKey: config.GROQ_API_KEY,
  model: "meta-llama/llama-4-scout-17b-16e-instruct",
});
