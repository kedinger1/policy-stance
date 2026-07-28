import { createClient } from "@supabase/supabase-js";

// Anon key only — safe for server components and any future client-side use.
// RLS (supabase/migrations/0003_enable_rls.sql) restricts this to read-only.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
