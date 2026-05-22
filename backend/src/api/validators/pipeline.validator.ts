import { z } from 'zod';

export const runPipelineSchema = z.object({
  message: z.string().min(1),
  userId: z.string().min(1),
  simplify: z.boolean().optional().default(false),
});
