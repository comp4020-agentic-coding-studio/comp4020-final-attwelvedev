# Backlog

Ideas and spec-level issues that come up mid-phase. Park them here instead of
switching away from the current phase. At each phase boundary, sort them
(overview §5.2 in `plans/2026-10-06-shared-pantry-00-overview.md`): run
`/brainstorm-feature` on anything worth doing, and move it to "Decided" with
where it went.

Plain bugs don't belong here: fix them straight away with a failing test
first.

## Parked

<!-- - YYYY-MM-DD — one line: the idea, and what prompted it -->

- 2026-10-07 — when a claimed offer is Collected, the claiming household's pantry should gain that item (name only, no offerer or note); today the item only leaves the offerer's pantry as Given. Raised while reviewing Task 20; touches the item model (phase 04, Task 13) and the privacy rules.
- 2026-10-07 — the measure guess is wrong for most meat and fish: every `meat` entry in `src/data/guess-client.json` is `fill` (all 63), so beef, fish, chicken and pork show a fullness jar. Meat is bought as a pack or a weight, so `have` or `count` fits better; the category-to-measure default lives in the phase 04 table build (`scripts/build-foodkeeper.ts`, `keyword-overrides.json`). Raised while reviewing Task 23; correctable in one tap once Task 24's Measured-by switch lands.

## Decided

<!-- - YYYY-MM-DD — idea → Tweak (commit abc1234) / Slice (plans/…) / Architecture (specs/…, ADR NNNN) / dropped (why) -->
