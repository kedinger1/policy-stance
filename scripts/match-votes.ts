import { supabase } from "./lib/supabase";
import { tagVoteTopics, classifyMatches, type MatchCandidate } from "./lib/codex";

// Below this confidence, a match still gets recorded but flagged for human review
// rather than auto-published.
const CONFIDENCE_THRESHOLD = 0.75;

// Below this relevance (1-10), a topically-tagged bill is treated as too tangential
// to be a meaningful test of a position — excluded before it ever reaches judgment.
const RELEVANCE_THRESHOLD = 6;

async function run() {
  const { data: politicianIdsWithPositions, error: posError } = await supabase.from("positions").select("politician_id");
  if (posError) throw posError;
  const withPositions = [...new Set(politicianIdsWithPositions.map((r) => r.politician_id))];

  // Votes is a large table (9,730+ rows) — fetching every row just to find distinct
  // politician_ids risks PostgREST's default row cap silently truncating the result.
  // Check per-politician instead, same safe pattern as check-vote-scope.ts.
  const targetIds: string[] = [];
  for (const id of withPositions) {
    const { count, error: voteCountError } = await supabase
      .from("votes")
      .select("*", { count: "exact", head: true })
      .eq("politician_id", id);
    if (voteCountError) throw voteCountError;
    if (count && count > 0) targetIds.push(id);
  }

  const { data: politicians, error: pError } = await supabase.from("politicians").select("id, full_name").in("id", targetIds);
  if (pError) throw pError;

  let totalVotes = 0;
  let totalTagged = 0;
  let totalMatched = 0;

  for (const politician of politicians) {
    console.log(`\n=== ${politician.full_name} ===`);
    const { data: votes, error: votesError } = await supabase
      .from("votes")
      .select("id, bill_title, vote_value, voted_at")
      .eq("politician_id", politician.id);
    if (votesError) throw votesError;
    totalVotes += votes.length;

    const labeledVotes = votes.map((v, i) => ({ label: `v${i}`, billTitle: v.bill_title, vote: v }));
    const tagByLabel = tagVoteTopics(labeledVotes.map(({ label, billTitle }) => ({ label, billTitle })));

    const taggedVotes = labeledVotes.filter(({ label }) => tagByLabel[label].topic !== null);
    const relevantVotes = taggedVotes.filter(({ label }) => tagByLabel[label].relevance >= RELEVANCE_THRESHOLD);
    totalTagged += relevantVotes.length;
    console.log(
      `${votes.length} votes, ${taggedVotes.length} tagged with a tracked topic, ` +
        `${relevantVotes.length} relevant enough (>=${RELEVANCE_THRESHOLD}/10) to actually test`,
    );

    // For each topically-tagged vote, find the most recent position on that topic
    // as of the vote date — a plain lookup, no AI needed for this part.
    const candidates: Array<{ label: string; voteId: string; topic: string; positionId: string; matchCandidate: MatchCandidate }> = [];
    let idx = 0;
    for (const { label, vote } of relevantVotes) {
      const topic = tagByLabel[label].topic as string;
      const { data: position, error: positionError } = await supabase
        .from("positions")
        .select("id, statement_text, stated_at")
        .eq("politician_id", politician.id)
        .eq("topic", topic)
        .lte("stated_at", vote.voted_at)
        .order("stated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (positionError) throw positionError;
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
          voteValue: vote.vote_value,
          positionStatement: position.statement_text,
          positionDate: position.stated_at,
        },
      });
    }

    console.log(`${candidates.length} votes had a prior position on the same topic to check against`);
    totalMatched += candidates.length;

    if (candidates.length === 0) {
      await supabase.from("matches").delete().eq("politician_id", politician.id);
      continue;
    }

    const judgments = classifyMatches(candidates.map((c) => c.matchCandidate));

    const rows = candidates.map((c) => {
      const judgment = judgments[c.label];
      const status = judgment.confidence >= CONFIDENCE_THRESHOLD ? "ai_matched" : "needs_review";
      return {
        politician_id: politician.id,
        position_id: c.positionId,
        vote_id: c.voteId,
        topic: c.topic,
        classification: judgment.classification,
        rationale: judgment.rationale,
        confidence: judgment.confidence,
        status,
      };
    });

    const { error: deleteError } = await supabase.from("matches").delete().eq("politician_id", politician.id);
    if (deleteError) throw deleteError;

    const { error: insertError } = await supabase.from("matches").insert(rows);
    if (insertError) throw insertError;
    console.log(`Inserted ${rows.length} matches for ${politician.full_name}`);
  }

  console.log(`\nDone. ${totalVotes} votes scanned, ${totalTagged} topically tagged, ${totalMatched} matched against a prior position.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
