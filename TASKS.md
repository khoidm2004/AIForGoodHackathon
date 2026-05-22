# Implementation Tasks

Phạm vi: **Agent 1, 2, 3** (Python) — CrewAI + FastAPI + OpenRouter + ChromaDB.  
Tham chiếu: [README.md](README.md)

## Legend

| Tag | Ý nghĩa |
|-----|---------|
| **[MANUAL]** | Bạn tự làm (terminal, browser, tạo/sửa file tay) |
| **[AIDER]** | Copy prompt bên dưới vào [aider](https://aider.chat) để nó viết code |

---

## Đã copy từ agentforge (sẵn trong repo)

| File | Nguồn | Mục đích |
|------|--------|----------|
| [start_aider.bat](start_aider.bat) | `agentforge/start_aider.bat` | `conda activate aider` + `openrouter/qwen/qwen3-8b` + đọc README/TASKS |
| [.env.example](.env.example) | pattern `agentforge/.env.example` + biến Hackathon | Template; không commit `.env` |
| [config/openrouter_models.yaml](config/openrouter_models.yaml) | `routing_rules.yaml` | Gợi ý model free cho `OPENROUTER_MODEL` |
| [docs/skills/fastapi.md](docs/skills/fastapi.md) | `agentforge/skills/fastapi.md` | Aider đọc khi làm FastAPI (TASK A7) |

**Không copy:** package `agentforge/`, Discord/Ollama/n8n, `OpenRouterClient` (CrewAI dùng LLM riêng).

---

## PHASE 1 — Setup (Manual)

- [ ] **[MANUAL]** Cài Python 3.11+ nếu chưa có: https://python.org
- [ ] **[MANUAL]** Tạo virtual environment:
  ```bash
  python -m venv venv
  venv\Scripts\activate   # Windows
  ```
- [x] **[MANUAL]** OpenRouter: nếu đã có key từ agentforge, giữ trong `.env` — chỉ **bổ sung** biến thiếu từ [.env.example](.env.example) (`OPENROUTER_MODEL`, `SIMILARITY_THRESHOLD`, …)
- [ ] **[MANUAL]** Chưa có `.env`: `copy .env.example .env` rồi điền `OPENROUTER_API_KEY`
- [ ] **[MANUAL]** Model: mặc định Aider = `qwen/qwen3-8b` (xem [config/openrouter_models.yaml](config/openrouter_models.yaml))
- [ ] **[MANUAL]** Chạy Aider (thay vì gõ `aider` tay):
  ```bat
  start_aider.bat
  ```
  Cần conda env tên `aider` (giống project cũ). Hoặc:
  ```bash
  cd Hackathon
  aider --model qwen/qwen3-8b --read README.md --read TASKS.md --read docs/skills/fastapi.md
  ```

---

## PHASE 2 — Aider Tasks (theo thứ tự)

> Dùng **`start_aider.bat`** hoặc lệnh aider ở PHASE 1.  
> Copy **từng prompt** dưới đây vào chat aider. Xong một task → review → task tiếp theo.

---

### TASK A1 — `requirements.txt` (`.env.example` đã có sẵn) ✅

**[AIDER]** Copy prompt:

```
Create requirements.txt in the project root with these dependencies (latest stable versions):
   - langgraph
   - langchain
   - langchain-openai
   - sentence-transformers
   - chromadb
   - fastapi
   - uvicorn[standard]
   - python-dotenv
   - pydantic
   - numpy
   - scikit-learn

Do NOT overwrite .env.example — it already exists in the repo with OPENROUTER_* and pipeline variables.
```

**Sau A1 — [MANUAL]:** Đối chiếu `.env` với `.env.example` (thêm biến thiếu). Chưa `pip install` — làm ở PHASE 3 sau khi code xong.

---

### TASK A2 — `config.py`

**[AIDER]** Copy prompt:

```
Create config.py in the project root.

Load settings from environment variables using python-dotenv (load .env at import time).

Define module-level constants or a Settings class for:
- OPENROUTER_API_KEY (str, required — raise clear error if missing when used)
- OPENROUTER_MODEL (str, default "meta-llama/llama-3.1-8b-instruct:free")
- SIMILARITY_THRESHOLD (float, default 0.75) — minimum cosine similarity for PASS
- MAX_RETRIES (int, default 2)
- CHROMA_PERSIST_DIR (str, default "./chroma_db")
- API_HOST (str, default "0.0.0.0")
- API_PORT (int, default 8000)
```

---

### TASK A3 — `core/similarity.py`

**[AIDER]** Copy prompt:

```
Create core/__init__.py (empty) and core/similarity.py.

Implement a CrewAI BaseTool called SimilarityTool:
- Import BaseTool from crewai.tools (or crewai_tools if that is the correct import for current crewai version)
- Use sentence-transformers model "all-MiniLM-L6-v2"
- Pydantic input schema: text1 (str), text2 (str)
- _run returns float: cosine similarity between 0.0 and 1.0

Also add standalone function:
  compute_similarity(text1: str, text2: str) -> float

Load the embedding model once at module level (singleton) to avoid reloading on every call.
```

---

### TASK A4 — `agents/crew.py` (3 CrewAI Agents + Tasks + Crew)

**[AIDER]** Copy prompt:

```
Create agents/__init__.py (empty) and agents/crew.py.

Define 3 specialized CrewAI agents and function:
  build_crew(original_prompt: str, compression_level: str = "medium") -> Crew

Imports:
  from crewai import Agent, Task, Crew, Process, LLM
  from core.similarity import SimilarityTool
  from config import OPENROUTER_API_KEY, OPENROUTER_MODEL

LLM (OpenRouter via LiteLLM format):
  llm = LLM(
      model=f"openrouter/{OPENROUTER_MODEL}",
      api_key=OPENROUTER_API_KEY,
      base_url="https://openrouter.ai/api/v1"
  )

Agent 1 — Preprocessor:
  role="Text Preprocessor"
  goal="Normalize and clean raw user input text"
  backstory="Expert in NLP text normalization. Fix typos, grammar, remove duplicate words, standardize formatting. Never add new information."
  llm=llm, verbose=True

Agent 2 — Privacy Compressor:
  role="Privacy Compression Specialist"
  goal="Remove sensitive personal information while preserving core intent"
  backstory="Expert in data privacy. Remove names, locations, ages, company names, PII. Compression level: low/medium/high affects aggressiveness."
  llm=llm, verbose=True

Agent 3 — Review Auditor:
  role="Privacy Review Auditor"
  goal="Validate privacy and semantic quality of compressed prompt"
  backstory="Strict privacy auditor. Use SimilarityTool for semantic similarity. Output JSON: status (PASS/FAIL), reason, similarity_score."
  tools=[SimilarityTool()]
  llm=llm, verbose=True

Tasks (sequential, Process.sequential):

Task 1 — preprocessor:
  description: clean/normalize the input; return only cleaned text
  expected_output: cleaned text

Task 2 — compressor (use compression_level in description):
  description: remove PII at given compression level; return only compressed text
  context: [task1]

Task 3 — reviewer:
  description: compare original vs compressed using SimilarityTool; return JSON with status, reason, similarity_score. PASS if similarity >= threshold and no sensitive data remains.
  context: [task2]
  expected_output: JSON with status, reason, similarity_score

Return Crew(agents=[...], tasks=[...], process=Process.sequential, verbose=True)
```

---

### TASK A5 — `agents/pipeline.py` (Retry logic)

**[AIDER]** Copy prompt:

```
Create agents/pipeline.py.

Import build_crew from agents.crew, compute_similarity from core.similarity, and MAX_RETRIES, SIMILARITY_THRESHOLD from config.

Define ProcessResult (dataclass or TypedDict):
  original: str
  preprocessed: str
  compressed: str
  similarity_score: float
  status: str   # "PASS" or "FAIL"
  retries: int

Define run_pipeline(prompt: str) -> ProcessResult:

1. Run build_crew(prompt, compression_level="medium").kickoff()
2. Parse outputs: preprocessed (task 1), compressed (task 2), review JSON (task 3)
3. Strip markdown code fences if LLM wraps JSON in ```json blocks
4. If status == "FAIL" and retries < MAX_RETRIES:
     - Re-run build_crew(prompt, compression_level="high").kickoff()
     - Parse again, increment retries
5. Set similarity_score using compute_similarity(original, compressed) as ground truth
6. If review JSON unparseable, treat as FAIL and retry if retries remain
7. Return ProcessResult with all fields
```

---

### TASK A6 — `db/chromadb_client.py`

**[AIDER]** Copy prompt:

```
Create db/__init__.py (empty) and db/chromadb_client.py.

Use chromadb PersistentClient with CHROMA_PERSIST_DIR from config.

Functions:
  get_client() -> chromadb.ClientAPI
  get_collection() -> chromadb.Collection  # name: "compressed_prompts"

  store_prompt(original: str, compressed: str, similarity_score: float, metadata: dict | None = None):
    - Add document with UUID id
    - Document text = compressed prompt
    - Metadata: original, similarity_score, plus any extra fields

  query_similar(text: str, n_results: int = 5) -> list[dict]:
    - Query collection for similar stored prompts
    - Return list of dicts: compressed, original, similarity_score (and distance if useful)
```

---

### TASK A7 — `api/routes.py` và `api/main.py`

**[AIDER]** Đã có [docs/skills/fastapi.md](docs/skills/fastapi.md) (từ agentforge). Trong aider có thể: `/read docs/skills/fastapi.md`

Copy prompt:

```
Create api/__init__.py (empty), api/routes.py, api/main.py.
Follow docs/skills/fastapi.md for structure, CORS, Pydantic models, and async patterns.

api/routes.py:
  - APIRouter
  - PromptRequest: prompt (str)
  - ProcessResponse: original, preprocessed, compressed, similarity_score, status, retries
  - POST /process: run_pipeline(prompt), then store_prompt in ChromaDB, return ProcessResponse
  - GET /health: {"status": "ok", "service": "privacy-agent-pipeline"}

api/main.py:
  - FastAPI app title="Privacy Agent Pipeline", version="1.0.0"
  - Include router
  - CORS allow all origins (for TypeScript team)
  - if __name__ == "__main__": uvicorn with API_HOST, API_PORT from config
```

---

### TASK A8 — Update `README.md` (section 13)

**[AIDER]** Copy prompt:

```
Append "## 13. Implementation" to README.md with:

### Tech Stack (Python Agents)
- CrewAI (3 specialized agents — meets hackathon agentic requirement)
- OpenRouter API
- sentence-transformers (all-MiniLM-L6-v2)
- ChromaDB
- FastAPI

### Project Structure
(directory tree: agents/, core/, db/, api/, config.py, requirements.txt)

### Setup Guide
1. venv + pip install -r requirements.txt
2. copy .env.example to .env, fill OPENROUTER_API_KEY
3. python -m uvicorn api.main:app --reload

### API Endpoints
- POST /process
- GET /health
- GET /docs (Swagger)

### Responsibility Split
- Python: Agents 1–3 + FastAPI
- TypeScript (team): frontend/server, HTTP calls to POST /process
```

---

## PHASE 3 — Sau khi Aider xong (Manual)

- [ ] **[MANUAL]** `pip install -r requirements.txt`
- [ ] **[MANUAL]** `.env`: đã có từ agentforge thì chỉ merge thêm key từ `.env.example`; chưa có thì `copy .env.example .env` + điền `OPENROUTER_API_KEY`
- [ ] **[MANUAL]** Chạy server:
  ```bash
  python -m uvicorn api.main:app --reload
  ```
- [ ] **[MANUAL]** Test tại http://localhost:8000/docs — `POST /process` với prompt mẫu từ README
- [ ] **[MANUAL]** Review code aider tạo; nếu lỗi import/runtime, fix bằng aider hoặc Cursor

---

## PHASE 4 — Review checklist (Manual)

- [ ] `agents/crew.py`: đủ 3 agents (Preprocessor, Compressor, Reviewer)?
- [ ] `agents/pipeline.py`: retry khi FAIL, `compression_level` high ở lần 2?
- [ ] `core/similarity.py`: `SimilarityTool` + `compute_similarity()`?
- [ ] `api/routes.py`: `POST /process`, `GET /health`?
- [ ] `db/chromadb_client.py`: `store_prompt()`?
- [ ] Server start không lỗi import?
- [ ] Response JSON đúng: `original`, `preprocessed`, `compressed`, `similarity_score`, `status`, `retries`?

---

## Ghi chú cho reviewer / team TS

- Python service expose **HTTP only** — team TS gọi `POST http://localhost:8000/process`
- OpenAPI: `GET /docs` khi server chạy
- Không commit file `.env` (chỉ `.env.example`)

---

## Context Simplification Validation Pipeline

### Objective

Implement a multi-stage context compression and validation workflow that sits between the Coder/Reviewer agents and the Vector Database ingestion layer.

The system must:

- Preserve failed simplification attempts as part of the retry history
- Preserve successful retry attempts with full review notes
- Maintain retry history per task
- Allow future retrieval of both failed and successful context compression outputs
- Only mark a simplification as valid when **all** validation checks pass
- Never store raw conversation history or duplicate summaries in the Vector DB

---

### Final Pipeline Architecture

```text
Coder Agent
    ↓
Context Simplifier Agent        (Agent 2)
    ↓
Reviewer / Validator Agent      (Agent 3)
    ↓
Retry Memory Formatter          (Agent 4)
    ↓
Vector Database
```

---

### Agent Responsibilities

---

#### Agent 1 — Preprocessor (Rule-Based Normalization Algorithm)

**Type:** Deterministic, rule-based — no LLM required.

**Responsibilities:**

- Fix typos and spelling errors
- Normalize typing format and grammar
- Remove duplicated words and repeated punctuation
- Standardize whitespace and formatting
- Detect and strip obvious input noise

**Rules applied (in order):**

1. Lowercase normalize → restore casing from context
2. Spell correction via dictionary lookup
3. De-duplicate consecutive repeated words
4. Strip extra whitespace and trailing punctuation
5. Normalize unicode characters

---

#### Agent 2 — Context Simplifier (Hybrid Privacy-Aware Semantic Compression)

**Type:** LLM-assisted with structured output.

**Responsibilities:**

- Reduce token usage aggressively
- Preserve important symbols: filenames, function names, APIs, stack traces, commands
- Preserve unresolved errors and debugging state
- Preserve architectural decisions and constraints
- Use semantic chunking to split context into coherent segments
- Use salience scoring to rank and filter chunks
- Use rolling structured summaries to absorb new information
- Apply redundancy removal to deduplicate overlapping content
- Mask or remove PII before output

**Compression Strategy:**

| Step | Method |
|---|---|
| 1 | Semantic chunking |
| 2 | Salience scoring per chunk |
| 3 | Rolling structured summary |
| 4 | Mask / remove PII |
| 5 | Redundancy removal |

**Compression Levels:**

| Level | Use When |
|---|---|
| `medium` | First attempt (default) |
| `high` | Retry after failed review |

**Output Format:**

```json
{
  "task": "current active task",
  "summary": "compressed context",
  "important_symbols": [],
  "active_files": [],
  "errors": [],
  "constraints": [],
  "open_questions": []
}
```

---

#### Agent 3 — Reviewer / Validator (Semantic Validation Gate)

**Type:** LLM + `sentence-transformers` cosine similarity scoring.

**Responsibilities:**

- Compute semantic similarity between original and compressed context
- Verify all important symbols still appear in the output
- Verify all active filenames are preserved
- Verify all unresolved errors are retained
- Verify architectural constraints are not dropped
- Run PII check — fail if PII remains after compression
- Issue PASS or FAIL verdict with structured reasoning

**Validation Rules:**

| Check | PASS Condition |
|---|---|
| Semantic meaning preserved | Cosine similarity ≥ `SIMILARITY_THRESHOLD` |
| Important entities preserved | All symbols from original present in output |
| Active files preserved | No active filename dropped |
| Unresolved errors preserved | All error references retained |
| Architectural constraints preserved | No constraint reference dropped |
| PII check | No PII detected in compressed output |

**Validation Output:**

```json
{
  "approved": true,
  "reason": "summary preserved all required entities",
  "missing_items": []
}
```

---

#### Agent 4 — Retry Memory Formatter

**Type:** Structured formatting agent — low reasoning load.

**Responsibilities:**

- Receive the final verdict from Agent 3
- Collect all failed attempts (labeled `false` with failure reason)
- Collect the approved attempt (labeled `true` with review notes)
- Attach attempt count and full metadata envelope
- Package the structured retry memory record
- Forward the completed record to Vector DB for ingestion

---

### Retry Validation Workflow

```text
Agent 2 simplifies context (level=medium)
    ↓
Agent 3 reviews
    ├── PASS (attempt 1)
    │     ↓
    │   Agent 4 → { attempt: 1, true: { summary, review_notes } }
    │     ↓
    │   Vector DB
    └── FAIL
          ↓
        false = { summary, reason }
          ↓
        Agent 2 retries (level=high)
          ↓
        Agent 3 reviews again
            ├── PASS (attempt 2)
            │     ↓
            │   Agent 4 → { attempt: 2, false: {...}, true: {...} }
            │     ↓
            │   Vector DB
            └── FAIL → store permanently-failed record, skip ingestion
```

---

### Retry Memory Schema

**Attempt 1 — passes immediately:**

```json
{
  "attempt": 1,
  "true": {
    "summary": "validated simplification output",
    "review_notes": "preserved active architecture and debugging context"
  }
}
```

**Attempt 2 — first failed, retry passed:**

```json
{
  "attempt": 2,
  "false": {
    "summary": "first failed simplification output",
    "reason": "missing unresolved stack trace"
  },
  "true": {
    "summary": "validated simplification output",
    "review_notes": "preserved active architecture and debugging context"
  }
}
```

---

### Vector DB Storage Rules

**Store:**

| Field | Description |
|---|---|
| Failed simplification outputs | Labeled `false` with failure reason |
| Successful retry outputs | Labeled `true` with review notes |
| Review reasons | Why each attempt passed or failed |
| Retry count | Number of attempts before approval |
| Task metadata | Task ID, timestamp, compression score |
| Active symbols | Function names, class names, API references |
| Active files | Filenames relevant at time of compression |

**Do NOT store:**

- Duplicated summaries (deduplicate by content hash before insert)
- Full raw conversation history
- Unnecessary verbose reasoning chains
- Temporary intermediate prompts that were never reviewed

---

### Metadata Schema

```json
{
  "task_id": "uuid",
  "attempt": 2,
  "review_status": "approved",
  "timestamp": "ISO-8601",
  "active_symbols": [],
  "active_files": [],
  "failure_reason": "",
  "compression_score": 0.92,
  "semantic_similarity": 0.95
}
```

---

### Aider Task — Implement Context Simplification Pipeline

**[AIDER]** Copy prompt:

```
Create agents/context_pipeline.py implementing the 4-agent context simplification pipeline.

Use LangGraph for orchestration. Import LangChain for agent logic.

Pipeline stages:
  1. PreprocessorAgent — rule-based normalization (fix typos, normalize format)
  2. ContextSimplifierAgent — hybrid semantic compression
     - semantic chunking
     - salience scoring
     - rolling structured summary
     - mask/remove PII
     - redundancy removal
     - compression_level: "medium" (default) or "high" (retry)
     - preserve: filenames, function names, errors, constraints, open questions
  3. ReviewerValidatorAgent — validation gate
     - sentence-transformers cosine similarity
     - check important_symbols, active_files, errors, constraints are preserved
     - PII check
     - return: { approved: bool, reason: str, missing_items: list }
  4. RetryMemoryFormatter — structure retry record
     - track false={summary, reason} on fail
     - track true={summary, review_notes} on pass
     - attach metadata: task_id, attempt, timestamp, compression_score, semantic_similarity

Define ContextPipelineResult (TypedDict or dataclass):
  task_id: str
  attempt: int
  review_status: str  # "approved" | "failed"
  retry_record: dict  # retry memory schema
  metadata: dict      # metadata schema

Define run_context_pipeline(raw_context: str, task_id: str | None = None) -> ContextPipelineResult
```

---

### Future Improvements

- Semantic diff scoring between attempts
- Compression quality scoring (token reduction ratio)
- Hallucination detection on compressed output
- Retrieval-aware summarization (optimize for downstream query patterns)
- Graph-based dependency preservation for complex codebases
- Automatic retry strategy adjustment based on failure reasons
- Adaptive compression thresholds based on token budget
- PII detection using dedicated NER model (spaCy / presidio)
- Reinforcement learning from retry history
