import { supabase } from "./lib/supabase";

const NAME = process.argv[2] ?? "Andrea Stewart-Cousins";

async function run() {
  const { data: politician, error: pError } = await supabase.from("politicians").select("id, full_name").eq("full_name", NAME).single();
  if (pError) throw pError;

  console.log(`\n=== ${politician.full_name} ===`);
  const { data, error } = await supabase
    .from("positions")
    .select("topic, statement_text, source_type, source_url, stated_at, extraction_confidence")
    .eq("politician_id", politician.id)
    .order("stated_at", { ascending: false });
  if (error) throw error;
  for (const row of data) {
    console.log(`[${row.stated_at}] (${row.topic}, conf ${row.extraction_confidence}) ${row.statement_text}`);
    console.log(`  ${row.source_url}`);
  }
}

run();
