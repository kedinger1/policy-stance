-- A small hand-labeled sample used to measure how often the AI's verdicts agree with a
-- person, and whether the matching can detect a real contradiction at all. Each row is
-- a frozen snapshot of one statement-and-vote pair plus the AI's verdict at sampling
-- time, so later re-runs or rescans of the live tables can't change what was labeled.
create table validation_pairs (
  id uuid primary key default gen_random_uuid(),
  sample_kind text not null check (sample_kind in ('close', 'ai_kept', 'ai_na')),
  ord integer not null,                    -- shuffled, so labeling is blind to sample_kind
  politician_name text not null,
  topic text not null,
  statement_text text not null,
  statement_source_url text,
  stated_at date not null,
  bill_title text not null,
  vote_value text not null,
  voted_at date not null,
  similarity numeric,                      -- text similarity at sampling time
  ai_classification text not null,
  ai_status text not null,
  ai_confidence numeric,
  ai_rationale text not null,
  human_label text check (human_label in ('contradiction', 'match', 'not_testable', 'unsure')),
  human_note text,
  labeled_at timestamptz,
  created_at timestamptz not null default now()
);

-- Internal: RLS on with no policy keeps it off the public API; the service-role key
-- used by the scripts and the log-in-protected admin pages bypasses RLS.
alter table validation_pairs enable row level security;
