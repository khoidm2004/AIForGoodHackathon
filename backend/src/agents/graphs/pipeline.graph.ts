import { StateGraph } from "@langchain/langgraph";
import { PipelineAnnotation } from "../state/pipeline.state";
import { preprocessNode } from "../nodes/preprocess.node";
import { simplifyNode } from "../nodes/simplify.node";
import { reviewNode } from "../nodes/review.node";
import { outputNode } from "../nodes/output.node";
import { incrementRetryNode } from "../nodes/increment-retry.node";

const graph = new StateGraph(PipelineAnnotation)
  .addNode("preprocess", preprocessNode)
  .addNode("simplify", simplifyNode)
  .addNode("review", reviewNode)
  .addNode("output", outputNode)
  .addNode("increment-retry", incrementRetryNode)
  .addEdge("__start__", "preprocess")
  .addEdge("preprocess", "simplify")
  .addEdge("simplify", "review")
  .addConditionalEdges("review", (state) => {
    if (state.reviewPassed) return "output";
    // Max 3 attempts total: retryCount 0 (attempt 1), 1 (attempt 2), 2 (attempt 3)
    if (state.retryCount < 2) return "increment-retry";
    return "output";
  })
  .addEdge("increment-retry", "simplify")
  .addEdge("output", "__end__");

export const pipelineGraph = graph.compile();
