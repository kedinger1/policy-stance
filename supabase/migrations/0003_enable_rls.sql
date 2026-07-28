-- Required before the frontend queries Supabase directly with the public anon key.
-- Read-only: anyone can SELECT; only the service_role key (used server-side in
-- scripts/) can write, since it bypasses RLS entirely.

alter table politicians enable row level security;
alter table positions enable row level security;
alter table votes enable row level security;
alter table matches enable row level security;

create policy "public read" on politicians for select using (true);
create policy "public read" on positions for select using (true);
create policy "public read" on votes for select using (true);
create policy "public read" on matches for select using (true);
