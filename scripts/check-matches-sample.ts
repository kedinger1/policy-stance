import { supabase } from "./lib/supabase";

async function exactCount(column: "classification" | "status", value: string): Promise<number> {
  const { count, error } = await supabase.from("matches").select("*", { count: "exact", head: true }).eq(column, value);
  if (error) throw error;
  return count ?? 0;
}

async function run() {
  // A plain unfiltered select silently truncates at PostgREST's default row cap
  // (bit us once already with the votes table) -- use exact per-value counts instead.
  const byClassification: Record<string, number> = {};
  for (const c of ["kept", "broken", "partial", "na"]) {
    byClassification[c] = await exactCount("classification", c);
  }
  const byStatus: Record<string, number> = {};
  for (const s of ["ai_matched", "needs_review", "human_confirmed", "human_overridden", "community_flagged", "disputed"]) {
    const n = await exactCount("status", s);
    if (n > 0) byStatus[s] = n;
  }
  console.log("By classification:", byClassification);
  console.log("By status:", byStatus);

  const { data: politicians, error: pError } = await supabase.from("politicians").select("id, full_name");
  if (pError) throw pError;
  const nameById = new Map(politicians.map((p) => [p.id, p.full_name]));

  const { data: sample, error } = await supabase
    .from("matches")
    .select("politician_id, topic, classification, confidence, rationale, status")
    .order("confidence", { ascending: true })
    .limit(10);
  if (error) throw error;

  console.log("\nLowest-confidence matches (most likely candidates for review queue):");
  for (const row of sample) {
    console.log(`\n[${nameById.get(row.politician_id)}] ${row.topic} — ${row.classification} (conf ${row.confidence}, ${row.status})`);
    console.log(`  ${row.rationale}`);
  }
}

run();
