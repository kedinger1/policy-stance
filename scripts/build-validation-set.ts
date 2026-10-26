import { supabase, fetchAllRows } from "./lib/supabase";
import { buildRanker } from "./lib/similarity";

// Builds the hand-labeling sample (see migration 0008). Draws from the comparisons the
// pipeline has actually made, in three strata so the labeled set can answer different
// questions:
//   close    -- statement and vote text are most alike; where a real contradiction or a
//               missed clean test is most likely to hide
//   ai_kept  -- random pairs the AI called "kept"; checks it isn't over-crediting
//   ai_na    -- random pairs the AI called "not a clean test"; checks it isn't
//               dismissing real tests
// Caps keep any one statement or legislator from dominating. Refuses to run over an
// existing sample unless --rebuild is passed, because that deletes every label.
const N_CLOSE = 20;
const N_KEPT = 10;
const N_NA = 10;
const MAX_PER_STATEMENT = 2;
const MAX_PER_LEGISLATOR = 4;

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function run() {
  const rebuild = process.argv.includes("--rebuild");
  const { count, error: countError } = await supabase.from("validation_pairs").select("*", { count: "exact", head: true });
  if (countError) throw new Error(`validation_pairs not readable (has migration 0008 been run?): ${countError.message}`);
  if ((count ?? 0) > 0 && !rebuild) {
    console.log(`A sample of ${count} pairs already exists. Re-run with --rebuild to replace it (this deletes all labels).`);
    return;
  }

  const matches = await fetchAllRows((f, t) =>
    supabase
      .from("matches")
      .select("politician_id, position_id, vote_id, topic, classification, status, confidence, rationale")
      .range(f, t),
  );
  const positions = await fetchAllRows((f, t) =>
    supabase.from("positions").select("id, statement_text, source_url, stated_at, source_type").neq("source_type", "bill_sponsorship").range(f, t),
  );
  const posById = new Map(positions.map((p) => [p.id, p]));

  const voteIds = [...new Set(matches.map((m) => m.vote_id))];
  const votes = new Map<string, { bill_title: string; vote_value: string; voted_at: string }>();
  for (let i = 0; i < voteIds.length; i += 150) {
    const { data, error } = await supabase.from("votes").select("id, bill_title, vote_value, voted_at").in("id", voteIds.slice(i, i + 150));
    if (error) throw error;
    for (const v of data) votes.set(v.id, v);
  }
  const { data: pols } = await supabase.from("politicians").select("id, full_name");
  const nameOf = new Map((pols ?? []).map((p) => [p.id, p.full_name as string]));

  const rank = buildRanker(positions, (p) => p.statement_text);
  const pool = matches.flatMap((m) => {
    const pos = posById.get(m.position_id);
    const vote = votes.get(m.vote_id);
    if (!pos || !vote) return [];
    return [{ m, pos, vote, similarity: rank(vote.bill_title, [pos])[0].score }];
  });
  console.log(`Sampling from ${pool.length} comparisons.`);

  const used = new Set<number>();
  const perStatement = new Map<string, number>();
  const perLegislator = new Map<string, number>();
  const take = (idx: number) => {
    const { m } = pool[idx];
    if ((perStatement.get(m.position_id) ?? 0) >= MAX_PER_STATEMENT) return false;
    if ((perLegislator.get(m.politician_id) ?? 0) >= MAX_PER_LEGISLATOR) return false;
    perStatement.set(m.position_id, (perStatement.get(m.position_id) ?? 0) + 1);
    perLegislator.set(m.politician_id, (perLegislator.get(m.politician_id) ?? 0) + 1);
    used.add(idx);
    return true;
  };

  const chosen: { idx: number; kind: "close" | "ai_kept" | "ai_na" }[] = [];
  const byClass = (c: string) => shuffle(pool.map((_, i) => i).filter((i) => pool[i].m.classification === c));

  const bySimilarity = pool.map((_, i) => i).sort((a, b) => pool[b].similarity - pool[a].similarity);
  for (const idx of bySimilarity) {
    if (chosen.length >= N_CLOSE) break;
    if (take(idx)) chosen.push({ idx, kind: "close" });
  }
  let kept = 0;
  for (const idx of byClass("kept")) {
    if (kept >= N_KEPT) break;
    if (!used.has(idx) && take(idx)) {
      chosen.push({ idx, kind: "ai_kept" });
      kept++;
    }
  }
  let na = 0;
  for (const idx of byClass("na")) {
    if (na >= N_NA) break;
    if (!used.has(idx) && take(idx)) {
      chosen.push({ idx, kind: "ai_na" });
      na++;
    }
  }

  const order = shuffle(chosen.map((_, i) => i));
  const rows = chosen.map((c, i) => {
    const { m, pos, vote, similarity } = pool[c.idx];
    return {
      sample_kind: c.kind,
      ord: order[i],
      politician_name: nameOf.get(m.politician_id) ?? "Unknown",
      topic: m.topic,
      statement_text: pos.statement_text,
      statement_source_url: pos.source_url,
      stated_at: pos.stated_at,
      bill_title: vote.bill_title,
      vote_value: vote.vote_value,
      voted_at: vote.voted_at,
      similarity: Number(similarity.toFixed(3)),
      ai_classification: m.classification,
      ai_status: m.status,
      ai_confidence: m.confidence,
      ai_rationale: m.rationale,
    };
  });

  if (rebuild) {
    const { error } = await supabase.from("validation_pairs").delete().not("id", "is", null);
    if (error) throw error;
  }
  const { error } = await supabase.from("validation_pairs").insert(rows);
  if (error) throw error;

  const tally = rows.reduce<Record<string, number>>((a, r) => ((a[r.sample_kind] = (a[r.sample_kind] ?? 0) + 1), a), {});
  console.log(`Inserted ${rows.length} pairs:`, tally);
}

run().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
