import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { summarizeMatches, type Classification, type ReviewStatus } from "@/lib/scoring";
import { TOPICS, formatTopicLabel } from "@/lib/topics";
import { TopicPills } from "@/components/TopicPills";
import { Avatar } from "@/components/Avatar";

// Data only changes when a pipeline script is run manually, not on every visit —
// cache the render for an hour instead of re-querying on every request.
export const revalidate = 3600;

type Match = {
  id: string;
  topic: string;
  classification: Classification;
  rationale: string;
  confidence: number;
  status: ReviewStatus;
  position_id: string;
  vote_id: string;
};
type Position = {
  id: string;
  topic: string;
  statement_text: string;
  source_type: string;
  source_url: string | null;
  stated_at: string;
  extraction_confidence: number | null;
};

const CLASSIFICATION_STYLE: Record<Classification, string> = {
  kept: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  broken: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  na: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
};
const BAR_STYLE: Record<"kept" | "broken" | "partial", string> = {
  kept: "bg-emerald-400 dark:bg-emerald-500",
  broken: "bg-red-400 dark:bg-red-500",
  partial: "bg-amber-400 dark:bg-amber-500",
};

// A topic's best kept and (if any) best broken match — the pairing that turns a
// bare percentage into an actual example of what was said versus what happened.
function pickExamples(matches: Match[]) {
  const confident = matches.filter((m) => m.status !== "needs_review");
  const best = (classification: Classification) =>
    confident.filter((m) => m.classification === classification).sort((a, b) => b.confidence - a.confidence)[0];
  return [best("kept"), best("broken")].filter((m): m is Match => Boolean(m));
}

export default async function PoliticianPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ topic?: string }>;
}) {
  const { id } = await params;
  const { topic } = await searchParams;
  const activeTopic = topic && (TOPICS as readonly string[]).includes(topic) ? topic : null;

  const { data: politician, error: pError } = await supabase
    .from("politicians")
    .select("id, full_name, chamber, state, district, photo_url")
    .eq("id", id)
    .maybeSingle();
  if (pError) throw pError;
  if (!politician) notFound();

  const { count: totalVotes, error: voteCountError } = await supabase
    .from("votes")
    .select("*", { count: "exact", head: true })
    .eq("politician_id", id);
  if (voteCountError) throw voteCountError;

  const { data: allPositions, error: posError } = await supabase
    .from("positions")
    .select("id, topic, statement_text, source_type, source_url, stated_at, extraction_confidence")
    .eq("politician_id", id)
    .order("stated_at", { ascending: false });
  if (posError) throw posError;

  const { data: allMatches, error: matchError } = await supabase
    .from("matches")
    .select("id, topic, classification, rationale, confidence, status, position_id, vote_id")
    .eq("politician_id", id)
    .order("confidence", { ascending: true });
  if (matchError) throw matchError;

  const voteIds = [...new Set(allMatches.map((m) => m.vote_id))];
  const { data: votes, error: votesFetchError } = await supabase
    .from("votes")
    .select("id, bill_title, vote_value, voted_at")
    .in("id", voteIds.length > 0 ? voteIds : ["00000000-0000-0000-0000-000000000000"]);
  if (votesFetchError) throw votesFetchError;

  const votesById = new Map(votes.map((v) => [v.id, v]));
  const positionsById = new Map<string, Position>(allPositions.map((p) => [p.id, p]));

  const positions = activeTopic ? allPositions.filter((p) => p.topic === activeTopic) : allPositions;
  const matches = activeTopic ? allMatches.filter((m) => m.topic === activeTopic) : allMatches;
  const summary = summarizeMatches(matches);

  // The topic breakdown always covers every topic, regardless of the pill filter —
  // that filter narrows the record below, not the fingerprint of where she stands.
  const topicStats = (TOPICS as readonly string[])
    .map((t) => ({
      topic: t,
      label: formatTopicLabel(t),
      positionCount: allPositions.filter((p) => p.topic === t).length,
      summary: summarizeMatches(allMatches.filter((m) => m.topic === t)),
    }))
    .sort((a, b) => b.summary.scoreable - a.summary.scoreable);

  const featuredTopics = activeTopic
    ? topicStats.filter((t) => t.topic === activeTopic)
    : topicStats.slice(0, 3);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/" className="font-mono text-xs uppercase tracking-wider text-teal-700 hover:underline dark:text-teal-400">
        ← all politicians
      </Link>

      <div className="mt-2 flex items-center gap-4">
        <Avatar src={politician.photo_url} name={politician.full_name} size={64} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">{politician.full_name}</h1>
          <div className="font-mono text-xs text-stone-500">
            {politician.state} · {politician.chamber}
            {politician.district ? ` · District ${politician.district}` : ""}
          </div>
        </div>
      </div>

      <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        These scores reflect votes that reached the floor. Legislative leadership (the Speaker, Majority Leader) largely
        controls which bills get a vote — a lack of activity on a topic may reflect leadership blocking it, not this
        member&apos;s own choice.
      </p>

      <div className="mt-6">
        <TopicPills activeTopic={activeTopic} basePath={`/politicians/${id}`} />
      </div>
      {activeTopic && (
        <p className="mt-2 font-mono text-xs text-stone-500">
          {`Showing: ${formatTopicLabel(activeTopic)} only — total votes below is still this member's overall count.`}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded border border-stone-200 bg-stone-200 sm:grid-cols-3 dark:border-stone-800 dark:bg-stone-800">
        <Stat label="Total votes" value={String(totalVotes ?? 0)} />
        <Stat label="Matched to a position" value={String(matches.length)} />
        <Stat
          label="Consistency"
          value={summary.consistency === null ? "n/a" : `${Math.round(summary.consistency * 100)}% (n=${summary.scoreable})`}
        />
      </div>
      <p className="mt-2 font-mono text-xs text-stone-500">
        {summary.kept} kept · {summary.broken} broken · {summary.partial} partial · {summary.na} na (not close enough
        to the same question to score)
        {summary.needsReview > 0 && ` · ${summary.needsReview} awaiting review (not counted above)`}
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50">By topic</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {topicStats.map((t) => (
            <Link
              key={t.topic}
              href={t.topic === activeTopic ? `/politicians/${id}` : `/politicians/${id}?topic=${t.topic}`}
              className={`rounded border p-3 transition-colors hover:border-stone-400 dark:hover:border-stone-600 ${
                t.topic === activeTopic ? "border-teal-600 dark:border-teal-500" : "border-stone-200 dark:border-stone-800"
              } ${t.summary.scoreable === 0 ? "opacity-60" : ""}`}
            >
              <div className="text-sm font-medium text-stone-800 dark:text-stone-200">{t.label}</div>
              {t.summary.scoreable > 0 ? (
                <>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-mono text-xl font-semibold tabular-nums text-stone-900 dark:text-stone-50">
                      {Math.round((t.summary.consistency ?? 0) * 100)}%
                    </span>
                    <span className="font-mono text-xs text-stone-500">n={t.summary.scoreable}</span>
                  </div>
                  <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
                    <span className={BAR_STYLE.kept} style={{ width: `${(t.summary.kept / t.summary.scoreable) * 100}%` }} />
                    <span className={BAR_STYLE.broken} style={{ width: `${(t.summary.broken / t.summary.scoreable) * 100}%` }} />
                    <span className={BAR_STYLE.partial} style={{ width: `${(t.summary.partial / t.summary.scoreable) * 100}%` }} />
                  </div>
                </>
              ) : (
                <div className="mt-1 text-xs text-stone-500">
                  {t.positionCount === 0 ? "no stated position yet" : "no vote has clearly tested this yet"}
                </div>
              )}
              {t.summary.needsReview > 0 && (
                <div className="mt-1 font-mono text-[11px] text-stone-400 dark:text-stone-500">
                  {t.summary.needsReview} awaiting review
                </div>
              )}
            </Link>
          ))}
        </div>
      </section>

      {featuredTopics.some((t) => pickExamples(allMatches.filter((m) => m.topic === t.topic)).length > 0) && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50">The story behind the numbers</h2>
          <div className="mt-3 space-y-3">
            {featuredTopics.map((t) => {
              const examples = pickExamples(allMatches.filter((m) => m.topic === t.topic));
              if (examples.length === 0) return null;
              const position = positionsById.get(examples[0].position_id);
              return (
                <article key={t.topic} className="rounded border border-stone-200 p-4 dark:border-stone-800">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded bg-teal-50 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                      {t.label}
                    </span>
                    <span className="font-mono text-xs text-stone-500">stated {position?.stated_at}</span>
                  </div>
                  {position && <p className="mt-2 text-stone-800 dark:text-stone-200">&ldquo;{position.statement_text}&rdquo;</p>}
                  {t.summary.needsReview > 0 && (
                    <p className="mt-2 rounded bg-stone-50 p-2 text-xs text-stone-600 dark:bg-stone-900 dark:text-stone-400">
                      {t.summary.needsReview === 1
                        ? "1 more vote on this topic is still awaiting review and isn't counted in the score above."
                        : `${t.summary.needsReview} more votes on this topic are still awaiting review and aren't counted in the score above.`}
                    </p>
                  )}
                  {examples.map((match) => {
                    const vote = votesById.get(match.vote_id);
                    if (!vote) return null;
                    return (
                      <div key={match.id} className="mt-2 flex items-start gap-3 border-t border-stone-100 pt-2 dark:border-stone-800">
                        <span className={`mt-0.5 shrink-0 rounded px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide ${CLASSIFICATION_STYLE[match.classification]}`}>
                          {match.classification}
                        </span>
                        <div className="text-sm text-stone-800 dark:text-stone-200">
                          Voted <span className="font-medium">{vote.vote_value}</span> on &ldquo;{vote.bill_title}&rdquo;{" "}
                          <span className="font-mono text-xs text-stone-500">({vote.voted_at})</span>
                        </div>
                      </div>
                    );
                  })}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <details className="mt-10 rounded border border-stone-200 dark:border-stone-800">
        <summary className="cursor-pointer p-4 font-mono text-xs uppercase tracking-wider text-stone-500">
          Full record — {positions.length} position{positions.length === 1 ? "" : "s"}, {matches.length} matched vote
          {matches.length === 1 ? "" : "s"}
        </summary>

        <section className="border-t border-stone-200 p-4 dark:border-stone-800">
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
                  <span className="font-mono text-xs text-stone-500">sourcing confidence {position.extraction_confidence}</span>
                </div>
                <p className="mt-2 text-stone-800 dark:text-stone-200">&ldquo;{position.statement_text}&rdquo;</p>
                <div className="mt-2 flex flex-wrap gap-3 font-mono text-xs text-stone-500">
                  <span className="font-semibold text-amber-700 dark:text-amber-500">{position.stated_at}</span>
                  <span className="uppercase">{position.source_type}</span>
                  <a href={position.source_url ?? undefined} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline hover:text-teal-900 dark:text-teal-400">
                    source ↗
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-stone-200 p-4 dark:border-stone-800">
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
                      <span>match confidence {match.confidence}</span>
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
      </details>
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
