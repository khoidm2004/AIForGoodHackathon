import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { "Content-Type": "application/json" },
});
let isWarmedUp = false;

export type TraceStage = "preprocess" | "simplify" | "review" | "output";

export interface TraceEntry {
  stage: TraceStage;
  text: string;
  attempt?: number;
  passed?: boolean;
  similarityScore?: number;
  reason?: string;
  missingItems?: string[];
}

export async function runPipeline(message: string, simplify: "low" | "medium" | "high") {
    const { data } = await api.post("/api/pipeline/run", { message, simplify });
    if (!data.success) throw new Error(data.error ?? "Pipeline failed");
    return data.data as {
      result: { status: string; answer: string; simplifiedMessage: string };
      trace: TraceEntry[];
    };
}

export async function warmup() {
  if (isWarmedUp) return;

  try {
    const response = await api.get("/warmup");
    if (response.data?.ready === true) {
      isWarmedUp = true; 
    }
  } catch (err) {
    console.warn("Warmup request failed:", err);
  }
}