import { supabase } from "./lib/supabase";
import { fetchRecentNyBillsWithVotes } from "./lib/openstates";
import { buildVoteRows } from "./lib/vote-rows";

async function run() {
  const { data: politicians, error: fetchError } = await supabase
    .from("politicians")
    .select("id, openstates_id")
    .not("openstates_id", "is", null);
  if (fetchError) throw fetchError;

  const politicianIdByOpenStatesId = new Map(politicians.map((p) => [p.openstates_id as string, p.id as string]));

  const bills = await fetchRecentNyBillsWithVotes();
  console.log(`Fetched ${bills.length} bills`);

  const { rows, skippedUntrackedVoter } = buildVoteRows(bills, politicianIdByOpenStatesId);

  console.log(`Upserting ${rows.length} vote rows (skipped ${skippedUntrackedVoter} votes by untracked voters)`);
  if (rows.length > 0) {
    const { error } = await supabase.from("votes").upsert(rows, { onConflict: "politician_id,openstates_vote_id" });
    if (error) throw error;
  }

  console.log("Done.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
