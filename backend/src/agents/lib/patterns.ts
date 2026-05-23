/** Shared regex patterns (ported from Hackathon agents/context_simplifier.py). */

export const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
export const PHONE_RE = /\+?[\d\s\-().]{7,15}/;
export const AGE_RE = /\b\d{1,3}\s*(years?\s*old|yo)\b/i;
export const COMPANY_RE = /\b(company|inc|corp|ltd|llc)\b/i;
export const LOCATION_RE = /\b(in|at|from)\s+[A-Z][a-zA-Z]+\b/;
export const NAME_RE = /\b(my name is|i am)\s+[A-Z][a-zA-Z]+\b/i;
export const REPEATED_WORD_RE = /\b(\w+)(\s+\1)+\b/i;
// Strip control chars and zero-width chars only — preserve Unicode (Vietnamese, CJK, etc.)
export const NON_ASCII_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g;

// === Vietnamese PII patterns ===
// Name introduction: "tôi tên là X", "tên tôi là X", "mình tên là X", "anh/chị/em X", "Y, sinh viên..."
export const NAME_VI_RE =
  /\b(t[ôo]i\s+t[êe]n\s+l[àa]|t[êe]n\s+t[ôo]i\s+l[àa]|m[ìi]nh\s+t[êe]n\s+l[àa]|t[ôo]i\s+l[àa]|m[ìi]nh\s+l[àa])\s+\p{Lu}[\p{L}\p{M}]+/iu;
// "Anh/Chị/Em/Bạn/Cô/Chú X" — common addressing form before a name
export const NAME_VI_TITLE_RE =
  /\b(anh|ch[ịi]|em|b[ạa]n|c[ôo]|ch[úu]|b[áa]c|d[ìi]|c[ậậ]u|m[ợợ])\s+\p{Lu}[\p{L}\p{M}]+/iu;
// Age in Vietnamese: "22 tuổi"
export const AGE_VI_RE = /\b\d{1,3}\s*tu[ổo]i\b/iu;
// Location prepositions in Vietnamese: "ở/tại/đến từ/từ <ProperNoun>"
// Captures up to 4 capitalized words to handle "TP.HCM", "Đại học Quốc gia Hà Nội", "Hồ Tây"
export const LOCATION_VI_RE =
  /\b(s[ốo]ng\s+(?:ở|t[ạa]i)|đ[ếe]n\s+t[ừu]|đang\s+(?:ở|s[ốo]ng)|ở|t[ạa]i|t[ừu])\s+(?:TP\.?\s*\p{Lu}\p{L}*|\p{Lu}[\p{L}\p{M}]+(?:\s+\p{Lu}[\p{L}\p{M}]+){0,3})/iu;
// Vietnamese phone: "(số điện thoại|sđt|đt|phone) ..." or 10-11 digits without separators
export const PHONE_VI_RE = /\b(?:s[ốo]\s*đi[ệe]n\s*tho[ạa]i|sđt|đt|phone)\b\s*[:\-]?\s*[\d\s\-.()]{7,15}/iu;

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
