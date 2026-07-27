import { supabase } from "./lib/supabase";
import { fetchNyLegislators, type OrgClassification } from "./lib/openstates";

async function run() {
  const chambers: OrgClassification[] = ["upper", "lower"];

  for (const chamber of chambers) {
    const legislators = await fetchNyLegislators(chamber);
    console.log(`Fetched ${legislators.length} NY ${chamber} legislators`);

    const rows = legislators.map((person) => ({
      full_name: person.name,
      state: "NY",
      chamber,
      district: person.current_role?.district ?? null,
      openstates_id: person.id,
    }));

    const { error } = await supabase.from("politicians").upsert(rows, { onConflict: "openstates_id" });
    if (error) throw error;
  }

  console.log("Done.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
