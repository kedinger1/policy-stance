import Link from "next/link";
import type { Metadata } from "next";
import { supabase, fetchAllRows } from "@/lib/supabase";
import { SITE_NAME } from "@/lib/site";

// Counts only change when a pipeline script is run by hand — same hour-long cache
// as the rest of the site.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: `${SITE_NAME} — what they said, how they voted`,
  description:
    "Lines up what New York state legislators say in public with how they actually vote, one dated statement and one roll call at a time, and shows its work.",
};

const CONFIDENT_STATUSES = ["ai_matched", "human_confirmed", "human_overridden"];

async function exactCount(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function getStats() {
  const positionRows = await fetchAllRows((from, to) => supabase.from("positions").select("politician_id, source_type").range(from, to));
  const pilotIds = [...new Set(positionRows.map((r) => r.politician_id))];

  const [legislators, votes, matchRows] = await Promise.all([
    exactCount(supabase.from("politicians").select("*", { count: "exact", head: true }).in("chamber", ["upper", "lower"])),
    exactCount(supabase.from("votes").select("*", { count: "exact", head: true }).in("politician_id", pilotIds)),
    fetchAllRows((from, to) =>
      supabase.from("matches").select("position_id, classification, status").in("politician_id", pilotIds).range(from, to),
    ),
  ]);

  // A statement counts as tested once at least one confident vote clearly tests it,
  // however many votes do -- the same unit the results themselves use.
  const testedStatements = new Set(
    matchRows
      .filter((m) => CONFIDENT_STATUSES.includes(m.status) && m.classification !== "na")
      .map((m) => m.position_id),
  );

  return {
    pilot: pilotIds.length,
    legislators,
    statements: positionRows.filter((r) => r.source_type !== "bill_sponsorship").length,
    sponsored: positionRows.filter((r) => r.source_type === "bill_sponsorship").length,
    votes,
    matches: matchRows.length,
    tested: testedStatements.size,
  };
}

const fmt = (n: number) => n.toLocaleString("en-US");

const LABEL = "font-mono text-xs uppercase tracking-wider text-teal-700 dark:text-teal-400";
const H2 = "mt-2 text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl dark:text-stone-50";
const BODY = "text-stone-600 dark:text-stone-400";

export default async function LandingPage() {
  const stats = await getStats();

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <div className={LABEL}>{`${SITE_NAME} · pilot · New York state legislature`}</div>

      <section className="mt-6">
        <h1 className="text-4xl font-semibold tracking-tight text-stone-900 sm:text-6xl dark:text-stone-50">
          What they said.
          <br />
          How they voted.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-stone-700 dark:text-stone-300">
          {`${SITE_NAME} lines up what New York state legislators say in public with how they actually vote — one dated statement and one roll call at a time — and shows every step of the reasoning so you can check it yourself.`}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            href="/politicians"
            className="rounded bg-teal-700 px-5 py-3 font-mono text-sm text-white transition-colors hover:bg-teal-800 dark:bg-teal-400 dark:text-stone-950 dark:hover:bg-teal-300"
          >
            {`Browse the ${stats.pilot} legislators →`}
          </Link>
          <a href="#how" className="font-mono text-sm text-teal-700 underline-offset-4 hover:underline dark:text-teal-400">
            How it works
          </a>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="example-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="example-heading" className={LABEL}>
            One comparison, start to finish
          </h2>
          <span className="font-mono text-[11px] text-stone-500">illustrative · not a real person</span>
        </div>
        <div className="mt-3 divide-y divide-stone-200 rounded border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
          <ExampleRow label="Stated" meta="press release · March 2024">
            <p className="text-stone-800 dark:text-stone-200">
              &ldquo;Any new tax revenue should go toward lowering local property taxes.&rdquo;
            </p>
          </ExampleRow>
          <ExampleRow label="Voted" meta="roll call · May 2026">
            <p className="text-stone-800 dark:text-stone-200">
              <span className="font-medium">Yes</span>
              {" "}
              on a bill extending a county&apos;s authority to levy a new occupancy tax.
            </p>
          </ExampleRow>
          <ExampleRow label="Verdict" meta="with a one-sentence rationale, always shown">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0 rounded bg-red-100 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-red-800 dark:bg-red-950 dark:text-red-300">
                broken
              </span>
              <p className="text-stone-800 dark:text-stone-200">
                The stated goal was to push tax revenue toward property-tax relief; this vote keeps a new tax in place without
                that offset.
              </p>
            </div>
          </ExampleRow>
        </div>
        <p className="mt-3 font-mono text-xs text-stone-500">
          Four possible verdicts:{" "}
          <Chip tone="kept">kept</Chip> <Chip tone="broken">broken</Chip> <Chip tone="partial">partial</Chip>{" "}
          <Chip tone="na">not a clean test</Chip>
        </p>
      </section>

      <section className="mt-20" aria-labelledby="why-heading">
        <div className={LABEL}>Why this exists</div>
        <h2 id="why-heading" className={H2}>
          Words are cheap. Roll calls are public. Nobody lines them up.
        </h2>
        <div className={`mt-5 space-y-4 ${BODY}`}>
          <p>
            State legislatures decide much of what touches daily life — taxes, housing, schools, policing — and tend to
            get far less scrutiny than Congress. New York&apos;s 213 legislators cast thousands of recorded votes every session,
            under titles like &ldquo;Relates to the powers of the New York state housing finance agency.&rdquo; Almost no
            one reads them against what the same people say on the campaign trail.
          </p>
          <p>
            Existing tools tend to do one half of the job: grade a vote tally against an advocacy group&apos;s agenda, or track
            campaign promises. We&apos;re trying to connect the two directly — a specific, dated statement to the specific votes
            that actually test it — with the reasoning attached to every judgment.
          </p>
        </div>
      </section>

      <section id="how" className="mt-20 scroll-mt-8" aria-labelledby="how-heading">
        <div className={LABEL}>How it works</div>
        <h2 id="how-heading" className={H2}>
          Three steps, each one inspectable.
        </h2>
        <ol className="mt-8 space-y-8">
          <Step n="1" title="Collect what they've said">
            Dated, sourced statements — press releases, speeches, news quotes. We also record the bills each legislator
            personally introduced, which show what they act on. Those are deeds, like votes, so they&apos;re shown alongside
            but never used as the yardstick for a vote.
          </Step>
          <Step n="2" title="Match each statement to the votes that actually test it">
            Every vote is tagged by issue and scored for how squarely it tests that issue — a wildlife-awareness resolution
            isn&apos;t a test of someone&apos;s climate policy, even though both are loosely &ldquo;environment.&rdquo; Votes are
            compared against the legislator&apos;s most recent statement on that issue at the time of the vote.
          </Step>
          <Step n="3" title="Judge it, and show the work">
            Each comparison gets a verdict and a one-sentence rationale. A statement counts once, however many votes test it,
            and results are shown as counts (statements tested, upheld, contradicted), not a grade. Judgments the AI isn&apos;t confident about,
            and every possible contradiction, are held out until a person reviews them.
          </Step>
        </ol>
        <Link
          href="/methodology"
          className="mt-8 inline-block font-mono text-sm text-teal-700 underline-offset-4 hover:underline dark:text-teal-400"
        >
          Read the full methodology →
        </Link>
      </section>

      <section className="mt-20" aria-labelledby="live-heading">
        <div className={LABEL}>The pilot, right now</div>
        <h2 id="live-heading" className={H2}>
          {stats.pilot} of {stats.legislators} legislators so far.
        </h2>
        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded border border-stone-200 bg-stone-200 sm:grid-cols-5 dark:border-stone-800 dark:bg-stone-800">
          <Stat value={fmt(stats.statements)} label="public statements" />
          <Stat value={fmt(stats.sponsored)} label="sponsored bills" />
          <Stat value={fmt(stats.votes)} label="roll-call votes on file" />
          <Stat value={fmt(stats.matches)} label="statement-to-vote comparisons" />
          <Stat wide value={fmt(stats.tested)} label="statements tested" />
        </dl>
        <p className="mt-3 text-sm text-stone-500">
          Most comparisons don&apos;t end up counting toward a result, and that&apos;s deliberate. Many votes simply don&apos;t squarely test a given
          statement, so they&apos;re judged &ldquo;not a clean test,&rdquo; and anything the AI wasn&apos;t sure about, or that looks
          like a contradiction, waits for a person rather than being averaged in as if it were evidence.
        </p>
      </section>

      <section className="mt-20" aria-labelledby="caveats-heading">
        <div className={LABEL}>What these numbers do and don&apos;t say</div>
        <h2 id="caveats-heading" className={H2}>
          Read it as a starting point, not a verdict.
        </h2>
        <dl className="mt-6 space-y-6">
          <Caveat term="Upheld isn't the same as right.">
            Voting in line with what you&apos;ve said measures follow-through, not whether the position is good policy.
          </Caveat>
          <Caveat term="No contradictions found is not the same as none exist.">
            A clear contradiction needs a statement and a vote about the same specific question, and today that match is rare. So
            &ldquo;all upheld&rdquo; is a limit of the test, not proof that someone is consistent.
          </Caveat>
          <Caveat term="Only votes that reached the floor count.">
            Legislative leadership largely controls which bills get a vote, so a lack of votes on an issue may reflect leadership
            blocking it, not the member&apos;s own choice.
          </Caveat>
          <Caveat term="“No vote has clearly tested this” is not a pass.">
            Plenty of issues have a stated position but no vote that squarely tests it. We&apos;d rather say that than invent a result.
          </Caveat>
          <Caveat term="An AI does the first pass, and it makes mistakes.">
            That&apos;s why every judgment links to its rationale and source, why uncertain ones are held back, and why this is
            labelled a pilot. Check anything that matters against the primary sources.
          </Caveat>
        </dl>
      </section>

      <section className="mt-20" aria-labelledby="potential-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className={LABEL}>Where this could go</div>
          <span className="font-mono text-[11px] text-stone-500">potential, not promises</span>
        </div>
        <h2 id="potential-heading" className={H2}>
          Follow-through, visible before you vote.
        </h2>
        <ul className={`mt-5 space-y-3 ${BODY}`}>
          <Potential title="Voters.">
            New York legislators serve two-year terms, so every seat is on the ballot every even year. A record of follow-through
            gives voters something sturdier than a mailer.
          </Potential>
          <Potential title="Reporters, advocates, and staff.">
            A sourced shortlist of votes that cut against a stated position is a faster place to start than a thousand bill
            titles.
          </Potential>
          <Potential title="Beyond New York.">
            The legislative data comes from Open States, which covers every state, so the approach isn&apos;t specific to New York.
          </Potential>
          <Potential title="Your priorities.">
            Weighting the issues you care about most is on the list, once we&apos;ve talked to enough voters to know what
            &ldquo;important to me&rdquo; should mean.
          </Potential>
        </ul>
      </section>

      <section className="mt-20 border-t border-stone-200 pt-10 dark:border-stone-800">
        <h2 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
          Start with the pilot.
        </h2>
        <p className={`mt-2 max-w-xl ${BODY}`}>
          Pick an issue, see who has been tested on it, and click through to the statements, votes, and reasoning behind each
          number.
        </p>
        <Link
          href="/politicians"
          className="mt-6 inline-block rounded bg-teal-700 px-5 py-3 font-mono text-sm text-white transition-colors hover:bg-teal-800 dark:bg-teal-400 dark:text-stone-950 dark:hover:bg-teal-300"
        >
          {`Browse the ${stats.pilot} legislators →`}
        </Link>
        <p className="mt-10 font-mono text-xs text-stone-500">
          Legislative data from Open States. Statements are AI-researched from public sources and linked to where they were found.
          Pilot data — not a substitute for reading the primary record.
        </p>
      </section>
    </div>
  );
}

function ExampleRow({ label, meta, children }: { label: string; meta: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 p-4 sm:grid-cols-[6.5rem_1fr] sm:gap-4">
      <div>
        <div className="font-mono text-xs font-semibold uppercase tracking-wider text-stone-900 dark:text-stone-50">{label}</div>
        <div className="font-mono text-[11px] text-stone-500">{meta}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}

const CHIP_STYLE = {
  kept: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  broken: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  partial: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  na: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
};

function Chip({ tone, children }: { tone: keyof typeof CHIP_STYLE; children: React.ReactNode }) {
  return <span className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${CHIP_STYLE[tone]}`}>{children}</span>;
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[2.5rem_1fr] gap-4">
      <div className="font-mono text-3xl font-semibold leading-none text-teal-700 dark:text-teal-400">{n}</div>
      <div>
        <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-50">{title}</h3>
        <p className={`mt-1 ${BODY}`}>{children}</p>
      </div>
    </li>
  );
}

function Stat({ value, label, wide }: { value: string; label: string; wide?: boolean }) {
  return (
    <div className={`flex flex-col-reverse justify-end bg-white p-4 dark:bg-stone-950 ${wide ? "col-span-2 sm:col-span-1" : ""}`}>
      <dt className="mt-1 font-mono text-[11px] uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="font-mono text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-50">{value}</dd>
    </div>
  );
}

function Caveat({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-stone-900 dark:text-stone-50">{term}</dt>
      <dd className={`mt-1 ${BODY}`}>{children}</dd>
    </div>
  );
}

function Potential({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li>
      <span className="font-semibold text-stone-900 dark:text-stone-50">{title} </span>
      {children}
    </li>
  );
}
