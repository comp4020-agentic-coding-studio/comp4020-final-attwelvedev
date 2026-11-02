# Escape-room heist: Phase 14 (caches): the six caches and wrap-up

- **Date:** 2026-11-02
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-02
- **Part of:** `plans/2026-11-02-escape-room-heist-14-00-overview.md`. Read it first (demo §2, cache metadata §4).
- **Depends on phases:** 14-01 (53), 14-03 (55 to 57). Needs the rooms already in `rooms/04..09`.

## 1. Summary

Six hand-authored caches, one per room 4 to 9, each linted, cleared by perception-only bots with and without the cache solved, and played
by the user. Then the wrap-up: CLAUDE.md, DESIGN.md, the backlog, ADR 0020 and the process log. Ends with the user's acceptance.

## 2. Requirements (this phase)

### 2.1 Functional

Cache FR1, FR2 (the rooms, owners 1, 2, 3, 1, 2, 3), FR4 (a decoy tile each), FR6, FR7, FR8 (rooms still clear), and the heist-level demo steps 1 to 11.

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
  tiles (`.`) reachable by walking (Task 53 lint).
- `pnpm mockup:room rooms/NN-slug.room out.html` shows what each role perceives from each tile (`src/game/rooms/mockup.ts`); it does not
  draw the stash.
- `spec/rooms.test.ts` runs every room with bots in every rotation; `spec/room07.test.ts`, `spec/heist.test.ts`, `spec/heistPlay.ts`.
- CLAUDE.md bullets: Sensory parity, Rooms, Shape of the app; `doc/adr/0020-side-jobs-are-hidden-optional-stations.md` (proposed);
  `specs/backlog.md` Decided lines; `PROCESS_LOG.md` (append-only, header comment has the format).

### Interfaces from earlier phases (exact)

From 14-01: the cache metadata shape (overview §4), `cacheOf`, `lintCaches` (a room with a cache runs it inside `lintRoom`), `World.cacheUncovered`,
`World.cacheBy`. From 14-02: `cleared.cache`, `heist.caches`. From 14-03: the drawn stash, the chip, the tile and the shelf.

## 4. Approach

**One cache per room, designed with its clue split across roles.** A cache's clue is the clue of its station type (a dial's tumbler heard with a
stethoscope, a keypad's code from a plaque, wires' rule on a plaque, a music box's tune, switches' target card, a vault's order clue, a sync
lock's keys), and the uncover tile is a drawn motif on a wall or floor where only sighted roles perceive it, with one decoy of another motif.
So the owner's riddle names the motif, the tile is found by a sighted role, and the clue belongs to a different role. The six, to be settled
with the user at each room (the plan fixes the structure, not the sentence):

| Room | Owner seat | Station type (already met) | Item | Where the structure puts the split |
| --- | --- | --- | --- | --- |
| 04 The Safe | 1 | dial | watch | tile seen by sighted; the tumbler is heard with the stethoscope |
| 05 The Gallery | 2 | keypad | ledger | tile seen by sighted; the code comes from a plaque only one role can read |
| 06 Lights Out | 3 | switches | ring | tile seen; the target card is behind glass, read by a different role |
| 07 Night Shift | 1 | wires | goblet | tile seen; the rule is UV ink needing the torch |
| 08 Music Room | 2 | bells | pen | tile seen; the tune is heard through a vent |
| 09 The Vault | 3 | keypad | necklace | tile seen; the code is a symbol order from a wing |

Each cache is placed off the main route (a dead-end alcove or a wing), never in the exit chamber, with a station type already met (Task 53).

## 5. Task breakdown

### Task 58: Caches in rooms 4 to 6

- **Description:** author the three caches and prove them: lint, bots clear without solving, a person can.
- **Files touched:** `rooms/04-the-safe.room`, `05-the-gallery.room`, `06-lights-out.room` (add the `cache` metadata, one extra `Q` anchor and its
  parts, the alcove tiles), `spec/rooms.test.ts` (a room with a cache clears with the cache unsolved; a unit-level scripted solve per room
  in `spec/caches.test.ts`, which uncovers the right tile and solves the cache through the real sim, then asserts the loot, the events and a
  send-back undo), `spec/heist.test.ts` (a `cleared` with `cache` for a cache room reached by bots; `found: false` since bots ignore it), `spec/layout/leaderboard.test.ts` (the
  cleared card with a real cache room at 1280 and 375: the tile after the credits and before the buttons, inside the column, no clipping with a long item
  name, the buttons' bottom edge inside the frame at 1280, found and missed tiles the same height; shown red by moving the tile below the buttons).
- **Tests first (red):** (a) `lintRoom` fails each room with a cache whose type is wrong or tile missing before the room is authored (written
  as a table from the plan); (b) the scripted solve fails until the room exists; (c) `spec/rooms.test.ts` stays green for all nine.
- **Implementation (green):** author each room by the structure above; run `pnpm lint:rooms`, `pnpm mockup:room`, read what each role perceives
  from the tile and the clue; every cache shown to be un-solvable alone by the lint (break the split on purpose and watch it fail).
- **Acceptance criteria:** the nine rooms lint and clear; the scripted solves pass for rooms 4 to 6; each rule's red shown.
- **Human review:** the user plays rooms 4 to 6 in three tabs: the riddle reads well, the motif hunt is fair, the clue is perceivable by
  the intended role only, the reward feels earned. Pass = the user says so.
- **Depends on:** 53, 55 to 57.

### Task 59: Caches in rooms 7 to 9

- **Description:** as Task 58 for rooms 7 (UV ink), 8 (tune through a vent) and 9 (the vault's order).
- **Files touched:** `rooms/07-night-shift.room`, `08-music-room.room`, `09-the-vault.room`, `spec/caches.test.ts`, `spec/room07.test.ts` if its
  assertions name object counts.
- **Tests first (red):** as Task 58 (a) to (c) for these rooms; (d) `spec/heist.test.ts` clears the whole heist through room 9 and the final
  `heist` message has six `caches` entries in room order, all `found: false`.
- **Implementation (green):** as Task 58.
- **Acceptance criteria:** as Task 58 for rooms 7 to 9; the full heist clears with bots and a cache solved by script in any one room raises that
  room's loot by 1 and that room's `found` to true.
- **Human review:** the user plays rooms 7 to 9 as for Task 58, and one full heist end to end to see the shelf.
- **Depends on:** 58.

### Task 60: Wrap-up: docs, backlog, ADR 0020, process log

- **Description:** bring the docs in line with the code.
- **Files touched:** `CLAUDE.md` (Shape of the app: caches; Sensory parity: `uncover` and `stash` are team-wide with parity rows, the riddle is
  an own-only view field; Rooms: a cache is one per room, its clue and tile are linted to need different roles and its station type must already
  be met; bots ignore caches), `DESIGN.md` checked against the code, `specs/backlog.md` (a Decided line for the 2026-10-28 side-job idea:
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
