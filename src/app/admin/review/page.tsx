import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { adminClient, isAdmin } from "@/lib/admin";
import { fetchAllRows, fetchRowsForIds } from "@/lib/supabase";
import { formatTopicLabel } from "@/lib/topics";
import { logout } from "@/app/login/actions";
import { AdminTabs } from "../AdminTabs";
import { resolveMatches } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review", robots: { index: false, follow: false } };

export default async function ReviewPage() {
  if (!(await isAdmin())) redirect("/login");
  const db = adminClient();

  const flagged = await fetchAllRows((from, to) =>
    db
      .from("matches")
      .select("id, politician_id, position_id, vote_id, topic, rationale, confidence")
      .eq("status", "needs_review")
      .eq("classification", "broken")
      .range(from, to),
  );

  const positions = await fetchRowsForIds([...new Set(flagged.map((m) => m.position_id))], (chunk) =>
    db.from("positions").select("id, politician_id, statement_text, stated_at, source_url").in("id", chunk),
  );
  const votes = await fetchRowsForIds([...new Set(flagged.map((m) => m.vote_id))], (chunk) =>
    db.from("votes").select("id, bill_title, vote_value, voted_at").in("id", chunk),
  );
  const { data: politicians } = await db
    .from("politicians")
    .select("id, full_name")
    .in("id", [...new Set(flagged.map((m) => m.politician_id))]);

  const positionById = new Map(positions.map((p) => [p.id, p]));
  const voteById = new Map(votes.map((v) => [v.id, v]));
  const nameById = new Map((politicians ?? []).map((p) => [p.id, p.full_name]));

  const groups = [...new Set(flagged.map((m) => m.position_id))]
    .map((positionId) => ({
      position: positionById.get(positionId),
      matches: flagged.filter((m) => m.position_id === positionId),
    }))
    .sort((a, b) => (nameById.get(a.matches[0].politician_id) ?? "").localeCompare(nameById.get(b.matches[0].politician_id) ?? ""));

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center justify-between gap-4">
        <div className="font-mono text-xs uppercase tracking-wider text-teal-700 dark:text-teal-400">Reviewer tool</div>
        <form action={logout}>
          <button type="submit" className="font-mono text-xs text-stone-500 underline underline-offset-2 hover:text-stone-900 dark:hover:text-stone-50">
            Log out
          </button>
        </form>
      </div>
      <h1 className="mt-2 mb-4 text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">Possible contradictions</h1>
      <AdminTabs />
      <p className="mt-3 max-w-xl text-stone-600 dark:text-stone-400">
        {`${flagged.length} flagged vote${flagged.length === 1 ? "" : "s"} across ${groups.length} statement${groups.length === 1 ? "" : "s"}. `}
        Read the source, then decide. Confirming makes a contradiction count toward the result. &ldquo;Not a contradiction&rdquo;
        removes it. The test is whether the vote does the opposite of something the statement explicitly called for or opposed,
        on the same specific question.
      </p>

      {groups.length === 0 && (
        <p className="mt-10 rounded border border-stone-200 p-6 text-stone-600 dark:border-stone-800 dark:text-stone-400">
          Nothing waiting for review.
        </p>
      )}

      <div className="mt-10 space-y-8">
        {groups.map(({ position, matches }) => {
          const ids = matches.map((m) => m.id);
          return (
            <section key={position?.id ?? matches[0].id} className="rounded border border-stone-200 dark:border-stone-800">
              <div className="border-b border-stone-200 p-4 dark:border-stone-800">
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-stone-500">
                  <span className="font-semibold text-stone-900 dark:text-stone-50">{nameById.get(matches[0].politician_id)}</span>
                  <span>{formatTopicLabel(matches[0].topic)}</span>
                  <span>{position?.stated_at}</span>
                  {position?.source_url && (
                    <a href={position.source_url} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline dark:text-teal-400">
                      source ↗
                    </a>
                  )}
                </div>
                <p className="mt-2 text-stone-800 dark:text-stone-200">{position?.statement_text}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ReviewButton ids={ids} decision="confirm" label={`Confirm all ${ids.length}`} tone="danger" />
                  <ReviewButton ids={ids} decision="override" label={`Not a contradiction (all ${ids.length})`} />
                </div>
              </div>

              <ul className="divide-y divide-stone-200 dark:divide-stone-800">
                {matches.map((m) => {
                  const v = voteById.get(m.vote_id);
                  return (
                    <li key={m.id} className="p-4">
                      <p className="text-sm text-stone-800 dark:text-stone-200">
                        {`Voted ${v?.vote_value} on “${v?.bill_title}” (${v?.voted_at})`}
                      </p>
                      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                        {`AI reasoning (confidence ${m.confidence}): ${m.rationale}`}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <ReviewButton ids={[m.id]} decision="confirm" label="Confirm" tone="danger" />
                        <ReviewButton ids={[m.id]} decision="override" label="Not a contradiction" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ReviewButton({ ids, decision, label, tone }: { ids: string[]; decision: "confirm" | "override"; label: string; tone?: "danger" }) {
  return (
    <form action={resolveMatches}>
      <input type="hidden" name="ids" value={ids.join(",")} />
      <input type="hidden" name="decision" value={decision} />
      <button
        type="submit"
        className={`rounded border px-3 py-1.5 font-mono text-xs transition-colors ${
          tone === "danger"
            ? "border-red-300 text-red-800 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
            : "border-stone-300 text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900"
        }`}
      >
        {label}
      </button>
    </form>
  );
}
