import type { OpenStatesBill } from "./openstates";

export type VoteRow = {
  politician_id: string;
  openstates_bill_id: string;
  openstates_vote_id: string;
  bill_title: string;
  vote_value: string;
  voted_at: string;
  topic_tags: string[];
  is_bundled: boolean;
};

// Flattens bills -> roll calls -> individual voter options into vote rows,
// keeping only voters we already track, and dedupes on the same key as the
// DB's unique constraint (a bill can appear twice across paginated requests
// if it's updated mid-pagination, which would otherwise duplicate its votes
// within a single upsert batch and break ON CONFLICT).
export function buildVoteRows(bills: OpenStatesBill[], politicianIdByOpenStatesId: Map<string, string>): { rows: VoteRow[]; skippedUntrackedVoter: number } {
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

  const deduped = [...new Map(rows.map((row) => [`${row.politician_id}:${row.openstates_vote_id}`, row])).values()];
  return { rows: deduped, skippedUntrackedVoter };
}
