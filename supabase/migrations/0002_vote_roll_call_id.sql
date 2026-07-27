-- A bill can have multiple roll-call votes (committee, floor, veto override),
-- so dedupe on the specific roll call, not just the bill.
alter table votes add column if not exists openstates_vote_id text;
create unique index if not exists votes_politician_vote_uidx on votes(politician_id, openstates_vote_id);
