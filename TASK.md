# Task

Initialize folder structure for a backend AI app using Node.js, Express, TypeScript, and LangGraph and vector database using Qdrant and setup development env for me.


├── src/
│   ├── agents/
│   │   ├── graphs/
│   │   │   └── pipeline.graph.ts
│   │   ├── nodes/
│   │   │   ├── preprocess.node.ts
│   │   │   ├── simplify.node.ts
│   │   │   └── review.node.ts
│   │   └── state/
│   │       └── pipeline.state.ts
│   │
│   ├── vector/
│   │   ├── qdrant.client.ts
│   │   └── qdrant.service.ts
│   │
│   ├── api/
│   │   ├── routes/
│   │   │   ├── pipeline.routes.ts
│   │   │   └── health.routes.ts
│   │   ├── controllers/
│   │   │   └── pipeline.controller.ts
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts
│   │   │   ├── error.middleware.ts
│   │   │   └── rateLimit.middleware.ts
│   │   ├── validators/
│   │   │   └── pipeline.validator.ts
│   │   ├── dto/
│   │   │   └── pipeline.dto.ts
│   │   └── sse/
│   │       └── stream.ts
│   │
│   ├── services/
│   │   └── pipeline.service.ts
│   │
│   ├── config/
│   │   └── index.ts
│   │
│   ├── types/
│   │   └── index.ts
│   │
│   ├── app.ts
│   └── index.ts
│
├── .env
├── .dockerignore
├── Dockerfile
├── package.json
└── tsconfig.json