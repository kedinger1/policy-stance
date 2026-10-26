import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { adminClient, isAdmin } from "@/lib/admin";
import { formatTopicLabel } from "@/lib/topics";
import { logout } from "@/app/login/actions";
import { AdminTabs } from "../AdminTabs";
import { clearLabel, labelPair } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Accuracy sample", robots: { index: false, follow: false } };

type Pair = {
  id: string;
  sample_kind: "close" | "ai_kept" | "ai_na";
  politician_name: string;
  topic: string;
  statement_text: string;
  statement_source_url: string | null;
  stated_at: string;
  bill_title: string;
  vote_value: string;
  voted_at: string;
  ai_classification: string;
  ai_confidence: number | null;
  ai_rationale: string;
  human_label: "contradiction" | "match" | "not_testable" | "unsure" | null;
  human_note: string | null;
};

const OPTIONS = [
  { value: "match", text: "Clear match", hint: "The vote clearly fits what the statement said." },
  {
    value: "contradiction",
    text: "Clear contradiction",
    hint: "The vote does the opposite of something the statement explicitly called for or opposed, on the same specific question.",
  },
  { value: "not_testable", text: "Not a clean test", hint: "A different or more specific question, or too loosely related to judge." },
  { value: "unsure", text: "Unsure", hint: "You can't tell from this much information. Excluded from the results." },
] as const;

const HUMAN_TEXT: Record<string, string> = { match: "Clear match", contradiction: "Clear contradiction", not_testable: "Not a clean test", unsure: "Unsure" };
const AI_TEXT: Record<string, string> = { kept: "kept", partial: "partial", broken: "broken", na: "not a clean test" };
// What the AI's verdict means in the human's vocabulary, so the two can be compared.
const EQUIVALENT: Record<string, string> = { kept: "match", broken: "contradiction", na: "not_testable" };

export default async function LabelPage({ searchParams }: { searchParams: Promise<{ results?: string }> }) {
  if (!(await isAdmin())) redirect("/login");
  const { results } = await searchParams;

  const { data, error } = await adminClient().from("validation_pairs").select("*").order("ord");
  const missingTable = Boolean(error && /validation_pairs/.test(error.message));
  const pairs = (data ?? []) as Pair[];
  const labeled = pairs.filter((p) => p.human_label);
  const next = pairs.find((p) => !p.human_label);
  const showResults = results === "1" || (pairs.length > 0 && !next);

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
      <h1 className="mt-2 mb-4 text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">Accuracy sample</h1>
      <AdminTabs />

      {error ? (
        <p className="rounded border border-stone-200 p-4 text-stone-600 dark:border-stone-800 dark:text-stone-400">
          {missingTable
            ? "The sample table doesn't exist yet. Run migration 0008 in Supabase, then build the sample."
            : `Couldn't load the sample: ${error.message}`}
        </p>
      ) : pairs.length === 0 ? (
        <p className="rounded border border-stone-200 p-4 text-stone-600 dark:border-stone-800 dark:text-stone-400">
          No sample yet. Build one with <span className="font-mono text-sm">npx tsx scripts/build-validation-set.ts</span>.
        </p>
      ) : showResults ? (
        <Results pairs={pairs} labeledCount={labeled.length} />
      ) : (
        next && <LabelCard pair={next} done={labeled.length} total={pairs.length} />
      )}
    </div>
  );
}

function LabelCard({ pair, done, total }: { pair: Pair; done: number; total: number }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 font-mono text-xs text-stone-500">
        <span>{`${done} of ${total} labeled`}</span>
        {done > 0 && (
          <Link href="/admin/label?results=1" className="underline underline-offset-2 hover:text-stone-900 dark:hover:text-stone-50">
            See results so far
          </Link>
        )}
      </div>
      <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
        Judge this the way the AI was told to: by what the two say, not by what you know about the politician. You can&apos;t see
        the AI&apos;s answer until you&apos;ve labeled everything.
      </p>

      <div className="mt-5 rounded border border-stone-200 dark:border-stone-800">
        <div className="border-b border-stone-200 p-4 dark:border-stone-800">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-stone-500">
            <span className="font-semibold text-stone-900 dark:text-stone-50">{pair.politician_name}</span>
            <span>{formatTopicLabel(pair.topic)}</span>
            <span>{`stated ${pair.stated_at}`}</span>
            {pair.statement_source_url && (
              <a href={pair.statement_source_url} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline dark:text-teal-400">
                source ↗
              </a>
            )}
          </div>
          <div className="mt-3 font-mono text-[11px] uppercase tracking-wider text-stone-500">Said (AI summary of the source)</div>
          <p className="mt-1 text-stone-800 dark:text-stone-200">{pair.statement_text}</p>
        </div>
        <div className="p-4">
          <div className="font-mono text-[11px] uppercase tracking-wider text-stone-500">Voted</div>
          <p className="mt-1 text-stone-800 dark:text-stone-200">
            {`${pair.vote_value.toUpperCase()} on “${pair.bill_title}” (${pair.voted_at})`}
          </p>
          <p className="mt-1 text-xs text-stone-500">Only the bill&apos;s title is shown; the AI saw only the title too.</p>
        </div>
      </div>

      <form action={labelPair} className="mt-5">
        <input type="hidden" name="id" value={pair.id} />
        <label htmlFor="note" className="font-mono text-xs uppercase tracking-wider text-stone-500">
          Note (optional)
        </label>
        <textarea
          id="note"
          name="note"
          rows={2}
          maxLength={500}
          className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-50"
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="submit"
              name="label"
              value={o.value}
              className="rounded border border-stone-300 p-3 text-left transition-colors hover:border-teal-700 hover:bg-stone-50 dark:border-stone-700 dark:hover:border-teal-400 dark:hover:bg-stone-900"
            >
              <span className="block text-sm font-semibold text-stone-900 dark:text-stone-50">{o.text}</span>
              <span className="mt-0.5 block text-xs text-stone-600 dark:text-stone-400">{o.hint}</span>
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}

function Results({ pairs, labeledCount }: { pairs: Pair[]; labeledCount: number }) {
  const decided = pairs.filter((p) => p.human_label && p.human_label !== "unsure");
  const comparable = decided.filter((p) => p.ai_classification !== "partial");
  const agreed = comparable.filter((p) => EQUIVALENT[p.ai_classification] === p.human_label);
  const disagreed = comparable.filter((p) => EQUIVALENT[p.ai_classification] !== p.human_label);

  const missedTests = decided.filter((p) => p.ai_classification === "na" && (p.human_label === "match" || p.human_label === "contradiction"));
  const overCredited = decided.filter((p) => p.ai_classification === "kept" && (p.human_label === "not_testable" || p.human_label === "contradiction"));
  const humanContradictions = decided.filter((p) => p.human_label === "contradiction");
  const caught = humanContradictions.filter((p) => p.ai_classification === "broken");

  const cell = (human: string, ai: string) => decided.filter((p) => p.human_label === human && p.ai_classification === ai).length;
  const unsure = pairs.filter((p) => p.human_label === "unsure").length;
  const unlabeled = pairs.length - labeledCount;

  return (
    <div>
      {unlabeled > 0 && (
        <p className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {`Partial results: ${unlabeled} pair${unlabeled === 1 ? "" : "s"} still unlabeled. `}
          <Link href="/admin/label" className="underline underline-offset-2">
            Keep labeling
          </Link>
        </p>
      )}

      <p className="text-stone-700 dark:text-stone-300">
        {comparable.length === 0
          ? "Nothing to compare yet."
          : `You and the AI agreed on ${agreed.length} of ${comparable.length} comparable pairs.`}
        {unsure > 0 && ` ${unsure} marked unsure are left out.`}
      </p>

      <div className="mt-5 overflow-x-auto rounded border border-stone-200 dark:border-stone-800">
        <table className="w-full text-left text-sm">
          <thead className="font-mono text-[11px] uppercase tracking-wide text-stone-500">
            <tr className="border-b border-stone-200 dark:border-stone-800">
              <th className="p-3 font-normal">You said ↓ / AI said →</th>
              {["kept", "partial", "broken", "na"].map((ai) => (
                <th key={ai} className="p-3 text-right font-normal">
                  {AI_TEXT[ai]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
            {["match", "contradiction", "not_testable"].map((h) => (
              <tr key={h}>
                <td className="p-3 text-stone-800 dark:text-stone-200">{HUMAN_TEXT[h]}</td>
                {["kept", "partial", "broken", "na"].map((ai) => (
                  <td
                    key={ai}
                    className={`p-3 text-right font-mono tabular-nums ${
                      EQUIVALENT[ai] === h ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-stone-700 dark:text-stone-300"
                    }`}
                  >
                    {cell(h, ai)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-5 space-y-2 text-sm text-stone-700 dark:text-stone-300">
        <li>{`Real tests the AI called "not a clean test": ${missedTests.length}. These are the matches or contradictions it dismissed.`}</li>
        <li>{`Pairs the AI called "kept" that you'd call not a clean test or a contradiction: ${overCredited.length}. This is over-crediting.`}</li>
        <li>
          {humanContradictions.length === 0
            ? "You labeled no contradictions in this sample, so detection can't be measured from it."
            : `Contradictions you found: ${humanContradictions.length}. The AI caught ${caught.length} of them.`}
        </li>
      </ul>
      <p className="mt-4 text-xs text-stone-500">
        This is a small sample drawn from the comparisons the pipeline already makes, so read it as a spot-check, not a rate
        for the whole site. It can show over-crediting and dismissed tests, but not contradictions among pairs the pipeline
        never made.
      </p>

      {disagreed.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50">{`Where you disagreed (${disagreed.length})`}</h2>
          <ul className="mt-3 space-y-3">
            {disagreed.map((p) => (
              <li key={p.id} className="rounded border border-stone-200 p-4 text-sm dark:border-stone-800">
                <div className="font-mono text-xs text-stone-500">{`${p.politician_name} · ${formatTopicLabel(p.topic)}`}</div>
                <p className="mt-2 text-stone-800 dark:text-stone-200">{p.statement_text}</p>
                <p className="mt-2 text-stone-700 dark:text-stone-300">{`Voted ${p.vote_value} on “${p.bill_title}”`}</p>
                <p className="mt-2 text-stone-600 dark:text-stone-400">
                  {`AI: ${AI_TEXT[p.ai_classification]} (confidence ${p.ai_confidence}). ${p.ai_rationale}`}
                </p>
                <p className="mt-1 font-semibold text-stone-900 dark:text-stone-50">
                  {`You: ${HUMAN_TEXT[p.human_label ?? ""]}${p.human_note ? ` — ${p.human_note}` : ""}`}
                </p>
                <form action={clearLabel} className="mt-2">
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="font-mono text-xs text-teal-700 underline underline-offset-2 dark:text-teal-400">
                    Re-label this one
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
