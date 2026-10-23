import Link from "next/link";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { TOPICS, formatTopicLabel } from "@/lib/topics";
import { SITE_NAME } from "@/lib/site";

// Counts only change when a pipeline script is run by hand.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Methodology — ${SITE_NAME}`,
  description:
    "Where every number comes from, how each result is counted, and what it does and does not say.",
};

const CONFIDENT_STATUSES = ["ai_matched", "human_confirmed", "human_overridden"];

async function exactCount(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function getBreakdown() {
  const head = { count: "exact" as const, head: true };
  const confident = (classification: string) =>
    exactCount(supabase.from("matches").select("*", head).eq("classification", classification).in("status", CONFIDENT_STATUSES));

  const [quotes, sponsored, kept, broken, partial, na, awaitingBroken, awaitingOther] = await Promise.all([
    exactCount(supabase.from("positions").select("*", head).neq("source_type", "bill_sponsorship")),
    exactCount(supabase.from("positions").select("*", head).eq("source_type", "bill_sponsorship")),
    confident("kept"),
    confident("broken"),
    confident("partial"),
    confident("na"),
    exactCount(supabase.from("matches").select("*", head).eq("status", "needs_review").eq("classification", "broken")),
    exactCount(supabase.from("matches").select("*", head).eq("status", "needs_review").neq("classification", "broken")),
  ]);

  return {
    quotes,
    sponsored,
    kept,
    broken,
    partial,
    na,
    awaitingBroken,
    awaitingOther,
    total: kept + broken + partial + na + awaitingBroken + awaitingOther,
  };
}

const fmt = (n: number) => n.toLocaleString("en-US");

const LABEL = "font-mono text-xs uppercase tracking-wider text-teal-700 dark:text-teal-400";
const H2 = "mt-2 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50";
const BODY = "text-stone-600 dark:text-stone-400";

const SECTIONS = [
  { id: "pipeline", label: "The pipeline" },
  { id: "sources", label: "Sources" },
  { id: "issues", label: "Issues" },
  { id: "comparing", label: "Comparing" },
  { id: "verdicts", label: "Verdicts" },
  { id: "score", label: "Results" },
  { id: "summaries", label: "Stance summaries" },
  { id: "ledger", label: "The ledger" },
  { id: "limits", label: "Known limits" },
];

export default async function MethodologyPage() {
  const b = await getBreakdown();
  const counted = b.kept + b.broken + b.partial;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <div className={LABEL}>Methodology</div>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl dark:text-stone-50">
        How the numbers work.
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-stone-700 dark:text-stone-300">
        Where each number comes from, how it&apos;s calculated, and what it does and does not say. If something here
        doesn&apos;t match what you see on a profile, the profile is wrong and this page is right.
      </p>
      <p className="mt-3 font-mono text-xs text-stone-500">Pilot · New York state legislature · updated October 2026</p>

      <nav aria-label="On this page" className="mt-8 flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-full border border-stone-300 px-3 py-1 font-mono text-xs text-stone-600 transition-colors hover:border-teal-700 hover:text-teal-700 dark:border-stone-700 dark:text-stone-400 dark:hover:border-teal-400 dark:hover:text-teal-400"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <Section id="pipeline" label="The pipeline" title="Five steps from a statement to a result.">
        <ol className="space-y-3">
          <Flow n="1" title="Collect">
            Dated, sourced statements. Separately, the bills each legislator personally introduced.
          </Flow>
          <Flow n="2" title="Tag">
            Every roll-call vote is assigned to an issue and scored for how squarely it tests that issue.
          </Flow>
          <Flow n="3" title="Compare">
            Each relevant vote is paired with the legislator&apos;s most recent statement on that issue at the time.
          </Flow>
          <Flow n="4" title="Judge">
            An AI model gives a verdict, a one-sentence rationale, and a confidence between 0 and 1.
          </Flow>
          <Flow n="5" title="Score">
            Each statement is judged by the votes that test it and counted once: upheld, mixed, or contradicted. Everything
            else is shown but kept out of the counts.
          </Flow>
        </ol>
        <p>
          Steps 1 through 4 use an AI model (currently OpenAI&apos;s Codex). Step 5 is plain arithmetic, shown below.
        </p>
      </Section>

      <Section id="sources" label="Sources" title="What goes in, and where it comes from.">
        <div className="divide-y divide-stone-200 rounded border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
          <Source
            name="Statements"
            count={fmt(b.quotes)}
            body="Found by an AI model searching public sources: official press releases, legislative websites, official social media, news coverage quoting the legislator directly, and OnTheIssues.org. Every statement must carry a specific date and a link to where it was found. Undated biography text is discarded, and a vote on its own does not count as a statement. Each statement is an AI-written summary of its source, not a word-for-word quote, and the source link is there so you can read the original. Nothing has been checked automatically against the source yet."
          />
          <Source
            name="Sponsored bills"
            count={fmt(b.sponsored)}
            body="Bills a legislator introduced as primary sponsor, from Open States. A name on a bill is an explicit, checkable fact about what they chose to act on. These are deeds, like votes, so they are shown alongside statements and feed the stance summaries, but a vote is never scored against one. The date is the bill's first recorded action, and each links to the bill itself. Cosponsorships are left out for now: there are far more of them and they're a weaker signal."
          />
          <Source
            name="Votes"
            count="2019–present"
            body="Recorded roll calls from Open States' public bulk exports, covering the 2019–2020 session onward. Older sessions are thinner because individual voter identities are often missing from the source data. The current session is only as fresh as our last data load."
          />
          <Source
            name="Bill summaries"
            count="context"
            body="Plain-language bill abstracts from Open States are shown to the AI for sponsored bills. Votes don't have abstracts loaded yet, so for now votes are tagged and judged from the bill title alone, which is often too terse to tell what a bill does."
          />
        </div>
      </Section>

      <Section id="issues" label="Issues" title="Eleven issues, deliberately broad.">
        <p>
          Statements and votes are matched on a fixed list of issues so they share a vocabulary:
        </p>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1 font-mono text-sm sm:grid-cols-2">
          {TOPICS.map((t) => (
            <li key={t} className="text-stone-800 dark:text-stone-200">
              {formatTopicLabel(t)}
            </li>
          ))}
        </ul>
        <p>
          For each bill, the AI picks one issue (or none) and scores 1 to 10 how centrally the bill&apos;s substance tests
          it. Ceremonial bills, such as naming a highway, and narrow technical or procedural bills get no issue. A relevance
          below 6 is dropped. That filter exists because of a real mistake: a wildlife-awareness resolution once counted as
          a test of a climate-change statement simply because both were loosely &ldquo;environment.&rdquo;
        </p>
        <p>
          Broad issues have a cost. &ldquo;Housing&rdquo; bundles zoning, tenant protection, homeownership, and code
          enforcement, so one statement about zoning can&apos;t be fairly tested by most housing votes.
        </p>
      </Section>

      <Section id="comparing" label="Comparing" title="Which statement does a vote get compared to?">
        <p>
          The legislator&apos;s most recent statement on that issue dated on or before the vote. Sponsored bills are never
          the yardstick: a bill is a deed, like a vote, so comparing the two answers a different question (does someone
          follow through on their own agenda?) than the one these results claim to answer (do they do what they said?).
        </p>
        <p>
          To keep the work tractable, each legislator&apos;s 1,000 most recent votes are considered.
        </p>
      </Section>

      <Section id="verdicts" label="Verdicts" title="Four verdicts, plus one holding pen.">
        <dl className="space-y-4">
          <Verdict tone="kept" name="Kept">
            The vote clearly matches the stated position.
          </Verdict>
          <Verdict tone="broken" name="Broken">
            The vote does the opposite of something the statement explicitly called for or opposed, on the same specific
            question. General criticism of a budget or of &ldquo;costly&rdquo; policy is not contradicted by voting for a
            specific bill.
          </Verdict>
          <Verdict tone="partial" name="Partial">
            Reserved for bundled or omnibus bills that mix provisions for and against the position, or a genuine, explainable
            tradeoff on the exact same question. It is not a hedge for &ldquo;sort of related.&rdquo;
          </Verdict>
          <Verdict tone="na" name="Not a clean test">
            The vote addresses a different, more specific, or more tangential question than the position, even if both share
            an issue. This is the default whenever the AI is merely unsure the two are about the same thing.
          </Verdict>
        </dl>
        <p>
          Every verdict comes with a confidence from 0 to 1. Below 0.75, the comparison is marked awaiting review and
          held out of every result. A &ldquo;broken&rdquo; verdict is always held for a person to confirm, however confident
          the AI is, because it is an accusation about a named person. Until a person confirms it, it doesn&apos;t
          count, and profiles show only that a possible contradiction was flagged.
        </p>
      </Section>

      <Section id="score" label="Results" title="How results are counted.">
        <p>
          The unit is the statement, not the vote. One press release can be tested by dozens of votes, such as a whole
          budget week or a run of local tax authorizations, and counting each vote would let a single statement dominate. So
          a statement tested by 40 votes counts the same as one tested by 1. Only confident verdicts count.
          &ldquo;Not a clean test&rdquo; and awaiting-review comparisons stay out.
        </p>
        <p>Each tested statement ends up in one of three places:</p>
        <dl className="space-y-4">
          <Verdict tone="kept" name="Upheld">
            Every vote that clearly tests it was kept.
          </Verdict>
          <Verdict tone="partial" name="Mixed">
            The votes testing it split, or were partial.
          </Verdict>
          <Verdict tone="broken" name="Contradicted">
            A person confirmed that votes did the opposite, and none went the other way.
          </Verdict>
        </dl>
        <p>
          We show these as counts, such as &ldquo;3 tested, 2 upheld, 1 mixed,&rdquo; and not as a percentage. With a handful
          of tested statements, a percentage reads like a grade and says more than the data can support.
        </p>
        <div className="rounded border border-stone-200 p-5 dark:border-stone-800">
          <div className={LABEL}>Worked example</div>
          <p className="mt-2">
            A legislator has three tested statements. Statement A is tested by 6 votes, all kept: upheld. Statement B is
            tested by 4 votes, 1 kept and 3 broken: mixed. Statement C is tested by 2 votes, both confirmed broken:
            contradicted. The result reads &ldquo;3 tested, 1 upheld, 1 mixed, 1 contradicted,&rdquo; no matter how many
            votes sit behind each one. Votes judged &ldquo;not a clean test&rdquo; and anything awaiting review are visible on
            the profile but don&apos;t move the counts.
          </p>
        </div>
        <p>
          &ldquo;No vote has clearly tested this yet&rdquo; is not a pass. It means there is nothing to count, and we say
          that instead of inventing a result. When the list is filtered by issue, legislators are ordered by statements
          tested, so one lucky match can&apos;t outrank a real record.
        </p>
      </Section>

      <Section id="summaries" label="Stance summaries" title="The one place the AI writes prose.">
        <p>
          Once a legislator has three or more statements or sponsored bills on an issue, an AI model writes a short summary of
          the pattern from the 40 most recent. It is asked to separate real policy philosophy from one-off constituent casework, and to say
          so plainly when something runs against the pattern. Profiles label it as AI-inferred, and it is never an input
          to any result. The statements and bills underneath it are the record.
        </p>
      </Section>

      <Section id="ledger" label="The ledger" title="Where every comparison ended up.">
        <p>Live from the database. This is the whole pilot, not a sample.</p>
        <div className="overflow-x-auto rounded border border-stone-200 dark:border-stone-800">
          <table className="w-full text-left text-sm">
            <thead className="font-mono text-[11px] uppercase tracking-wide text-stone-500">
              <tr className="border-b border-stone-200 dark:border-stone-800">
                <th className="p-3 font-normal">Outcome</th>
                <th className="p-3 text-right font-normal">Comparisons</th>
                <th className="p-3 font-normal">Counted?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
              <LedgerRow tone="kept" name="Kept" value={b.kept} counted />
              <LedgerRow tone="broken" name="Broken, confirmed" value={b.broken} counted />
              <LedgerRow tone="partial" name="Partial" value={b.partial} counted />
              <LedgerRow tone="broken" name="Possible contradiction, awaiting a person" value={b.awaitingBroken} />
              <LedgerRow tone="na" name="Not a clean test" value={b.na} />
              <LedgerRow tone="na" name="Other, awaiting review" value={b.awaitingOther} />
            </tbody>
            <tfoot className="border-t border-stone-300 font-mono dark:border-stone-700">
              <tr>
                <td className="p-3 text-stone-900 dark:text-stone-50">Total</td>
                <td className="p-3 text-right tabular-nums text-stone-900 dark:text-stone-50">{fmt(b.total)}</td>
                <td className="p-3 text-stone-500">{`${fmt(counted)} count`}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p>
          Most comparisons don&apos;t end up counting toward a result. That&apos;s the filters working, not a bug: most votes simply
          don&apos;t squarely test a given statement.
        </p>
      </Section>

      <Section id="limits" label="Known limits" title="What this can't tell you.">
        <ul className="space-y-4">
          <Limit title="An AI makes these judgments, and it makes mistakes.">
            Nothing here has been checked by a person yet. Each verdict links its rationale and sources so you can check it
            yourself, and anything that matters should be checked against the primary record.
          </Limit>
          <Limit title="A clear contradiction is a high bar, and the test is coarse.">
            A contradiction needs a statement and a vote about the same specific question, but votes are paired with the
            newest statement on the same broad issue, so that match is rare. Every &ldquo;broken&rdquo; verdict also waits for
            a person to confirm it. Read &ldquo;all upheld&rdquo; as &ldquo;no confirmed contradiction,&rdquo; not as proof
            of consistency, and check the ledger for how many are waiting.
          </Limit>
          <Limit title="Upheld is not the same as right.">
            Voting in line with what you said measures follow-through, not whether the position is good policy.
          </Limit>
          <Limit title="Only votes that reached the floor count.">
            Legislative leadership largely controls which bills get a vote, so silence on an issue may reflect leadership
            blocking it, not the member&apos;s choice.
          </Limit>
          <Limit title="The most recent statement wins, which can hide an older one.">
            A narrow recent statement can shadow a broader earlier one, so some issues read &ldquo;no vote has clearly
            tested this&rdquo; where a looser reading would have found something.
          </Limit>
          <Limit title="Coverage is partial.">
            24 of 213 legislators, primary sponsorships only, the most recent 1,000 votes per legislator, and thinner
            data for older sessions.
          </Limit>
          <Limit title="The words side is thin.">
            Roughly 10 to 15 statements per legislator, mostly press releases and news quotes, which are one polished
            audience. Floor remarks, town halls, and social posts aren&apos;t collected yet, so many issues have nothing to
            test, and what someone says to one audience may differ from what they say to another.
          </Limit>
        </ul>
        <p>
          Legislative data is from{" "}
          <a href="https://openstates.org" className="text-teal-700 underline underline-offset-2 dark:text-teal-400">
            Open States
          </a>
          . Ready to see it applied?{" "}
          <Link href="/politicians" className="text-teal-700 underline underline-offset-2 dark:text-teal-400">
            Explore the pilot
          </Link>
          .
        </p>
      </Section>
    </div>
  );
}

function Section({ id, label, title, children }: { id: string; label: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-16 scroll-mt-8" aria-labelledby={`${id}-heading`}>
      <div className={LABEL}>{label}</div>
      <h2 id={`${id}-heading`} className={H2}>
        {title}
      </h2>
      <div className={`mt-4 space-y-4 ${BODY}`}>{children}</div>
    </section>
  );
}

function Flow({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[2rem_1fr] items-baseline gap-3">
      <span className="font-mono text-lg font-semibold text-teal-700 dark:text-teal-400">{n}</span>
      <span>
        <span className="font-semibold text-stone-900 dark:text-stone-50">{title}.</span> {children}
      </span>
    </li>
  );
}

function Source({ name, count, body }: { name: string; count: string; body: string }) {
  return (
    <div className="p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-semibold text-stone-900 dark:text-stone-50">{name}</h3>
        <span className="font-mono text-xs text-stone-500">{count}</span>
      </div>
      <p className="mt-1">{body}</p>
    </div>
  );
}

const TONE = {
  kept: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  broken: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  na: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
};

function Verdict({ tone, name, children }: { tone: keyof typeof TONE; name: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt>
        <span className={`inline-block rounded px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide ${TONE[tone]}`}>
          {name}
        </span>
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function LedgerRow({ tone, name, value, counted }: { tone: keyof typeof TONE; name: string; value: number; counted?: boolean }) {
  return (
    <tr>
      <td className="p-3">
        <span className={`rounded px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide ${TONE[tone]}`}>
          {name}
        </span>
      </td>
      <td className="p-3 text-right font-mono tabular-nums text-stone-900 dark:text-stone-50">{fmt(value)}</td>
      <td className="p-3 font-mono text-xs text-stone-500">{counted ? "yes" : "no"}</td>
    </tr>
  );
}

function Limit({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li>
      <div className="font-semibold text-stone-900 dark:text-stone-50">{title}</div>
      <div className="mt-1">{children}</div>
    </li>
  );
}
