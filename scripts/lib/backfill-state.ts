import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

// Local, gitignored — mutable run state for the multi-day vote backfill.
// Newest session first: most relevant/recent data lands sooner rather than
// waiting for the full ~2-week backfill to complete before anything is usable.
const STATE_PATH = path.join(process.cwd(), ".vote-backfill-state.json");

export type BackfillState = {
  sessions: string[];
  sessionIndex: number;
  page: number;
  done: boolean;
};

const DEFAULT_STATE: BackfillState = {
  sessions: ["2025-2026", "2023-2024", "2021-2022", "2019-2020"],
  sessionIndex: 0,
  page: 1,
  done: false,
};

export function loadBackfillState(): BackfillState {
  if (!existsSync(STATE_PATH)) return { ...DEFAULT_STATE };
  return JSON.parse(readFileSync(STATE_PATH, "utf-8"));
}

export function saveBackfillState(state: BackfillState): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}
