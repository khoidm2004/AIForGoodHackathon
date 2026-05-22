import { Annotation } from '@langchain/langgraph';

export const PipelineAnnotation = Annotation.Root({
  originalMessage: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  preprocessedMessage: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  simplifiedMessage: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  reviewPassed: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  finalOutput: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  shouldSimplify: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
});

export type PipelineState = typeof PipelineAnnotation.State;
