import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import { supabase } from "./lib/supabase";
import type { VoteRow } from "./lib/vote-rows";

// Public, unauthenticated bulk exports -- no API key, no rate limit. Far faster
// and more reliable than paginating the live API for closed historical sessions
// (per OpenStates: monthly-refreshed, so not ideal for the still-open session
// between refreshes -- keep using ingest-votes.ts for that one's day-to-day top-ups).
const SESSIONS = [
  { identifier: "2025-2026", url: "https://data.openstates.org/csv/latest/NY_2025-2026_csv_1ZC9XOeLy28LfCuj12GFBA.zip" },
  { identifier: "2023-2024", url: "https://data.openstates.org/csv/latest/NY_2023-2024_csv_2JUIuQ57UGKUJ0di0KC4w7.zip" },
  { identifier: "2021-2022", url: "https://data.openstates.org/csv/latest/NY_2021-2022_csv_1i36qUkzrbr6jNLjFrdisY.zip" },
  { identifier: "2019-2020", url: "https://data.openstates.org/csv/latest/NY_2019-2020_csv_OiJvES2l2q9g8qRZJhAqF.zip" },
];

const UPSERT_BATCH_SIZE = 2000;

type CsvRow = Record<string, string>;

function readCsv(csvDir: string, sessionId: string, name: string): CsvRow[] {
  const filePath = path.join(csvDir, `NY_${sessionId}_${name}.csv`);
  return parse(readFileSync(filePath, "utf-8"), { columns: true, skip_empty_lines: true });
}

async function downloadAndExtract(url: string, identifier: string, workDir: string): Promise<string> {
  console.log(`[${identifier}] Downloading...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${identifier}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const zipPath = path.join(workDir, `${identifier}.zip`);
  writeFileSync(zipPath, buffer);

  console.log(`[${identifier}] Extracting (${Math.round(buffer.byteLength / 1024 / 1024)}MB)...`);
  const extractDir = path.join(workDir, identifier);
  new AdmZip(zipPath).extractAllTo(extractDir, true);
  return path.join(extractDir, "NY", identifier);
}

async function processSession(
  identifier: string,
  url: string,
  workDir: string,
  politicianIdByOpenStatesId: Map<string, string>,
): Promise<{ upserted: number; skippedNoVoterId: number; skippedUntracked: number }> {
  const csvDir = await downloadAndExtract(url, identifier, workDir);

  const bills = readCsv(csvDir, identifier, "bills");
  const billById = new Map(bills.map((b) => [b.id, { identifier: b.identifier, title: b.title }]));

  const votes = readCsv(csvDir, identifier, "votes");
  const voteById = new Map(votes.map((v) => [v.id, { bill_id: v.bill_id, start_date: v.start_date }]));

  const votePeople = readCsv(csvDir, identifier, "vote_people");
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
