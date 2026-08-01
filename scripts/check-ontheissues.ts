import { supabase } from "./lib/supabase";

async function run() {
  const { data, error } = await supabase
    .from("positions")
    .select("politician_id, topic, statement_text, source_url, stated_at, extraction_confidence")
    .ilike("source_url", "%ontheissues.org%");
  if (error) throw error;

  const { data: politicians } = await supabase.from("politicians").select("id, full_name");
  const nameById = new Map(politicians!.map((p) => [p.id, p.full_name]));

  for (const row of data) {
    console.log(`\n[${nameById.get(row.politician_id)}] ${row.topic} (conf ${row.extraction_confidence}, ${row.stated_at})`);
    console.log(`  "${row.statement_text}"`);
    console.log(`  ${row.source_url}`);
  }
}

run();
