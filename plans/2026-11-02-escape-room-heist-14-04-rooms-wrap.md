# Escape-room heist: Phase 14 (caches): the six chambers and wrap-up

- **Date:** 2026-11-02
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-02
- **Part of:** `plans/2026-11-02-escape-room-heist-14-00-overview.md`. Read it first (demo §2, cache metadata §4).
- **Depends on phases:** 14-01 (53), 14-02b (62 to 65: the chamber format, sim, view and results), 14-03 (55 to 57). Needs the rooms already in `rooms/04..09`.
- **Task order:** Task 66 (the inspection plate) runs **first**, then 58, 59, 60. Its number is 66 because 61 to 65 are taken; it is listed first in §5.
- **Amended 2026-11-02:** a cache is now a side chamber behind a secret door with a vault behind a second one (overview §4); each room needs its chamber authored.
- **Amended 2026-11-03 (plan-feature, after the execute-plan Phase 1 review):** the former §9 (a findable listening spot) is now **Task 66**; every chamber goes **below** its room (no coordinate shifts); the riddle sentences are drafted by the agent and revised after the user's playtest; the two new spec files are named. See §9 and §10.

## 1. Summary

First, **Task 66**: the floor inspection plate that makes a cache dial's listening spot findable (a drawn plate and a `hollow` step sound), with the linter rules that go with it. Then six hand-authored **chambers**, one per room 4 to 9: a side room hung off the room (up or down) behind a secret door, with the cache's station inside
and a vault alcove behind a second secret door holding the item. Each is linted, cleared by perception-only bots without being opened, and played by the
user. Then the wrap-up: CLAUDE.md, DESIGN.md, the backlog, ADR 0020 and the process log. Ends with the user's acceptance.

## 2. Requirements (this phase)

### 2.1 Functional

Cache FR1, FR2 (the rooms, owners 1, 2, 3, 1, 2, 3), FR4 (a decoy tile each; the secret door), FR6, FR7 (the vault, the owner's take), FR8 (rooms still clear), and the heist-level demo steps 1 to 13.

**Plate (Task 66, settled with the user 2026-11-03; cache FR6's "clue findable"):** a cache whose station is a dial has an inspection plate at the dial's `back` tile, drawn for every sighted seat and sounding different underfoot (`hollow`) to every hearing seat in earshot, including Can't see; ordinary safes (rooms 4 and 9's teaching safes and the real ones) are unchanged; a dial cache's stethoscope lies inside its chamber.

### 2.2 Non-functional

Every room passes `pnpm lint:rooms` and `spec/rooms.test.ts` (bots clear it in every role rotation, with the cache left alone). Pacing
(`pacing.test.ts`): a cache's station type was met earlier. Never hand-write a room without running both.

### 2.3 Out of scope for this phase

Bots solving a cache; a relay skill; caches in rooms 1 to 3; a plate or hollow step for any station other than a cache dial; a flickering lamp on the back box and a plaque hinting where to stand (revisit only if playtest finds the clue too hard); the free-redraw spam on a wrong answer (in `specs/backlog.md`).

### 2.4 Assumptions

See overview §2. A cache's clue must be perceivable by a role other than the one that perceives its uncover tile (Task 53's lint); with a
bot in that role the crew cannot finish it, accepted.

## 3. Existing code context (verified 2026-11-02)

- Rooms and their stations (types in each, from `grep '"type"'`): 04 dial x2; 05 keypad, wires x2; 06 keypad, radio x2, switches; 07 dial x2,
  switches x2, wires x2; 08 bells x2, keypad; 09 dial x2, keypad, sync, vault x2, wires. `hints.jobs` in each room file drive the bots; a
  cache never appears there (Task 53 lints it).
- `.room` format: JSON header, a `---` line, then the grid; `Q` anchors numbered in reading order; a station's parts in its `objects` entry;
  `m` is not a tile letter. **Motif tiles** are listed in the cache's metadata (`cache.tiles`), not in the grid; they must lie on floor
  tiles (`.`) reachable by walking (Task 53 lint). **The chamber** (Task 62): `cache.chamber = { rect, door, vault: { rect, door, item } }`; the chamber's
  rows are appended below the room (pad each row to the room's width with `#`), its two secret doors are `D` tiles in the grid with no `opensWhen`, the
  station's parts lie inside `chamber.rect`, and nothing else of the room's (exit, plate, spawn, checkpoint, hazard, crate, gear, loot) does. Room heights: 04 is
  7 rows, 05 is 9, 06 is 10, 07 is 9, 08 is 8, 09 is 12.
- `pnpm mockup:room rooms/NN-slug.room out.html` shows what each role perceives from each tile (`src/game/rooms/mockup.ts`); it shows a chamber open
  (Task 62) and does not draw the vault or the item.
- `spec/rooms.test.ts` runs every room with bots in every rotation; `spec/room07.test.ts`, `spec/heist.test.ts`, `spec/heistPlay.ts`.
- CLAUDE.md bullets: Sensory parity, Rooms, Shape of the app; `doc/adr/0020-side-jobs-are-hidden-optional-stations.md` (proposed);
  `specs/backlog.md` Decided lines; `PROCESS_LOG.md` (append-only, header comment has the format).

**Verified 2026-11-03 for Task 66:**

- Only room 4's cache is a **dial** (the §4 table), so the plate and the chamber stethoscope are authored once, in room 4; the other five caches need neither. The linter rule keys on station type `dial`, so a later dial cache is covered.
- The tumbler: `perception.ts` `stationSound` emits `tumbler` when a dial turn matches the answer's digit, to a seat carrying a stethoscope within `RANGE.tumbler` (1.5 tiles) of the centre of the dial's `params.back` tile. Nothing marks that tile today.
- Steps: `soundsFor` (perception.ts) emits `footsteps` for others (`cue(world, "footsteps", p.pos, me)`, default `HEARING_RANGE` 12, stopped by walls) and `{ kind: "step", pan: 0, gain: OWN_STEP_GAIN }` for the walker. `SoundCue["kind"]` is a closed union; `parity.test.ts` has `PARITY: Record<SoundCue["kind"], Scenario>` (a row per kind, `sees` and optional `exempt`), `hud.ts` has `CUE_WORD: Record<SoundCue["kind"], string>`, and `parity.test.ts` checks every kind has a caption except `step`.
- The station entity (`entitiesFor`, perception.ts) exists only while `cacheOpen`, carries `station.parts` (including `back`), and `station.stash` after a solve. `StationView` in perception.ts has no cache marker. `src/client/render/stations.ts` draws a dial's `back` parts as `plinth(ctx, cam, b, 0.25, 0.3)` (line 714, in the dial case); `linkOf` draws a wire to it only when a wall lies between. `src/client/render/chamber.ts` holds `drawMotifTile`, `drawKeepsake`, `drawSlide`.
- `lintChamber` (`src/game/rooms/lint.ts`) rejects **any** object inside `chamber.rect` other than the station and the vault door (`"... lies inside its chamber, which holds only its own station"`), which would reject the chamber stethoscope; the rule must admit it. `controls(o)` lists a dial's own tile plus its pads.
- `src/client/audio.ts`: cues are synthesised in one dispatch (`tick`, `tumbler`, `snap`, ...); footsteps are rate-limited (`STEP_GAP_MS` 260, `OWN_STEP_GAP_MS` 290) and the walker's own step is `ownStep`; `SoundBriefing`/`cuesIn` (`src/game/cues.ts`) tell Can't see the sounds of a room before it starts, from the room's objects.
- The fixture `spec/fixtures/rooms-cache/01-cache-a.room`: dial `Q1` anchor at (5,8), pads (4,8) and (6,8), `back` at (1,6), chamber rect `[1,6,9,8]`, a stethoscope `g1` in the main room at (6,4). Used by `spec/heist-cache.test.ts`, `spec/layout/cache-chip.test.ts`, `src/net/game.test.ts` and `src/game/sim/chamber.test.ts`.

### Interfaces from earlier phases (exact)

From 14-01: `cacheOf`, `lintCaches` (a room with a cache runs it inside `lintRoom`), `World.cacheUncovered`, `World.cacheBy`. From 14-02b: the chamber metadata (overview §4),
`CacheSpec.chamber`, `secretDoors`, `syncCacheDoors`, `World.cacheTaken`, the chamber lint rules, `RoleView.cache.state`, `RoleView.keepsake`. From 14-02/65: `cleared.cache` (with
`opened`), `heist.caches` (`found` = taken). From 14-03: the doors' slide, the standing item, the chip, the tile and the shelf.

## 4. Approach

**One chamber per room, designed with its clue split across roles and its place off the route.** A cache's clue is the clue of its station type (a dial's
tumbler heard with a stethoscope, a keypad's code from a plaque, wires' rule on a plaque, a music box's tune, switches' target card, a vault's order clue, a
sync lock's keys); the station sits **inside the chamber**. The uncover tile is a drawn motif on a floor tile of the main room where only sighted roles perceive
it, with one decoy of another motif, and it is not beside the secret door (so the hunt is a hunt). The owner's riddle names the motif; the tile is found by a
sighted role; the clue belongs to a different role. The chamber is a dead end off one wall: `rect` about 4 by 3 tiles, a vault alcove of 1 or 2 tiles at its far end.
The six, to be settled with the user at each room (the plan fixes the structure, not the sentence or the exact wall):

| Room | Owner seat | Station type (already met) | Item | Where the structure puts the split | Chamber off |
| --- | --- | --- | --- | --- | --- |
| 04 The Safe | 1 | dial | watch | tile seen by sighted; the tumbler is heard with the stethoscope | below, off the hall's south wall |
| 05 The Gallery | 2 | keypad | ledger | tile seen by sighted; the code comes from a plaque only one role can read | below the gallery |
| 06 Lights Out | 3 | switches | ring | tile seen; the target card is behind glass, read by a different role | below the wing |
| 07 Night Shift | 1 | wires | goblet | tile seen; the rule is UV ink needing the torch | below the vault corridor |
| 08 Music Room | 2 | bells | pen | tile seen; the tune is heard through a vent | below the music room |
| 09 The Vault | 3 | keypad | necklace | tile seen; the code is a symbol order from a wing | below the vault wing |

**Ruling (user, 2026-11-03): every chamber goes below its room.** Authors append the chamber's rows under the room (padded to the room's width with `#`), which shifts no coordinate in the file; none goes above. A chamber is never in the exit chamber and never
beside a checkpoint flag (a send-back would otherwise spawn people next to a wall that hides a room). Which wall it hangs off may still be moved per room after the user plays it.

**Riddles:** the agent drafts each room's riddle sentence (naming the motif, never the clue's role or the chamber), and the user revises it in the playtest of Tasks 58 and 59.

**A dial cache's chamber carries the plate (Task 66):** the `back` tile within about two tiles of the dial and inside `chamber.rect`, and a stethoscope (`gear` with `item: "stethoscope"`) inside the chamber too, so the clue is reachable without leaving it. Room 4 is the only dial cache.

## 5. Task breakdown

### Task 66: The inspection plate (a findable listening spot in a dial cache's chamber) (runs first)

- **Description:** make the clue of a cache whose station is a dial findable, for cache chambers only. The dial's `back` tile becomes a **floor inspection plate**: a small metal plate set flush in the floor with wear around it where someone has knelt, subtle and unlabelled, with no wire drawn to it, drawn for every sighted seat that has it in sight. A step on it sounds different: a new cue **`hollow`** (metal over a hollow) replaces the step cue for a walker standing on the plate (their own `step`) and the `footsteps` cue others hear of them, for hearing seats in earshot, Can't see included. The tumbler itself is unchanged (stethoscope within 1.5 tiles of the plate when a teammate turns the dial onto the answer). Ordinary safes and every non-cache dial keep their current clues, drawing and sounds. The linters gain the authoring rules.
- **Files touched:**
  - `src/game/perception.ts`: `SoundCue["kind"] += "hollow"` (with its comment), `RANGE.hollow = 6` (only near the plate), `soundsFor` swaps `step` and `footsteps` for `hollow` when the walker's tile is a cache dial's `back` tile and the walker is moving and not blocked; `StationView.cache?: true`, set in `entitiesFor` when `cacheOf(o)` and the station type is `dial`, so the client knows which `back` to draw as a plate (the entity exists only once the chamber is open, so it reveals nothing).
  - `src/client/hud.ts`: `CUE_WORD.hollow = "hollow step"`, named for a source with a direction like `footsteps`.
  - `src/client/audio.ts`: the `hollow` synth (a short low sine drop with a metallic ring above it, distinct from `tick`, `tumbler`, `step` and `footsteps`), rate-limited like the steps it replaces (the walker's own at `OWN_STEP_GAP_MS`, others' at `STEP_GAP_MS`); a pure plan function for its tones so a unit test can tell it apart from the other cues.
  - `src/client/render/chamber.ts` (`drawInspectionPlate`) and `src/client/render/stations.ts` (the dial's `back` parts draw it, not the plinth, when `station.cache`): a flush plate in the world's line and card colours with a worn ring, outlined for high contrast, no wire (`linkOf` returns null for a cache dial).
  - `src/game/rooms/lint.ts`: for a cache whose station is a dial, `lintChamber` reports an issue when `back` is missing, lies outside `chamber.rect`, is not a floor tile, or is more than 2.5 tiles (centre to centre) from the dial's own tile; and when no `gear` with `item: "stethoscope"` lies inside `chamber.rect`. The "holds only its own station" rule admits that stethoscope (and only a stethoscope). Chambers of other station types are unaffected.
  - `spec/fixtures/rooms-cache/01-cache-a.room`: `back` moves from (1,6) to (3,8) (two tiles from the dial at (5,8), clear of the pads), and a stethoscope `g2` is added inside the chamber at (2,7); re-run `src/game/sim/chamber.test.ts`, `spec/heist-cache.test.ts`, `spec/layout/cache-chip.test.ts`, `src/net/game.test.ts`.
  - `src/game/parity.test.ts`: a `hollow` row; `DESIGN.md` §4.8 (the plate) in the same commit.
  - `src/game/perception.test.ts`, `src/game/rooms/lint.test.ts`, `src/client/render/chamber.test.ts`, `src/client/audio` plan test (beside the pure function), `src/client/hud.test.ts`.
- **Tests first (red):**
  - (a) perception: on a cache world, a walker moving on the plate hears `hollow` and **not** `step`; a hearing teammate in earshot hears `hollow` and **not** `footsteps` for them, with a direction; one beyond 6 tiles, or on the far side of a wall, hears neither; a walker on any other tile, or on the `back` tile of a **non-cache** dial, gets `step`/`footsteps` as before; a blocked walker makes no `hollow`; Can't hear is told nothing in sound; the station's `cache: true` is on a cache dial's entity and absent from a non-cache dial's;
  - (b) the `hollow` parity row (Can't see hears it; Can't hear sees the walker standing on the plate drawn in the view; no `exempt`); the existing caption test covers `CUE_WORD.hollow`;
  - (c) lint: a table of malformed dial caches (no `back`, `back` outside the chamber, `back` on a wall, `back` too far, no stethoscope inside) each fail with its message, and a well-formed one passes; a UV torch inside the chamber still fails the "holds only" rule; a non-dial cache needs neither;
  - (d) render: a cache dial's `back` is drawn with `drawInspectionPlate` and not `plinth`; a non-cache dial's `back` still draws the plinth; the plan's `hollow` tones differ from `tick`'s, `tumbler`'s and the step's.
- **Implementation (green):** as above. Every rule is shown to fail: revert the swap in `soundsFor` (a), take the `cache` marker off the entity (d), loosen the distance test (c), watch each go red, and restore.
- **Not in the briefing:** `cuesIn`/`SoundBriefing` do **not** list `hollow` (that would tell Can't see, in every dial room's briefing, that a cache exists); a test on `cuesIn` for a dial cache room asserts it is unchanged. Can't see learns the sound by walking.
- **Acceptance criteria:** (1) the four test groups pass and each was shown red; (2) `pnpm lint:rooms` and `spec/rooms.test.ts` stay green for the nine rooms; (3) on the fixture at 1280 and 375 the plate is drawn at (3,8), reads as a plate and not as a tile, has no wire and no label, in normal, high-contrast and reduced-motion; (4) ordinary safes in rooms 1 to 9 draw and sound exactly as before; (5) the stethoscope inside the chamber can be picked up and carried to the plate without leaving it.
- **Human review:** on a local build with `ROOMS_DIR=spec/fixtures/rooms-cache`, in three tabs: the plate can be found by eye as a sighted player without being told; a hearing player walking over it, Can't see included, notices the step; a stethoscope holder on it hears the tumbler when a teammate turns the dial onto the answer; and, as Can't see alone, the step sound does **not** by itself solve the chamber (the playtest watch item from 14-03 §9). Pass = the user says so. If the plate is too subtle or too obvious, the drawing and the range are the knobs; a different approach goes back to `plan-feature`.
- **Depends on:** 53, 62 to 65 (the chamber lint and view), 55 to 56 (the render and the audio dispatch).

### Task 58: Chambers in rooms 4 to 6

- **Description:** author the three chambers, **all below their rooms** (their appended rows, both secret doors, the station inside, the uncover and decoy tiles, the vault and its item tile; room 4's also its plate and its own stethoscope, Task 66) and prove them: lint, bots clear without opening, a person can open, solve and take. Riddle sentences are drafted here and revised after the user plays them.
- **Files touched:** `rooms/04-the-safe.room`, `05-the-gallery.room`, `06-lights-out.room` (add the `cache` metadata with its `chamber`, one extra `Q` anchor and its
  parts inside the chamber, the chamber rows below the room, the motif tiles), `spec/rooms.test.ts` (a room with a cache clears with the cache unsolved; a unit-level scripted solve per room
  in `spec/caches.test.ts`, which uncovers the right tile, walks in, solves the station, takes the item as the owner, and asserts the doors, the loot, the events and a
  send-back undo; for room 4 it also stands on the plate and asserts `hollow`), `spec/heist.test.ts` (a `cleared` with `cache` for a cache room reached by bots; `opened: false, found: false` since bots ignore it), `spec/layout/leaderboard.test.ts` (the
  cleared card with a real chamber room at 1280 and 375: the tile after the credits and before the buttons, inside the column, no clipping with a long item
  name, the buttons' bottom edge inside the frame at 1280, the taken, left-behind and not-found tiles the same height; shown red by moving the tile below the buttons),
  and a chamber layout spec `spec/layout/chamber.test.ts` (a real game on a room with a chamber: the map is solid wall where it hides at 1280 and 375, the door slide
  runs once and not under reduced motion, the item stands and leaves on the take, the owner's chip walks its four states, and a non-owner cannot take it; for room 4 the plate is drawn at its tile and not blank). Both `spec/caches.test.ts` and `spec/layout/chamber.test.ts` are **new files** (the existing cache spec is `spec/heist-cache.test.ts`; leave it alone).
- **Tests first (red):** (a) `lintRoom` fails each room with a cache whose type is wrong, tile missing or chamber malformed before the room is authored (written
  as a table from the plan); (b) the scripted open, solve and take fails until the room exists; (c) `spec/rooms.test.ts` stays green for all nine, bots clearing each with the
  chamber never opened.
- **Implementation (green):** author each room by the structure above; run `pnpm lint:rooms`, `pnpm mockup:room`, read what each role perceives
  from the tile and the clue; every cache shown to be un-solvable alone by the lint (break the split on purpose and watch it fail), and every chamber shown to be sealed (open a path to it on purpose and watch the lint fail).
- **Acceptance criteria:** the nine rooms lint and clear; the scripted open-solve-take passes for rooms 4 to 6 and a send-back undoes it; each rule's red shown; the chamber looks like wall at 1280 and 375 until opened.
- **Human review:** the user plays rooms 4 to 6 in three tabs: the riddle reads well, the motif hunt is fair, the secret door and the chamber feel like part of the room, the clue is perceivable by
  the intended role only, only the owner can take the item, the reward feels earned. Pass = the user says so.
- **Depends on:** 66, 53, 55 to 57, 62 to 65.

### Task 59: Chambers in rooms 7 to 9

- **Description:** as Task 58 for rooms 7 (UV ink), 8 (tune through a vent) and 9 (the vault's order), every chamber below its room. None of these three is a dial, so none needs a plate or its own stethoscope.
- **Files touched:** `rooms/07-night-shift.room`, `08-music-room.room`, `09-the-vault.room`, `spec/caches.test.ts`, `spec/room07.test.ts` if its
  assertions name object counts, and the layout specs above for the new rooms.
- **Tests first (red):** as Task 58 (a) to (c) for these rooms; (d) `spec/heist.test.ts` clears the whole heist through room 9 and the final
  `heist` message has six `caches` entries in room order, all `found: false` (nobody took anything).
- **Implementation (green):** as Task 58.
- **Acceptance criteria:** as Task 58 for rooms 7 to 9; the full heist clears with bots; a cache opened, solved and taken by script in any one room raises that
  room's loot by 1 and that room's `found` to true, and the same cache opened and solved but left raises nothing and leaves `found` false with `opened` true.
- **Human review:** the user plays rooms 7 to 9 as for Task 58, and one full heist end to end to see the shelf.
- **Depends on:** 58 (and through it 66).

### Task 60: Wrap-up: docs, backlog, ADR 0020, process log

- **Description:** bring the docs in line with the code.
- **Files touched:** `CLAUDE.md` (Shape of the app: caches, a chamber behind a secret door, a keepsake slot; Sensory parity: `uncover` and `stash` are team-wide with parity rows, a take reuses the `loot` cue, the
  riddle is an own-only view field, the hidden chamber is masked in the map until its door opens and a secret door opens with no `door` event; Rooms: a cache is one
  per room with a chamber, its clue and tile are linted to need different roles, its chamber is sealed and holds only its station, and its station type must already
  be met; bots ignore caches and chambers), `DESIGN.md` checked against the code, `specs/backlog.md` (a Decided line for the 2026-10-28 side-job idea:
  replaced by caches; plus any backlog items raised during the phase), `doc/adr/0020-…` status → `accepted` **only after the user says so**,
  `PROCESS_LOG.md` (the moments: the floor-item side jobs were loot with a caption, the user's reframe to escape-room caches, the
  contradiction in my "visible only next to it" idea, the stale-server bogus red run, the pacing ruling), phase 11's overview row ticked.
- **Tests first (red):** `spec/design.test.ts` green; `pnpm check:evidence`; `pnpm check`.
- **Implementation (green):** edits as listed.
- **Acceptance criteria:** `pnpm check` green on a fresh check server; `pnpm check:evidence` resolves every cited commit.
- **Human review:** the user reads the CLAUDE.md diff and accepts ADR 0020.
- **Depends on:** 58, 59 (and through them 66).

## 5b. Execution status (2026-11-03, execute-plan)

The user asked that every **Human review** be deferred to the end of the phase, and authorised reasonable choices on blockers. So Tasks 66, 58 and 59 are **built and verified by automated checks but not ticked and not committed**: the commits wait for the user's review (Phase 3, step 5). Task 60 is drafted the same way.

- [ ] Task 66: built; unit tests, parity row, lint rules, render and fixture all green and each shown red. Awaiting the user's review (Human review line).
- [ ] Task 58: rooms 4 to 6 authored, linted, cleared by bots in every rotation, and played by script in `spec/caches.test.ts`. Browser specs done: `spec/layout/chamber.test.ts` (room 4 at 1280 and 375: map fits its frame, owner-only chip, nothing names the chamber) and a side-job-tile case in `spec/layout/leaderboard.test.ts` (tile after the credits, before the buttons, inside the column), each shown red; screenshots of the cleared card looked at. Full `pnpm check` green on a fresh server (143 files, 2081 tests).
- [ ] Task 59: rooms 7 to 9 authored (room 9's cache is a dial, see the Corrections log), linted, cleared by bots, scripted open-solve-take for each, and the nine-room heist reports six unopened, untaken caches in order. Browser specs shared with Task 58 (room 4 only; rooms 5 to 9 are covered headless).
- [ ] Task 60: CLAUDE.md edited; DESIGN.md has the plate; the rest (backlog Decided line, PROCESS_LOG entries, ADR 0020 acceptance, overview ticks) outstanding.

## 6. Phase Definition of Done

- [ ] Tasks 66, 58, 59, 60 done and committed one each (Human review tasks only after acceptance).
- [ ] `pnpm test:unit` and `pnpm check` pass on a fresh check server.
- [ ] Demo script 1 to 11 (overview §2) played by the user on a local build, three tabs, 1280 and 375.
- [ ] CLAUDE.md invariants hold; ADR 0020 accepted by the user.
- [ ] Tick this phase in the 14 overview §5, tick phase 14 in the master overview §5, and commit.

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR1, FR2, FR4, FR6, FR7, FR8 (the rooms) | 58, 59 (the dial's clue: 66) |
| Cache FR6 (the clue findable: the plate and the hollow step, linted) | 66 |
| Docs, ADR, process | 60 |

## 8. Risks / open questions

None open. §9 (formerly a pending amendment) is now Task 66, and the six riddle sentences are drafted by the agent in Tasks 58 and 59 and revised in the user's playtest, not settled before. Accepted:

- Room 4 is the only dial cache, so the plate is authored and played once; the lint keeps any later dial cache honest.
- The `hollow` step is audible to every hearing seat in earshot, so a teammate on the plate is a clue to where the stethoscope should go. That is intended (the clue is shared), and Task 66's human review watches that it does not solve the chamber for Can't see by itself.
- `hollow` is not in the Can't-see briefing, on purpose (it would announce a cache); a player learns it by walking.
- A chamber's rows below the room make the file taller; room heights are 7, 9, 10, 9, 8 and 12 before the chamber, and the client scales the map to fit, which Task 58's layout spec checks at 1280 and 375.

## 9. Corrections log

- 2026-11-03, Task 56's human review (recorded in 14-03 §9): the stethoscope clue in a chamber was unfindable. The user settled a floor inspection plate and a different step sound for cache chambers only; this file carried it as a pending amendment, and the execute-plan Phase 1 review stopped on it (a task without a task). Written as Task 66, ahead of 58. Pattern: a clue placed by authoring needs something in the world that points at it.

- 2026-11-03, Task 59 (found when the bots stopped clearing room 7, in all three rotations, after the cache's ink was added): `inkPost` in `src/game/bots/brain.ts` sends the torch bot to stand at the ink of every unsolved numbered wire panel, and a hidden cache's panel is never solved, so the bot camped at it forever. Expected "bots ignore caches" (the plan says so in five places) to hold in every bot helper; it held in `jobs.ts` and not in this one. Fix: `inkPost` skips a cache's station, with a failing `solve.test.ts` case on the real room 7 shown red by removing the line. Pattern: a rule stated for a whole subsystem needs a test through the real room, not one per helper.
- 2026-11-03, Tasks 58 and 59 (found by diffing each room's object ids against `git`): object ids are numbered in reading order (`Q`, `c`, `u`, `g`, `D`...), so a letter I added above an existing one of its kind renumbered it. In room 9 the new vent `c` at (22,2) took `c1`, and the room's real keypad `Q7` (`clue: "c1"`) would have listened to the cache's vent while `pnpm lint:rooms` stayed green. Expected the linter to catch a rewired room; it only checks that each clue is valid. Fix for now: append new letters after the existing ones in reading order and diff ids before and after (written into CLAUDE.md's Rooms bullet). A durable sensor (a snapshot of each shipped room's id-to-position map) is not built; noted for the phase boundary rather than acted on mid-phase.
- 2026-11-03, Task 58 (found while writing the room 5 and 9 caches): a hidden keypad cache's clue object chimed from the first tick, announcing a cache nobody had uncovered (demo step 2: "no chamber, label or sound for it"). Expected hidden to mean silent as well as invisible; the sim hid the station's view and Act but not the clue object it names. Fix: `hiddenCacheClue` in `src/game/sim/stations.ts`, used by `updateClues`, with a test in `src/game/sim/cache.test.ts` shown red by removing the guard.
- 2026-11-03, Task 58 (found by the linter, then by reasoning): a keypad's code is `answer[i]` in 0 to 8, so a cache keypad needs the full 3x3 keys. My first room 5 cache had three keys and would have had an unsolvable answer; lint cannot see this because it never checks that an answer is reachable. Fixed by authoring nine keys. Not guarded by a test of its own: `spec/caches.test.ts` solves every cache's real station from its real answer, which would have failed.
- 2026-11-03, Task 59 (judgement call, recorded for the report): room 9's cache is a **dial**, not the keypad or vault the table lists. Every spot for a second vent in room 9 either renumbered an existing clue (see above), landed in the original keypad's own alcove and broke its presence rule, or put two chimes under one vent. A dial needs no clue object (its clue is the tumbler at the plate), reuses Task 66's plate and stethoscope, and its type was met earlier in the same room (`Q1`, `Q6`). The riddle and clue split are unchanged in kind. Say if you want a keypad or vault there instead.
- 2026-11-03, Task 58 (a lint boundary found authoring room 9): a dial cache's plate must be within 2.5 tiles of the dial's anchor (Task 66's rule) and more than 1.5 tiles from every pad and the anchor, or someone at the dial hears the tumbler alone; with pads either side of the anchor on one row the two cannot both hold, so the pads and the plate must not share a row. Room 9's dial has its pads on row 12 and its plate on row 14.

- 2026-11-03, Human review of Tasks 66, 58 and 59 (the user, after a three-tab playtest). Findings, with what each was and where it went:
  - **Fixed (bug, test first, shown red):** a send-back shut a chamber on the server but sent no map, so clients kept it drawn open and walkable while the server treated it as wall ("the door does not close, but it can't be walked through", seen in room 7, true of every cache room). Expected a send-back to be a map change like an uncover; the map was re-sent only on `uncover` and `solved`. `src/net/game.ts` now counts `caught`, with a test in `src/net/game.test.ts`.
  - **Fixed:** the riddle chip started collapsed and needed a tap to show the whole line. It now shows the whole riddle, a click hides it to "Side job", and a drawn chevron says it toggles (`SideJob.tsx`, `game.css`; `cache-chip.test.ts` measured against the old default and was changed with it).
  - **Fixed:** G did nothing at a hatch sill, only Act did. `gearPress` now takes from and puts on a sill (shared `useSill`), after handing to a teammate and before dropping.
  - **Room authoring, to do:** room 4 loses the chamber's stethoscope (the room's own is enough: the lint rule that demanded one is wrong and goes); room 5's vent moves to the far left end of the corridor, away from the real keypad's vent; room 6 needs a visible lamp clue for the cache, or a lock towards the end in the keypad room; room 7's ink goes behind the switches door and its last wire panel moves to the wall right of the door; room 8's bells move to the right wall, off the door, and its tune box moves away from the second music box (the chimes overlap); room 9's safe moves away from the door.
  - **Render, to do:** the inspection plate fills the whole tile in a subtle floor-grey with the two rivets and no ring; room 9's safe name plate hides its shape and the shape covers the solved tick on the wires and keypad.
  - **Design, needs a ruling:** the motif is always the moon and the star is a decoy that does nothing, so finding a chamber is predictable. The user wants a real challenge in finding it.
  - **Design, needs a ruling:** the heist-complete shelf repeats a room's item when the room is replayed; the user wants no repeats or a simpler shelf.
  - **Other bugs raised, to do:** a station is visible through walls (the music box in room 7); the leaderboard should show the current team's loot.

- 2026-11-03, rulings after the review feedback (the user, answering two questions): (1) **the heist shelf** is one plate per room showing the latest result, which the heist record now does (`src/net/heistTotals.ts`: a replayed room replaces its earlier clear in every total, and the same bug had been doubling the replayed room's time, loot and version in the saved heist run). (2) **Finding the chamber:** the user chose "the riddle points at a place, not a symbol". That is a change to cache FR4 and to ADR 0020 (the motif tile, its decoy and the uncover lint are all built on a glyph the riddle names), so it is **not built in this phase's execution**: it needs a superseding ADR and a replan (`plan-feature`), and the room files keep their motif tiles until then. The star decoy "serves no point" is the same finding.

- 2026-11-03, Human review, second round (the user, same playtest session). What each finding was and where it went:
  - **Fixed, test first, shown red:** a station is sent whole when any one part is in sight, and the client drew every part (wires, a music box, a back box) through the veil. `cutToSight` (`src/client/render/sight.ts`) cuts a station to the parts you can see and drops it when none is; the wire and the name plate follow. Also an effect (the secret door's slide, dust) is now drawn only where you can see it: `fxOfCacheEvent` is team-wide by design (every role gets the moment) but the picture of it at a hidden place told a sighted player where the door was.
  - **Fixed, test first:** the door chip said "opens while its plates are held" for every door. A door now carries how it opens (`EntityView.opens`: `stations` or `sequence`; plates are the default), with a chip of its own for each, and a test over every door in every shipped room that fails if one is mislabelled.
  - **Fixed:** the last room could not be restarted from the menu. The page shows the heist-complete screen in place of the room whenever it holds a heist result, and a passed restart cleared only the room's summary, so the old result stayed over the restarted room for good. `afterRestart` (`src/client/restart.ts`) now drops both. **Not verified in a browser** (it needs a whole real room cleared by hand); the pure function is tested, the page wiring is read and typechecked.
  - **Fixed, test first, shown red:** a music box's wire ran as a two-point straight line because the secret door in the wall row broke the wall run it follows; a wire now treats a door in a wall as wall (`linkPath`).
  - **Room 8, authored with the user's choice (a vent alcove):** the hidden music box's tune box is in a one-tile alcove behind a vent at (30,8), in sight of neither real tune box and not seen from the corridor (checked with `visibleFrom`). Sound still leaves through the vent, so someone standing by it can hear it beside the second real box's tune: one corridor cannot isolate sound as well as sight. Flagged for the playtest.
  - **Not fixed, open:** (1) *tumbler no longer audible except on the role assignment screen.* Every layer I could test works: in the real room 4 the stethoscope holder's view carries `tumbler` on the first digit of a two-digit code, the existing perception and parity tests pass, and the page plays every view's sounds. I could not reproduce it and have not changed anything; I need the room, and where the holder stood. (2) *Players, stations and effects out of the cone are drawn faded through the veil, and a player round a corner is drawn whole.* The server sends a tile as seen when any ray touches it, and the picture is cut by the exact light polygon, so a figure on a partly lit tile is drawn whole and then veiled. The user's rule ("cut off exactly by the cone") means clipping what stands to the light polygon, with the outline of a figure behind a wall and marks as the deliberate exceptions. That is a rendering rule change across the whole frame, so it waits for the user's go-ahead. (3) *Finding the chamber:* to be brainstormed and replanned.
  - **Process finding:** every one of these bugs is something the sim and the unit tests could not see, because it lives between layers (server sends a whole station, client draws it whole; server tile sight, client ray light). See the backlog entry on automated playtests.

## 10. Rulings from the execute-plan Phase 1 review (2026-11-03)

- All six chambers go **below** their rooms (rows appended; no coordinate shifts). Rooms 06 and 08's "above" entries became "below".
- Task 66 comes first; 58 and 59 depend on it.
- The new test files are `spec/caches.test.ts` and `spec/layout/chamber.test.ts`; `spec/heist-cache.test.ts` stays as is.
- The 14-02 and 14-03 deferrals of a real-chamber-room browser check land in Task 58's `spec/layout/leaderboard.test.ts` and `chamber.test.ts` additions.
