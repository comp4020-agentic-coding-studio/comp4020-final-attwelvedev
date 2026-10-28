# Escape-room heist: Phase 11, side jobs, credited results, comms map, wrap-up

- **Date:** 2026-10-28
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-10-28
- **Part of:** `plans/2026-10-28-escape-room-heist-00-overview.md`. Read it first.
- **Depends on phases:** 10.
- **Re-plan:** was phase 05 (Tasks 17 to 20); same work, renumbered 28 to 31, side jobs in rooms
  4 to 9, nine leaderboard room tabs, ADR 0018 alongside 0017.

## 1. Summary

Adds side jobs (rooms 4 to 9) and credited results, the comms map at room end, a new leaderboard
edition for the nine-room heist with the old one kept, and brings CLAUDE.md, DESIGN.md, the
backlog and the ADRs in line with the code.

## 2. Requirements (this phase)

### 2.1 Functional

Spec FR28 (from room 4, clues FR11), FR30, FR31; overhaul FR35 (comms map).

### 2.2 Non-functional

Logging: side-job events as kinds only, never the item text.

### 2.3 Out of scope for this phase

Ambience and music (overhaul phase 07).

### 2.4 Assumptions

See overview §2.4.

## 3. Existing code context (verified 2026-10-28)

- `src/net/protocol.ts` — server message `{ t: "cleared"; room: string; ms:
  number; loot: number; lootTotal: number }`.
- `src/net/attach.ts` ~L344 builds a room run with `version:
  String(world.room.version)` and ~L361 a heist run with `version:
  running.heist.versions.join(".")`.
- `src/lib/runs.ts` — `version: string` per run; `sameHeat(kind, roomId,
  version)`; "the current version of a kind/room is whichever one was most
  recently played".
- `src/lib/schema.ts`, `drizzle/` migrations (`pnpm db:generate`).
- `src/components/RoomCleared.tsx`, `HeistComplete.tsx`, `src/pages/leaderboard.astro`.
- Overhaul phase 06's Task 24/25 text (in
  `plans/2026-10-19-play-overhaul-06-rooms-results.md` §5, now marked moved):
  comms map = per-direction, per-method delivery counts sent with `cleared`,
  drawn as a triangle with arrow thickness by count, a one-line summary;
  edition = an `edition` column, `EDITION = 2`, old board by link.
- `src/lib/gameLog.ts` `GameEvent`; `src/lib/log.ts` `redact` allowlist.

### Interfaces from earlier phases (exact)

- Rooms `rooms/01-first-steps.room` to `09-the-vault.room` (phases 04 to 10); the old rooms are gone.

- Room format letter `j` = `sidejob` with metadata `{"owner": 1|2|3, "text":
  string}` (overview §4.1); `World.sideJobsDone: string[]`, `Snapshot.sideJobsDone`
  (overview §4.2); `WorldEvent { kind: "sidejob"; id; seat }`;
  `RoleView.sideJob?: { id; text; done }`; `SideJob.tsx` renders it
  (Task 10).
- `lintPresence` and `worldAt(room, x, y, role, gear?)` (Task 5).
- Rooms `02-gallery`, `03-lights-out`, `04-vault` (Tasks 12, 14, 15).

## 4. Approach

**Side jobs.** One `j` per spawn seat in rooms 2–4, with `value` loot. The
owner sees `view.sideJob` (text from metadata) on the reveal and the HUD chip;
nobody else's view mentions it, though the item itself is an ordinary visible
object. Picked up by walking over it, by anyone; credited to the owner and
the picker. It counts toward `loot`. Lint: the item is not reachable by its
owner from their spawn without a door another role opens, or not perceivable
by the owner's role (e.g. a blind owner's item behind glass with no sound).
Bots ignore side jobs (FR3: they prove the room clears).

**Credits.** The server keeps per-seat counters for the room (stations solved
by Act, side jobs done, with whom) and sends `credits: { seat: Seat; line:
string }[]` with `cleared`; lines are built from fixed templates ("cracked the
safe", "side job: the music box (with Hanna)"), nicknames inserted client-side
from the crew (never logged).

## 4. Approach

As the old phase 05 §4 (kept in git history at `plans/2026-10-28-escape-room-heist-05-jobs-results.md`
before this re-plan): a side job is a `j` object owned by a spawn seat, placed where its owner can
neither perceive nor reach it alone (linted like the presence rule), worth loot, credited in the
results; the comms map counts deliveries per direction and method; `EDITION = 2`.

## 5. Task breakdown

### Task 28: Side jobs and credited results

- **Description:** Per this file's §4.
- **Files touched:** `src/game/rooms/format.ts` (`j`), `src/game/sim/step.ts`
  (pickup, snapshot), `src/game/perception.ts` (`sideJob` own only),
  `src/game/rooms/lint.ts`, rooms 04 to 09 (add `j` objects: side jobs from room 4, clues FR11), `src/net/game.ts`
  and `attach.ts` (credits), `src/net/protocol.ts` (`credits` on `cleared`),
  `src/components/RoomCleared.tsx`, `src/components/RoleReveal.tsx` (side job
  line), `src/lib/gameLog.ts` (`"sidejob"`), tests beside each;
  `spec/heist.test.ts` (credits arrive).
- **Tests first (red):** a side job in seat 1's view and absent from seats 0
  and 2; picking it up adds its value and is undone by a reset; lint flags an
  item its owner can reach and perceive alone; `cleared` carries one credit per
  seat; the log line has no item text.
- **Implementation (green):** as described.
- **Acceptance criteria:** tests green; lint and rooms spec green.
- **Human review:** three tabs: the side job is a fun aside, not a
  distraction; the credit lines read well. Pass = the user says so.
- **Depends on:** Task 27.

### Task 29: The comms map at room end (was overhaul Task 24)

- [x] **Done** on `auto/side-work` (overnight side session, 2026-10-29), ahead of Task 28: no
  side-job credit yet; `RoomCleared.tsx` marks where Task 28's credit lines go, under the map. The
  keyboard path is a 48 px chip per busy arrow (the SVG itself is a picture), and HeistComplete
  shows the last room's map. Merge into `auto/escape-room` is the user's.

- **Description:** Count deliveries per direction and method; send them with
  `cleared`; draw `CommsMap` in `RoomCleared` and `HeistComplete`.
- **Files touched:** `src/net/attach.ts`, `src/net/game.ts` (+ test:
  `countComms(comms, from, receivers, method)` pure helper),
  `src/net/protocol.ts`, `src/lib/gameLog.ts`/`src/lib/log.ts` (`sends`),
  new `src/components/CommsMap.tsx`, `RoomCleared.tsx`, `HeistComplete.tsx`,
  `src/styles/game.css`, `DESIGN.md`, `spec/heist.test.ts` (`cleared` has
  `comms` edges matching the messages sent), `spec/layout/hud.test.ts` (map
  visible, axe clean, summary names the busiest direction).
- **Tests first (red):** two callouts from seat 1 to seats 0 and 2 count 1
  each on `1>0` and `1>2`; a voice spurt counts once; counts reset next room.
- **Implementation (green):** triangle of the three players, arrow thickness
  by count, per-edge method breakdown on hover/focus, one-line summary.
- **Acceptance criteria:** tests green; never a message's content in the map or
  the log.
- **Depends on:** Task 28.

### Task 30: A new leaderboard edition, the old one kept (was overhaul Task 25)

- [x] **Done** on `auto/side-work` (overnight side session, 2026-10-29), ahead of Task 27: the room
  tabs come from `rooms/` at runtime, not a fixed nine; `/leaderboard.json`, the in-game panel and
  the room board on clear all read edition 2 through `topRuns`' default. Merge into
  `auto/escape-room` is the user's.

- **Description:** `edition` column and migration, `EDITION = 2`, filtering,
  the earlier-edition link and tabs; FR31.
- **Files touched:** `src/lib/schema.ts`, `drizzle/NNNN_*.sql` + meta
  (generated by `pnpm db:generate`), `src/lib/runs.ts` (+ test),
  `src/pages/leaderboard.astro`, `spec/leaderboard.test.ts`.
- **Tests first (red):** a run saved now has edition 2; `topRuns` defaults to
  edition 2 and returns edition-1 rows only when asked; existing rows read as
  edition 1 after migrating; the board has a tab for the full heist and each of
  the nine rooms and links to the earlier board.
- **Implementation (green):** as described.
- **Acceptance criteria:** tests green; migration committed; no rows deleted.
- **Depends on:** Task 27.

### Task 31: Wrap-up: CLAUDE.md, DESIGN.md, backlog, ADR 0017

- **Description:** Bring the harness docs in line with the code.
- **Files touched:** `CLAUDE.md`: the **Sensory parity** bullet gains the
  deliberate exceptions (earpiece and stethoscope sounds have no picture; UV
  ink and goggles sight have no sound) and "a new station sound goes in
  `parity.test.ts`"; the **Rooms** bullet says rooms are station puzzles
  linted by `lintPresence` and `lintClues`, introduce at most two new things (`pacing.test.ts`), and are cleared by perception-only bots (ADR 0018) (no lead beats), and that a room must pass
  `pnpm lint:rooms` and `spec/rooms.test.ts`; the **Shape of the app** bullet
  mentions stations and gear. `DESIGN.md` checked against the code;
  `specs/backlog.md` Decided lines; `doc/adr/0017-…` and `0018-…` status → `accepted`
  **only after the user says so**; DESIGN.md 4.6 and 4.8 checked (label cap, clue visuals); `PROCESS_LOG.md` entry for the phase's
  moments.
- **Tests first (red):** `spec/design.test.ts` green; `pnpm check:evidence`.
- **Implementation (green):** edits as listed.
- **Acceptance criteria:** `pnpm check` green.
- **Human review:** the user reads the CLAUDE.md diff and approves ADRs 0017 and 0018.
- **Depends on:** Tasks 28, 29, 30.

## 6. Phase Definition of Done

- [ ] Every task in §5 is complete and its tests pass
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start` then `pnpm check` passes
- [ ] Tasks 28 and 31 human reviews accepted; ADRs 0017 and 0018 accepted by the user
- [ ] The overview's feature-level Definition of Done holds
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| Spec FR28 (from room 4), FR30; clues FR11 | Task 28 |
| Overhaul FR35 | Task 29 |
| Spec FR31 | Task 30 |
| Housekeeping, ADRs | Task 31 |

## 8. Risks / open questions

None.

## 9. Corrections log

<!-- one line per user redirect during execution -->
