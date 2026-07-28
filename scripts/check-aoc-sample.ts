import { supabase } from "./lib/supabase";

async function run() {
  const { data: p, error: pError } = await supabase
    .from("politicians")
    .select("id")
    .eq("full_name", "Alexandria Ocasio-Cortez")
    .single();
  if (pError) throw pError;

  const { data, error } = await supabase
    .from("positions")
    .select("topic, statement_text, source_type, source_url, stated_at, extraction_confidence")
    .eq("politician_id", p.id)
    .order("stated_at", { ascending: false });
  if (error) throw error;

  for (const row of data) {
    console.log(`[${row.stated_at}] (${row.topic}, conf ${row.extraction_confidence}) ${row.statement_text}`);
    console.log(`  ${row.source_url}`);
  }
}

run();
