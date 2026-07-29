import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { summarizeMatches } from "@/lib/scoring";

export const revalidate = 0;

export default async function Home() {
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
    .select("politician_id")
    .in("politician_id", researchedIds);
  if (allPosError) throw allPosError;

  const { data: allMatches, error: allMatchError } = await supabase
    .from("matches")
    .select("politician_id, classification")
    .in("politician_id", researchedIds);
  if (allMatchError) throw allMatchError;

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

      <ul className="mt-8 divide-y divide-stone-200 dark:divide-stone-800">
        {politicians.map((politician) => {
          const positionCount = allPositions.filter((p) => p.politician_id === politician.id).length;
          const matches = allMatches.filter((m) => m.politician_id === politician.id);
          const summary = summarizeMatches(matches);

          return (
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
                  <span>{positionCount} positions</span>
                  <span>
                    {summary.consistency === null
                      ? "—"
                      : `${Math.round(summary.consistency * 100)}% consistent (n=${summary.scoreable})`}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
