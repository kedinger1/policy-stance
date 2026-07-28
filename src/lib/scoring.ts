export type Classification = "kept" | "broken" | "partial" | "na";

export function summarizeMatches(matches: { classification: Classification }[]) {
  const counts = { kept: 0, broken: 0, partial: 0, na: 0 };
  for (const m of matches) counts[m.classification]++;
  const scoreable = counts.kept + counts.broken + counts.partial;
  const consistency = scoreable > 0 ? (counts.kept + 0.5 * counts.partial) / scoreable : null;
  return { ...counts, scoreable, consistency };
}
