/**
 * Pure text helpers (no I/O) so they are easy to unit test:
 *  - chunkText: paragraph-aware chunking with overlap
 *  - hashEmbedding: deterministic offline embedding used when no OpenAI key is set
 *  - toOrTsQuery: turns a natural-language question into an OR full-text query
 */

const STOPWORDS = new Set(
  ('a an and are as at be but by can do does for from has have how i if in is it its ' +
    'me my of on or our so than that the their them then there these they this to us ' +
    'was we what when where which who why will with you your').split(' '),
);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t) => t.length > 1 && !STOPWORDS.has(t),
  );
}

/**
 * Splits text into ~`size`-character chunks on paragraph/sentence boundaries,
 * carrying `overlap` characters of context into the next chunk.
 */
export function chunkText(text: string, size = 900, overlap = 150): string[] {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];

  // Paragraphs first; split oversized paragraphs into sentences, then hard-wrap.
  const pieces: string[] = [];
  for (const para of clean.split(/\n\s*\n/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length <= size) {
      pieces.push(p);
      continue;
    }
    for (const sentence of p.split(/(?<=[.!?])\s+/)) {
      for (let i = 0; i < sentence.length; i += size) pieces.push(sentence.slice(i, i + size));
    }
  }

  const chunks: string[] = [];
  let current = '';
  for (const piece of pieces) {
    if (current && current.length + piece.length + 2 > size) {
      chunks.push(current);
      const tail = current.slice(Math.max(0, current.length - overlap));
      // Start the overlap at a word boundary.
      const cut = tail.indexOf(' ');
      current = (cut >= 0 ? tail.slice(cut + 1) : tail) + '\n\n' + piece;
    } else {
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Feature-hashing embedding (unigrams + bigrams), L2-normalised.
 * Not semantic like a real model, but deterministic and good enough to run
 * the full pipeline offline and in tests.
 */
export function hashEmbedding(text: string, dims = 1536): number[] {
  const vec = new Array<number>(dims).fill(0);
  const tokens = tokenize(text);
  const features = [...tokens, ...tokens.slice(1).map((t, i) => `${tokens[i]}_${t}`)];
  for (const f of features) {
    const h = fnv1a(f);
    vec[h % dims] += (h & 0x80000000) === 0 ? 1 : -1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

/** "What is the refund policy?" -> "refund | policy" (safe for to_tsquery). */
export function toOrTsQuery(question: string): string {
  return [...new Set(tokenize(question))].slice(0, 16).join(' | ');
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** Reciprocal Rank Fusion over several ranked id lists (k=60 as in the original paper). */
export function rrf(lists: string[][], k = 60): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, idx) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + idx + 1)));
  }
  return scores;
}
