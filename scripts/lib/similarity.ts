// Lexical relevance ranking (BM25) between a vote's text and a legislator's
// candidate positions. Plain code, no AI calls: its job is to shortlist which
// position a vote should be judged against, so the AI judges the right pair
// instead of whichever position happens to be newest.

const STOPWORDS = new Set(
  (
    "the and for with that this from are was were has have had not but all any can will shall may must per " +
    "its their there which such than then these those into onto upon over under out off about also been being " +
    "relates relating provides providing requires requiring establishes establishing authorizes authorizing creates " +
    "creating amends amending act law laws new york state bill bills certain relation primary sponsor sponsored " +
    "introduced said say says would should could"
  ).split(" "),
);

function stem(t: string): string {
  if (t.length > 5 && t.endsWith("ies")) return `${t.slice(0, -3)}y`;
  if (t.length > 5 && t.endsWith("ing")) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith("ed")) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t))
    .map(stem);
}

export type RankedDoc<T> = { doc: T; score: number };

// Builds a BM25 index over `docs` (idf computed from this corpus), then ranks
// any subset of them against a query. Corpus = all of one legislator's positions.
export function buildRanker<T>(docs: T[], textOf: (d: T) => string) {
  const K1 = 1.2;
  const B = 0.75;
  const tokenized = new Map<T, { tf: Map<string, number>; len: number }>();
  const df = new Map<string, number>();
  let totalLen = 0;

  for (const d of docs) {
    const toks = tokenize(textOf(d));
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    tokenized.set(d, { tf, len: toks.length });
    totalLen += toks.length;
  }
  const N = docs.length;
  const avgLen = totalLen / Math.max(N, 1) || 1;
  const idf = (t: string) => Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));

  return function rank(query: string, candidates: T[]): RankedDoc<T>[] {
    const qTerms = [...new Set(tokenize(query))];
    return candidates
      .map((doc) => {
        const entry = tokenized.get(doc);
        let score = 0;
        if (entry) {
          for (const t of qTerms) {
            const f = entry.tf.get(t);
            if (!f) continue;
            score += idf(t) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * entry.len) / avgLen)));
          }
        }
        return { doc, score };
      })
      .sort((a, b) => b.score - a.score);
  };
}
