# Escape-room heist: Phase 03, room 2 The Gallery

- **Date:** 2026-10-28
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-10-28
- **Part of:** `plans/2026-10-28-escape-room-heist-00-overview.md`. Read it
  first, especially §3 and §4.1 (room format additions).
- **Depends on phases:** 01, 02.

## 1. Summary

Builds the first station room, The Gallery, adds the hold-hands label to room
1, and runs playtest 5 before rooms 3 and 4 are built. Ends with a three-room
heist (First Job, The Gallery, and the old room 3 still in place) that is
playable end to end, and a written playtest.

## 2. Requirements (this phase)

### 2.1 Functional

Spec FR26 (rooms 1 and 2), FR2 (room 2 design), FR3 (bots clear room 2).

### 2.2 Non-functional

Room size within Task 7's measured budget.

### 2.3 Out of scope for this phase

Rooms 3 and 4 (phase 04), side jobs (phase 05).

### 2.4 Assumptions

See overview §2.4.

## 3. Existing code context (verified 2026-10-28)

- `rooms/01-first-job.room` (40×11; beats "The crate", "Glass", "Vent and three
  hands"; hints jobs), `rooms/02-cameras-lasers.room`, `rooms/03-vault.room`
  (old, to be replaced in phase 04).
- `src/game/rooms/load.ts` — `loadRooms(dir = "./rooms"): Room[]`, sorted by
  file name.
- `pnpm mockup:room rooms/NN-slug.room out.html` — what each role sees and hears
  from each tile (`src/game/rooms/mockup.ts`).
- `spec/rooms.test.ts` — `clearEveryRotation` over shipped rooms and drafts:
  cleared, within `meta.budgetS` (default 600), `caught === 0`, every
  checkpoint set, `refused === 0`.
- `src/client/labels.ts` — `LABEL_COPY` (the hold-hands row added by Task 10).
- `playtests/2026-10-14-playtest-02.md` — the write-up format (header,
  "What happened", "What can be brought forward" table).

### Interfaces from earlier phases (exact)

- Room format (overview §4.1): letters `Q g H b l j u`; station metadata
  `{"type": StationType, ...}` per phase 01 §4's table (`dial`: `pads`,
  `back`, `digits`, `range`; `wires`: `wires`, `plaque`; `keypad`: `keys`,
  `clue`, `length`; …); gear metadata `{"item": GearItem}`.
- Bot hint jobs (Task 4): `{"beat":n,"station":"Q1"}`, `{"beat":n,"take":"g1"}`,
  `{"beat":n,"give":"g1","to":Role}`, `{"beat":n,"sill":"g1","hatch":"H1"}`,
  `{"beat":n,"tow":Role,"to":[x,y]}`, plus the existing `goTo`, `push`, `all`,
  `prefer`.
- `lintRoom(room): LintIssue[]` with `lintPresence` (Task 5).

## 4. Approach

**The Gallery** (`rooms/02-gallery.room`, hue apricot, about 48×24): a central
hub (spawn, a checkpoint, the exit door) with three side chambers:

- **West: the safe.** Dial on the safe front facing the hub; the `back` tile is
  in a narrow service passage behind, reached by a different door and joined to
  the safe by a vent; the stethoscope lies in the hub. Clue (tumbler) at the
  back; control (pads) at the front; feedback (dial number by sight, ticks by
  ear) at the front. One person turns, one listens behind, and someone relays
  ("stop": tumbler-hearer to turner) across the channel edges.
- **North: the wires.** The wire panel; its plaque is in the east chamber.
  A camera sweeps the north chamber.
- **East: the keypad and the plaque.** The keypad's code clue is a `clue`
  chime behind a vent in the west passage (heard, not seen); the plaque for
  the wires is on the east wall. A guard patrols the hub's south corridor.
- The exit door opens when the safe, wires and keypad are all solved (`opensWhen`
  extended to station ids, Task 2's door rule if needed: a door may list `Qn`).
- At the start, the safe and keypad are both open (FR2); the wires need the
  plaque reader in the east chamber.

Room 1 gains only the hold-hands label (via the Task 10 label table); no change
to its grid.

## 5. Task breakdown

### Task 11: Doors that open on solved stations; room 1 hold-hands beat label

- **Description:** A door's `opensWhen` may name station ids (open when all
  are solved). Room 1 shows the hold-hands label where Can't see and a sighted
  teammate first stand side by side (the label is in `LABEL_COPY`; this task
  makes it appear: a `player` entity adjacent to you in room 1).
- **Files touched:** `src/game/sim/step.ts` (`updateDoors`) + `step.test.ts`;
  `src/game/rooms/lint.ts` (opensWhen may name a station) + test;
  `src/client/labels.ts` + test.
- **Tests first (red):** a door with `opensWhen: ["Q1","Q2"]` opens only when
  both are solved and stays open after a reset; lint accepts a station id and
  rejects an unknown one; `labelsFor` yields the hold-hands chip when a
  teammate is within 1.5 tiles in the first room.
- **Implementation (green):** as described.
- **Acceptance criteria:** tests green.
- **Depends on:** Task 2, Task 10.

### Task 12: Build The Gallery

- **Description:** `rooms/02-gallery.room` per this file's §4, with beats,
  intents, hints for the bots, and checkpoints; the old `02-cameras-lasers` is
  renamed to `03-cameras-lasers.room` (shifted) and the old `03-vault` to
  `04-vault.room` so the heist still has four rooms until phase 04 replaces
  them.
- **Files touched:** new `rooms/02-gallery.room`; renamed old rooms; their
  solution files under `src/game/rooms/solutions/` regenerated by
  `pnpm solve:rooms`; `spec/leaderboard.test.ts`/`spec/heist.test.ts` only
  where they name room ids.
- **Tests first (red):** `spec/rooms.test.ts` already runs every shipped room:
  `02-gallery` must clear in every rotation with no catches; `pnpm lint:rooms`
  must pass (presence rule and FR2).
- **Implementation (green):** draft in `spec/fixtures/drafts/` first, look at
  it with `pnpm mockup:room` for every role (the safe's back hears tumblers
  only with the stethoscope; the plaque is not in sight of the wires), then
  move it to `rooms/`.
- **Acceptance criteria:** `pnpm lint:rooms` and `spec/rooms.test.ts` green;
  bots clear in under the room's `budgetS`; the mockup page saved to
  `playtests/mockups/02-gallery.html`.
- **Human review:** on a local build, three tabs at desktop and phone, the user
  plays The Gallery in each role at least once: no one waits with nothing to
  do for more than about 20 s; the room is not cramped. Pass = the user says
  so.
- **Depends on:** Tasks 4, 5, 8, 9, 10, 11.

### Task 13: Playtest 5 and its write-up

- **Description:** The user runs a playtest of rooms 1 and 2 with three people;
  the agent writes it up from the user's notes.
- **Files touched:** new `playtests/2026-MM-DD-playtest-05.md` (format of
  playtest 02: header, what happened, findings table with actions and where
  they land); `specs/backlog.md` for ideas; failing tests for bugs found.
- **Tests first (red):** for each bug reported, a failing test before the fix.
- **Implementation (green):** fixes for plain bugs only; feature ideas go to
  the backlog; findings that change rooms 3–4 update phase 04's file before it
  starts (re-run its Phase 4 checks).
- **Acceptance criteria:** write-up committed; every finding has an action.
- **Human review:** the user confirms the write-up matches what happened.
- **Depends on:** Task 12.

## 6. Phase Definition of Done

- [ ] Every task in §5 is complete and its tests pass
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start` then `pnpm check` passes
- [ ] Task 12 human review accepted; playtest 5 written up (Task 13)
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR26 rooms 1–2 | Tasks 11, 12 |
| FR2 (design), FR3 (room 2) | Task 12 |
| Playtest gate | Task 13 |

## 8. Risks / open questions

None.

## 9. Corrections log

<!-- one line per user redirect during execution -->
