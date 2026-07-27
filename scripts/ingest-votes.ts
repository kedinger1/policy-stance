import { supabase } from "./lib/supabase";
import { fetchRecentNyBillsWithVotes } from "./lib/openstates";

type VoteRow = {
  politician_id: string;
  openstates_bill_id: string;
  openstates_vote_id: string;
  bill_title: string;
  vote_value: string;
  voted_at: string;
  topic_tags: string[];
  is_bundled: boolean;
};

async function run() {
  const { data: politicians, error: fetchError } = await supabase
    .from("politicians")
    .select("id, openstates_id")
    .not("openstates_id", "is", null);
  if (fetchError) throw fetchError;

  const politicianIdByOpenStatesId = new Map(politicians.map((p) => [p.openstates_id as string, p.id as string]));

  const bills = await fetchRecentNyBillsWithVotes();
  console.log(`Fetched ${bills.length} bills`);

  const rows: VoteRow[] = [];
  let skippedUntrackedVoter = 0;

  for (const bill of bills) {
    for (const rollCall of bill.votes ?? []) {
      for (const voteOption of rollCall.votes ?? []) {
        const politicianId = voteOption.voter?.id ? politicianIdByOpenStatesId.get(voteOption.voter.id) : undefined;
        if (!politicianId) {
          skippedUntrackedVoter++;
          continue;
        }

        rows.push({
          politician_id: politicianId,
          openstates_bill_id: bill.identifier,
          openstates_vote_id: rollCall.id,
          bill_title: bill.title,
          vote_value: voteOption.option,
          voted_at: rollCall.start_date?.slice(0, 10),
          topic_tags: [],
          is_bundled: false,
        });
      }
    }
  }

  // A bill can shift between pages if it's updated mid-pagination (sorted by
  // most-recently-updated, and NY's legislature is actively in session), which
  // duplicates all of its votes. Dedupe on the same key as the DB constraint
  // before upserting, since ON CONFLICT can't affect the same row twice in one statement.
  const dedupedRows = [...new Map(rows.map((row) => [`${row.politician_id}:${row.openstates_vote_id}`, row])).values()];
  const duplicateCount = rows.length - dedupedRows.length;

  console.log(
    `Upserting ${dedupedRows.length} vote rows (skipped ${skippedUntrackedVoter} votes by untracked voters, ${duplicateCount} duplicates)`,
  );
  if (dedupedRows.length > 0) {
    const { error } = await supabase.from("votes").upsert(dedupedRows, { onConflict: "politician_id,openstates_vote_id" });
    if (error) throw error;
  }

  console.log("Done.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
