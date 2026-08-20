import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { supabase, fetchAllRows } from "./lib/supabase";
import { SESSIONS, downloadAndExtractSession, readSessionCsv } from "./lib/openstates-bulk";
import { tagVoteTopics } from "./lib/codex";
import { withRetry } from "./lib/retry";

// Same threshold used for vote-to-position matching -- a bill's topic label alone
// doesn't mean sponsoring it is a meaningful statement on that topic.
const RELEVANCE_THRESHOLD = 6;
const TAG_BATCH_SIZE = 300;
const UPSERT_BATCH_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

type PositionRow = {
  politician_id: string;
  topic: string;
  statement_text: string;
  source_type: "bill_sponsorship";
  source_url: string | null;
  stated_at: string;
  extraction_confidence: number;
  source_bill_id: string;
};

async function processSession(
  identifier: string,
  url: string,
  workDir: string,
  politicianIdByOpenStatesId: Map<string, string>,
): Promise<number> {
  const csvDir = await downloadAndExtractSession(url, identifier, workDir);

  const bills = readSessionCsv(csvDir, identifier, "bills");
  const billById = new Map(bills.map((b) => [b.id, { identifier: b.identifier, title: b.title }]));

  const abstracts = readSessionCsv(csvDir, identifier, "bill_abstracts");
  const abstractByBillId = new Map(abstracts.map((a) => [a.bill_id, a.abstract]));

  // No date field on a sponsorship itself -- the bill's earliest recorded action
  // (introduction) is the closest real-world date for "this became a public stance".
  const actions = readSessionCsv(csvDir, identifier, "bill_actions");
  const earliestActionByBillId = new Map<string, string>();
  for (const a of actions) {
    if (!a.date) continue;
    const prev = earliestActionByBillId.get(a.bill_id);
    if (!prev || a.date < prev) earliestActionByBillId.set(a.bill_id, a.date);
  }

  // Prefer a link to the actual bill text (PDF); fall back to whatever official
  // source OpenStates recorded. Both are real URLs from the export, never guessed.
  const versions = readSessionCsv(csvDir, identifier, "bill_versions");
  const billIdByVersionId = new Map(versions.map((v) => [v.id, v.bill_id]));
  const urlByBillId = new Map<string, string>();
  for (const link of readSessionCsv(csvDir, identifier, "bill_version_links")) {
    const billId = billIdByVersionId.get(link.version_id);
    if (!billId) continue;
    if (!urlByBillId.has(billId) || link.media_type === "application/pdf") urlByBillId.set(billId, link.url);
  }
  for (const s of readSessionCsv(csvDir, identifier, "bill_sources")) {
    if (!urlByBillId.has(s.bill_id)) urlByBillId.set(s.bill_id, s.url);
  }

  const sponsorships = readSessionCsv(csvDir, identifier, "bill_sponsorships");
  const primarySponsorships = sponsorships.filter(
    (s) => s.classification === "primary" && politicianIdByOpenStatesId.has(s.person_id),
  );
  console.log(`[${identifier}] ${primarySponsorships.length} primary sponsorships by tracked politicians`);

  type Candidate = {
    politicianId: string;
    billIdentifier: string;
    title: string;
    summary: string | null;
    statedAt: string;
    sourceUrl: string | null;
    name: string;
  };

  const candidates: Candidate[] = [];
  for (const s of primarySponsorships) {
    const bill = billById.get(s.bill_id);
    if (!bill) continue;
    const statedAt = earliestActionByBillId.get(s.bill_id);
    if (!statedAt) continue; // can't place an undated bill on the position timeline
    candidates.push({
      politicianId: politicianIdByOpenStatesId.get(s.person_id) as string,
      billIdentifier: bill.identifier,
      title: bill.title,
      summary: abstractByBillId.get(s.bill_id) ?? null,
      statedAt,
      sourceUrl: urlByBillId.get(s.bill_id) ?? null,
      name: s.name,
    });
  }
  console.log(`[${identifier}] ${candidates.length} datable candidates`);

  const labeled = candidates.map((c, i) => ({ label: `s${i}`, billTitle: c.title, billSummary: c.summary }));
  const tagByLabel: Record<string, { topic: string | null; relevance: number }> = {};
  for (const batch of chunk(labeled, TAG_BATCH_SIZE)) {
    Object.assign(tagByLabel, tagVoteTopics(batch));
    console.log(`[${identifier}]   tagged ${Object.keys(tagByLabel).length}/${labeled.length}`);
  }

  const rows: PositionRow[] = [];
  candidates.forEach((c, i) => {
    const tag = tagByLabel[`s${i}`];
    if (!tag.topic || tag.relevance < RELEVANCE_THRESHOLD) return;
    rows.push({
      politician_id: c.politicianId,
      topic: tag.topic,
      statement_text:
        `${c.name} is the primary sponsor of ${c.billIdentifier} ("${c.title}")` + (c.summary ? ` — ${c.summary}` : "") + ".",
      source_type: "bill_sponsorship",
      source_url: c.sourceUrl,
      stated_at: c.statedAt,
      extraction_confidence: 1,
      source_bill_id: c.billIdentifier,
    });
  });
  console.log(`[${identifier}] ${rows.length} relevant enough (>=${RELEVANCE_THRESHOLD}/10) to record as positions`);

  for (const batch of chunk(rows, UPSERT_BATCH_SIZE)) {
    await withRetry(async () => {
      const { error } = await supabase.from("positions").upsert(batch, { onConflict: "politician_id,source_bill_id" });
      if (error) throw error;
    });
  }

  return rows.length;
}

async function run() {
  // Same pilot scope as match-votes.ts -- politicians already in the program,
  // not the full 213-member legislature yet.
  const positionRows = await withRetry(() =>
    fetchAllRows((from, to) => supabase.from("positions").select("politician_id").range(from, to)),
  );
  const pilotIds = new Set(positionRows.map((r) => r.politician_id));

  const { data: politicians, error } = await withRetry(async () => {
    const res = await supabase.from("politicians").select("id, openstates_id").not("openstates_id", "is", null);
    if (res.error) throw res.error;
    return res;
  });
  if (error) throw error;

  const politicianIdByOpenStatesId = new Map(
    politicians.filter((p) => pilotIds.has(p.id)).map((p) => [p.openstates_id as string, p.id as string]),
  );
  console.log(`Tracking ${politicianIdByOpenStatesId.size} pilot politicians for sponsorship-based positions.\n`);

  const workDir = mkdtempSync(path.join(tmpdir(), "openstates-sponsorships-"));
  let total = 0;
  try {
    for (const session of SESSIONS) {
      total += await processSession(session.identifier, session.url, workDir, politicianIdByOpenStatesId);
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  console.log(`\nDone. ${total} sponsorship-based positions recorded across all sessions.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
