import { supabase } from "./lib/supabase";
import { generateTopicStances, type StanceCandidate } from "./lib/codex";
import { formatTopicLabel } from "./lib/topics";
import { withRetry } from "./lib/retry";

// Below this many positions on a topic, a synthesized summary doesn't add much
// over just reading the position(s) directly -- skip and let the raw quote show.
const MIN_POSITIONS_FOR_SUMMARY = 3;

// Bounds prompt size for prolific bill sponsors; most recent positions are the
// most representative of where someone currently stands anyway.
const MAX_POSITIONS_PER_TOPIC = 40;

const STANCE_BATCH_SIZE = 10;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function run() {
  const { data: politicians, error } = await withRetry(async () => {
    const res = await supabase.from("politicians").select("id, full_name");
    if (res.error) throw res.error;
    return res;
  });
  if (error) throw error;

  const candidates: Array<{ label: string; politicianId: string; topic: string; candidate: StanceCandidate }> = [];
  let idx = 0;

  for (const politician of politicians) {
    const { data: positions, error: posError } = await withRetry(async () => {
      const res = await supabase
        .from("positions")
        .select("topic, statement_text, stated_at")
        .eq("politician_id", politician.id)
        .order("stated_at", { ascending: false });
      if (res.error) throw res.error;
      return res;
    });
    if (posError) throw posError;
    if (positions.length === 0) continue;

    const byTopic = new Map<string, { statement_text: string; stated_at: string }[]>();
    for (const p of positions) {
      const list = byTopic.get(p.topic) ?? [];
      list.push(p);
      byTopic.set(p.topic, list);
    }

    for (const [topic, topicPositions] of byTopic) {
      if (topicPositions.length < MIN_POSITIONS_FOR_SUMMARY) continue;
      const label = `t${idx++}`;
      candidates.push({
        label,
        politicianId: politician.id,
        topic,
        candidate: {
          label,
          politicianName: politician.full_name,
          topicLabel: formatTopicLabel(topic),
          positions: topicPositions
            .slice(0, MAX_POSITIONS_PER_TOPIC)
            .map((p) => ({ statementText: p.statement_text, statedAt: p.stated_at })),
        },
      });
    }
  }

  console.log(`${candidates.length} politician-topic pairs with enough positions (>=${MIN_POSITIONS_FOR_SUMMARY}) to summarize.`);

  const summaryByLabel: Record<string, string> = {};
  for (const batch of chunk(candidates, STANCE_BATCH_SIZE)) {
    Object.assign(summaryByLabel, generateTopicStances(batch.map((c) => c.candidate)));
    console.log(`  ${Object.keys(summaryByLabel).length}/${candidates.length} summarized`);
  }

  const rows = candidates.map((c) => ({
    politician_id: c.politicianId,
    topic: c.topic,
    summary: summaryByLabel[c.label],
  }));

  await withRetry(async () => {
    const { error: upsertError } = await supabase.from("topic_stances").upsert(rows, { onConflict: "politician_id,topic" });
    if (upsertError) throw upsertError;
  });

  console.log(`\nDone. ${rows.length} topic stance summaries written.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
