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

- 2026-11-07 — cache hints in braille: a plate that tells where a cache's chamber is, or a station's role in it. Out of scope of the blind-purpose spec (§2.3); parked until the plates have been played.
- 2026-10-28 — a distraction side job: one player draws a guard away while the others work a station. Raised in the escape-room brainstorm; parked so the first rooms ship first.
- 2026-11-07 — a door opening is team-wide, like loot or the alarm: every role hears it from anywhere and the sighted see it animate open and stay open, in or out of sight. It replaces the patch that sends an unseen door as closed whatever the truth, and it signals that a station or group was solved. Raised by the user in the phase 03 review. Needs: the true state sent to every sighted seat, a sound with no reach limit (and its picture for Can't hear), a `PARITY` row, a ruling against ADR 0012's sound reach (likely a superseding ADR), and the secret doors kept as they are (no click).
- 2026-11-03 — automate the playtest: an agent that plays a heist in a real browser (three tabs, 1280 and 375) with a checklist of invariants read off each screenshot and each view (nothing out of the light is drawn, every door chip matches how it opens, every menu action works in every room including the last, every sound the server sends is played). The bugs a human playtest found in phase 14 all lived between layers (a server sends a whole station and the client draws it whole; server tile sight against client ray light; a passed vote clears the room but not the heist screen), so none was reachable by a unit test of one layer. Needs: a scripted player that can clear a room through the UI, a screenshot-diff or pixel-probe vocabulary ("is anything drawn at this tile that the view did not send"), and a decision on cost (browser runs are slow, and CLAUDE.md caps them at 3 files).
- 2026-11-07 — agents that play the heist: three Claude agents, one per seat, each from its own page's screenshot and text, talking only through the game. The only automated way to find comms gaps. Dropped from `specs/2026-11-07-playtests.md` on cost (about $55 a heist on Sonnet, six tasks to build); the screenshot review was built instead. Would reuse ADR 0027's seam and `scripts/playtest/drive.ts`. Revisit if Haiku-class screenshot reading proves good enough in the review, or human playtests stop catching comms gaps.

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
- 2026-10-28 — "Can't speak has little to do" → Architecture (`specs/2026-10-28-escape-room-heist.md`, ADR 0017): stations, gear and side jobs give every role work.
- 2026-10-28 — `pnpm check` overloads the machine → Tweak: the spec project's `maxWorkers` is 3 in `vitest.config.ts` (unit tests first, full width); two full checks green, peak load 13–15, 227–231 s.
- 2026-11-01 — wire plaques as riddles, not instructions: today's rule sentences just say what to do and are boring; a riddle would make players think (room 7's ink is a bare number meanwhile) → Architecture (`specs/2026-11-05-blind-purpose-and-riddles.md` FR11, FR12; `plans/2026-11-05-blind-purpose-00-overview.md`, phase 05 Task 79): wire plaques from room 4 on are seeded riddles.
- 2026-11-01 — radios are only "dial until the static clears": needs a brainstorm for a real challenge (a hidden target, a clue held by a teammate, or a narrow drifting lock) → Architecture (`specs/2026-11-05-blind-purpose-and-riddles.md`; `plans/2026-11-05-blind-purpose-00-overview.md`, phase 04 Tasks 77, 78): decoy bands and a braille plate that names the real one.
- 2026-11-02 — room 6: the gap in the keypad chimes where the radio pips go is too subtle (the user needed several frustrated attempts to realise it is a gap at all): give the gap a quiet marker sound, a low or high pitch, so it reads as "a number goes here" → Architecture (`plans/2026-11-05-blind-purpose-00-overview.md`, phase 04 Task 76): a rest in a keypad's tune plays a quiet marker chime.
- 2026-11-02 — the whole game looks too simple/cartoonish; the user wants a more realistic feel across it (gradients, soft shadows, gloss), starting from the keepsakes in phase 14 → undecided, needs a brainstorm and a DESIGN.md pass at the phase boundary.
- 2026-11-03 — a wrong answer on a teaching safe or a cache re-draws only that station with no cost (clues FR7, caches FR5), so a player can spam Act on the dial until the redraw lands on 0 (1 in `range` per press for one digit): the puzzle can be brute-forced by luck → Architecture (`plans/2026-11-05-blind-purpose-00-overview.md`, phase 02 Task 71): a wrong answer on a teaching station or a cache jams it for 3 s.
- 2026-11-03 — more subtle chamber hints if playtest finds the plate too hard to find: a lamp on the back box that flickers as the dial passes the answer, a decorative stethoscope mat near the chamber door, a riddle that says where to stand → undecided, after the plate is played (14-04 §9).
- 2026-10-28 — a distraction side job: one player draws a guard away while the others work a station → Architecture (`specs/2026-11-02-escape-room-caches.md`, ADR 0020): replaced by caches, an optional hidden chamber with a station and a keepsake in each of rooms 4 to 9. The guard-distraction idea itself is not built.
- 2026-11-03 — room ids are numbered in reading order, so adding a `Q`, `c`, `u`, `g` or `D` above an existing one renumbers it and `pnpm lint:rooms` stays green while the room is rewired (found twice authoring phase 14's chambers) → Tweak and Slice (`plans/2026-11-05-blind-purpose-00-overview.md`, phase 01 Task 69): a snapshot test of each shipped room's id map (`src/game/rooms/ids.test.ts`), with the CLAUDE.md rule.

Sorted on 2026-11-07 by `/brainstorm-feature`.

- 2026-10-28 — a periscope gear item, a team codebook, and spectators voicing the earpiece → dropped (the user does not want them).
- 2026-11-05 — a cache's dial cannot be solved with bots in the crew → Architecture (`specs/2026-11-07-bots-help-caches.md`, ADR 0024 proposed): bots work a cache once a person uncovers it. The Parked line stays until it is built.
- 2026-11-07 — a door opening is team-wide → Architecture (`specs/2026-11-07-team-wide-doors.md`, ADR 0025 proposed): a new unlock sound with no reach limit, every ordinary door's true state sent to every sighted seat, and an edge pill for a door off screen. Cache doors are unchanged. The Parked line stays until it is built.
- 2026-10-09 — menu and button sounds, and pleasanter masking noise → Slice (`plans/2026-11-07-menu-sounds-and-masking.md`): synthesised menu sounds under their own "Menu sounds" toggle (on by default), a row glow as the lobby's picture twin, and Brown, Rain and Café masking beds. If the beds fail review, recordings get a new brainstorm. The Parked lines stay until it is built.
- 2026-11-02 — the whole game looks too simple/cartoonish → Architecture (`specs/2026-11-07-diorama-look.md`, ADR 0026 proposed): a lit diorama world with room tints and generated decor, a dusk shell, a staged start of each room, and motion unique to each object.
- 2026-11-03 — automate the playtest → Architecture (`specs/2026-11-07-playtests.md`, ADRs 0027 and 0028 proposed): a bot-driven regression run with frame invariants, and a screenshot review of what each role perceived at each beat (~$2 a heist). Revised 2026-11-07 from an agent playtest, on cost (option B); the agent loop is parked. The Parked line stays until it is built.
