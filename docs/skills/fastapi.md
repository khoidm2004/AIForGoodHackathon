# FastAPI Best Practices

Apply these patterns when writing FastAPI endpoints for this project (`api/routes.py`, `api/main.py`).

## Structure
- Define request and response models with `pydantic.BaseModel`. Never accept raw `dict` from a client.
- Group related endpoints behind `APIRouter` (e.g. `router = APIRouter(tags=["pipeline"])`).
- Mount routers on the root `app` in `api/main.py`.

## Async
- Use `async def` for any endpoint that calls IO (network, disk, DB, LLM).
- CrewAI `kickoff()` may block — run it in `asyncio.to_thread()` or `run_in_executor` inside async routes.

## Errors
- Raise `HTTPException(status_code=4xx, detail=...)` for client errors.
- Return clean JSON on pipeline failures; avoid raw stack traces in production responses.

## Validation
- Validate at the boundary: Pydantic models on input, `response_model` on output.
- Use `Field(..., description=...)` so OpenAPI docs at `/docs` are useful for the TypeScript team.

## CORS
- Allow all origins for local hackathon dev (team TS frontend), same pattern as agentforge `api.py`.

## Testing
- Use `httpx` / `TestClient` against `app` (no live server needed).
- Mock `run_pipeline` and ChromaDB — do not hit OpenRouter from unit tests.
