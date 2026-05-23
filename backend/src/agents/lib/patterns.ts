/** Shared regex patterns (ported from Hackathon agents/context_simplifier.py). */

export const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
export const PHONE_RE = /\+?[\d\s\-().]{7,15}/;
export const AGE_RE = /\b\d{1,3}\s*(years?\s*old|yo)\b/i;
export const COMPANY_RE = /\b(company|inc|corp|ltd|llc)\b/i;
export const LOCATION_RE = /\b(in|at|from)\s+[A-Z][a-zA-Z]+\b/;
export const NAME_RE = /\b(my name is|i am)\s+[A-Z][a-zA-Z]+\b/i;
export const REPEATED_WORD_RE = /\b(\w+)(\s+\1)+\b/i;
export const NON_ASCII_RE = /[^\x00-\x7F]+/;

export const CODE_PATTERN =
  /\b[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*\(.*?\)|\b[A-Z][a-zA-Z]*Error\b|\b\w+\.(py|js|ts|jsx|tsx)\b|\b(API|endpoint|handler|route|function|class|def|import|from)\b/i;

export const ERROR_PATTERN =
  /\b(error|exception|traceback|failed|crash|bug|fix|debug|TypeError|ValueError|KeyError|AttributeError|ImportError|RuntimeError)\b/i;

export const QUESTION_PATTERN =
  /\?|\b(can|could|would|will|is|are|does|do|how|what|why|where|when|who)\s+[a-z]+/i;

export const FILENAME_PATTERN =
  /\b\w+\.(py|js|ts|json|yaml|yml|toml|md|txt|csv|sql|html|css|scss|jsx|tsx)\b/i;

export const STACK_TRACE_PATTERN =
  /\b(File|at)\s+\S+[:,]\s*line\s*\d+|\b\w+Error:\s*.+|\btraceback\b|\bstack\b/i;

export function reTest(pattern: RegExp, text: string): boolean {
  return new RegExp(pattern.source, pattern.flags.includes("i") ? "i" : "").test(text);
}

export function reReplaceAll(pattern: RegExp, replacement: string, text: string): string {
  const flags = pattern.flags.includes("i") ? "gi" : "g";
  return text.replace(new RegExp(pattern.source, flags), replacement);
}

export function reMatchAll(pattern: RegExp, text: string): string[] {
  const flags = pattern.flags.includes("i") ? "gi" : "g";
  return [...text.matchAll(new RegExp(pattern.source, flags))].map((m) => m[0]);
}

export const FILLERS = new Set([
  "uh",
  "uhh",
  "umm",
  "hmm",
  "pls",
  "please",
  "just",
  "like",
  "okay",
  "ok",
  "so",
  "actually",
  "basically",
  "literally",
  "you know",
  "i mean",
  "kind of",
  "sort of",
]);
