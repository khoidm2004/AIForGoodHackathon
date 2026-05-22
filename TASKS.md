# Implementation Tasks

Phạm vi: **Agent 1, 2, 3, 4** (Python) — LangGraph + LangChain + FastAPI + OpenRouter + ChromaDB.  
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

**Không copy:** package `agentforge/`, Discord/Ollama/n8n, `OpenRouterClient` (LangChain dùng ChatOpenAI với OpenRouter base_url).

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

Use sentence-transformers model "all-MiniLM-L6-v2".
Load the model once at module level (singleton) to avoid reloading on every call.

Implement:
  compute_similarity(text1: str, text2: str) -> float
    - encode both texts with the singleton model
    - return cosine similarity as float between 0.0 and 1.0
    - use sklearn.metrics.pairwise.cosine_similarity or numpy dot product

Also implement as a LangChain Tool (langchain.tools.Tool or @tool decorator):
  similarity_tool: Tool
    - name="similarity_tool"
    - description="Compute cosine similarity between two texts"
    - func wraps compute_similarity, accepts JSON string {"text1": ..., "text2": ...}

No CrewAI imports — use only langchain, sentence-transformers, numpy, scikit-learn.
```

---

### TASK A4 — `agents/graph.py` (LangGraph StateGraph — 4 nodes)

**[AIDER]** Copy prompt:

```
Create agents/__init__.py (empty) and agents/graph.py.

Use LangGraph (StateGraph) to orchestrate the 4-agent pipeline.
Do NOT use CrewAI. Use langchain_openai.ChatOpenAI with OpenRouter base_url.

LLM setup:
  from langchain_openai import ChatOpenAI
  from config import OPENROUTER_API_KEY, OPENROUTER_MODEL

  llm = ChatOpenAI(
      model=OPENROUTER_MODEL,
      api_key=OPENROUTER_API_KEY,
      base_url="https://openrouter.ai/api/v1",
  )

State (TypedDict):
  class PipelineState(TypedDict):
      original: str
      preprocessed: str
      compressed: str
      compression_level: str   # "medium" | "high"
      review: dict             # { approved, reason, missing_items }
      attempt: int
      retry_records: list[dict]
      final_record: dict

Nodes (one function per node):

  preprocess_node(state) -> dict
    - rule-based only: lowercase, strip extra whitespace, remove repeated words, fix obvious typos
    - no LLM call
    - return {"preprocessed": cleaned_text}

  compress_node(state) -> dict
    - call llm with system prompt:
        "You are a privacy-aware context simplifier. compression_level={state['compression_level']}.
         Remove PII (names, emails, phone, location, company). Keep intent, filenames, function names,
         errors, constraints. Return ONLY a JSON object:
         {task, summary, important_symbols, active_files, errors, constraints, open_questions}"
    - return {"compressed": llm_response_content}

  review_node(state) -> dict
    - compute similarity: from core.similarity import compute_similarity
    - call llm with system prompt:
        "You are a strict review auditor. Check: semantic meaning preserved (similarity score provided),
         PII removed, important_symbols present, active_files present, errors present.
         Return ONLY JSON: {approved: bool, reason: str, missing_items: list}"
    - inject similarity score into the prompt
    - return {"review": parsed_json}

  format_retry_node(state) -> dict
    - if review approved: build true={summary, review_notes}, append to retry_records
    - if review failed: build false={summary, reason}, append to retry_records
    - return {"retry_records": updated, "final_record": structured_record}

Edges:
  preprocess → compress → review → format_retry
  After review_node: if not approved and attempt < MAX_RETRIES:
    increment attempt, set compression_level="high", loop back to compress_node
  else: proceed to format_retry_node

Expose:
  build_graph() -> CompiledGraph
  run_graph(prompt: str) -> PipelineState
```

---

### TASK A5 — `agents/pipeline.py` (thin wrapper over LangGraph)

**[AIDER]** Copy prompt:

```
Create agents/pipeline.py.

Import run_graph from agents.graph and compute_similarity from core.similarity.

Define ProcessResult (TypedDict or dataclass):
  original: str
  preprocessed: str
  compressed: str
  similarity_score: float
  status: str        # "PASS" or "FAIL"
  retries: int
  retry_record: dict

Define run_pipeline(prompt: str) -> ProcessResult:

1. Call final_state = run_graph(prompt)
2. Extract preprocessed, compressed, review, attempt, final_record from final_state
3. Compute similarity_score = compute_similarity(prompt, compressed) as ground truth float
4. Determine status:
   - "PASS" if final_state["review"].get("approved") == True
   - "FAIL" otherwise
5. Strip markdown code fences from compressed if LLM wrapped in ```json blocks
6. Return ProcessResult with all fields populated

No CrewAI imports.
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
- LangGraph (StateGraph orchestration — 4-node pipeline)
- LangChain + LangChain-OpenAI
- OpenRouter API (via ChatOpenAI base_url)
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
- Python: Agents 1–4 + FastAPI (LangGraph pipeline)
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

- [ ] `agents/graph.py`: đủ 4 nodes (preprocess, compress, review, format_retry) trong LangGraph StateGraph?
- [ ] `agents/pipeline.py`: gọi `run_graph()`, trả `ProcessResult` với đủ fields?
- [ ] `core/similarity.py`: `compute_similarity()` + `similarity_tool` (LangChain Tool)?
- [ ] `api/routes.py`: `POST /process`, `GET /health`?
- [ ] `db/chromadb_client.py`: `store_prompt()` lưu retry_record + metadata?
- [ ] Server start không lỗi import?
- [ ] Response JSON đúng: `original`, `preprocessed`, `compressed`, `similarity_score`, `status`, `retries`, `retry_record`?
- [ ] Không còn `import crewai` hay `from crewai` ở bất kỳ file nào?

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

**Type:** Three-phase pipeline — rule-based prefilter → LLM rewrite → post-check.

**Responsibilities:**

- Reduce token usage aggressively
- Preserve important symbols: filenames, function names, APIs, stack traces, commands
- Preserve unresolved errors and debugging state
- Preserve architectural decisions and constraints
- Mask or remove PII before output

---

##### Phase 1 — Rule-Based Prefilter (before LLM)

Runs entirely in Python — **no LLM call**. Cleans the raw input so the LLM receives leaner, structured text.

**Steps (in order):**

| # | Operation | Method |
|---|---|---|
| 1 | Remove redundant / filler sentences | regex pattern: sentences containing only stop words or single-word fillers |
| 2 | Remove emoji and Unicode decorators | `re.sub(r'[^\x00-\x7F]+', '', text)` or Unicode category filter |
| 3 | Remove repeated words in sequence | `re.sub(r'\b(\w+)(\s+\1)+\b', r'\1', text, flags=re.IGNORECASE)` |
| 4 | Detect and tag PII — names | spaCy NER `PERSON` label or regex capitalized word patterns |
| 5 | Detect and tag PII — ages | regex `\b\d{1,3}\s*(years?\s*old|yo)\b` |
| 6 | Detect and tag PII — location | spaCy `GPE` / `LOC` labels |
| 7 | Detect and tag PII — company | spaCy `ORG` label |
| 8 | Detect and tag PII — email | regex `[\w.+-]+@[\w-]+\.[a-z]{2,}` |
| 9 | Detect and tag PII — phone | regex `\+?[\d\s\-().]{7,15}` |

**Output:** cleaned text with PII replaced by `[REDACTED_<TYPE>]` placeholders and filler removed.

---

##### Phase 2 — LLM Rewrite / Compression

Sends the prefiltered text to the LLM with an explicit system prompt.

**System prompt contract:**

```
You are a privacy-aware context simplifier.
compression_level: {medium|high}

Rules:
1. Keep the main intent of the input.
2. Remove all remaining sensitive details (names, locations, company, personal context).
3. Shorten sentences — remove unnecessary words.
4. Do NOT invent or add new information.
5. Preserve: filenames, function names, error messages, stack traces, API names, architectural constraints.
6. Return ONLY a JSON object with this exact schema:
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

**Compression levels:**

| Level | LLM instruction |
|---|---|
| `medium` | Balance brevity with detail — keep useful context |
| `high` | Maximize compression — keep only essential facts |

---

##### Phase 3 — Post-Check (after LLM returns)

Runs immediately after the LLM response, before passing output to Agent 3.

**Checks:**

| Check | Method | Action on fail |
|---|---|---|
| Still contains PII? | Re-run Phase 1 PII detector on LLM output | Retry Phase 2 at `high` level |
| Semantic similarity too low? | `compute_similarity(original, summary)` | If below `MIN_PRECHECK_THRESHOLD` (e.g. 0.5), reject before sending to Agent 3 |
| Output is valid JSON? | `json.loads(llm_response)` | Strip markdown fences, retry parse; if still invalid → treat as FAIL |

If post-check fails, the node signals Agent 3 to immediately return `approved: false` without full validation, saving one LLM call.

---

##### Formal Algorithm Definition

This component can be formally described as a **Privacy-Aware Semantic Compression Algorithm**:

```
INPUT:  raw_prompt (str), compression_level ("medium" | "high")
OUTPUT: sanitized_prompt (JSON), pii_tags (list), compression_score (float)

ALGORITHM PrivacyAwareSemanticCompression:

  1. TOKENIZE / SPLIT CLAUSES
       clauses ← split_into_clauses(raw_prompt)
       # sentence boundary detection, clause segmentation

  2. REMOVE LOW-UTILITY SEGMENTS
       FOR each clause IN clauses:
           IF salience_score(clause) < LOW_UTILITY_THRESHOLD:
               DROP clause
           IF is_filler(clause):   # only stop words / emojis / repetition
               DROP clause

  3. MASK SENSITIVE ENTITIES
       FOR each clause IN remaining_clauses:
           entities ← detect_pii(clause)   # NER + regex
           FOR each entity IN entities:
               clause ← replace(entity, "[REDACTED_" + entity.type + "]")

  4. COMPRESS REMAINING TEXT
       compressed ← LLM_rewrite(
           input=remaining_clauses,
           level=compression_level,
           preserve=["filenames","function_names","errors","constraints"]
       )

  5. VALIDATE MEANING RETENTION
       similarity ← cosine_similarity(
           embed(raw_prompt),
           embed(compressed.summary)
       )
       IF similarity < MIN_PRECHECK_THRESHOLD:
           RAISE CompressionFailure("semantic drift too large")
       IF detect_pii(compressed.summary) NOT EMPTY:
           RAISE CompressionFailure("PII remains after LLM rewrite")

  6. OUTPUT SANITIZED PROMPT
       RETURN compressed, pii_tags, compression_score=similarity
```

**Compression Levels:**

| Level | Use When |
|---|---|
| `medium` | First attempt (default) |
| `high` | Retry after failed review from Agent 3 |

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
Create agents/context_pipeline.py implementing the 4-stage context simplification pipeline.

Use LangGraph (StateGraph) for orchestration. Use langchain_openai.ChatOpenAI with OpenRouter base_url.
No CrewAI imports.

--- Stage 1: preprocess_node (rule-based only, no LLM) ---
- remove filler sentences (sentences that are only stop words)
- remove emoji / unicode decorators via regex
- remove repeated consecutive words via regex
- detect and replace PII with [REDACTED_<TYPE>] placeholders:
    PERSON, AGE, LOCATION, COMPANY, EMAIL, PHONE
  use spacy if available, else regex patterns as fallback
- return {"preprocessed": cleaned_text, "pii_tags": list_of_detected_tags}

--- Stage 2: compress_node (LLM rewrite) ---
Three-phase execution:
  Phase A (prefilter already done in stage 1 — skip, use state["preprocessed"])
  Phase B (LLM rewrite):
    system prompt contract:
      - keep main intent
      - remove remaining sensitive details
      - shorten sentences, do not add information
      - preserve: filenames, function names, errors, constraints, API names
      - return ONLY JSON: {task, summary, important_symbols, active_files, errors, constraints, open_questions}
    compression_level from state["compression_level"]: "medium" (default) or "high" (retry)
  Phase C (post-check, no LLM):
    - detect PII in LLM output → if found, set needs_retry=True
    - compute compute_similarity(original, summary) → if < 0.5, set needs_retry=True
    - validate JSON parse → if invalid, set needs_retry=True
- return {"compressed": json_string, "post_check_passed": bool}

--- Stage 3: review_node (LLM + sentence-transformers) ---
- compute similarity: compute_similarity(state["original"], state["compressed"].summary)
- call LLM: verify important_symbols, active_files, errors, constraints preserved; PII removed
- return {"review": {approved, reason, missing_items}, "similarity_score": float}

--- Stage 4: format_retry_node ---
- if approved: build true={summary, review_notes}
- if failed: build false={summary, reason}
- assemble final retry_record and metadata
- return {"final_record": dict, "retry_records": list}

State (TypedDict): original, preprocessed, pii_tags, compressed, compression_level,
  post_check_passed, review, similarity_score, attempt, retry_records, final_record

Edges:
  preprocess → compress → review
  after review: if not approved and attempt < MAX_RETRIES → increment attempt, level="high", back to compress
  else → format_retry (end)

Expose:
  build_context_graph() -> CompiledGraph
  run_context_pipeline(raw_context: str, task_id: str | None = None) -> dict
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
