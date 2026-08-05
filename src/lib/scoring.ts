export type Classification = "kept" | "broken" | "partial" | "na";
export type ReviewStatus =
  | "ai_matched"
  | "needs_review"
  | "human_confirmed"
  | "human_overridden"
  | "community_flagged"
  | "disputed";

// Only matches the AI (or a human) was actually confident about count toward the
// public score — a needs_review match is the AI's own admission of uncertainty,
// and treating it as "half consistent" would be presenting a guess as evidence.
const CONFIDENT_STATUSES: ReviewStatus[] = ["ai_matched", "human_confirmed", "human_overridden"];

export function summarizeMatches(matches: { classification: Classification; status: ReviewStatus }[]) {
  const confident = matches.filter((m) => CONFIDENT_STATUSES.includes(m.status));
  const counts = { kept: 0, broken: 0, partial: 0, na: 0 };
  for (const m of confident) counts[m.classification]++;
  const scoreable = counts.kept + counts.broken + counts.partial;
  const consistency = scoreable > 0 ? (counts.kept + 0.5 * counts.partial) / scoreable : null;
  const needsReview = matches.length - confident.length;
  return { ...counts, scoreable, consistency, needsReview };
}
