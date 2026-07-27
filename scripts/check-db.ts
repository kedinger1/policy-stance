import { supabase } from "./lib/supabase";

async function run() {
  for (const table of ["politicians", "positions", "votes", "matches"]) {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) {
      console.error(`${table}: ERROR:`, error.message);
      continue;
    }
    console.log(`${table}: ${count} rows`);
  }
}

run();
