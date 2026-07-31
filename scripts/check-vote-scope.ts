import { supabase } from "./lib/supabase";

async function run() {
  const { data: positionRows, error: posError } = await supabase.from("positions").select("politician_id");
  if (posError) throw posError;
  const researchedIds = [...new Set(positionRows.map((r) => r.politician_id))];

  const { data: politicians, error: pError } = await supabase.from("politicians").select("id, full_name").in("id", researchedIds);
  if (pError) throw pError;

  let total = 0;
  for (const politician of politicians) {
    const { count, error } = await supabase.from("votes").select("*", { count: "exact", head: true }).eq("politician_id", politician.id);
    if (error) throw error;
    console.log(`${politician.full_name}: ${count} votes`);
    total += count ?? 0;
  }
  console.log(`\nTotal: ${total} votes across ${politicians.length} politicians`);
}

run();
