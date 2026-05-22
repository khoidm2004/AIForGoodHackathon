[2026-05-23] - Integrate preprocess agent with Groq (llama-4-scout-17b-16e-instruct)
What changed: Added backend/src/services/groq.client.ts exporting a ChatGroq instance configured for llama-4-scout-17b-16e-instruct. Updated preprocess.node.ts to invoke groqClient instead of a stub. Added GROQ_API_KEY to the config schema (required) and made ANTHROPIC_API_KEY optional. Added @langchain/groq ^0.1.0 to package.json dependencies. Added GROQ_API_KEY placeholder to backend/.env.
Why: Wire up a real LLM provider (Groq) to the preprocessor agent so it performs actual typo/grammar correction instead of acting as a pass-through.
Impact: preprocessNode now makes a live Groq API call on every pipeline run. simplify.node.ts, review.node.ts, pipeline.graph.ts, and pipeline.state.ts are unchanged. TypeScript compiles with zero errors. No hardcoded secrets in source files.

[2026-05-22] - Recreate backend scaffold after accidental deletion
What changed: Restored all 21+ required backend source files under backend/src/, plus backend/.env, .dockerignore, Dockerfile, package.json, and tsconfig.json. Covers agents (pipeline graph, preprocess/simplify/review nodes, pipeline state), API layer (routes, controllers, middleware, validators, DTOs, SSE), vector layer (Qdrant client and service), services, config, types, app entry points.
Why: The backend directory was accidentally deleted and needed to be fully recreated to restore the working scaffold.
Impact: Backend is fully operational again. TypeScript compiles with zero errors. No hardcoded secrets found in src/ — .env contains only placeholder values. All required dependencies (express, @langchain/langgraph, @qdrant/js-client-rest, dotenv, zod) are present in package.json.
