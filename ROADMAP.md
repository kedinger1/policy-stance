# Roadmap

Backlog to pull from — not ordered by priority beyond the rough grouping below.

## Data

- [ ] Expand vote history further back than the current snapshot (the 100 most-recently-updated NY bills). OpenStates has deeper session history available; this is a config change, not a data-source limitation. Likely also reduces weak/adjacent matches, since positions could get matched against votes from the same era instead of whatever's recently available.
- [ ] Scale the position + vote + matching pipeline from the current pilot (6 politicians) to all 213 NY state legislators.
- [ ] Federal vote ingestion (e.g. ProPublica Congress API) so featured federal politicians (AOC) can actually be scored — right now they have positions but no votes to match against.

## Methodology / product

- [ ] Admin review UI for the `matches` table's `needs_review` queue — confirm or override AI classifications. Schema already supports this (`status: human_confirmed / human_overridden`, `reviewed_by`, `reviewed_at`); just needs a UI.
- [ ] Surface sample size (N) next to every consistency %, not just in the small-print breakdown — consider a per-topic breakdown on the politician page rather than only an aggregate score, so a reader can see "88% consistent (16/19)" vs. a thinly-evidenced "100% (1/1)" at a glance.
- [ ] If the relevance filter alone doesn't fully solve match precision, consider sub-topic/issue tags nested under each of the 11 broad topics.
- [ ] Voter interviews before building personalization features — a friend has offered to help conduct these and has a template in progress.
- [ ] Topic-priority weighting / personalized ranking (let a voter weight which topics matter most to them, surface relevant politicians/positions accordingly) — sequence after interviews, not before.

## Later / exploratory

- [ ] Shareable scorecard format for social distribution (inspired by the "Stocking the Capitol" model — one person + a niche + partnering with an existing org).
- [ ] Reach out to Bret re: shared interest in political accountability tooling.
