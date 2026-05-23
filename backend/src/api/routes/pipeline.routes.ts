import { Router } from "express";
import { runPipelineController } from "../controllers/pipeline.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();
router.post("/run", authMiddleware, runPipelineController);

export default router;
