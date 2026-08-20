-- Bill sponsorship as a second, cheaper, structurally-verified position source
-- alongside AI-researched quotes -- sponsoring a bill is an explicit, dated,
-- unambiguous stance with zero inference required.
alter type source_type add value if not exists 'bill_sponsorship';

-- Ties a sponsorship-derived position back to the exact bill it came from, so
-- the matching pipeline can skip the tautological case of comparing someone's
-- own sponsored bill against their own vote on that same bill.
alter table positions add column if not exists source_bill_id text;

-- Upsert target for re-running the sponsorship ingest without duplicating rows
-- or deleting/reinserting (which would null out matches.position_id via the
-- ON DELETE SET NULL cascade, as happened with the quote-based rescan).
alter table positions add constraint positions_politician_bill_unique unique (politician_id, source_bill_id);
