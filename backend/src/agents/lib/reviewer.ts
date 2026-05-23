/**
 * Agent 3: review / validation (ported from Hackathon/agents/reviewer.py).
 */

import { chat } from "./llm-chat";
import type { Agent2Result } from "./context-simplifier";
import {
  AGE_RE,
  EMAIL_RE,
  FILENAME_PATTERN,
  LOCATION_RE,
  NAME_RE,
  PHONE_RE,
  reTest,
} from "./patterns";
import { computeSimilarity } from "./similarity";

export interface ReviewResult {
  approved: boolean;
  confidence: number;
  similarityScore: number;
  checks: Record<string, boolean>;
  missingItems: string[];
  reason: string;
  suggestions: string[];
}

function asText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") {
    const text = value.trim();
    if (text.startsWith("{") && text.endsWith("}")) {
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        return asText(
          parsed.reason ?? parsed.explanation ?? parsed.message ?? parsed.summary ?? parsed,
        );
      } catch {
        return text;
      }
    }
    return text;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const key of ["reason", "explanation", "message", "summary", "detail"]) {
      if (key in obj) return asText(obj[key]);
    }
    return Object.entries(obj)
      .map(([k, v]) => `${k}: ${asText(v)}`)
      .filter((s) => s.length > 0)
      .join("; ");
  }
  if (Array.isArray(value)) {
    return value.map(asText).filter(Boolean).join("; ");
  }
  return String(value).trim();
}

function asList(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(asText).filter(Boolean);
  const text = asText(value);
  return text ? [text] : [];
}

function normalizeChecks(value: unknown): Record<string, boolean> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { llm_checks_valid: false };
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [String(k), Boolean(v)]),
  );
}

function agent2Payload(agent2Output: Agent2Result | Record<string, unknown>): Record<string, unknown> {
  if ("sanitizedPrompt" in agent2Output && typeof agent2Output.sanitizedPrompt === "string") {
    const result = agent2Output as Agent2Result;
    const compressed = (result.compressed ?? {}) as Record<string, unknown>;
    return {
      sanitized_prompt: result.sanitizedPrompt,
      algorithm: result.algorithm || compressed.algorithm || "",
      compression_level: compressed.compression_level || "",
      active_files: compressed.active_files || [],
      errors: compressed.errors || [],
      constraints: compressed.constraints || [],
      open_questions: compressed.open_questions || [],
      important_symbols: compressed.important_symbols || [],
    };
  }

  const dict = agent2Output as Record<string, unknown>;
  const compressed = (dict.compressed ?? {}) as Record<string, unknown>;
  const source = typeof compressed === "object" && compressed !== null ? compressed : {};
  return {
    sanitized_prompt: dict.sanitized_prompt || source.sanitized_prompt || "",
    algorithm: dict.algorithm || source.algorithm || "",
    compression_level: dict.compression_level || source.compression_level || "",
    active_files: dict.active_files || source.active_files || [],
    errors: dict.errors || source.errors || [],
    constraints: dict.constraints || source.constraints || [],
    open_questions: dict.open_questions || source.open_questions || [],
    important_symbols: dict.important_symbols || source.important_symbols || [],
  };
}

function quickChecks(
  original: string,
  sanitized: string,
): { pass: boolean; fail?: ReviewResult } {
  if (!sanitized || sanitized.trim().length < 5) {
    return {
      pass: false,
      fail: {
        approved: false,
        confidence: 1,
        similarityScore: 0,
        checks: { empty: false },
        missingItems: ["sanitized_prompt"],
        reason: "Output is empty or too short",
        suggestions: ["Check Agent 2 pipeline"],
      },
    };
  }

  const piiPatterns = [EMAIL_RE, PHONE_RE, AGE_RE, NAME_RE, LOCATION_RE];
  const foundPii = piiPatterns.filter((p) => reTest(p, sanitized)).map((p) => p.source.slice(0, 20) + "...");

  if (foundPii.length > 0) {
    return {
      pass: false,
      fail: {
        approved: false,
        confidence: 1,
        similarityScore: 0,
        checks: { pii_clean: false },
        missingItems: foundPii,
        reason: "PII detected in output",
        suggestions: ["Increase PII masking in Agent 2"],
      },
    };
  }

  // Lexical cosine is low when rephrasing long→short; use lenient threshold
  const sim = computeSimilarity(original, sanitized);
  const lengthRatio = sanitized.length / Math.max(original.length, 1);
  // When heavily compressed (short output vs long input), lower the bar
  const threshold = lengthRatio < 0.3 ? 0.08 : 0.15;

  if (sim < threshold) {
    return {
      pass: false,
      fail: {
        approved: false,
        confidence: 0.9,
        similarityScore: sim,
        checks: { semantic_similarity: false },
        missingItems: ["core_intent"],
        reason: `Semantic drift too severe (${sim.toFixed(2)} < ${threshold})`,
        suggestions: ["Agent 2 over-compressed; retry with lower threshold"],
      },
    };
  }

  return { pass: true };
}

function extractKeyElements(text: string): Record<string, string[]> {
  return {
    filenames: [...text.matchAll(/\b\w+\.(py|js|ts|json|yaml|yml|toml|md|txt|csv|sql|html|css|scss|jsx|tsx)\b/gi)].map(
      (m) => m[0],
    ),
    errors: [...text.matchAll(/\b\w*Error:?\s*[^.\n]*/gi)].map((m) => m[0]),
    questions: [...text.matchAll(/[^.?!]*\?[^.?!]*/g)].map((m) => m[0]),
    constraints: [
      ...text.matchAll(
        /\b(do not|don't|must|should|never|always|keep|preserve|maintain)\b[^.?!]*[.?!]/gi,
      ),
    ].map((m) => m[0]),
    code_symbols: [...text.matchAll(/\b\w+\(\s*\)/g)].map((m) => m[0]),
    urls_apis: [...text.matchAll(/\b(api|endpoint|url|http)[^\s]*/gi)].map((m) => m[0]),
  };
}

function missingCriticalItems(original: string, sanitized: string): string[] {
  const originalElements = extractKeyElements(original);
  const sanitizedLower = sanitized.toLowerCase();
  const missing: string[] = [];

  for (const category of ["filenames", "errors", "code_symbols"] as const) {
    for (const item of originalElements[category] ?? []) {
      if (item && !sanitizedLower.includes(item.toLowerCase())) {
        missing.push(`${category}:${item}`);
      }
    }
  }

  for (const item of originalElements.constraints ?? []) {
    if (/\bdon't\s+(even\s+)?know\b/i.test(item)) continue;
    if (item && !sanitizedLower.includes(item.toLowerCase())) {
      missing.push(`constraints:${item}`);
    }
  }

  return missing;
}

function buildReviewPrompt(
  original: string,
  sanitized: string,
  simScore: number,
  agent2Meta: Record<string, unknown>,
): string {
  const origElems = extractKeyElements(original);
  const slice = (arr: string[], n: number) => arr.slice(0, n);

  return `Compare ORIGINAL vs SANITIZED and return ONE valid JSON object only.
Do not use markdown. Do not wrap the JSON in code fences. Do not add headings.

ORIGINAL (user's verbose prompt):
"""${original.slice(0, 2000)}"""

SANITIZED (simplified question by Agent 2):
"""${sanitized.slice(0, 1500)}"""

Pre-computed lexical similarity: ${simScore.toFixed(3)} (NOTE: low similarity is EXPECTED when rephrasing a long text into a short question)

Agent 2 metadata:
- Algorithm: ${agent2Meta.algorithm ?? ""}
- Compression level: ${agent2Meta.compression_level ?? ""}
- Important symbols: ${JSON.stringify(agent2Meta.important_symbols ?? [])}
- Constraints: ${JSON.stringify(agent2Meta.constraints ?? [])}

TASK: Agent 2's job is to SIMPLIFY the user's prompt into a concise question. It is NOT required to keep every detail.

Rules for approval:
1. CORE INTENT: Does the simplified question capture what the user actually wants to know/do?
2. KEY DECISION: If the user is asking "should I do X or Y", is that choice preserved?
3. CONSTRAINTS: Are hard requirements ("must", "don't", specific goals like "for internship demo") kept?
4. NOT REQUIRED to keep: background stories, names, locations, all technical details that are just context

Decision:
- APPROVE if the simplified question correctly identifies what the user needs answered
- APPROVE even if minor supporting details are dropped (that's the point of simplification)
- FAIL only if the core question/intent is WRONG or MISSING entirely

Return exactly this JSON shape:
{
  "approved": true,
  "confidence": 0.8,
  "checks": {
    "intent_preserved": true,
    "key_decision_preserved": true,
    "constraints_preserved": true
  },
  "missing_items": ["only list truly critical things that change the meaning"],
  "reason": "one plain-text sentence",
  "retry_suggestion": "one plain-text hint for Agent 2"
}`;
}

function extractJsonFromResponse(text: string): Record<string, unknown> {
  let body = text.trim();
  body = body.replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, "").trim();

  const fenced = body.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fenced?.[1]) {
    body = fenced[1].trim();
  }

  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new SyntaxError("No JSON object found");
  }
  return JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
}

function fallbackReview(
  original: string,
  sanitized: string,
  simScore: number,
  reason: string,
): ReviewResult {
  const missingItems = missingCriticalItems(original, sanitized);
  const approved = simScore >= 0.72 && missingItems.length === 0;
  return {
    approved,
    confidence: approved ? 0.65 : 0.35,
    similarityScore: simScore,
    checks: {
      llm_parse: false,
      semantic_similarity: simScore >= 0.72,
      critical_items_preserved: missingItems.length === 0,
    },
    missingItems,
    reason: `LLM reviewer returned malformed JSON; used deterministic fallback. ${reason}`,
    suggestions: approved ? [] : ["Retry LLM review or use a stronger reviewer model"],
  };
}

async function llmReview(
  original: string,
  sanitized: string,
  simScore: number,
  agent2Meta: Record<string, unknown>,
): Promise<ReviewResult> {
  const messages = [
    {
      role: "system" as const,
      content:
        "You are a precise validator. Output ONLY valid JSON. No markdown, no explanation outside JSON.",
    },
    {
      role: "user" as const,
      content: buildReviewPrompt(original, sanitized, simScore, agent2Meta),
    },
  ];

  try {
    const response = await chat(messages);
    const result = extractJsonFromResponse(response);
    const checks = normalizeChecks(result.checks);
    const approved = Boolean(result.approved);
    const reason = asText(result.reason);
    const suggestions = asList(result.retry_suggestion);

    return {
      approved: approved && Object.values(checks).every(Boolean),
      confidence: Number(result.confidence ?? 0.5),
      similarityScore: simScore,
      checks,
      missingItems: asList(result.missing_items),
      reason,
      suggestions,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fallbackReview(original, sanitized, simScore, `Parse error: ${msg.slice(0, 100)}`);
  }
}

export async function reviewAgent3(
  original: string,
  agent2Output: Agent2Result | Record<string, unknown>,
  options: { useLlm?: boolean; minSimilarity?: number } = {},
): Promise<ReviewResult> {
  const { useLlm = true, minSimilarity = 0.5 } = options;
  const agent2Meta = agent2Payload(agent2Output);
  const sanitized = asText(agent2Meta.sanitized_prompt);

  const quick = quickChecks(original, sanitized);
  if (!quick.pass && quick.fail) {
    return quick.fail;
  }

  const sim = computeSimilarity(original, sanitized);

  if (useLlm) {
    return llmReview(original, sanitized, sim, agent2Meta);
  }

  const approved = sim >= minSimilarity;
  return {
    approved,
    confidence: approved ? 0.7 : 0.3,
    similarityScore: sim,
    checks: { similarity_threshold: approved },
    missingItems: approved ? [] : ["elements potentially lost"],
    reason:
      `Similarity ${sim.toFixed(3)} vs threshold ${minSimilarity}` +
      (approved ? "" : " - possible over-compression"),
    suggestions: sim < 0.7 ? ["Enable LLM review for detailed analysis"] : [],
  };
}
