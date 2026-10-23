import { createHash } from "node:crypto";
import { supabase, fetchAllRows } from "./lib/supabase";
import { tagVoteTopics, classifyMatches, type MatchCandidate } from "./lib/codex";
import { withRetry } from "./lib/retry";

// Below this confidence, a match still gets recorded but flagged for human review
// rather than auto-published.
const CONFIDENCE_THRESHOLD = 0.75;

// Below this relevance (1-10), a topically-tagged bill is treated as too tangential
// to be a meaningful test of a position — excluded before it ever reaches judgment.
const RELEVANCE_THRESHOLD = 6;

// With years of history now loaded (some politicians have 15,000+ votes), cap how
// far back we look per politician and chunk every Codex call — one prompt with
// thousands of bill titles isn't workable. Recent votes are also the ones most
// likely to have a matching position anyway, since position data skews recent.
const VOTE_CAP_PER_POLITICIAN = 1000;
const TAG_BATCH_SIZE = 300;
const CLASSIFY_BATCH_SIZE = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// vote_tags cache, keyed by a hash of exactly what the tagger sees (title + summary),
// so identical bills share one tag across legislators and runs, and a bill that later
// gains a summary is re-tagged automatically.
const tagCache = new Map<string, { topic: string | null; relevance: number }>();
const textKey = (title: string, summary: string | null) => createHash("sha256").update(`${title}\n${summary ?? ""}`).digest("hex");

async function loadCachedTags(keys: string[]) {
  const missing = keys.filter((k) => !tagCache.has(k));
  // 64-char keys in a URL: keep chunks small enough to stay well under header limits.
  for (const batch of chunk(missing, 100)) {
    const rows = await withRetry(async () => {
      const { data, error } = await supabase.from("vote_tags").select("text_key, topic, relevance").in("text_key", batch);
      if (error) throw error;
      return data;
    });
    for (const r of rows) tagCache.set(r.text_key, { topic: r.topic, relevance: r.relevance });
  }
}

async function run() {
  const politicianIdsWithPositions = await withRetry(() =>
    fetchAllRows((from, to) => supabase.from("positions").select("politician_id").range(from, to)),
  );
  const withPositions = [...new Set(politicianIdsWithPositions.map((r) => r.politician_id))];

  // Votes is a large table (9,730+ rows) — fetching every row just to find distinct
  // politician_ids risks PostgREST's default row cap silently truncating the result.
  // Check per-politician instead, same safe pattern as check-vote-scope.ts.
  const targetIds: string[] = [];
  for (const id of withPositions) {
    const count = await withRetry(async () => {
      const { count, error } = await supabase.from("votes").select("*", { count: "exact", head: true }).eq("politician_id", id);
      if (error) throw error;
      return count;
    });
    if (count && count > 0) targetIds.push(id);
  }

  const politicians = await withRetry(async () => {
    const { data, error } = await supabase.from("politicians").select("id, full_name").in("id", targetIds);
    if (error) throw error;
    return data;
  });

  let totalVotes = 0;
  let totalTagged = 0;
  let totalMatched = 0;

  // Resume support: this run is long and quota-hungry, so after an interruption
  // (usage limit, closed laptop) pass --since=<ISO date> to skip anyone whose matches
  // were already refreshed on or after that time, instead of redoing them.
  const since = process.argv.find((a) => a.startsWith("--since="))?.slice("--since=".length);

  for (const politician of politicians) {
    if (since) {
      const latest = await withRetry(async () => {
        const { data, error } = await supabase
          .from("matches")
          .select("created_at")
          .eq("politician_id", politician.id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) throw error;
        return data[0]?.created_at as string | undefined;
      });
      if (latest && latest >= since) {
        console.log(`\n=== ${politician.full_name} === already refreshed since ${since}, skipping`);
        continue;
      }
    }
    console.log(`\n=== ${politician.full_name} ===`);
    const votes = await withRetry(async () => {
      const { data, error } = await supabase
        .from("votes")
        .select("id, bill_title, bill_summary, openstates_bill_id, vote_value, voted_at")
        .eq("politician_id", politician.id)
        .order("voted_at", { ascending: false })
        .limit(VOTE_CAP_PER_POLITICIAN);
      if (error) throw error;
      return data;
    });
    totalVotes += votes.length;

    const labeledVotes = votes.map((v, i) => ({ label: `v${i}`, billTitle: v.bill_title, billSummary: v.bill_summary, vote: v }));

    // Tags come from the vote_tags cache (shared across legislators and across runs);
    // only bill texts never seen before are sent to the AI, and each batch is saved
    // as it completes so an interrupted run keeps its progress.
    const keyOf = new Map(labeledVotes.map((l) => [l.label, textKey(l.billTitle, l.billSummary)]));
    await loadCachedTags([...new Set(keyOf.values())]);

    const seen = new Set<string>();
    const toTag = labeledVotes.filter((l) => {
      const key = keyOf.get(l.label) as string;
      if (tagCache.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    console.log(`  ${labeledVotes.length - toTag.length} of ${labeledVotes.length} votes already tagged (cache), ${toTag.length} new bill texts to tag`);

    let tagged = 0;
    for (const batch of chunk(toTag, TAG_BATCH_SIZE)) {
      const result = tagVoteTopics(batch.map(({ label, billTitle, billSummary }) => ({ label, billTitle, billSummary })));
      const rows = batch.flatMap(({ label }) =>
        result[label]
          ? [{ text_key: keyOf.get(label) as string, topic: result[label].topic, relevance: result[label].relevance }]
          : [],
      );
      if (rows.length < batch.length) console.log(`  warning: AI returned no tag for ${batch.length - rows.length} of ${batch.length}; they'll be retried next run`);
      await withRetry(async () => {
        const { error } = await supabase.from("vote_tags").upsert(rows, { onConflict: "text_key" });
        if (error) throw error;
      });
      for (const r of rows) tagCache.set(r.text_key, { topic: r.topic, relevance: r.relevance });
      tagged += batch.length;
      console.log(`  tagged ${tagged}/${toTag.length} new`);
    }

    const tagByLabel: Record<string, { topic: string | null; relevance: number }> = {};
    for (const { label } of labeledVotes) {
      tagByLabel[label] = tagCache.get(keyOf.get(label) as string) ?? { topic: null, relevance: 1 };
    }

    const taggedVotes = labeledVotes.filter(({ label }) => tagByLabel[label].topic !== null);
    const relevantVotes = taggedVotes.filter(({ label }) => tagByLabel[label].relevance >= RELEVANCE_THRESHOLD);
    totalTagged += relevantVotes.length;
    console.log(
      `${votes.length} votes, ${taggedVotes.length} tagged with a tracked topic, ` +
        `${relevantVotes.length} relevant enough (>=${RELEVANCE_THRESHOLD}/10) to actually test`,
    );

    // Only statements are anchors here -- sponsored bills are deeds, like votes, so
    // comparing a vote against one is deed-vs-deed, not the say-vs-do test this
    // score claims to be. (Fetch this politician's statements once and index by
    // topic, sorted newest first, then look up "most recent as of the vote date" in memory
    // for every candidate — a relevantVotes.length round-trip to Supabase per
    // vote (hundreds, now that votes are capped at 1,000/politician instead of
    // ~46) is both slow and fragile to any single transient network hiccup.)
    const politicianPositions = await withRetry(async () => {
      const { data, error } = await supabase
        .from("positions")
        .select("id, topic, statement_text, stated_at")
        .eq("politician_id", politician.id)
        .neq("source_type", "bill_sponsorship");
      if (error) throw error;
      return data;
    });

    const positionsByTopic = new Map<string, { id: string; statement_text: string; stated_at: string }[]>();
    for (const p of politicianPositions) {
      const list = positionsByTopic.get(p.topic) ?? [];
      list.push(p);
      positionsByTopic.set(p.topic, list);
    }
    for (const list of positionsByTopic.values()) list.sort((a, b) => (a.stated_at < b.stated_at ? 1 : -1));

    function findPositionAsOf(topic: string, voteDate: string) {
      return positionsByTopic.get(topic)?.find((p) => p.stated_at <= voteDate);
    }

    const candidates: Array<{ label: string; voteId: string; topic: string; positionId: string; matchCandidate: MatchCandidate }> = [];
    let idx = 0;
    for (const { label, vote } of relevantVotes) {
      const topic = tagByLabel[label].topic as string;
      const position = findPositionAsOf(topic, vote.voted_at);
      if (!position) continue;

      const matchLabel = `m${idx++}`;
      candidates.push({
        label: matchLabel,
        voteId: vote.id,
        topic,
        positionId: position.id,
        matchCandidate: {
          label: matchLabel,
          billTitle: vote.bill_title,
          billSummary: vote.bill_summary,
          voteValue: vote.vote_value,
          positionStatement: position.statement_text,
          positionDate: position.stated_at,
        },
      });
    }

    console.log(`${candidates.length} votes had a prior position on the same topic to check against`);
    totalMatched += candidates.length;

    if (candidates.length === 0) {
      await withRetry(async () => {
        const { error } = await supabase.from("matches").delete().eq("politician_id", politician.id);
        if (error) throw error;
      });
      continue;
    }

    const judgments: Record<string, Awaited<ReturnType<typeof classifyMatches>>[string]> = {};
    for (const batch of chunk(candidates, CLASSIFY_BATCH_SIZE)) {
      Object.assign(judgments, classifyMatches(batch.map((c) => c.matchCandidate)));
      console.log(`  classified ${Object.keys(judgments).length}/${candidates.length}`);
    }

    // Decisions a person already made (confirmed or overridden) must survive a re-run:
    // this script replaces a politician's matches wholesale, which would otherwise wipe
    // every review. Carry them forward onto the same statement-and-vote pair.
    const reviewed = await withRetry(async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("position_id, vote_id, classification, status, reviewed_by, reviewed_at")
        .eq("politician_id", politician.id)
        .in("status", ["human_confirmed", "human_overridden"]);
      if (error) throw error;
      return data;
    });
    const reviewedByPair = new Map(reviewed.map((r) => [`${r.position_id}|${r.vote_id}`, r]));

    const rows = candidates.map((c) => {
      const judgment = judgments[c.label];
      // A "broken" verdict is an accusation about a named person, so it is always held
      // for a human to confirm before it can count or be shown as a contradiction,
      // however confident the AI is. Everything else auto-publishes above the threshold.
      const status =
        judgment.classification === "broken" || judgment.confidence < CONFIDENCE_THRESHOLD ? "needs_review" : "ai_matched";
      const base = {
        politician_id: politician.id,
        position_id: c.positionId,
        vote_id: c.voteId,
        topic: c.topic,
        classification: judgment.classification,
        rationale: judgment.rationale,
        confidence: judgment.confidence,
        status,
        reviewed_by: null as string | null,
        reviewed_at: null as string | null,
      };
      const prior = reviewedByPair.get(`${c.positionId}|${c.voteId}`);
      return prior
        ? { ...base, classification: prior.classification, status: prior.status, reviewed_by: prior.reviewed_by, reviewed_at: prior.reviewed_at }
        : base;
    });

    await withRetry(async () => {
      const { error } = await supabase.from("matches").delete().eq("politician_id", politician.id);
      if (error) throw error;
    });

    await withRetry(async () => {
      const { error } = await supabase.from("matches").insert(rows);
      if (error) throw error;
    });
    console.log(`Inserted ${rows.length} matches for ${politician.full_name}`);
  }

  console.log(`\nDone. ${totalVotes} votes scanned, ${totalTagged} topically tagged, ${totalMatched} matched against a prior position.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
