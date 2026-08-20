import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { supabase } from "./lib/supabase";
import { SESSIONS, downloadAndExtractSession, readSessionCsv } from "./lib/openstates-bulk";
import type { VoteRow } from "./lib/vote-rows";

const UPSERT_BATCH_SIZE = 2000;

async function processSession(
  identifier: string,
  url: string,
  workDir: string,
  politicianIdByOpenStatesId: Map<string, string>,
): Promise<{ upserted: number; skippedNoVoterId: number; skippedUntracked: number }> {
  const csvDir = await downloadAndExtractSession(url, identifier, workDir);

  const bills = readSessionCsv(csvDir, identifier, "bills");
  const abstracts = readSessionCsv(csvDir, identifier, "bill_abstracts");
  const abstractByBillId = new Map(abstracts.map((a) => [a.bill_id, a.abstract]));
  const billById = new Map(
    bills.map((b) => [b.id, { identifier: b.identifier, title: b.title, summary: abstractByBillId.get(b.id) ?? null }]),
  );

  const votes = readSessionCsv(csvDir, identifier, "votes");
  const voteById = new Map(votes.map((v) => [v.id, { bill_id: v.bill_id, start_date: v.start_date }]));

  const votePeople = readSessionCsv(csvDir, identifier, "vote_people");
  console.log(`[${identifier}] ${bills.length} bills, ${votes.length} roll calls, ${votePeople.length} individual ballots`);

  const rows: VoteRow[] = [];
  let skippedNoVoterId = 0;
  let skippedUntracked = 0;

  for (const vp of votePeople) {
    if (!vp.voter_id) {
      skippedNoVoterId++;
      continue;
    }
    const politicianId = politicianIdByOpenStatesId.get(vp.voter_id);
    if (!politicianId) {
      skippedUntracked++;
      continue;
    }
    const vote = voteById.get(vp.vote_event_id);
    if (!vote) continue;
    const bill = billById.get(vote.bill_id);
    if (!bill) continue;

    rows.push({
      politician_id: politicianId,
      openstates_bill_id: bill.identifier,
      openstates_vote_id: vp.vote_event_id,
      bill_title: bill.title,
      bill_summary: bill.summary,
      vote_value: vp.option,
      voted_at: vote.start_date.slice(0, 10),
      topic_tags: [],
      is_bundled: false,
    });
  }

  const deduped = [...new Map(rows.map((r) => [`${r.politician_id}:${r.openstates_vote_id}`, r])).values()];

  console.log(`[${identifier}] Upserting ${deduped.length} vote rows...`);
  for (let i = 0; i < deduped.length; i += UPSERT_BATCH_SIZE) {
    const batch = deduped.slice(i, i + UPSERT_BATCH_SIZE);
    const { error } = await supabase.from("votes").upsert(batch, { onConflict: "politician_id,openstates_vote_id" });
    if (error) throw error;
    console.log(`[${identifier}]   ${Math.min(i + UPSERT_BATCH_SIZE, deduped.length)}/${deduped.length}`);
  }

  return { upserted: deduped.length, skippedNoVoterId, skippedUntracked };
}

async function run() {
  const { data: politicians, error } = await supabase
    .from("politicians")
    .select("id, openstates_id")
    .not("openstates_id", "is", null);
  if (error) throw error;
  const politicianIdByOpenStatesId = new Map(politicians.map((p) => [p.openstates_id as string, p.id as string]));

  const workDir = mkdtempSync(path.join(tmpdir(), "openstates-bulk-"));
  try {
    for (const session of SESSIONS) {
      const result = await processSession(session.identifier, session.url, workDir, politicianIdByOpenStatesId);
      console.log(
        `[${session.identifier}] Done: ${result.upserted} upserted, ${result.skippedNoVoterId} skipped (no voter_id in export), ` +
          `${result.skippedUntracked} skipped (untracked politician)\n`,
      );
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  console.log("All sessions complete.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
