# Roadmap

Backlog to pull from — not ordered by priority beyond the rough grouping below.

## Data

- [x] Expand vote history further back than the original snapshot — done via bulk CSV loading (`scripts/ingest-votes-bulk.ts`) direct from OpenStates' public data export, covering all NY sessions back to 2019-2020. `ingest-votes.ts` (the live API poller) stays in use for day-to-day top-ups on the still-open current session between OpenStates' monthly bulk refreshes.
- [ ] Scale the position + vote + matching pipeline from the current pilot (~26 politicians) to all 213 NY state legislators. Now cheaper than before -- bill sponsorship (see below) needs no web research, only per-bill topic tagging.
- [x] Add bill sponsorship as a second, structurally-verified position source alongside AI-researched quotes (`scripts/ingest-positions-from-sponsorships.ts`) — a legislator's name on a bill they primary-sponsored is an explicit, dated stance with zero inference required, sourced from OpenStates' bulk `bill_sponsorships.csv` (previously unused). Also wired bill abstracts (`bill_abstracts.csv`) into the existing vote-tagging and match-classification prompts as extra context. Cosponsorships (much higher volume, weaker signal) intentionally left out for now.
- [x] Synthesize a per-topic "inferred stance" summary (`scripts/generate-topic-stances.ts`, `topic_stances` table) from a politician's full position history on a topic — sponsorship data made individual positions numerous enough (dozens to 100+ bills per politician per topic) that a raw list reads flat; a short AI-synthesized summary (explicitly asked to separate real policy philosophy from one-off constituent casework, and to flag anything that complicates the pattern rather than smoothing it over) replaces the single-quote lead-in on the politician page when enough positions exist.
- [x] Add a headshot photo URL to the politicians table/UI — done. `photo_url` column populated from OpenStates' `/people` `image` field via `ingest-politicians.ts` (213/214 NY state legislators have one), rendered via a new `Avatar` component on both the list and detail pages.

## Methodology / product

- [ ] Admin review UI for the `matches` table's `needs_review` queue — confirm or override AI classifications. Schema already supports this (`status: human_confirmed / human_overridden`, `reviewed_by`, `reviewed_at`); just needs a UI.
- [x] Surface sample size (N) next to every consistency % — done, on both the list and detail pages, plus a per-topic filter (pills) that persists between them so a reader can drill into "88% consistent (n=16)" for one specific issue rather than only an aggregate score.
- [ ] If the relevance filter alone doesn't fully solve match precision, consider sub-topic/issue tags nested under each of the 11 broad topics.
- [ ] Watch whether "most recent position wins" is now hurting coverage rather than helping it, now that sponsorship data adds many narrow, bill-specific positions into the timeline -- a broad quote that used to loosely match several later votes can get shadowed by a more recent but narrower sponsored bill that no later vote closely tests, so some topics regressed from "a thin real percentage" to "no vote has clearly tested this yet" after this rollout. Not necessarily wrong (an honest "not enough evidence" beats a padded guess), but worth watching as more sessions of sponsorship data land.
- [ ] Consider adding cosponsorships as a position source too (much higher volume than primary sponsorship, but a weaker/more symbolic signal in most state legislatures) -- worth revisiting once primary-sponsorship data has been live long enough to judge whether it's already rich enough.
- [ ] Voter interviews before building personalization features — a friend has offered to help conduct these and has a template in progress.
- [ ] Topic-priority weighting / personalized ranking (let a voter weight which topics matter most to them, surface relevant politicians/positions accordingly) — sequence after interviews, not before.
- [ ] Search icon/box to find a politician by name on the list page. Alphabetical ordering is fine at the current pilot scale, but won't hold up once this scales toward all 213 (or beyond, to other states).

## Later / exploratory

- [ ] Shareable scorecard format for social distribution (inspired by the "Stocking the Capitol" model — one person + a niche + partnering with an existing org).
- [ ] Reach out to Bret re: shared interest in political accountability tooling.
