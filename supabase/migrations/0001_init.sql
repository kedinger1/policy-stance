-- Core schema for policy-stance: politicians, their public positions over time,
-- their votes, and the AI/human-adjudicated matches linking the two.

create type match_classification as enum ('kept', 'broken', 'partial', 'na');
create type review_status as enum (
  'ai_matched',
  'needs_review',
  'human_confirmed',
  'human_overridden',
  'community_flagged',
  'disputed'
);
create type source_type as enum ('npat', 'press_release', 'speech', 'social', 'news_quote', 'other');

create table politicians (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  state text not null,
  chamber text not null, -- 'state_senate' | 'state_house' | 'us_senate' | 'us_house'
  district text,
  openstates_id text unique,
  votesmart_id text unique,
  created_at timestamptz not null default now()
);

create table positions (
  id uuid primary key default gen_random_uuid(),
  politician_id uuid not null references politicians(id) on delete cascade,
  topic text not null,
  statement_text text not null,
  source_type source_type not null,
  source_url text,
  stated_at date not null,
  supersedes uuid references positions(id), -- previous position on same topic, if any
  pivot_announced boolean not null default false,
  extraction_confidence numeric(3,2), -- null if manually entered
  created_at timestamptz not null default now()
);

create table votes (
  id uuid primary key default gen_random_uuid(),
  politician_id uuid not null references politicians(id) on delete cascade,
  openstates_bill_id text not null,
  bill_title text not null,
  bill_summary text,
  vote_value text not null, -- 'yea' | 'nay' | 'present' | 'absent'
  voted_at date not null,
  topic_tags text[] not null default '{}',
  is_bundled boolean not null default false,
  context_note text, -- AI-written plain-language note, esp. for bundled/omnibus bills
  created_at timestamptz not null default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  politician_id uuid not null references politicians(id) on delete cascade,
  position_id uuid references positions(id) on delete set null,
  vote_id uuid not null references votes(id) on delete cascade,
  topic text not null,
  classification match_classification not null,
  rationale text not null,
  confidence numeric(3,2),
  status review_status not null default 'ai_matched',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (position_id, vote_id)
);

create index positions_politician_topic_idx on positions(politician_id, topic, stated_at desc);
create index votes_politician_idx on votes(politician_id, voted_at desc);
create index matches_status_idx on matches(status);
