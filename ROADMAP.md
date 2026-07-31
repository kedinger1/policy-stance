# Roadmap

Backlog to pull from — not ordered by priority beyond the rough grouping below.

## Data

- [x] Expand vote history further back than the original snapshot — done via bulk CSV loading (`scripts/ingest-votes-bulk.ts`) direct from OpenStates' public data export, covering all NY sessions back to 2019-2020. `ingest-votes.ts` (the live API poller) stays in use for day-to-day top-ups on the still-open current session between OpenStates' monthly bulk refreshes.
- [ ] Scale the position + vote + matching pipeline from the current pilot (~26 politicians) to all 213 NY state legislators.
- [ ] Federal vote ingestion (e.g. ProPublica Congress API) so featured federal politicians (AOC) can actually be scored — right now they have positions but no votes to match against.
- [ ] Add a headshot photo URL to the politicians table/UI. OpenStates' `/people` API already returns an `image` field per legislator (seen it in the raw response during ingestion) — likely just a schema column plus populating it in `ingest-politicians.ts`, not a new data source.

## Methodology / product

- [ ] Admin review UI for the `matches` table's `needs_review` queue — confirm or override AI classifications. Schema already supports this (`status: human_confirmed / human_overridden`, `reviewed_by`, `reviewed_at`); just needs a UI.
- [x] Surface sample size (N) next to every consistency % — done, on both the list and detail pages, plus a per-topic filter (pills) that persists between them so a reader can drill into "88% consistent (n=16)" for one specific issue rather than only an aggregate score.
- [ ] If the relevance filter alone doesn't fully solve match precision, consider sub-topic/issue tags nested under each of the 11 broad topics.
- [ ] Voter interviews before building personalization features — a friend has offered to help conduct these and has a template in progress.
- [ ] Topic-priority weighting / personalized ranking (let a voter weight which topics matter most to them, surface relevant politicians/positions accordingly) — sequence after interviews, not before.
- [ ] Search icon/box to find a politician by name on the list page. Alphabetical ordering is fine at the current pilot scale, but won't hold up once this scales toward all 213 (or beyond, to other states).

## Later / exploratory

- [ ] Shareable scorecard format for social distribution (inspired by the "Stocking the Capitol" model — one person + a niche + partnering with an existing org).
- [ ] Reach out to Bret re: shared interest in political accountability tooling.
