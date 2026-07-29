import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { summarizeMatches, type Classification } from "@/lib/scoring";

export const revalidate = 0;

const CLASSIFICATION_STYLE: Record<Classification, string> = {
  kept: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  broken: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  na: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
};

export default async function PoliticianPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: politician, error: pError } = await supabase
    .from("politicians")
    .select("id, full_name, chamber, state, district")
    .eq("id", id)
    .maybeSingle();
  if (pError) throw pError;
  if (!politician) notFound();

  const { count: totalVotes, error: voteCountError } = await supabase
    .from("votes")
    .select("*", { count: "exact", head: true })
    .eq("politician_id", id);
  if (voteCountError) throw voteCountError;

  const { data: positions, error: posError } = await supabase
    .from("positions")
    .select("id, topic, statement_text, source_type, source_url, stated_at, extraction_confidence")
    .eq("politician_id", id)
    .order("stated_at", { ascending: false });
  if (posError) throw posError;

  const { data: matches, error: matchError } = await supabase
    .from("matches")
    .select("id, topic, classification, rationale, confidence, status, position_id, vote_id")
    .eq("politician_id", id)
    .order("confidence", { ascending: true });
  if (matchError) throw matchError;

  const voteIds = [...new Set(matches.map((m) => m.vote_id))];
  const { data: votes, error: votesFetchError } = await supabase
    .from("votes")
    .select("id, bill_title, vote_value, voted_at")
    .in("id", voteIds.length > 0 ? voteIds : ["00000000-0000-0000-0000-000000000000"]);
  if (votesFetchError) throw votesFetchError;

  const votesById = new Map(votes.map((v) => [v.id, v]));
  const positionsById = new Map(positions.map((p) => [p.id, p]));
  const summary = summarizeMatches(matches);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/" className="font-mono text-xs uppercase tracking-wider text-teal-700 hover:underline dark:text-teal-400">
        ← all politicians
      </Link>

      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">{politician.full_name}</h1>
      <div className="font-mono text-xs text-stone-500">
        {politician.state} · {politician.chamber}
        {politician.district ? ` · District ${politician.district}` : ""}
      </div>

      <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        These scores reflect votes that reached the floor. Legislative leadership (the Speaker, Majority Leader) largely
        controls which bills get a vote — a lack of activity on a topic may reflect leadership blocking it, not this
        member&apos;s own choice.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded border border-stone-200 bg-stone-200 sm:grid-cols-4 dark:border-stone-800 dark:bg-stone-800">
        <Stat label="Total votes" value={String(totalVotes ?? 0)} />
        <Stat label="Matched to a position" value={String(matches.length)} />
        <Stat label="Scoreable" value={String(summary.scoreable)} />
        <Stat
          label="Consistency"
          value={summary.consistency === null ? "n/a" : `${Math.round(summary.consistency * 100)}%`}
        />
      </div>
      <p className="mt-2 font-mono text-xs text-stone-500">
        {summary.kept} kept · {summary.broken} broken · {summary.partial} partial · {summary.na} na (not close enough
        to the same question to score)
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50">
          Positions <span className="font-mono text-sm font-normal text-stone-500">({positions.length})</span>
        </h2>
        <div className="mt-3 space-y-3">
          {positions.map((position) => (
            <article key={position.id} className="rounded border border-stone-200 p-4 dark:border-stone-800">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded bg-teal-50 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                  {position.topic}
                </span>
                <span className="font-mono text-xs text-stone-500">conf {position.extraction_confidence}</span>
              </div>
              <p className="mt-2 text-stone-800 dark:text-stone-200">&ldquo;{position.statement_text}&rdquo;</p>
              <div className="mt-2 flex flex-wrap gap-3 font-mono text-xs text-stone-500">
                <span className="font-semibold text-amber-700 dark:text-amber-500">{position.stated_at}</span>
                <span className="uppercase">{position.source_type}</span>
                <a href={position.source_url} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline hover:text-teal-900 dark:text-teal-400">
                  source ↗
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50">
          Vote matches <span className="font-mono text-sm font-normal text-stone-500">({matches.length})</span>
        </h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">Sorted lowest-confidence first — these are the judgment calls most worth double-checking.</p>
        <div className="mt-3 space-y-3">
          {matches.map((match) => {
            const vote = votesById.get(match.vote_id);
            const position = positionsById.get(match.position_id);
            return (
              <article key={match.id} className="rounded border border-stone-200 p-4 dark:border-stone-800">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide ${CLASSIFICATION_STYLE[match.classification as Classification]}`}>
                      {match.classification}
                    </span>
                    <span className="font-mono text-[11px] text-stone-500">{match.topic}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-xs text-stone-500">
                    <span>conf {match.confidence}</span>
                    {match.status === "needs_review" && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        needs review
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-stone-800 dark:text-stone-200">{match.rationale}</p>
                {vote && (
                  <div className="mt-2 rounded bg-stone-50 p-2 font-mono text-xs text-stone-600 dark:bg-stone-900 dark:text-stone-400">
                    Voted <span className="font-semibold">{vote.vote_value}</span> on &ldquo;{vote.bill_title}&rdquo; ({vote.voted_at})
                  </div>
                )}
                {position && (
                  <div className="mt-1 rounded bg-stone-50 p-2 font-mono text-xs text-stone-600 dark:bg-stone-900 dark:text-stone-400">
                    Compared against: &ldquo;{position.statement_text}&rdquo; ({position.stated_at})
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white p-3 dark:bg-stone-950">
      <div className="font-mono text-lg font-semibold tabular-nums text-stone-900 dark:text-stone-50">{value}</div>
      <div className="font-mono text-[11px] uppercase tracking-wide text-stone-500">{label}</div>
    </div>
  );
}
