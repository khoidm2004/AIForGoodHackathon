import { StateGraph } from '@langchain/langgraph';
import { PipelineAnnotation } from '../state/pipeline.state';
import { preprocessNode } from '../nodes/preprocess.node';
import { simplifyNode } from '../nodes/simplify.node';
import { reviewNode } from '../nodes/review.node';

const graph = new StateGraph(PipelineAnnotation)
  .addNode('preprocess', preprocessNode)
  .addNode('simplify', simplifyNode)
  .addNode('review', reviewNode)
  .addEdge('__start__', 'preprocess')
  .addEdge('preprocess', 'simplify')
  .addEdge('simplify', 'review')
  .addEdge('review', '__end__');

export const pipelineGraph = graph.compile();
