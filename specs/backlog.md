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

- 2026-10-09 — sounds for menus and buttons (nothing there helps anyone play), deferred from the Task 14 sound pass of the first heist plan. Any new sound must come with its sight and caption: see the parity table in `src/game/parity.test.ts`. The play overhaul builds ambience and music but not these (spec §2.3).
- 2026-10-09 — a pivoting camera (sweeps its cone back and forth, with a slim gap to sneak through) as a later variant, perhaps one in a late room. Needs: a lint rule that works out safe windows geometrically (today it is simply watchingS/periodS), a continuous panned servo sound for Can't see instead of the one whir, and its own tuning. Raised while reviewing phase 05 Task 14; the cone cameras and gradual guard turning were built instead. Left out of the play overhaul (spec §2.3).
- 2026-10-09 — the masking noise is plain brown noise; pleasant alternatives (or a choice of a few) would be nicer for whoever has to listen to it for a whole heist. Needs a decision on whether a new sound asset is justified (CLAUDE.md: only bundled outside assets today are the bluemoji faces and Pixabay clips) or another synthesised option. Raised during Task 19's human review. Left out of the play overhaul (spec §2.3).

## Decided

<!-- - YYYY-MM-DD — idea → Tweak (commit abc1234) / Slice (plans/…) / Architecture (specs/…, ADR NNNN) / dropped (why) -->

Sorted on 2026-10-19 by the play overhaul brainstorm (`specs/2026-10-19-play-overhaul.md`); built by its plan, ``plans/2026-10-19-play-overhaul-00-overview.md`.

- 2026-10-07 — a collected offer should add the item to the claiming household's pantry → dropped (the pantry app is archived at tag `archive/pantry-2026-10-08`).
- 2026-10-07 — the measure guess is wrong for meat and fish → dropped (same: the pantry is archived).
- 2026-10-08 — the first spec's "Sound: 2×4 grid" wording is out of date → dropped (the tray and its sheets are replaced by the comms wheel: `specs/2026-10-19-play-overhaul.md` FR26, ADR 0011).
- 2026-10-09 — the host should be able to restart the entire heist → Architecture (`specs/2026-10-19-play-overhaul.md` FR32; restarting the room or the heist is a unanimous vote, not a host action; `plans/2026-10-19-play-overhaul-02-lobby-server.md` Task 8).
- 2026-10-09 — background ambience and music, and bigger visual polish → Architecture (`specs/2026-10-19-play-overhaul.md` FR37 for ambience and music, `plans/2026-10-19-play-overhaul-07-sound-wrapup.md`; the visual polish is the tilted 3/4 world, ADR 0016, `plans/2026-10-19-play-overhaul-05-world-renderer.md`). Menu and button sounds stay parked.
- 2026-10-09 — headphones belong to a person, not a role, and the real-life wizard can't express a mixed table → Architecture (`specs/2026-10-19-play-overhaul.md` FR20–FR21, ADR 0013; per-person setup, settings recomputed each room; `plans/2026-10-19-play-overhaul-02-lobby-server.md` Task 7; the wizard is removed).
- 2026-10-10 — voice: a tap-to-toggle mode with a visible "mic is live" state → Slice inside the overhaul (`specs/2026-10-19-play-overhaul.md` FR27; `plans/2026-10-19-play-overhaul-01-comms.md` Task 3).
- 2026-10-18 — bots that hesitate like people (a tolerant `guideBlind`) → Architecture (`specs/2026-10-19-play-overhaul.md` FR14 with amendment A3; the tolerant guide is `plans/2026-10-19-play-overhaul-06-rooms-results.md` Task 28 (moved there from `-04-line-of-sight.md` Task 16 on 2026-10-20, after phase 04 could not make it hold on the old rooms).
- 2026-10-18 — Can't speak has little to do → Architecture (`specs/2026-10-19-play-overhaul.md` FR5–FR6, FR12, FR14; ADR 0012; sight becomes local, each room has a beat one role leads, and a spec fails a room without its lead's sends; `plans/2026-10-19-play-overhaul-04-line-of-sight.md`, `-06-rooms-results.md`).
