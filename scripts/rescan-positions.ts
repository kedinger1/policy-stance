import { supabase } from "./lib/supabase";
import { researchPositionsViaCodex } from "./lib/codex";
import { withRetry } from "./lib/retry";

// Re-researches every politician who already has positions -- e.g. after a
// prompt change (like adding a new source to check) that could plausibly
// surface data the original pass missed. Replaces each politician's existing
// positions with the fresh set, same delete-then-insert semantics as ingest-positions.ts.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function run() {
  const { data: positionRows, error: posError } = await supabase.from("positions").select("politician_id");
  if (posError) throw posError;
  const alreadyResearchedIds = [...new Set(positionRows.map((r) => r.politician_id))];

  const { data: politicians, error: pError } = await supabase
    .from("politicians")
    .select("id, full_name, chamber, state")
    .in("id", alreadyResearchedIds)
    .order("full_name");
  if (pError) throw pError;

  console.log(`Rescanning ${politicians.length} politicians...\n`);

  for (const politician of politicians) {
    console.log(`Rescanning ${politician.full_name} via Codex...`);
    const positions = researchPositionsViaCodex(politician.full_name, politician.chamber, politician.state);
    console.log(`Extracted ${positions.length} candidate positions`);

    const rows: {
      politician_id: string;
      topic: string;
      statement_text: string;
      source_type: string;
      source_url: string;
      stated_at: string;
      extraction_confidence: number;
    }[] = [];
    let skippedBadDate = 0;
    for (const p of positions) {
      if (!DATE_RE.test(p.stated_at)) {
        skippedBadDate++;
        continue;
      }
      rows.push({
        politician_id: politician.id,
        topic: p.topic,
        statement_text: p.statement_text,
        source_type: p.source_type,
        source_url: p.source_url,
        stated_at: p.stated_at,
        extraction_confidence: p.confidence,
      });
    }
    if (skippedBadDate > 0) {
      console.log(`Skipped ${skippedBadDate} positions with unparseable dates`);
    }

    await withRetry(async () => {
      const { error } = await supabase.from("positions").delete().eq("politician_id", politician.id);
      if (error) throw error;
    });

    if (rows.length > 0) {
      await withRetry(async () => {
        const { error } = await supabase.from("positions").insert(rows);
        if (error) throw error;
      });
    }
    console.log(`Inserted ${rows.length} positions for ${politician.full_name}\n`);
  }

  console.log("Done.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
