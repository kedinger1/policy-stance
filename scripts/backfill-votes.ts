import { supabase } from "./lib/supabase";
import { fetchBillsPageForSession, DailyLimitExceededError } from "./lib/openstates";
import { buildVoteRows } from "./lib/vote-rows";
import { loadBackfillState, saveBackfillState } from "./lib/backfill-state";

// Safety margin under OpenStates' actual daily cap, which turned out to be
// 250/day, not the 500/day the dashboard displayed (learned the hard way from
// a live 429). Re-run this script daily (or whenever convenient) to continue —
// progress is saved after every page.
const REQUEST_BUDGET_PER_RUN = 220;

async function run() {
  const state = loadBackfillState();
  if (state.done) {
    console.log("Backfill already complete across all sessions.");
    return;
  }

  const { data: politicians, error: fetchError } = await supabase
    .from("politicians")
    .select("id, openstates_id")
    .not("openstates_id", "is", null);
  if (fetchError) throw fetchError;
  const politicianIdByOpenStatesId = new Map(politicians.map((p) => [p.openstates_id as string, p.id as string]));

  let requestsUsed = 0;
  let totalUpserted = 0;

  while (requestsUsed < REQUEST_BUDGET_PER_RUN) {
    const session = state.sessions[state.sessionIndex];
    if (!session) {
      state.done = true;
      break;
    }

    const { bills, maxPage } = await fetchBillsPageForSession(session, state.page);
    requestsUsed++;

    const { rows, skippedUntrackedVoter } = buildVoteRows(bills, politicianIdByOpenStatesId);
    if (rows.length > 0) {
      const { error } = await supabase.from("votes").upsert(rows, { onConflict: "politician_id,openstates_vote_id" });
      if (error) throw error;
      totalUpserted += rows.length;
    }

    console.log(
      `[${session}] page ${state.page}/${maxPage}: ${bills.length} bills, ${rows.length} vote rows upserted ` +
        `(${skippedUntrackedVoter} untracked voters skipped)`,
    );

    if (state.page >= maxPage) {
      state.sessionIndex++;
      state.page = 1;
      console.log(`Session ${session} complete.`);
    } else {
      state.page++;
    }

    saveBackfillState(state);

    if (state.sessionIndex >= state.sessions.length) {
      state.done = true;
      break;
    }
  }

  console.log(`\nRun complete: ${requestsUsed} requests used, ${totalUpserted} vote rows upserted this run.`);
  if (state.done) {
    console.log("All sessions fully backfilled!");
  } else {
    console.log(
      `Progress saved — resume anytime by re-running this script. ` +
        `Currently at session ${state.sessions[state.sessionIndex]}, page ${state.page}.`,
    );
  }
}

run().catch((err) => {
  if (err instanceof DailyLimitExceededError) {
    console.log(`Hit today's OpenStates quota. Progress is saved — just re-run this script tomorrow to continue.`);
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});
