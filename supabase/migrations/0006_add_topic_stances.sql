-- A synthesized 1-2 sentence "inferred stance" per politician per topic, generated
-- from all of their positions on that topic (quotes and sponsored bills alike).
-- Explicitly a display-layer gloss, not a new source of truth -- the underlying
-- `positions` rows remain the literal, verifiable record; this table exists only
-- because a wall of bill titles reads flat and a synthesized sentence doesn't.
create table topic_stances (
  id uuid primary key default gen_random_uuid(),
  politician_id uuid not null references politicians(id) on delete cascade,
  topic text not null,
  summary text not null,
  generated_at timestamptz not null default now(),
  unique (politician_id, topic)
);

alter table topic_stances enable row level security;
create policy "public read" on topic_stances for select using (true);
