export type Classification = "kept" | "broken" | "partial" | "na";
export type ReviewStatus =
  | "ai_matched"
  | "needs_review"
  | "human_confirmed"
  | "human_overridden"
  | "community_flagged"
  | "disputed";

// Only matches the AI (or a human) was actually confident about count toward the
// public score. needs_review covers both low-confidence guesses and every "broken"
// verdict, which waits for a person to confirm it before it can count.
const CONFIDENT_STATUSES: ReviewStatus[] = ["ai_matched", "human_confirmed", "human_overridden"];

type MatchLike = { position_id: string; classification: Classification; status: ReviewStatus };

// The unit of evidence is the statement, not the vote. One press release can be tested
// by dozens of votes (a whole budget week, a run of local tax authorizations), and
// counting each vote separately would let a single statement dominate a score. So each
// statement is scored by the votes that test it, and statements count equally.
// Results are shown as counts, never a percentage: with a handful of tested statements a
// percentage reads like a grade and overstates what the data can support.
export function describeResult(s: { statementsTested: number; upheld: number; mixed: number; contradicted: number }) {
  if (s.statementsTested === 0) return "none tested yet";
  const parts = [`${s.statementsTested} tested`, `${s.upheld} upheld`];
  if (s.mixed > 0) parts.push(`${s.mixed} mixed`);
  if (s.contradicted > 0) parts.push(`${s.contradicted} contradicted`);
  return parts.join(" · ");
}

export function summarizeMatches(matches: MatchLike[]) {
  const confident = matches.filter((m) => CONFIDENT_STATUSES.includes(m.status));

  const voteCounts = { kept: 0, broken: 0, partial: 0, na: 0 };
  const perStatement = new Map<string, { kept: number; broken: number; partial: number }>();
  for (const m of confident) {
    voteCounts[m.classification]++;
    if (m.classification === "na") continue;
    const e = perStatement.get(m.position_id) ?? { kept: 0, broken: 0, partial: 0 };
    e[m.classification]++;
    perStatement.set(m.position_id, e);
  }

  let upheld = 0;
  let contradicted = 0;
  let mixed = 0;
  let votes = 0;
  let scoreSum = 0;
  for (const e of perStatement.values()) {
    const n = e.kept + e.broken + e.partial;
    votes += n;
    scoreSum += (e.kept + 0.5 * e.partial) / n;
    if (e.broken === 0 && e.partial === 0) upheld++;
    else if (e.kept === 0 && e.partial === 0) contradicted++;
    else mixed++;
  }

  const statementsTested = perStatement.size;
  return {
    ...voteCounts,
    votes, // scoreable votes behind the statements
    statementsTested,
    upheld,
    mixed,
    contradicted,
    consistency: statementsTested > 0 ? scoreSum / statementsTested : null,
    needsReview: matches.length - confident.length,
  };
}
