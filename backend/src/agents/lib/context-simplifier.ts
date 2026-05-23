/**
 * Agent 2: privacy-aware context simplification (ported from Hackathon/agents/context_simplifier.py).
 */

import { chat } from "./llm-chat";
import {
  AGE_RE,
  CODE_PATTERN,
  COMPANY_RE,
  EMAIL_RE,
  ERROR_PATTERN,
  FILENAME_PATTERN,
  FILLERS,
  LOCATION_RE,
  NAME_RE,
  NON_ASCII_RE,
  PHONE_RE,
  QUESTION_PATTERN,
  REPEATED_WORD_RE,
  STACK_TRACE_PATTERN,
  reMatchAll,
  reReplaceAll,
  reTest,
} from "./patterns";
import { buildVocab, computeSimilarity, cosineSimilarityVectors, encodeClause } from "./similarity";

export type CompressionLevel = "low" | "medium" | "high";

export interface Clause {
  text: string;
  salience: number;
  isPiiOnly: boolean;
  isFiller: boolean;
}

export interface Agent2Result {
  preprocessed: string;
  compressed: Record<string, unknown>;
  piiTags: string[];
  precheckSimilarity: number;
  postCheckPassed: boolean;
  needsRetry: boolean;
  sanitizedPrompt: string;
  clauses: Clause[];
  keptClauses: string[];
  algorithm: string;
}

const LEVEL_CONFIG: Record<
  CompressionLevel,
  { svtThreshold: number; topKRatio: number; dedupThreshold: number; useLlm: boolean }
> = {
  low: { svtThreshold: 0.16, topKRatio: 0.92, dedupThreshold: 0.97, useLlm: false },
  medium: { svtThreshold: 0.38, topKRatio: 0.68, dedupThreshold: 0.86, useLlm: false },
  high: { svtThreshold: 0.58, topKRatio: 0.38, dedupThreshold: 0.72, useLlm: true },
};

function containsPii(text: string): boolean {
  return [EMAIL_RE, PHONE_RE, AGE_RE, NAME_RE, LOCATION_RE].some((p) => reTest(p, text));
}

function isFillerClause(text: string): boolean {
  const words = text.toLowerCase().split(/\s+/);
  if (words.length === 0) return true;
  const fillerCount = words.filter((w) => FILLERS.has(w.replace(/[.,!?]/g, ""))).length;
  return fillerCount / words.length > 0.6;
}

function isPiiOnlyClause(text: string): boolean {
  if (reTest(QUESTION_PATTERN, text)) return false;
  if (/\b(help|please|need|want|tell|show|explain|fix|refactor|implement)\b/i.test(text)) {
    return false;
  }

  let cleaned = text;
  for (const pattern of [EMAIL_RE, PHONE_RE, AGE_RE, NAME_RE, LOCATION_RE, COMPANY_RE]) {
    cleaned = reReplaceAll(pattern, "", cleaned);
  }
  cleaned = cleaned.replace(/\[REDACTED_\w+\]/g, "").replace(/\s+/g, " ").trim();

  if (!cleaned || cleaned.length < 8) return true;

  const hasTechnical =
    reTest(CODE_PATTERN, text) ||
    reTest(ERROR_PATTERN, text) ||
    reTest(FILENAME_PATTERN, text) ||
    reTest(STACK_TRACE_PATTERN, text);
  if (hasTechnical) return false;

  const redactedCount = (text.match(/\[REDACTED_\w+\]/g) ?? []).length;
  if (redactedCount / Math.max(1, text.split(/\s+/).length) > 0.3) return true;

  return isFillerClause(cleaned);
}

function splitByCommaSmart(text: string): string[] {
  const result: string[] = [];
  let current = "";
  let parenDepth = 0;

  for (const char of text) {
    if (char === "(") parenDepth += 1;
    else if (char === ")") parenDepth -= 1;
    else if (char === "," && parenDepth === 0) {
      if (current.trim()) result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) result.push(current.trim());
  return result.length > 0 ? result : [text];
}

function splitIntoClauses(text: string): string[] {
  const delimiters = /(?<=[.!?])\s+|\n+|(?<=\))\s+(?=[A-Z])|(?<=\])\s+(?=[A-Z])/;
  const parts = text.split(delimiters);
  const clauses: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length < 3) continue;
    if (trimmed.length > 150 && trimmed.includes(",")) {
      clauses.push(...splitByCommaSmart(trimmed));
    } else {
      clauses.push(trimmed);
    }
  }
  return clauses;
}

function maskPii(text: string): { text: string; tags: string[] } {
  const tags: string[] = [];

  const sub = (pattern: RegExp, label: string, source: string): string => {
    if (reTest(pattern, source)) tags.push(label);
    return reReplaceAll(pattern, `[REDACTED_${label}]`, source);
  };

  let output = text;
  output = sub(EMAIL_RE, "EMAIL", output);
  output = sub(PHONE_RE, "PHONE", output);
  output = sub(AGE_RE, "AGE", output);
  output = sub(NAME_RE, "PERSON", output);
  output = sub(LOCATION_RE, "LOCATION", output);
  output = sub(COMPANY_RE, "COMPANY", output);
  return { text: output, tags: [...new Set(tags)].sort() };
}

function prefilter(text: string): { text: string; piiTags: string[] } {
  let output = text.replace(NON_ASCII_RE, "");
  output = output.replace(REPEATED_WORD_RE, "$1");
  output = output.replace(/\s+/g, " ").trim();
  const masked = maskPii(output);
  return { text: masked.text, piiTags: masked.tags };
}

function computeSalience(clause: string, taskContext = ""): number {
  let score = 0;
  const textLower = clause.toLowerCase();

  if (reTest(QUESTION_PATTERN, clause)) score += 0.45;
  if (/\b(must|should|required|do not|don't|never|always|keep|preserve)\b/i.test(textLower)) {
    score += 0.35;
  }
  if (reTest(CODE_PATTERN, clause)) score += 0.3;
  if (reTest(FILENAME_PATTERN, clause)) score += 0.25;
  if (reTest(STACK_TRACE_PATTERN, clause)) score += 0.3;
  if (reTest(ERROR_PATTERN, clause)) score += 0.3;

  const techKeywords = [
    "function",
    "class",
    "method",
    "api",
    "endpoint",
    "route",
    "handler",
    "controller",
    "service",
    "model",
    "database",
    "query",
    "request",
    "response",
    "auth",
    "login",
    "error",
    "exception",
    "bug",
    "fix",
    "debug",
    "traceback",
    "import",
    "module",
    "package",
    "config",
    "settings",
    "env",
    "variable",
  ];
  for (const kw of techKeywords) {
    if (` ${textLower} `.includes(` ${kw} `) || textLower.startsWith(`${kw} `)) {
      score += 0.15;
      break;
    }
  }

  const actionVerbs = [
    "fix",
    "implement",
    "create",
    "add",
    "update",
    "remove",
    "refactor",
    "optimize",
    "test",
    "deploy",
    "build",
    "run",
  ];
  for (const verb of actionVerbs) {
    if (` ${textLower} `.includes(` ${verb} `)) {
      score += 0.1;
      break;
    }
  }

  if (taskContext && clause.length > 10) {
    try {
      score += computeSimilarity(clause, taskContext) * 0.2;
    } catch {
      /* ignore */
    }
  }

  const clauseLen = clause.split(/\s+/).length;
  if (clauseLen < 4) score -= 0.15;
  else if (clauseLen > 25) score -= 0.05;

  if (isPiiOnlyClause(clause)) score -= 0.25;
  if (isFillerClause(clause)) score -= 0.2;

  return Math.max(0, Math.min(1, score));
}

function applySvt(clauses: Clause[], threshold: number): Clause[] {
  return clauses.filter((c) => c.salience >= threshold);
}

function applyTopK(clauses: Clause[], ratio: number): Clause[] {
  if (clauses.length === 0) return [];
  const sorted = [...clauses].sort((a, b) => b.salience - a.salience);
  const k = Math.max(1, Math.floor(sorted.length * ratio));
  return sorted.slice(0, k);
}

function applyNoisyKnn(clauses: Clause[], threshold: number): Clause[] {
  if (clauses.length <= 1) return clauses;

  const sorted = [...clauses].sort((a, b) => b.salience - a.salience);
  const kept: Clause[] = [];
  const keptEmbeddings: number[][] = [];
  const vocab = buildVocab(sorted.map((c) => c.text));

  for (const clause of sorted) {
    const emb = encodeClause(clause.text, vocab);
    const isDuplicate = keptEmbeddings.some(
      (keptEmb) => cosineSimilarityVectors(emb, keptEmb) > threshold,
    );
    if (!isDuplicate) {
      kept.push(clause);
      keptEmbeddings.push(emb);
    }
  }
  return kept;
}

function algorithmCompress(
  text: string,
  level: CompressionLevel,
  taskContext = "",
): { sanitized: string; clauses: Clause[]; keptTexts: string[]; algorithm: string } {
  const config = LEVEL_CONFIG[level];
  const rawClauses = splitIntoClauses(text);

  const clauses: Clause[] = rawClauses.map((raw) => ({
    text: raw,
    salience: computeSalience(raw, taskContext),
    isPiiOnly: isPiiOnlyClause(raw),
    isFiller: isFillerClause(raw),
  }));

  const afterSvt = applySvt(clauses, config.svtThreshold);
  const afterTopK = applyTopK(afterSvt, config.topKRatio);
  let finalClauses = applyNoisyKnn(afterTopK, config.dedupThreshold);

  if (finalClauses.length === 0 && clauses.length > 0) {
    finalClauses = [clauses.reduce((best, c) => (c.salience > best.salience ? c : best))];
  }

  const keptTexts = finalClauses.map((c) => c.text);
  const algorithm = `SVT(${config.svtThreshold}) → Top-k(${(config.topKRatio * 100).toFixed(0)}%) → NoisyKNN(${config.dedupThreshold})`;

  return { sanitized: keptTexts.join(" "), clauses, keptTexts, algorithm };
}

function extractJsonObject(text: string): Record<string, unknown> {
  let body = text.trim();
  body = body.replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, "").trim();
  if (body.includes("```")) {
    body = body.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model output.");
  }
  return JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
}

async function llmCompress(text: string): Promise<{ sanitized: string; structured: Record<string, unknown> }> {
  const systemPrompt =
    "You are a privacy-aware context reducer. HIGH compression mode.\n\n" +
    "Your job: STRIP AWAY all unnecessary content, keeping ONLY:\n" +
    "1. The core request/question\n" +
    "2. Technical references (filenames, errors, function names)\n" +
    "3. Constraints or requirements\n\n" +
    "This is NOT summarization — do not rephrase.\n" +
    "Keep sentences verbatim, just remove whole sentences that are filler/PII-only.\n\n" +
    'Return JSON:\n' +
    '{"sanitized_prompt": "kept sentences joined", "removed_parts": [...], ' +
    '"important_symbols": [...], "active_files": [...], "errors": [...], ' +
    '"constraints": [...], "open_questions": [...]}';

  const llmOutput = await chat([
    { role: "system", content: systemPrompt },
    { role: "user", content: text },
  ]);

  try {
    const result = extractJsonObject(llmOutput);
    const sanitized = String(result.sanitized_prompt ?? "").trim();
    return { sanitized, structured: result };
  } catch {
    return { sanitized: text, structured: { sanitized_prompt: text, error: "LLM parsing failed" } };
  }
}

export async function simplifyContext(
  rawContext: string,
  compressionLevel: CompressionLevel = "medium",
  minPrecheckThreshold = 0.5,
  taskContext = "",
): Promise<Agent2Result> {
  const { text: preprocessed, piiTags } = prefilter(rawContext);
  const config = LEVEL_CONFIG[compressionLevel] ?? LEVEL_CONFIG.medium;

  const { sanitized: sanitizedAlgo, clauses, keptTexts, algorithm } = algorithmCompress(
    preprocessed,
    compressionLevel,
    taskContext,
  );

  let llmResult: Record<string, unknown> = {};
  let finalSanitized = sanitizedAlgo;

  if (config.useLlm && compressionLevel === "high") {
    const { sanitized, structured } = await llmCompress(sanitizedAlgo);
    llmResult = structured;
    finalSanitized = sanitized || sanitizedAlgo;
  }

  const similarity = finalSanitized ? computeSimilarity(rawContext, finalSanitized) : 0;
  const piiRemaining = containsPii(finalSanitized);
  const postCheckPassed = !piiRemaining && similarity >= minPrecheckThreshold;

  const compressed: Record<string, unknown> = {
    sanitized_prompt: finalSanitized,
    algorithm,
    compression_level: compressionLevel,
    removed_parts: clauses.filter((c) => !keptTexts.includes(c.text)).map((c) => c.text),
    kept_clauses: keptTexts,
    clause_count: clauses.length,
    kept_count: keptTexts.length,
    important_symbols: [],
    active_files: reMatchAll(FILENAME_PATTERN, finalSanitized),
    errors: reMatchAll(ERROR_PATTERN, finalSanitized),
    constraints: [],
    open_questions: [],
  };

  for (const key of [
    "important_symbols",
    "active_files",
    "errors",
    "constraints",
    "open_questions",
  ] as const) {
    const fromLlm = llmResult[key];
    if (Array.isArray(fromLlm) && fromLlm.length > 0) {
      compressed[key] = fromLlm;
    }
  }

  return {
    preprocessed,
    compressed,
    piiTags,
    precheckSimilarity: similarity,
    postCheckPassed,
    needsRetry: !postCheckPassed,
    sanitizedPrompt: finalSanitized,
    clauses,
    keptClauses: keptTexts,
    algorithm,
  };
}
