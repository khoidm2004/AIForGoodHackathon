/** Lexical cosine similarity (lightweight stand-in for sentence-transformers in Hackathon). */

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/\b\w+\b/g) ?? [];
}

function termVector(tokens: string[]): Map<string, number> {
  const vec = new Map<string, number>();
  for (const t of tokens) {
    vec.set(t, (vec.get(t) ?? 0) + 1);
  }
  return vec;
}

function cosineFromMaps(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const val of a.values()) {
    normA += val * val;
  }
  for (const val of b.values()) {
    normB += val * val;
  }

  for (const [key, valA] of a) {
    const valB = b.get(key);
    if (valB !== undefined) {
      dot += valA * valB;
    }
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function computeSimilarity(text1: string, text2: string): number {
  return cosineFromMaps(termVector(tokenize(text1)), termVector(tokenize(text2)));
}

export function cosineSimilarityVectors(v1: number[], v2: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(v1.length, v2.length);
  for (let i = 0; i < len; i++) {
    dot += v1[i]! * v2[i]!;
    normA += v1[i]! * v1[i]!;
    normB += v2[i]! * v2[i]!;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Clause embedding for Noisy KNN dedup (term-frequency vector over shared vocab). */
export function encodeClause(text: string, vocab: string[]): number[] {
  const freq = termVector(tokenize(text));
  return vocab.map((word) => freq.get(word) ?? 0);
}

export function buildVocab(texts: string[]): string[] {
  const words = new Set<string>();
  for (const text of texts) {
    for (const t of tokenize(text)) {
      words.add(t);
    }
  }
  return [...words];
}
