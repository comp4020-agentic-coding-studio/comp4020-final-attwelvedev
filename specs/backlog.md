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

- 2026-10-08 — spec §4.1 says "Sound: 2×4 grid"; the soundboard is now 12 clips in a 4×3 grid (keys 1–6 and `0`, as for faces), so the wireframe wording is out of date. Raised while building phase 03 Task 10.
- 2026-10-09 — the host should also be able to restart the entire heist (back to room 1, roles reset), alongside "Restart room"; today only the current room can be restarted. The spec's heist-complete wireframe (§4.1) shows a [ Play again ] button but phase 07 Task 18 never says what it does or builds it, so it fits there; a mid-heist "Restart heist" in the host's menu would be the same server action. Raised while reviewing phase 05 Task 14.
- 2026-10-09 — deferred from the Task 14 sound pass: background ambience, music, and sounds for menus and buttons (nothing there helps anyone play, so they belong with phase 07 polish); and bigger visual polish beyond the small fading effects now drawn for plates, doors, crates, loot, checkpoints and the sequence sign. Any new sound must come with its sight and caption: see the parity table in `src/game/parity.test.ts`.
- 2026-10-09 — a pivoting camera (sweeps its cone back and forth, with a slim gap to sneak through) as a later variant, perhaps one in a late room. Needs: a lint rule that works out safe windows geometrically (today it is simply watchingS/periodS), a continuous panned servo sound for Can't see instead of the one whir, and its own tuning. Raised while reviewing phase 05 Task 14; the cone cameras and gradual guard turning were built instead.

- 2026-10-09 — the real-life wizard's "same room?" question is binary and "do Can't see and Can't speak have headphones?" is asked once for both; this can't express a mixed table (one player remote, two in person) or tell the two apart (one has headphones, the other doesn't). A second, independent reason the same fix is needed: headphone possession belongs to a seat (a person), not a role, but roles rotate every room while the wizard only ever asks once, before anyone has a role. "Does Can't hear have headphones?" is really asking about whichever seat lands that role in room 1; by room 2 a different seat is Can't hear and the answer may no longer hold, with nothing to update it. The fix for both: ask headphones per seat (three yes/no facts about the people, not the roles) and have the server recompute the effective masking-noise/captions-instead-of-sound settings each room from `rolesFor(roomIndex)` against those per-seat facts, rather than fixing one team-wide preset for the whole heist. This reopens `presetFor`'s truth table and `LobbySettings` (both built and tested in phase 07 Task 19) and changes when the effective settings are computed (per room, not once at wizard time), so it needs its own planning pass rather than a live edit. Raised during Task 19's human review.
- 2026-10-09 — the masking noise is plain brown noise; pleasant alternatives (or a choice of a few) would be nicer for whoever has to listen to it for a whole heist. Needs a decision on whether a new sound asset is justified (CLAUDE.md: only bundled outside assets today are the bluemoji faces and Pixabay clips) or another synthesised option. Raised during Task 19's human review.
- 2026-10-10 — voice: a tap-to-toggle mode alongside hold-to-talk (hands-free, and easier on a phone where holding a button blocks the joystick). Needs a decision on the control (a second button, a setting, or a long-press) and on a visible "mic is live" state so nobody talks open-mic by accident. Raised during Task 22's human review.

## Decided

<!-- - YYYY-MM-DD — idea → Tweak (commit abc1234) / Slice (plans/…) / Architecture (specs/…, ADR NNNN) / dropped (why) -->
