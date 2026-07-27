import { supabase } from "./lib/supabase";

async function run() {
  const { data, error } = await supabase
    .from("positions")
    .select("topic, statement_text, source_type, source_url, stated_at, extraction_confidence")
    .order("stated_at", { ascending: false })
    .limit(12);
  if (error) throw error;
  for (const row of data) {
    console.log(JSON.stringify(row, null, 2));
  }
}

run();
