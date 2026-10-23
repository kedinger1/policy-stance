import { supabase, fetchAllRows } from "./lib/supabase";
import { classifyMatches, type MatchCandidate } from "./lib/codex";
import { buildRanker } from "./lib/similarity";

// READ-ONLY prototype. Re-pairs each already-tagged vote with its best-matching
// position (BM25) instead of the newest one on the issue, judges the new pairs,
// and prints old vs new. Writes nothing to the database.
const CONFIDENCE_THRESHOLD = 0.75;
const BATCH = 50;

const name = process.argv[2] ?? "Brian Cunningham";
const limit = Number(process.argv[3] ?? 0) || Infinity;

type Position = { id: string; topic: string; statement_text: string; stated_at: string; source_type: string; source_bill_id: string | null };

const tally = (xs: string[]) => xs.reduce<Record<string, number>>((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {});

function summarize(rows: { classification: string; confidence: number }[]) {
  const confident = rows.filter((r) => r.confidence >= CONFIDENCE_THRESHOLD);
  const c = tally(confident.map((r) => r.classification));
  const scoreable = (c.kept ?? 0) + (c.broken ?? 0) + (c.partial ?? 0);
  const consistency = scoreable ? Math.round((((c.kept ?? 0) + 0.5 * (c.partial ?? 0)) / scoreable) * 100) : null;
  return { total: rows.length, confident: c, awaitingReview: rows.length - confident.length, scoreable, consistency };
}

async function run() {
  const { data: pol } = await supabase.from("politicians").select("id").eq("full_name", name).maybeSingle();
  if (!pol) throw new Error(`no politician named ${name}`);

  const positions = (await fetchAllRows((f, t) =>
    supabase.from("positions").select("id, topic, statement_text, stated_at, source_type, source_bill_id").eq("politician_id", pol.id).range(f, t),
  )) as Position[];
  const oldMatches = await fetchAllRows((f, t) =>
    supabase.from("matches").select("vote_id, topic, position_id, classification, confidence, status").eq("politician_id", pol.id).range(f, t),
  );

  const voteIds = oldMatches.map((m) => m.vote_id);
  const votes = new Map<string, { id: string; bill_title: string; bill_summary: string | null; openstates_bill_id: string; vote_value: string; voted_at: string }>();
  for (let i = 0; i < voteIds.length; i += 150) {
    const { data, error } = await supabase
      .from("votes")
      .select("id, bill_title, bill_summary, openstates_bill_id, vote_value, voted_at")
      .in("id", voteIds.slice(i, i + 150));
    if (error) throw error;
    for (const v of data) votes.set(v.id, v);
  }

  const rank = buildRanker(positions, (p) => p.statement_text);
  const posById = new Map(positions.map((p) => [p.id, p]));

  const subset = oldMatches.slice(0, limit);
  const pairs = subset.flatMap((m, i) => {
    const vote = votes.get(m.vote_id);
    if (!vote) return [];
    const candidates = positions.filter(
      (p) => p.topic === m.topic && p.stated_at <= vote.voted_at && !(p.source_bill_id && p.source_bill_id === vote.openstates_bill_id),
    );
    if (candidates.length === 0) return [];
    const ranked = rank(`${vote.bill_title} ${vote.bill_summary ?? ""}`, candidates);
    const best = ranked[0];
    return [{ label: `m${i}`, old: m, vote, best: best.doc, score: best.score, candidates: candidates.length }];
  });

  console.log(`== ${name}: ${positions.length} positions, ${oldMatches.length} existing comparisons, re-pairing ${pairs.length}`);

  // The stored "old" results came from a different model, so re-judge the old
  // pairings with the same model as the new ones -- otherwise the comparison
  // mixes a model change with the pairing change. Identical pairs are judged once.
  type Judgment = { classification: string; rationale: string; confidence: number };
  const toItem = (label: string, vote: (typeof pairs)[number]["vote"], pos: Position): MatchCandidate => ({
    label,
    billTitle: vote.bill_title,
    billSummary: vote.bill_summary,
    voteValue: vote.vote_value,
    positionStatement: pos.statement_text,
    positionDate: pos.stated_at,
  });
  const work: MatchCandidate[] = [];
  for (const p of pairs) {
    work.push(toItem(`n${p.label}`, p.vote, p.best));
    const oldPos = posById.get(p.old.position_id);
    if (oldPos && oldPos.id !== p.best.id) work.push(toItem(`o${p.label}`, p.vote, oldPos));
  }
  const judged: Record<string, Judgment> = {};
  for (let i = 0; i < work.length; i += BATCH) {
    Object.assign(judged, classifyMatches(work.slice(i, i + BATCH)));
    console.log(`  judged ${Math.min(i + BATCH, work.length)}/${work.length}`);
  }

  const newRows = pairs.map((p) => ({ ...judged[`n${p.label}`], p }));
  const oldRejudged = pairs.map((p) => judged[`o${p.label}`] ?? judged[`n${p.label}`]);
  const oldStored = pairs.map((p) => ({ classification: p.old.classification, confidence: Number(p.old.confidence) }));

  const changed = pairs.filter((p) => p.best.id !== p.old.position_id).length;
  console.log("\nOLD as stored in the database (earlier model)");
  console.log("  ", JSON.stringify(summarize(oldStored)));
  console.log("OLD pairing (newest position on the issue), re-judged with the current model");
  console.log("  distinct positions used:", new Set(pairs.map((p) => p.old.position_id)).size);
  console.log("  ", JSON.stringify(summarize(oldRejudged)));
  console.log("NEW pairing (best-matching position), current model");
  console.log("  distinct positions used:", new Set(pairs.map((p) => p.best.id)).size, `| pairing changed for ${changed}/${pairs.length}`);
  console.log("  ", JSON.stringify(summarize(newRows)));
  console.log("  new pairing by position source:", JSON.stringify(tally(newRows.map((r) => `${r.p.best.source_type === "bill_sponsorship" ? "sponsored" : "quote"}:${r.classification}`))));

  const show = (title: string, rows: typeof newRows) => {
    console.log(`\n--- ${title}`);
    for (const r of rows) {
      console.log(`vote (${r.p.vote.vote_value}): ${r.p.vote.bill_title.slice(0, 110)}`);
      console.log(`  paired with [bm25 ${r.p.score.toFixed(1)}, ${r.p.candidates} candidates]: ${r.p.best.statement_text.slice(0, 150)}`);
      console.log(`  -> ${r.classification} (${r.confidence}): ${r.rationale.slice(0, 200)}`);
    }
  };
  show("sample of new KEPT/BROKEN/PARTIAL", newRows.filter((r) => r.classification !== "na").slice(0, 8));
  show("sample of new NA", newRows.filter((r) => r.classification === "na").slice(0, 4));
}

run().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
