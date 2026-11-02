# Escape-room heist: Phase 14 (caches): the six chambers and wrap-up

- **Date:** 2026-11-02
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-02
- **Part of:** `plans/2026-11-02-escape-room-heist-14-00-overview.md`. Read it first (demo §2, cache metadata §4).
- **Depends on phases:** 14-01 (53), 14-02b (62 to 65: the chamber format, sim, view and results), 14-03 (55 to 57). Needs the rooms already in `rooms/04..09`.
- **Amended 2026-11-02:** a cache is now a side chamber behind a secret door with a vault behind a second one (overview §4); each room needs its chamber authored.

## 1. Summary

Six hand-authored **chambers**, one per room 4 to 9: a side room hung off the room (up or down) behind a secret door, with the cache's station inside
and a vault alcove behind a second secret door holding the item. Each is linted, cleared by perception-only bots without being opened, and played by the
user. Then the wrap-up: CLAUDE.md, DESIGN.md, the backlog, ADR 0020 and the process log. Ends with the user's acceptance.

## 2. Requirements (this phase)

### 2.1 Functional

Cache FR1, FR2 (the rooms, owners 1, 2, 3, 1, 2, 3), FR4 (a decoy tile each; the secret door), FR6, FR7 (the vault, the owner's take), FR8 (rooms still clear), and the heist-level demo steps 1 to 13.

### 2.2 Non-functional

Every room passes `pnpm lint:rooms` and `spec/rooms.test.ts` (bots clear it in every role rotation, with the cache left alone). Pacing
(`pacing.test.ts`): a cache's station type was met earlier. Never hand-write a room without running both.

### 2.3 Out of scope for this phase

Bots solving a cache; a relay skill; caches in rooms 1 to 3.

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
| 06 Lights Out | 3 | switches | ring | tile seen; the target card is behind glass, read by a different role | above the wing |
| 07 Night Shift | 1 | wires | goblet | tile seen; the rule is UV ink needing the torch | below the vault corridor |
| 08 Music Room | 2 | bells | pen | tile seen; the tune is heard through a vent | above the music room |
| 09 The Vault | 3 | keypad | necklace | tile seen; the code is a symbol order from a wing | below the vault wing |

The "Chamber off" column is a first proposal, not a ruling: the user settles it per room as each is played. A chamber is never in the exit chamber and never
beside a checkpoint flag (a send-back would otherwise spawn people next to a wall that hides a room).

## 5. Task breakdown

### Task 58: Chambers in rooms 4 to 6

- **Description:** author the three chambers (their rows, both secret doors, the station inside, the uncover and decoy tiles, the vault and its item tile) and prove them: lint, bots clear without opening, a person can open, solve and take.
- **Files touched:** `rooms/04-the-safe.room`, `05-the-gallery.room`, `06-lights-out.room` (add the `cache` metadata with its `chamber`, one extra `Q` anchor and its
  parts inside the chamber, the chamber rows below the room, the motif tiles), `spec/rooms.test.ts` (a room with a cache clears with the cache unsolved; a unit-level scripted solve per room
  in `spec/caches.test.ts`, which uncovers the right tile, walks in, solves the station, takes the item as the owner, and asserts the doors, the loot, the events and a
  send-back undo), `spec/heist.test.ts` (a `cleared` with `cache` for a cache room reached by bots; `opened: false, found: false` since bots ignore it), `spec/layout/leaderboard.test.ts` (the
  cleared card with a real chamber room at 1280 and 375: the tile after the credits and before the buttons, inside the column, no clipping with a long item
  name, the buttons' bottom edge inside the frame at 1280, the taken, left-behind and not-found tiles the same height; shown red by moving the tile below the buttons),
  and a chamber layout spec `spec/layout/chamber.test.ts` (a real game on a room with a chamber: the map is solid wall where it hides at 1280 and 375, the door slide
  runs once and not under reduced motion, the item stands and leaves on the take, the owner's chip walks its four states, and a non-owner cannot take it).
- **Tests first (red):** (a) `lintRoom` fails each room with a cache whose type is wrong, tile missing or chamber malformed before the room is authored (written
  as a table from the plan); (b) the scripted open, solve and take fails until the room exists; (c) `spec/rooms.test.ts` stays green for all nine, bots clearing each with the
  chamber never opened.
- **Implementation (green):** author each room by the structure above; run `pnpm lint:rooms`, `pnpm mockup:room`, read what each role perceives
  from the tile and the clue; every cache shown to be un-solvable alone by the lint (break the split on purpose and watch it fail), and every chamber shown to be sealed (open a path to it on purpose and watch the lint fail).
- **Acceptance criteria:** the nine rooms lint and clear; the scripted open-solve-take passes for rooms 4 to 6 and a send-back undoes it; each rule's red shown; the chamber looks like wall at 1280 and 375 until opened.
- **Human review:** the user plays rooms 4 to 6 in three tabs: the riddle reads well, the motif hunt is fair, the secret door and the chamber feel like part of the room, the clue is perceivable by
  the intended role only, only the owner can take the item, the reward feels earned. Pass = the user says so.
- **Depends on:** 53, 55 to 57, 62 to 65.

### Task 59: Chambers in rooms 7 to 9

- **Description:** as Task 58 for rooms 7 (UV ink), 8 (tune through a vent) and 9 (the vault's order).
- **Files touched:** `rooms/07-night-shift.room`, `08-music-room.room`, `09-the-vault.room`, `spec/caches.test.ts`, `spec/room07.test.ts` if its
  assertions name object counts, and the layout specs above for the new rooms.
- **Tests first (red):** as Task 58 (a) to (c) for these rooms; (d) `spec/heist.test.ts` clears the whole heist through room 9 and the final
  `heist` message has six `caches` entries in room order, all `found: false` (nobody took anything).
- **Implementation (green):** as Task 58.
- **Acceptance criteria:** as Task 58 for rooms 7 to 9; the full heist clears with bots; a cache opened, solved and taken by script in any one room raises that
  room's loot by 1 and that room's `found` to true, and the same cache opened and solved but left raises nothing and leaves `found` false with `opened` true.
- **Human review:** the user plays rooms 7 to 9 as for Task 58, and one full heist end to end to see the shelf.
- **Depends on:** 58.

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
- **Depends on:** 58, 59.

## 6. Phase Definition of Done

- [ ] Tasks 58 to 60 done and committed one each (Human review tasks only after acceptance).
- [ ] `pnpm test:unit` and `pnpm check` pass on a fresh check server.
- [ ] Demo script 1 to 11 (overview §2) played by the user on a local build, three tabs, 1280 and 375.
- [ ] CLAUDE.md invariants hold; ADR 0020 accepted by the user.
- [ ] Tick this phase in the 14 overview §5, tick phase 14 in the master overview §5, and commit.

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR1, FR2, FR4, FR6, FR7, FR8 (the rooms) | 58, 59 |
| Docs, ADR, process | 60 |

## 8. Risks / open questions

None open. The six riddle sentences are settled with the user as each room is played (Human review in Tasks 58 and 59), not before.
