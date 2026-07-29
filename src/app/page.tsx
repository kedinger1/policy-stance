import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { summarizeMatches } from "@/lib/scoring";
import { TOPICS, formatTopicLabel } from "@/lib/topics";

export const revalidate = 0;

const PILL_BASE = "rounded-full border px-3 py-1 font-mono text-xs transition-colors";
const PILL_ACTIVE = "border-teal-700 bg-teal-700 text-white dark:border-teal-400 dark:bg-teal-400 dark:text-stone-950";
const PILL_INACTIVE =
  "border-stone-300 text-stone-600 hover:border-teal-700 hover:text-teal-700 dark:border-stone-700 dark:text-stone-400";

export default async function Home({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  const activeTopic = topic && (TOPICS as readonly string[]).includes(topic) ? topic : null;

  const { data: positionRows, error: posError } = await supabase.from("positions").select("politician_id");
  if (posError) throw posError;
  const researchedIds = [...new Set(positionRows.map((r) => r.politician_id))];

  const { data: politicians, error: pError } = await supabase
    .from("politicians")
    .select("id, full_name, chamber, state, district")
    .in("id", researchedIds)
    .order("full_name");
  if (pError) throw pError;

  const { data: allPositions, error: allPosError } = await supabase
    .from("positions")
    .select("politician_id, topic")
    .in("politician_id", researchedIds);
  if (allPosError) throw allPosError;

  const { data: allMatches, error: allMatchError } = await supabase
    .from("matches")
    .select("politician_id, classification, topic")
    .in("politician_id", researchedIds);
  if (allMatchError) throw allMatchError;

  const rows = politicians.map((politician) => {
    const positions = allPositions.filter((p) => p.politician_id === politician.id);
    const matches = allMatches.filter((m) => m.politician_id === politician.id);

    const positionCount = activeTopic ? positions.filter((p) => p.topic === activeTopic).length : positions.length;
    const relevantMatches = activeTopic ? matches.filter((m) => m.topic === activeTopic) : matches;
    const summary = summarizeMatches(relevantMatches);

    return { politician, positionCount, summary };
  });

  // Filtered by topic, sort by evidence (scoreable match count), not raw % —
  // otherwise one lucky match at 100% would outrank a real track record.
  const sortedRows = activeTopic ? [...rows].sort((a, b) => b.summary.scoreable - a.summary.scoreable) : rows;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-1 font-mono text-xs uppercase tracking-wider text-teal-700 dark:text-teal-400">
        policy-stance — pilot review
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">Politicians</h1>
      <p className="mt-2 max-w-xl text-stone-600 dark:text-stone-400">
        Every position and vote-match below is AI-sourced (Codex CLI) and reviewable — click through to see the
        underlying quotes, sources, and rationale behind each score.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/" className={`${PILL_BASE} ${activeTopic === null ? PILL_ACTIVE : PILL_INACTIVE}`}>
          All
        </Link>
        {TOPICS.map((t) => (
          <Link key={t} href={`/?topic=${t}`} className={`${PILL_BASE} ${activeTopic === t ? PILL_ACTIVE : PILL_INACTIVE}`}>
            {formatTopicLabel(t)}
          </Link>
        ))}
      </div>

      <ul className="mt-8 divide-y divide-stone-200 dark:divide-stone-800">
        {sortedRows.map(({ politician, positionCount, summary }) => (
          <li key={politician.id}>
            <Link
              href={`/politicians/${politician.id}`}
              className="flex items-center justify-between gap-4 py-4 transition-colors hover:bg-stone-50 dark:hover:bg-stone-900"
            >
              <div>
                <div className="font-medium text-stone-900 dark:text-stone-50">{politician.full_name}</div>
                <div className="font-mono text-xs text-stone-500 dark:text-stone-500">
                  {politician.state} · {politician.chamber}
                  {politician.district ? ` · District ${politician.district}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-4 font-mono text-xs text-stone-500 dark:text-stone-500">
                {activeTopic && positionCount === 0 ? (
                  <span className="italic text-stone-400 dark:text-stone-600">no tracked positions on this topic yet</span>
                ) : (
                  <>
                    <span>
                      {positionCount} position{positionCount === 1 ? "" : "s"}
                    </span>
                    <span>
                      {summary.consistency === null
                        ? "—"
                        : `${Math.round(summary.consistency * 100)}% consistent (n=${summary.scoreable})`}
                    </span>
                  </>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
