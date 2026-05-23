export type SimplifyLevel = "low" | "medium" | "high";

export interface PipelineInput {
  message: string;
  simplify?: SimplifyLevel;
}

export interface PipelineOutput {
  result: Record<string, unknown>;
  steps: string[];
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
