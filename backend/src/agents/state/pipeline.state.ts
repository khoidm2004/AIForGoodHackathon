import { Annotation } from "@langchain/langgraph";

export const PipelineAnnotation = Annotation.Root({
  originalMessage: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  preprocessedMessage: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  simplifiedMessage: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  reviewPassed: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  finalOutput: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  compressionLevel: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  retryCount: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
  onChunk: Annotation<((chunk: string) => void) | undefined>({
    reducer: (_, b) => b,
    default: () => undefined,
  }),
});

export type PipelineState = typeof PipelineAnnotation.State;
