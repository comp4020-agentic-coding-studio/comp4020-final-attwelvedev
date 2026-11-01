# Escape-room heist: Phase 13 (room 7)

- **Status:** Approved
- **Part of:** `plans/2026-11-01-escape-room-heist-13-00-overview.md` (read it first: requirements, demo script, conventions, coverage).
  Depends on phase 12. Task numbers are global. Task 43 (phase 02) now also makes room 7's ink a number: Task 44's `beats` and `hints` edits must keep that text.
- **Commits:** one per task once `pnpm check` is green, ending with
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never push or deploy without the user's go-ahead.
- **Review mode:** build and commit as checks go green; `Human review:` items are reviewed together at the end of phase 13 (overview §5).

## Interfaces from earlier phases (exact)

From phase 02, Task 43: a wire panel with `"numbered":true` has `plaqueText(world, id)` equal to `String(answer[0] + 1)`, and room 7's `Q1`, `Q3` are numbered. Task 44 edits the same room file (a different region: doors, torch, `hints`), so edit by a unique string and re-read first. Bots route through the new doors and read the digit through the decoder Task 43 adds.

## Tasks

### Task 44: Room 7: a door the right cut opens, torch far from the ink  [ ]  (demo 5)

Lint's FR2 rule forbids hiding two stations from the start, so the new door sits between the wire stations and the
switch/lamp stations as a **corridor door**, not over a station. Read `src/game/rooms/lint.ts:450` first and tell the user at once if FR2 forbids it:
that blocks the task (do not edit the linter to pass).

- **Red first:** `spec/room07.test.ts` (the nearest room spec): with the wire for Q1 uncut, a player cannot reach the Q2 button tiles (no path
  through a closed door); after the cut they can, and the door stays open after the cut. Same for Q3 and Q4's area. `pnpm lint:rooms` passes room 7.
  A random-press test: pressing the Q2 buttons from the other side is impossible, so the lamps task cannot be skipped.
- **Green:** `rooms/07-night-shift.room`: a door `D5` (`opensWhen:["Q1"]`) and `D6` (`opensWhen:["Q3"]`) across the corridors between the wires and the switches;
  move torch `g2` far from both inks (the ink at tile 5 and 25: place the torch at the far end of the opposite room); update `hints` and `beats` text so bots route
  through it. Run `pnpm mockup:room rooms/07-night-shift.room out.html`.
- **Done when:** lint, `spec/room07.test.ts` and `spec/rooms.test.ts` (bots clear it every rotation) pass.
  **Human review:** play room 7: the torch needs finding, the switches cannot be reached before the cut.

### Task 45: Wire rule wording  [ ]  (demo 7)

`WIRE_RULES` ends with `"Otherwise: cut the first wire."` (`src/game/sim/stations.ts:38`). Scope after the 2026-11-01 ruling: room 7's plaques are numbers
(Task 43), so no room 7 card carries a rule; this task rewords the rules rooms 5 and 9 still show. It does not depend on Task 43's order.

- **Red first:** `stations.test.ts`: no rule text starts with "Otherwise"; every rule text is a full sentence that names its wire (the last rule "None of the rules above: cut the first wire." is
  fine: it says why). The same test checks the text of the rooms 5 and 9 plaques (the rooms that still show a rule); room 7 shows a digit, covered by Task 43.
- **Green:** reword to `"None of the rules above: cut the first wire."`; fix any copy or test that quotes the old text (grep first).
- **Done when:** test and `pnpm test:unit` pass.

## Phase Definition of Done

- [ ] Tasks 44 and 45 committed, \`pnpm lint:rooms\`, \`spec/room07.test.ts\` and \`spec/rooms.test.ts\` green.
- [ ] Covers demo 5, 7.
