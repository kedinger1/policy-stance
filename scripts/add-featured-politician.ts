import { supabase } from "./lib/supabase";
import { researchPositionsViaCodex } from "./lib/codex";

// One-off additions of well-known (federal) politicians for demo relatability —
// distinct from the main NY state-legislature ingest pipeline. These won't have
// a scoreable votes record yet: `votes` only covers OpenStates' state-legislature
// data, and federal roll calls (ProPublica Congress API or similar) aren't ingested.
const FEATURED = {
  full_name: "Alexandria Ocasio-Cortez",
  state: "NY",
  chamber: "us_house",
  district: "NY-14",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function run() {
  const { data: existing, error: findError } = await supabase
    .from("politicians")
    .select("id")
    .eq("full_name", FEATURED.full_name)
    .maybeSingle();
  if (findError) throw findError;

  let politicianId = existing?.id as string | undefined;
  if (!politicianId) {
    const { data: inserted, error: insertError } = await supabase
      .from("politicians")
      .insert({ full_name: FEATURED.full_name, state: FEATURED.state, chamber: FEATURED.chamber, district: FEATURED.district })
      .select("id")
      .single();
    if (insertError) throw insertError;
    politicianId = inserted.id;
  }

  console.log(`Researching ${FEATURED.full_name} via Codex...`);
  const positions = researchPositionsViaCodex(FEATURED.full_name, FEATURED.chamber, FEATURED.state);
  console.log(`Extracted ${positions.length} candidate positions`);

  const rows = [];
  let skippedBadDate = 0;
  for (const p of positions) {
    if (!DATE_RE.test(p.stated_at)) {
      skippedBadDate++;
      continue;
    }
    rows.push({
      politician_id: politicianId,
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

  const { error: deleteError } = await supabase.from("positions").delete().eq("politician_id", politicianId);
  if (deleteError) throw deleteError;

  if (rows.length > 0) {
    const { error: insertPosError } = await supabase.from("positions").insert(rows);
    if (insertPosError) throw insertPosError;
  }
  console.log(`Inserted ${rows.length} positions for ${FEATURED.full_name}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
