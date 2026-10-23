-- Cache of the AI's issue tag + relevance score, keyed by the bill text it was given.
-- Tagging depends only on a bill's title and summary -- not on any legislator or
-- position -- so the result is identical across matching runs and shared by every
-- legislator who voted on the bill. Re-doing it each run was about a third of the AI
-- calls, and most Assembly members vote on the same bills.
--
-- Keyed by a hash of the exact text tagged (title + summary), so if a bill later gains
-- a summary its key changes and it is naturally re-tagged with the richer input.
create table vote_tags (
  text_key text primary key,               -- sha256 of title + "\n" + summary
  topic text,                              -- null = no tracked issue
  relevance integer not null,              -- 1-10, how squarely the bill tests that issue
  tagged_at timestamptz not null default now()
);

-- Internal pipeline data: RLS on with no policy means the public anon key can't read
-- it, while the service-role key used by the scripts bypasses RLS.
alter table vote_tags enable row level security;
