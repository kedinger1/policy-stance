import { supabase } from "./lib/supabase";
import { researchPositionsViaCodex } from "./lib/codex";

// How many additional politicians (beyond ones already researched) to process this run.
const BATCH_SIZE = 10;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function run() {
  const { data: existing, error: existingError } = await supabase.from("positions").select("politician_id");
  if (existingError) throw existingError;
  const alreadyResearched = [...new Set(existing.map((row) => row.politician_id))];

  let query = supabase.from("politicians").select("id, full_name, chamber, state").order("full_name").limit(BATCH_SIZE);
  if (alreadyResearched.length > 0) {
    query = query.not("id", "in", `(${alreadyResearched.join(",")})`);
  }
  const { data: politicians, error } = await query;
  if (error) throw error;

  for (const politician of politicians) {
    console.log(`Researching ${politician.full_name} via Codex...`);
    const positions = researchPositionsViaCodex(politician.full_name, politician.chamber, politician.state);
    console.log(`Extracted ${positions.length} candidate positions`);

    const rows = [];
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

    // Dev-loop convenience: clear this politician's prior extraction before inserting the fresh one.
    const { error: deleteError } = await supabase.from("positions").delete().eq("politician_id", politician.id);
    if (deleteError) throw deleteError;

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("positions").insert(rows);
      if (insertError) throw insertError;
    }
    console.log(`Inserted ${rows.length} positions for ${politician.full_name}`);
  }

  console.log("Done.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
