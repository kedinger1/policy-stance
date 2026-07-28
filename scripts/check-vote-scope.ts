import { supabase } from "./lib/supabase";

const NAMES = ["Al Stirpe", "Al Taylor", "Alec Brook-Krasny", "Alex Bores", "Alexis Weik", "Alexandria Ocasio-Cortez"];

async function run() {
  const { data: politicians, error: pError } = await supabase.from("politicians").select("id, full_name").in("full_name", NAMES);
  if (pError) throw pError;

  for (const politician of politicians) {
    const { count, error } = await supabase
      .from("votes")
      .select("*", { count: "exact", head: true })
      .eq("politician_id", politician.id);
    if (error) throw error;
    console.log(`${politician.full_name}: ${count} votes`);
  }
}

run();
