export type SimplifyLevel = "low" | "medium" | "high";

export interface PipelineInput {
  message: string;
  simplify?: SimplifyLevel;
}

export type TraceStage = "preprocess" | "simplify" | "review" | "output";

/** One stage of a single pipeline run, for the per-agent trace in the API response. */
export interface TraceEntry {
  stage: TraceStage;
  text: string;
  attempt?: number;
  passed?: boolean;
  similarityScore?: number;
  reason?: string;
  missingItems?: string[];
}

export interface PipelineOutput {
  result: Record<string, unknown>;
  steps: string[];
  trace: TraceEntry[];
}

export interface PipelineStateData {
  originalMessage: string;
  preprocessedMessage: string;
  simplifiedMessage: string;
  reviewPassed: boolean;
  finalOutput: string;
  compressionLevel: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface StreamChunk {
  event: string;
  data: string;
}
