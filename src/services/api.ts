import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { "Content-Type": "application/json" },
});

export async function runPipeline(message: string, simplify: "low" | "medium" | "high") {
    const { data } = await api.post("/api/pipeline/run", { message, simplify });
    if (!data.success) throw new Error(data.error ?? "Pipeline failed");
    return data.data as {result: { status: string; answer: string; simplifiedMessage: string }};
}

export async function warmup() {
  const alreadyWarmedUp = localStorage.getItem("isWarmup");
  if (alreadyWarmedUp === "true") return;

  try {
    const response = await api.get("/warmup");
    console.log("Warmup response:", response.data);
    if (response.data?.ready === true) {
      localStorage.setItem("isWarmup", "true");
    }
  } catch (err) {
    console.warn("Warmup request failed:", err);
  }
}
