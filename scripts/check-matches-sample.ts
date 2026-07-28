import { supabase } from "./lib/supabase";

async function run() {
  const { data: counts, error: countError } = await supabase.from("matches").select("classification, status");
  if (countError) throw countError;

  const byClassification: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const row of counts) {
    byClassification[row.classification] = (byClassification[row.classification] ?? 0) + 1;
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
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
