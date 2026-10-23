import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

// One shared reviewer password, kept in the ADMIN_PASSWORD env var (never in source).
// Good enough for a single reviewer on a low-traffic pilot; real per-user accounts are
// on the roadmap before this is opened to anyone else.
const SESSION_COOKIE = "otr_admin";
export const HINT_COOKIE = "otr_admin_hint"; // UI-only flag so the nav can say "Review"; grants nothing

const sha = (s: string) => createHash("sha256").update(s).digest();

export function passwordMatches(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  return Boolean(expected) && timingSafeEqual(sha(input), sha(expected as string));
}

export function sessionToken(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  return pw ? sha(`on-the-record-admin:${pw}`).toString("hex") : null;
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

// True only with a valid session cookie AND the service key present: without the key
// there is nothing the review screen could safely do.
export async function isAdmin(): Promise<boolean> {
  const token = sessionToken();
  if (!token || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value || value.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(token));
}

// Callers must check isAdmin() first.
export function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
