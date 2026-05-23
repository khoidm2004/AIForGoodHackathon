import { Request, Response, NextFunction } from "express";
import { runPipelineSchema } from "../validators/pipeline.validator";
import { runPipeline } from "../../services/pipeline.service";
import { initSSE, sendChunk, sendEvent, closeSSE } from "../sse/stream";

export async function runPipelineController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dto = runPipelineSchema.parse(req.body);

    initSSE(res);

    const onChunk = (chunk: string): void => {
      sendChunk(res, JSON.stringify({ type: "chunk", content: chunk }));
    };

    const output = await runPipeline(dto, onChunk);

    sendEvent(res, "result", JSON.stringify({ success: true, data: output }));
    closeSSE(res);
  } catch (err) {
    if (!res.headersSent) {
      next(err);
    } else {
      sendEvent(res, "error", JSON.stringify({ success: false, error: String(err) }));
      closeSSE(res);
    }
  }
}
