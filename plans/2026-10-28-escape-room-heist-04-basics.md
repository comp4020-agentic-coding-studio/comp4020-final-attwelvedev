# Escape-room heist: Phase 04, rooms 1 to 3 (the basics)

- **Date:** 2026-10-28
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-10-28 (clues spec)
- **Part of:** `plans/2026-10-28-escape-room-heist-00-overview.md`. Read it first, especially §3
  (commands, room workflow, human review on a local build).
- **Depends on phases:** 03.

## 1. Summary

Replaces room 1 First Job (about eleven kinds of object in forty tiles) with three short rooms
that each introduce at most two new things. Ends with a heist that opens on rooms 1 to 3, then
runs the old `02-cameras-lasers` and `03-vault` (renumbered after them) until phase 10 removes
them, cleared by perception-only bots in every rotation and played by the user.

## 2. Requirements (this phase)

### 2.1 Functional

Clues FR9, FR10 (rooms 1 to 3), FR12 (the basics' labels); spec FR22 (holding hands taught in
room 2).

### 2.2 Non-functional

Each room about two to four minutes for a first-time crew; within Task 7's budget.

### 2.3 Out of scope for this phase

Station rooms (phases 05 to 10).

### 2.4 Assumptions

See overview §2.4.

## 3. Existing code context (verified 2026-10-28)

- `rooms/01-first-job.room` (40×11: crate, plate, door, checkpoint, glass, camera, vent, guard,
  three-plate door, exit, loot), `rooms/02-cameras-lasers.room`, `rooms/03-vault.room`, their
  hand-authored routes `src/game/rooms/solutions/02-cameras-lasers.json`, `03-vault.json`
  (`pnpm solve:rooms`, `scripts/solve-rooms.ts`, `src/game/rooms/solvePlans.ts`).
- `src/game/rooms/load.ts`: `loadRooms(dir = "./rooms")`, sorted by file name; the heist plays
  them in that order.
- Tests that use a shipped room by id as a fixture: `src/net/game.test.ts` (L89, L195, L207,
  L230), `src/game/cues.test.ts` (L14, L18), `src/game/perception.test.ts` (L917),
  `src/game/bots/solve.test.ts` (L6), `src/game/bots/forecast.test.ts` (L17, L45-81),
  `src/game/bots/brain.test.ts` (L27, L43), `src/game/sim/room01.test.ts`,
  `src/game/rooms/load.test.ts`, `spec/heist.test.ts` (L42-63), `spec/leaderboard.test.ts`
  (L74), `spec/rooms.test.ts` (L18), `src/components/Feeds.tsx`, `scripts/bench-tick.ts`.
- `src/client/labels.ts` `LABEL_COPY` (the basics' lines exist: plate, crate, door, glass, vent,
  camera, guard, exit, loot), the label cap from Task 10.
- Room workflow (CLAUDE.md): draft in `spec/fixtures/drafts/`, `pnpm mockup:room`, `pnpm
  lint:rooms`, `spec/rooms.test.ts`.

### Interfaces from earlier phases (exact)

```ts
// src/game/bots/brain.ts (Task 13)
export function think(room: Room, view: RoleView, inbox: ChannelMessage[], memory: BotMemory,
  now: number): BotTurn;
// src/client/labels.ts (Task 10): at most three chips on desktop, two on a phone, nearest first
```

## 4. Approach

| Room | File | New things | Shape |
| --- | --- | --- | --- |
| 1 First Steps | `rooms/01-first-steps.room` | plate and door; talking across roles | one corridor: a door held open by one plate; whoever stands on it is told to come through once the others are past (a second plate on the far side lets them) |
| 2 Three Hands | `rooms/02-three-hands.room` | crate; three-plate door (holding hands) | a crate pushed onto a plate opens the first door; a door that needs all three on plates; Can't see led there by the hand |
| 3 Watchers | `rooms/03-watchers.room` | glass and camera; vent and guard | a camera seen through glass but not heard; a guard heard through a vent but not seen |

Loot, a checkpoint and the exit appear in each without counting toward its two. The old
`02-cameras-lasers` and `03-vault` become `04-cameras-lasers.room` and `05-vault.room` (their
solutions renamed) so the heist stays playable until phase 10.

A test that used a shipped room as a fixture gets its own fixture under `spec/fixtures/rooms/`
(a copy of the room it relied on, renamed), so it keeps testing what it tested; a test that
promised something about the heist (`spec/heist.test.ts`: the first room's id and loot) is
updated to the new first room.

## 5. Task breakdown

### Task 14: Rooms 1 to 3

- [x] Done 2026-10-29 (overnight run). Deviations, ruled and logged in `plans/2026-10-28-escape-room-heist-overnight.md`: room 1 ends with a three-plate door (the FR10 lint rule); First Job's fixture is `spec/fixtures/first-job/`, not `spec/fixtures/rooms/`; `spec/caught.test.ts` runs its own app on it; a guide-bot fix for towing (`guideBlind`).

- **Description:** Author the three rooms per this file's §4, with beats, intents, hints,
  checkpoints and labels; rename the old rooms; move room-id fixtures.
- **Files touched:** new `rooms/01-first-steps.room`, `02-three-hands.room`, `03-watchers.room`;
  `rooms/01-first-job.room` removed (its copy moved to `spec/fixtures/rooms/` for the tests that
  used it); old rooms renamed to `04-…`, `05-…` with their solutions; each test in this file's §3
  list pointed at its fixture or, for heist promises, at the new room ids; `playtests/mockups/`
  pages for the three rooms.
- **Tests first (red):** `spec/rooms.test.ts` runs every shipped room: the three new ones must
  clear in every rotation, never caught, within `budgetS` (set to 240 s); a new
  `src/game/rooms/pacing.test.ts`: each shipped room introduces at most two kinds not met in an
  earlier room (loot, checkpoint, exit, spawn not counted), computed from the room files in order.
- **Implementation (green):** draft each in `spec/fixtures/drafts/`, look with `pnpm
  mockup:room` per role, then move to `rooms/`.
- **Acceptance criteria:** `pnpm lint:rooms`, `pacing.test.ts`, `spec/rooms.test.ts` green;
  no test deleted (each moved to a fixture or updated to the new ids, listed in the commit).
- **Depends on:** Task 13.

### Task 15: Rooms 1 to 3 played

- [x] Screenshots taken and the playtest done by the user, who accepted it on 2026-10-31 (it was queued in `review/QUEUE.md` from the overnight run).

- **Description:** The user plays rooms 1 to 3 in three tabs.
- **Files touched:** fixes from the review only (a failing test first for any bug).
- **Tests first (red):** for each bug found, a failing test.
- **Implementation (green):** fixes.
- **Acceptance criteria:** `pnpm check` green after fixes.
- **Human review:** on a local build, three tabs at desktop 1280 and phone 375, the user plays
  rooms 1 to 3 in each role at least once: each room teaches its two things and nothing else
  feels unexplained; never more than three label chips; no one waits with nothing to do for
  more than about 20 s. Pass = the user says so.
- **Depends on:** Task 14.

## 6. Phase Definition of Done

- [x] Every task in §5 is complete and its tests pass (Task 15's review accepted 2026-10-31)
- [x] `pnpm test:unit` passes
- [x] `pnpm build && pnpm start` then `pnpm check` passes
- [x] Task 15 human review accepted by the user on 2026-10-31
- [x] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| Clues FR9, FR10 (rooms 1–3) | Task 14 (`pacing.test.ts`), Task 15 |
| Clues FR12 (the basics' labels) | Task 14, Task 15 |
| Spec FR22 (hold hands taught) | Task 14 (room 2) |

## 8. Risks / open questions

None.

## 9. Corrections log

<!-- one line per user redirect during execution -->
