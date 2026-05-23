import { z } from "zod";

export const runPipelineSchema = z.object({
  message: z.string().min(1),
  simplify: z.enum(["low", "medium", "high"]).optional().default("medium"),
});
