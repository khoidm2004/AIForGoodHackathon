import { Request, Response, NextFunction } from "express";
import { runPipelineSchema } from "../validators/pipeline.validator";
import { runPipeline } from "../../services/pipeline.service";

export async function runPipelineController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto = runPipelineSchema.parse(req.body);
    const output = await runPipeline(dto);
    res.json({ success: true, data: output });
  } catch (err) {
    next(err);
  }
}
