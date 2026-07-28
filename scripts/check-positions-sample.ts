import { supabase } from "./lib/supabase";

const NAMES = ["Alec Brook-Krasny", "Alex Bores", "Alexis Weik"];

async function run() {
  const { data: politicians, error: pError } = await supabase.from("politicians").select("id, full_name").in("full_name", NAMES);
  if (pError) throw pError;

  for (const politician of politicians) {
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
}

run();
