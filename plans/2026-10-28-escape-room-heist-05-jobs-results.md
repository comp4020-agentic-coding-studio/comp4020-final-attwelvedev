# Escape-room heist: Phase 05, side jobs, results and wrap-up

- **Date:** 2026-10-28
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-10-28
- **Part of:** `plans/2026-10-28-escape-room-heist-00-overview.md`. Read it
  first, especially §3 and §4.2.
- **Depends on phases:** 04.

## 1. Summary

Adds private side jobs, credited results lines, the comms map and the new
leaderboard edition (overhaul Tasks 24 and 25, moved here), then brings
CLAUDE.md, DESIGN.md, the backlog and ADR 0017 up to date. Ends with the
feature done.

## 2. Requirements (this phase)

### 2.1 Functional

Spec FR28, FR30, FR31; overhaul spec FR35 (comms map) and FR36 (versioning),
taken over from overhaul Tasks 24/25.

### 2.2 Non-functional

Perception (a side job is in its owner's view only); logging (side job done is
a kind, never the item); records keep every row (ADR 0014).

### 2.3 Out of scope for this phase

Ambience and music (overhaul phase 07, after this plan).

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

## 5. Task breakdown

### Task 17: Side jobs and credited results

- **Description:** Per this file's §4.
- **Files touched:** `src/game/rooms/format.ts` (`j`), `src/game/sim/step.ts`
  (pickup, snapshot), `src/game/perception.ts` (`sideJob` own only),
  `src/game/rooms/lint.ts`, rooms 02–04 (add `j` objects), `src/net/game.ts`
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
- **Depends on:** Task 16.

### Task 18: The comms map at room end (was overhaul Task 24)

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
- **Depends on:** Task 17.

### Task 19: A new leaderboard edition, the old one kept (was overhaul Task 25)

- **Description:** `edition` column and migration, `EDITION = 2`, filtering,
  the earlier-edition link and tabs; FR31.
- **Files touched:** `src/lib/schema.ts`, `drizzle/NNNN_*.sql` + meta
  (generated by `pnpm db:generate`), `src/lib/runs.ts` (+ test),
  `src/pages/leaderboard.astro`, `spec/leaderboard.test.ts`.
- **Tests first (red):** a run saved now has edition 2; `topRuns` defaults to
  edition 2 and returns edition-1 rows only when asked; existing rows read as
  edition 1 after migrating; the board has a tab for the full heist and each of
  the four rooms and links to the earlier board.
- **Implementation (green):** as described.
- **Acceptance criteria:** tests green; migration committed; no rows deleted.
- **Depends on:** Task 16.

### Task 20: Wrap-up: CLAUDE.md, DESIGN.md, backlog, ADR 0017

- **Description:** Bring the harness docs in line with the code.
- **Files touched:** `CLAUDE.md`: the **Sensory parity** bullet gains the
  deliberate exceptions (earpiece and stethoscope sounds have no picture; UV
  ink and goggles sight have no sound) and "a new station sound goes in
  `parity.test.ts`"; the **Rooms** bullet says rooms are station puzzles
  linted by `lintPresence` (no lead beats), and that a room must pass
  `pnpm lint:rooms` and `spec/rooms.test.ts`; the **Shape of the app** bullet
  mentions stations and gear. `DESIGN.md` checked against the code;
  `specs/backlog.md` Decided lines; `doc/adr/0017-…` status → `accepted`
  **only after the user says so**; `PROCESS_LOG.md` entry for the phase's
  moments.
- **Tests first (red):** `spec/design.test.ts` green; `pnpm check:evidence`.
- **Implementation (green):** edits as listed.
- **Acceptance criteria:** `pnpm check` green.
- **Human review:** the user reads the CLAUDE.md diff and approves ADR 0017.
- **Depends on:** Tasks 17, 18, 19.

## 6. Phase Definition of Done

- [ ] Every task in §5 is complete and its tests pass
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start` then `pnpm check` passes
- [ ] Tasks 17 and 20 human reviews accepted; ADR 0017 accepted
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR28, FR30 | Task 17 |
| Overhaul FR35 | Task 18 |
| FR31 / overhaul FR36 | Task 19 |
| Docs, parity exceptions in CLAUDE.md, ADR | Task 20 |

## 8. Risks / open questions

None.

## 9. Corrections log

<!-- one line per user redirect during execution -->
