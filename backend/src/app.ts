import express from "express";
import helmet from "helmet";
import cors from "cors";
import { rateLimitMiddleware } from "./api/middleware/rateLimit.middleware";
import { errorMiddleware } from "./api/middleware/error.middleware";
import pipelineRoutes from "./api/routes/pipeline.routes";
import healthRoutes from "./api/routes/health.routes";
import warmupRoutes from "./api/routes/warmup.routes";

const app = express();

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(helmet());
app.use(cors());
app.use(express.json());
app.set("json spaces", 2);

app.use("/health", healthRoutes);
app.use("/warmup", warmupRoutes);
app.use("/api/pipeline", rateLimitMiddleware, pipelineRoutes);

app.use(errorMiddleware);

export default app;
