[2026-05-23] - Remove unused Qdrant vector layer
What changed: Deleted backend/src/vector/qdrant.client.ts and qdrant.service.ts. Removed QDRANT_URL and QDRANT_API_KEY from config env schema. Removed @qdrant/js-client-rest from package.json and refreshed package-lock.json.
Why: Vector search was not used by the pipeline or API; dropping it simplifies config and dependencies.
Impact: Backend no longer requires Qdrant env vars. Remove QDRANT_URL and QDRANT_API_KEY from backend/.env if present.

[2026-05-23] - Add retry loop to pipeline with 3-attempt cap
What changed: Added retryCount field to PipelineAnnotation in pipeline.state.ts using a summing reducer ((a, b) => a + b) with default 0. Added increment-retry.node.ts exporting incrementRetryNode, which returns { retryCount: 1 } to accumulate via the reducer. Updated pipeline.graph.ts to register the increment-retry node, replace the old 2-way conditional from review with a 3-way conditional (reviewPassed → output, !reviewPassed && retryCount < 3 → increment-retry, !reviewPassed && retryCount >= 3 → **end**), and add the edge increment-retry → simplify.
Why: Review failure previously terminated the pipeline unconditionally. The retry loop re-runs simplify→review up to 3 times before giving up, giving transient failures a chance to resolve.
Impact: Pipeline can now loop through simplify and review up to 3 additional times on failure. preprocess.node.ts, simplify.node.ts, review.node.ts, and output.node.ts are unmodified. TypeScript compiles with zero errors. Note: runPipeline in pipeline.service.ts hardcodes steps as ['preprocess', 'simplify', 'review', 'output'] and does not reflect retry iterations — acceptable for now but worth updating if accurate step tracking is needed.

[2026-05-23] - Add output node as the final pipeline stage
What changed: Added backend/src/agents/nodes/output.node.ts exporting outputNode, which composes finalOutput from state.originalMessage and state.simplifiedMessage. Updated pipeline.graph.ts to register the output node and add conditional routing from review to output (when reviewPassed is true) or **end** (when false), plus an unconditional edge from output to **end**. Updated pipeline.service.ts to read result.finalOutput and include 'output' in the steps array.
Why: Introduce a dedicated final output stage that only activates on review approval, keeping the review node responsible solely for pass/fail and delegating output assembly to its own node.
Impact: Pipeline now terminates through the output node on success and short-circuits to **end** on review failure. TypeScript compiles with zero errors. preprocess.node.ts, simplify.node.ts, review.node.ts, and pipeline.state.ts are unmodified. Minor pre-existing redundancy: reviewNode also writes finalOutput, which outputNode overwrites; functionally correct but worth cleaning up later.

[2026-05-23] - Integrate preprocess agent with Groq (llama-4-scout-17b-16e-instruct)
What changed: Added backend/src/services/groq.client.ts exporting a ChatGroq instance configured for llama-4-scout-17b-16e-instruct. Updated preprocess.node.ts to invoke groqClient instead of a stub. Added GROQ_API_KEY to the config schema (required) and made ANTHROPIC_API_KEY optional. Added @langchain/groq ^0.1.0 to package.json dependencies. Added GROQ_API_KEY placeholder to backend/.env.
Why: Wire up a real LLM provider (Groq) to the preprocessor agent so it performs actual typo/grammar correction instead of acting as a pass-through.
Impact: preprocessNode now makes a live Groq API call on every pipeline run. simplify.node.ts, review.node.ts, pipeline.graph.ts, and pipeline.state.ts are unchanged. TypeScript compiles with zero errors. No hardcoded secrets in source files.

[2026-05-22] - Recreate backend scaffold after accidental deletion
What changed: Restored all 21+ required backend source files under backend/src/, plus backend/.env, .dockerignore, Dockerfile, package.json, and tsconfig.json. Covers agents (pipeline graph, preprocess/simplify/review nodes, pipeline state), API layer (routes, controllers, middleware, validators, DTOs, SSE), vector layer (Qdrant client and service), services, config, types, app entry points.
Why: The backend directory was accidentally deleted and needed to be fully recreated to restore the working scaffold.
Impact: Backend is fully operational again. TypeScript compiles with zero errors. No hardcoded secrets found in src/ — .env contains only placeholder values. All required dependencies (express, @langchain/langgraph, @qdrant/js-client-rest, dotenv, zod) are present in package.json.
