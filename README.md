# Privacy-Aware Multi-Agent Prompt Processing System

## 1. Overview

This project proposes a **multi-agent architecture** designed to improve privacy and security when handling user prompts before storing them in a vector database or passing them into downstream LLM systems.

The core idea is:

> Reduce sensitive or unnecessary information from prompts while preserving the original intent and usable context.

The system uses multiple agents, where each agent has a dedicated responsibility:

- Cleaning and normalizing input
- Reducing sensitive/context-heavy content
- Reviewing output quality and privacy level
- Retrying processing if privacy requirements are not met

The architecture is especially useful for:
- AI systems storing conversation history
- RAG pipelines
- Vector databases
- Long-term memory systems
- Enterprise AI assistants
- Privacy-sensitive LLM deployments

---

# 2. Main Goal

The main objective is:

```text
Preserve meaning.
Reduce sensitive context.
Increase resistance against prompt-history tracing.
```

Example concern:

If a hacker gains access to:
- vector database embeddings
- cached prompts
- conversation logs

then the stored prompts should contain:
- less personal information
- less unnecessary context
- fewer traceable identifiers

while still maintaining:
- the user’s original intent
- usable semantic meaning

---

# 3. System Workflow

```text
User Prompt
    ↓
Server
    ↓
Agent 1 — Preprocess Agent
    ↓
Agent 2 — Privacy-Aware Context Simplifier
    ↓
Agent 3 — Reviewer / Validator Agent
    ├── PASS → Server
    └── FAIL → Agent 2 Retry
                    ↓
               Reprocess
                    ↓
               Review Again
                    ↓
               Agent 4 - Retry Memory Formatter
    ↓
Vector Database
```

---

# 4. Agent Responsibilities

---

## Agent 1 — Preprocess Agent

### Purpose
Normalize and clean the user input before privacy processing.

### Responsibilities
- Fix typos
- Normalize grammar
- Remove duplicated words
- Standardize formatting
- Detect obvious noise

### Example

Input:
```text
Hiiiii, immm Johnnn, today weather pls???
```

Output:
```text
Hi, I'm John. What is the weather today?
```

---

# Agent 2 — Privacy Compression Agent

## Purpose

Reduce sensitive or unnecessary information while preserving semantic intent.

This is the core privacy layer.

---

## Responsibilities

- Remove personal identifiers
- Compress unnecessary context
- Summarize redundant content
- Rewrite prompts safely
- Keep only intent-relevant information

---

## Compression Threshold

The system can use a configurable threshold:

| Threshold | Behavior |
|---|---|
| Low | Keeps more context, lower privacy |
| Medium | Balanced |
| High | Aggressive compression, stronger privacy |

---

## Example 1

### Original Prompt
```text
My name is Alex, I am 25 years old and live in Helsinki.
Can you tell me the weather today?
```

### Agent 2 Output
```text
What is the weather today?
```

---

## Example 2

### Original Prompt
```text
I work at Company X in Espoo and I forgot my umbrella today.
Will it rain tonight?
```

### Agent 2 Output
```text
Will it rain tonight?
```

---

## Possible Processing Methods

### Option A — Direct Trimming
Remove unnecessary information.

### Option B — Semantic Summarization
Rewrite the prompt into a shorter semantic version.

### Option C — Hybrid
Both trimming and summarization.

---

# Agent 3 — Reviewer / Validator Agent

## Purpose

Validate whether:
- privacy requirements are satisfied
- semantic meaning is preserved
- output quality is acceptable

---

## Responsibilities

- Compare original and compressed prompt
- Estimate semantic similarity
- Detect remaining sensitive information
- Decide PASS or FAIL

---

## PASS Condition

If:
- semantic meaning retained above threshold
- sensitive content reduced sufficiently

Then:
```text
PASS → Send to server
```

---

## FAIL Condition

If:
- too much sensitive information remains
OR
- meaning is lost excessively

Then:
```text
FAIL → Return to Agent 2
```

---

# 5. Retry Logic

If Agent 3 rejects the output:

```text
Reviewer / Validator Agent
    ↓ FAIL
Privacy Agent Retry
    ├── stronger summarization
    ├── rewrite prompt
    ├── remove additional metadata
    └── retry compression
```

Possible retry strategies:
- stronger summarization
- entity masking
- keyword filtering
- sentence rewriting
- semantic abstraction

---

# 6. Semantic Similarity Validation

The system may compare:

```text
Original Prompt
vs
Compressed Prompt
```

using:
- cosine similarity
- sentence embeddings
- transformer embeddings
- semantic scoring

---

## Example

### Original
```text
I am Bob from Helsinki and I want to know if it rains tomorrow.
```

### Compressed
```text
Will it rain tomorrow?
```

Similarity:
```text
0.84 semantic similarity
```

If threshold:
```text
minimum similarity = 0.75
```

then:
```text
PASS
```

---

# 7. Security Benefits

## Reduced Prompt Traceability

Even if attackers access:
- logs
- embeddings
- vector databases

they obtain:
- compressed prompts
- reduced personal data
- minimized context leakage

---

## Lower Sensitive Data Exposure

The system reduces:
- names
- locations
- ages
- company names
- unnecessary metadata

before storage.

---

## Better RAG Security

Useful for:
- long-term memory systems
- vector search
- retrieval systems
- enterprise AI assistants

---

# 8. Possible Tech Stack

| Component | Possible Technology |
|---|---|
| Server | FastAPI / Flask |
| Agent Orchestration | LangGraph |
| Agent Framework | Direct OpenRouter API (`openai` SDK) |
| Embeddings | Sentence Transformers |
| Vector DB | ChromaDB / Qdrant / FAISS |
| Similarity Check | Cosine Similarity |
| LLM Backend | OpenRouter / OpenAI API |
| Privacy Layer | Custom Python Pipeline |

---

# 9. Future Improvements

## Adaptive Thresholds
Different security levels for different users.

---

## Entity Detection
Automatic detection of:
- names
- locations
- emails
- phone numbers

using NER models.

---

## Multi-Level Privacy Modes

Example:
- Normal Mode
- Enterprise Mode
- High Security Mode

---

## Differential Privacy
Inject statistical privacy techniques.

---

## Explainable Compression
Allow users to see:
- what was removed
- why it was removed

---

# 10. Example Full Workflow

## User Input

```text
Hi, I am Michael from Espoo.
I work at Company X.
Can you tell me if it will rain tomorrow?
```

---

## Agent 1 Output

```text
Hi, I am Michael from Espoo. I work at Company X.
Can you tell me if it will rain tomorrow?
```

(cleaned formatting only)

---

## Agent 2 Output

```text
Will it rain tomorrow?
```

---

## Agent 3 Review

### Checks
- Meaning preserved? → YES
- Sensitive data removed? → YES

Result:
```text
PASS
```

---

## Stored in Vector Database

```text
Will it rain tomorrow?
```

instead of the original sensitive prompt.

---

# 11. Core Innovation

The main innovation is:

```text
Privacy-aware semantic compression before vector storage.
```

Instead of storing:
- full prompts
- raw conversations
- sensitive metadata

the system stores:
- intent-preserving compressed prompts

through a multi-agent verification pipeline.

---

# 12. Potential Research / Demo Angles

This project can be presented as:

- Privacy-preserving RAG architecture
- Secure prompt engineering pipeline
- Multi-agent AI security system
- Prompt anonymization framework
- Semantic compression for LLM memory systems
- Privacy-aware vector database ingestion pipeline

---

# 13. Context Compression & Retry Validation System

## Architecture Overview

The full multi-agent pipeline for context simplification and validation:

```text
Prompt Source / User Prompt
    ↓
Privacy-Aware Context Simplifier
    ↓
Reviewer / Validator Agent
    ↓
Retry Memory Formatter
    ↓
Vector Database
```

This pipeline sits between the active coding/review workflow and long-term vector storage. Every piece of context that enters the Vector Database has been compressed, validated, and structured by this four-stage pipeline.

---

## Why Retry-Aware Simplification Exists

Long-running AI coding workflows suffer from:

- **Context overflow** — token windows fill up with stale or redundant information
- **Forgotten architectural decisions** — key constraints disappear from context
- **Loss of unresolved errors** — active debugging state is overwritten
- **Degraded reasoning quality** — too much noise, too little signal
- **Duplicated information** — repeated summaries waste tokens

This system solves those problems by:

- Compressing context through a salience-aware pipeline
- Validating compression quality with semantic similarity scoring
- Storing both failed and successful attempts for future analysis
- Formatting retry history before Vector DB ingestion

---

## Agent Responsibilities

### Agent 1 — Preprocessor (Rule-Based Normalization)

Applies a **rule-based preprocessing algorithm** before any LLM processing occurs:

- Fix typos and spelling errors
- Normalize typing format and grammar
- Remove duplicate words and repeated punctuation
- Standardize whitespace and formatting
- Detect and strip obvious noise

This stage is intentionally lightweight and deterministic — no LLM is invoked. It ensures that downstream agents work on clean, consistent input.

**Example:**

| Input | Output |
|---|---|
| `Hiiiii immm workking on thee loginnn pagee` | `I am working on the login page` |

---

### Agent 2 — Context Simplifier (Hybrid Privacy-Aware Semantic Compression)

The core compression layer. Uses a **hybrid privacy-aware semantic compression** strategy:

#### Compression Pipeline

1. **Semantic Chunking** — split context into semantically coherent segments
2. **Salience Scoring** — rank each chunk by relevance to the current task
3. **Rolling Structured Summary** — maintain a cumulative structured summary that absorbs new information
4. **Mask / Remove PII** — detect and strip personally identifiable information
5. **Redundancy Removal** — deduplicate overlapping content across chunks

#### What Must Be Preserved

The simplifier must **never** discard:

- Filenames and file paths
- Function names, class names, and active symbols
- Unresolved errors and stack traces
- Architectural decisions and constraints
- Active API references and commands
- Open questions that affect downstream reasoning

#### Output Format

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

#### Compression Levels

| Level | Behaviour |
|---|---|
| Low | Minimal reduction, higher detail retained |
| Medium | Balanced — default for first attempt |
| High | Aggressive — used on retry after failed review |

---

### Agent 3 — Reviewer / Validator (Semantic Validation Gate)

Acts as a strict **validation gate** using `sentence-transformers` for semantic similarity scoring.

#### Validation Checks

| Check | Condition for PASS |
|---|---|
| Semantic meaning preserved | Cosine similarity ≥ configured threshold |
| Important entities preserved | All symbols from original appear in output |
| Active files preserved | No active filenames dropped |
| Unresolved errors preserved | All error references retained |
| Architectural constraints preserved | No constraint references dropped |
| PII check | No personally identifiable information remains |

#### PASS Condition

All checks pass → forward to Retry Memory Formatter with `approved: true`.

#### FAIL Condition

Any check fails → return to Agent 2 for retry at higher compression level.

#### Validation Output

```json
{
  "approved": true,
  "reason": "summary preserved all required entities",
  "missing_items": []
}
```

---

### Agent 4 — Retry Memory Formatter

Sits between the Reviewer and the Vector Database. Its sole responsibility is to **structure and persist the retry history** before ingestion.

This agent:

- Collects failed simplification attempts (labeled `false`)
- Collects the final approved simplification (labeled `true`)
- Attaches review notes and reasons to each attempt
- Packages everything into the retry memory schema
- Forwards the structured record to the Vector DB

---

## Retry-Aware Memory System

### Retry Validation Workflow

```text
Agent 2 simplifies context
    ↓
Agent 3 reviews output
    ├── PASS (attempt 1)
    │     ↓
    │   Agent 4 formats with attempt=1, true={...}
    │     ↓
    │   Vector DB
    └── FAIL
          ↓
        Store failed output as false={...}
          ↓
        Agent 2 retries at compression_level=high
          ↓
        Agent 3 reviews again
          ├── PASS (attempt 2)
          │     ↓
          │   Agent 4 formats with attempt=2, false={...}, true={...}
          │     ↓
          │   Vector DB
          └── FAIL → mark as permanently failed, store record, skip ingestion
```

### Retry Memory Schema

When the first attempt passes:

```json
{
  "attempt": 1,
  "true": {
    "summary": "validated simplification output",
    "review_notes": "preserved active architecture and debugging context"
  }
}
```

When the first attempt fails and the retry passes:

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

## Vector DB Storage Rules

### Store

| Field | Description |
|---|---|
| Failed simplification outputs | Labeled as `false` with failure reason |
| Successful retry outputs | Labeled as `true` with review notes |
| Review reasons | Why each attempt passed or failed |
| Retry count | Number of attempts before approval |
| Task metadata | Task ID, timestamp, compression score |
| Active symbols | Function names, class names, APIs |
| Active files | Filenames relevant at time of compression |

### Do NOT Store

- Duplicated summaries (check hash before insert)
- Full raw conversation history
- Unnecessary verbose reasoning chains
- Temporary intermediate prompts that were never reviewed

---

## Metadata Schema

Every record stored in the Vector DB carries this metadata envelope:

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

## Design Goals

### Primary Goals

- Preserve reasoning quality across long sessions
- Minimize token usage without losing critical context
- Reduce hallucinations by removing noise before storage
- Maintain long-term memory consistency
- Support scalable multi-agent workflows

### Secondary Goals

- Improve Vector DB retrieval quality through structured metadata
- Preserve debugging history for post-session analysis
- Enable future reinforcement strategies using retry records
- Support autonomous retry pipelines with adaptive thresholds

---

## Recommended Workflows

### Standard Coding Session

```text
1. Coder Agent produces output
2. Context Simplifier compresses at level=medium
3. Reviewer validates — PASS
4. Retry Memory Formatter stores attempt=1, true={...}
5. Vector DB ingests structured record
```

### Long Session with Context Drift

```text
1. Coder Agent output grows large
2. Context Simplifier compresses at level=medium
3. Reviewer finds missing unresolved errors — FAIL
4. Retry Memory Formatter records false={...}
5. Context Simplifier retries at level=high with error preservation hint
6. Reviewer validates — PASS
7. Retry Memory Formatter stores attempt=2, false={...}, true={...}
8. Vector DB ingests with full retry history
```

---

## Recommended Reviewer Models

| Role | Recommended Models |
|---|---|
| Reviewer / Validator Agent | Claude Opus 4.6 / 4.7, GPT-5.5, Gemini 3.1 Pro |
| Context Simplifier Agent | Claude Sonnet 4.6, GPT-5.4, Kimi K2.5 |
| Coder Agent | Qwen3 8B, Codex 5.3, GPT-5.3 |
| Retry Memory Formatter | Any fast model (low reasoning load) |

---

## Tech Stack

| Component | Technology |
|---|---|
| Agent Orchestration | LangGraph |
| Agent Framework | Direct OpenRouter API (`openai` SDK) |
| Semantic Validation | sentence-transformers (all-MiniLM-L6-v2) |
| Vector Database | ChromaDB |
| API Server | FastAPI + uvicorn |
| Privacy / PII Detection | Custom Python pipeline |
| Similarity Scoring | scikit-learn cosine similarity + numpy |
| Configuration | python-dotenv + pydantic |