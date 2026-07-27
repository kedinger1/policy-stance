import { supabase } from "./lib/supabase";

async function run() {
  const { count, error } = await supabase.from("politicians").select("id", { count: "exact", head: true });
  if (error) {
    console.error("ERROR:", error.message);
    process.exit(1);
  }
  console.log("politicians table reachable, row count:", count);
}

run();
