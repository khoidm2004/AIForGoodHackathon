export interface PipelineInput {
  message: string;
  simplify?: boolean;
}

export interface PipelineOutput {
  result: string;
  steps: string[];
}

export interface PipelineStateData {
  originalMessage: string;
  preprocessedMessage: string;
  simplifiedMessage: string;
  reviewPassed: boolean;
  finalOutput: string;
  shouldSimplify: boolean;
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
