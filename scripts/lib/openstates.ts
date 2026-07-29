import { env } from "./env";

const BASE_URL = "https://v3.openstates.org";

// Free tier caps at 10 requests/min; stay comfortably under that.
const MIN_REQUEST_INTERVAL_MS = 6500;
let lastRequestAt = 0;

async function throttle(): Promise<void> {
  const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

export class DailyLimitExceededError extends Error {}

async function openStatesGet<T>(pathAndQuery: string, retriesLeft = 8): Promise<T> {
  await throttle();
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${pathAndQuery}`, {
      headers: { "X-API-KEY": env.openStatesApiKey },
    });
  } catch (err) {
    // A rejected fetch (dropped connection, DNS blip, reset socket) is a network-level
    // failure, not an HTTP status — needs its own retry path, not just the res.status checks below.
    if (retriesLeft > 0) {
      console.log(`Network error (${(err as Error).message}), retrying in 10s (${retriesLeft} attempt(s) left)...`);
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      return openStatesGet<T>(pathAndQuery, retriesLeft - 1);
    }
    throw err;
  }
  if (res.status === 429) {
    const body = await res.text();
    // A per-minute rate limit is worth waiting out; a daily cap is not —
    // retrying just burns more attempts (and possibly more quota) for nothing.
    if (/per day|\/day/i.test(body)) {
      throw new DailyLimitExceededError(body);
    }
    if (retriesLeft > 0) {
      const retryAfterMs = Number(res.headers.get("retry-after")) * 1000 || 65_000;
      console.log(`Rate limited, waiting ${Math.round(retryAfterMs / 1000)}s before retrying...`);
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
      return openStatesGet<T>(pathAndQuery, retriesLeft - 1);
    }
    throw new Error(`OpenStates request failed (429): ${body}`);
  }
  // 5xx (e.g. a transient 502) is the server's problem, not ours — worth a short
  // retry rather than aborting an unattended multi-hour run over one hiccup.
  if (res.status >= 500 && retriesLeft > 0) {
    console.log(`Server error ${res.status}, retrying in 10s (${retriesLeft} attempt(s) left)...`);
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    return openStatesGet<T>(pathAndQuery, retriesLeft - 1);
  }
  if (!res.ok) {
    throw new Error(`OpenStates request failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

type Paginated<T> = {
  results: T[];
  pagination: { page: number; max_page: number };
};

export type OrgClassification = "upper" | "lower";

export type OpenStatesPerson = {
  id: string;
  name: string;
  current_role: {
    title: string;
    org_classification: OrgClassification;
    district: string;
  } | null;
};

export async function fetchNyLegislators(orgClassification: OrgClassification): Promise<OpenStatesPerson[]> {
  const results: OpenStatesPerson[] = [];
  let page = 1;
  for (;;) {
    const data = await openStatesGet<Paginated<OpenStatesPerson>>(
      `/people?jurisdiction=New%20York&org_classification=${orgClassification}&per_page=20&page=${page}`,
    );
    results.push(...data.results);
    if (page >= data.pagination.max_page) break;
    page++;
  }
  return results;
}

export type OpenStatesVoteOption = {
  option: string;
  voter: { id: string } | null;
};

export type OpenStatesRollCall = {
  id: string;
  start_date: string;
  motion_text: string;
  votes: OpenStatesVoteOption[];
};

export type OpenStatesBill = {
  id: string;
  identifier: string;
  title: string;
  classification: string[];
  votes: OpenStatesRollCall[];
};

// maxPages caps how far back we page through "most recently updated" bills.
// Raise this once the pipeline is validated; kept small during development
// against OpenStates' free-tier daily request limit.
export async function fetchRecentNyBillsWithVotes(maxPages = 5): Promise<OpenStatesBill[]> {
  const results: OpenStatesBill[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await openStatesGet<Paginated<OpenStatesBill>>(
      `/bills?jurisdiction=New%20York&sort=updated_desc&per_page=20&page=${page}&include=votes`,
    );
    results.push(...data.results);
    if (page >= data.pagination.max_page) break;
  }
  return results;
}

// Single-page fetch for a specific legislative session, for resumable
// multi-day backfills that must track exactly which page they left off on
// (per_page is hard-capped at 20 by the API regardless of what's requested).
export async function fetchBillsPageForSession(
  session: string,
  page: number,
): Promise<{ bills: OpenStatesBill[]; maxPage: number }> {
  const data = await openStatesGet<Paginated<OpenStatesBill>>(
    `/bills?jurisdiction=New%20York&session=${session}&per_page=20&page=${page}&include=votes`,
  );
  return { bills: data.results, maxPage: data.pagination.max_page };
}
