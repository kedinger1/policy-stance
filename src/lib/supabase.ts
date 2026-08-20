import { createClient } from "@supabase/supabase-js";

// Anon key only — safe for server components and any future client-side use.
// RLS (supabase/migrations/0003_enable_rls.sql) restricts this to read-only.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// PostgREST silently caps an unfiltered/unpaginated select at 1000 rows — this
// has bitten the app more than once as tables grew past that line. Any query
// not scoped by a specific id (politician_id, etc.) should go through this.
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

// A large .in("id", [...]) list gets encoded into the request URL — PostgREST
// (via Supabase JS's GET-based select) hits a ~16KB header limit well before
// any row-count cap, once a politician has hundreds of matched votes. Chunk the
// id list across multiple requests instead of one huge one.
export async function fetchRowsForIds<T>(
  ids: string[],
  fetchChunk: (idsChunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const CHUNK_SIZE = 150;
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const { data, error } = await fetchChunk(ids.slice(i, i + CHUNK_SIZE));
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}
