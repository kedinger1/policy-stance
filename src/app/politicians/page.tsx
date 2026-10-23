import Link from "next/link";
import { supabase, fetchAllRows } from "@/lib/supabase";
import { describeResult, summarizeMatches, type Classification, type ReviewStatus } from "@/lib/scoring";
import { TOPICS } from "@/lib/topics";
import { TopicPills } from "@/components/TopicPills";
import { Avatar } from "@/components/Avatar";

// Data only changes when a pipeline script is run manually, not on every visit —
// cache the render for an hour instead of re-querying on every request.
export const revalidate = 3600;

export default async function Home({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  const activeTopic = topic && (TOPICS as readonly string[]).includes(topic) ? topic : null;

  // Every query here is paginated via fetchAllRows to avoid PostgREST's silent
  // 1000-row cap on unfiltered/unpaginated selects — positions alone crossed
  // that line once bill-sponsorship data landed, and matches crossed it earlier.
  const positionRows = await fetchAllRows((from, to) =>
    supabase.from("positions").select("politician_id").range(from, to),
  );
  const researchedIds = [...new Set(positionRows.map((r) => r.politician_id))];

  const { data: politicians, error: pError } = await supabase
    .from("politicians")
    .select("id, full_name, chamber, state, district, photo_url")
    .in("id", researchedIds)
    .order("full_name");
  if (pError) throw pError;

  const { count: totalLegislators, error: totalError } = await supabase
    .from("politicians")
    .select("*", { count: "exact", head: true })
    .in("chamber", ["upper", "lower"]);
  if (totalError) throw totalError;

  const allPositions = await fetchAllRows((from, to) =>
    supabase.from("positions").select("politician_id, topic, source_type").in("politician_id", researchedIds).range(from, to),
  );

  const allMatches = await fetchAllRows<{ politician_id: string; position_id: string; classification: Classification; topic: string; status: ReviewStatus }>(
    (from, to) =>
      supabase.from("matches").select("politician_id, position_id, classification, topic, status").in("politician_id", researchedIds).range(from, to),
  );

  const rows = politicians.map((politician) => {
    const positions = allPositions.filter((p) => p.politician_id === politician.id);
    const matches = allMatches.filter((m) => m.politician_id === politician.id);

    // Statements (words) and sponsored bills (deeds) are counted apart: only statements are scored against votes.
    const inScope = activeTopic ? positions.filter((p) => p.topic === activeTopic) : positions;
    const statementCount = inScope.filter((p) => p.source_type !== "bill_sponsorship").length;
    const billCount = inScope.length - statementCount;
    const relevantMatches = activeTopic ? matches.filter((m) => m.topic === activeTopic) : matches;
    const summary = summarizeMatches(relevantMatches);

    return { politician, statementCount, billCount, summary };
  });

  // Filtered by topic, sort by evidence (scoreable match count), not raw % —
  // otherwise one lucky match at 100% would outrank a real track record.
  const sortedRows = activeTopic ? [...rows].sort((a, b) => b.summary.statementsTested - a.summary.statementsTested) : rows;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-1 font-mono text-xs uppercase tracking-wider text-teal-700 dark:text-teal-400">
        Explore — pilot review
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">Politicians</h1>
      <p className="mt-2 max-w-xl text-stone-600 dark:text-stone-400">
        Every position and vote-match below is AI-sourced (Codex CLI) and reviewable — click through to see the
        underlying statements, sources, and rationale behind each result.
      </p>

      <div className="mt-6">
        <TopicPills activeTopic={activeTopic} basePath="/politicians" />
      </div>

      <ul className="mt-8 divide-y divide-stone-200 dark:divide-stone-800">
        {sortedRows.map(({ politician, statementCount, billCount, summary }) => (
          <li key={politician.id}>
            <Link
              href={activeTopic ? `/politicians/${politician.id}?topic=${activeTopic}` : `/politicians/${politician.id}`}
              className="flex items-center justify-between gap-4 py-4 transition-colors hover:bg-stone-50 dark:hover:bg-stone-900"
            >
              <div className="flex items-center gap-3">
                <Avatar src={politician.photo_url} name={politician.full_name} />
                <div>
                  <div className="font-medium text-stone-900 dark:text-stone-50">{politician.full_name}</div>
                  <div className="font-mono text-xs text-stone-500 dark:text-stone-500">
                    {politician.state} · {politician.chamber}
                    {politician.district ? ` · District ${politician.district}` : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 font-mono text-xs text-stone-500 dark:text-stone-500">
                {activeTopic && statementCount + billCount === 0 ? (
                  <span className="italic text-stone-500">nothing tracked on this topic yet</span>
                ) : (
                  <>
                    <span>{`${statementCount} statement${statementCount === 1 ? "" : "s"} · ${billCount} bill${billCount === 1 ? "" : "s"}`}</span>
                    <span>{describeResult(summary)}</span>
                  </>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-10 border-t border-stone-200 pt-6 dark:border-stone-800">
        <p className="text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
          {`${politicians.length} of ${totalLegislators ?? "—"} legislators so far.`}
        </p>
        <p className="mt-1 text-sm text-stone-500">
          <Link href="/methodology" className="underline underline-offset-2 hover:text-stone-900 dark:hover:text-stone-50">
            See the methodology
          </Link>{" "}
          for what these numbers do and don&apos;t say.
        </p>
      </div>
    </div>
  );
}
