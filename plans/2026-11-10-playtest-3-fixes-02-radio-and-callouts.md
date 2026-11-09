# Playtest 3 fixes: Phase 02, the radio counts from 1, and bots say a direction once

- **Status:** Approved
- **Tier:** Slice (two)
- **Overview:** `plans/2026-11-10-playtest-3-fixes-00-overview.md` (§1 run rules). Spec: `specs/2026-11-10-playtest-3-fixes.md` FR7–FR11.

## What you'll see

- The plated radio's face has numbered ticks from 1 to 10, left to right. The braille plate names the band you count to, so "band 4" means the 4th tick.
- A bot guiding Can't see says "Right" once when the way turns right, not every second and a half. If Can't see stands still for about 3 s, it says it once more, then waits for the next turn.

## Demo script

1. Room 6, Can't see reads the plate: band N. → The turner sets the needle on the Nth tick from the left, and it's the real band.
2. Room 1 with a bot as Can't hear guiding a person playing Can't see. Don't move. → One "Right", then a second "Right" about 3 s later, then nothing.
3. Walk right as told, then the path turns down. → One "Down".

## Context (read this turn)

- Positions are 0–9 inside the game. Stepping the dial is `(input + ±1 + range) % range` (`src/game/sim/stations.ts:466`), and the knob starts at 0.
- `platedRadio` picks settings 1 to 9 (`stations.ts:188`).
- The plate's number is `plateNumber` (`src/game/sim/braille.ts:21`). Its radio branch is `return s.answer[0]` (line 31), while keypad and wires use `plusOne`.
- The bots' turner uses `radioPad(o, b)` (`src/game/bots/decode.ts:324`). It takes the band Can't see texted (`b.numbers.at(-1)`) as a position to turn to, so it must subtract 1.
- `lintPlates` and its radio rules are in `src/game/rooms/lint.ts` (around lines 361–466).
- The face is drawn at `src/client/render/stations.ts:785-807` (`range = 10`, needle at `shows[0]`).
- Bot direction repeats: `REPEAT_MS = 1500` (`src/game/bots/brain.ts:169`), and the repeat block is at `brain.ts:1600-1602`. A guide's memory `g` has `moving`, `heading`, `lastSent` and `lastSentAt`.
- `STUCK_TICKS = 8` (`brain.ts:175`) already measures a person who hasn't moved while told to.

## Tasks

### Task 272: The radio counts from 1 (FR7–FR9) — [ ] (review queued)

- **Tests first (red):**
  - `src/game/sim/braille.test.ts` ("a radio: its real band", line 75): the plate carries `answer[0] + 1`.
  - `src/game/bots/decode.test.ts`: `radioPad` turns toward position `told − 1` (e.g. told 4, setting 0 → the right-hand pad; told 1, setting 0 → `null`, since it's already there).
- **Implementation:**
  - `plateNumber`'s radio branch uses `plusOne`.
  - `radioPad` subtracts 1 from the told band.
  - Lint's radio checks are read and adjusted so they still mean what they said. Log any rule you change.
  - Ticks 1–10 are drawn under the radio face's band at its existing scale: `WORLD.line` for the ticks and the face's label style for the numbers.
  - If the take hint or a caption names a position, it shows `value + 1`.
- **Acceptance:**
  - the tests above pass
  - `pnpm lint:rooms` is clean
  - `spec/rooms.test.ts` clears every room, in every rotation
  - screenshots `review/p3-272-radio-{1280,375}.png` of room 6's radio

  **Human review:** whether the ticks read clearly at phone size.
- **Break check:** by script, put back `return s.answer[0]`; the braille test and `spec/rooms.test.ts` room 6 go red.
- **Depends on:** none.

### Task 273: Bots say a direction once, and nudge once (FR10–FR11) — [ ]

- **Tests first (red), in `src/game/bots/brain.test.ts`,** with a tick count and no clock:
  - a guide whose heading doesn't change sends its direction exactly once over 10 s while the guided seat walks that way
  - if the guided seat stands still (or moves against the heading) for 3 s after it, the guide sends the same direction exactly once more, then nothing for the next 10 s
  - a change of heading sends the new word at once
- **Implementation:** replace the `REPEAT_MS` timer repeat with a nudge. A guide keeps `nudged: boolean`, reset when the heading changes. It repeats once when the guided seat has made no progress toward the heading for `NUDGE_MS = 3000` since `lastSentAt`. Reuse the existing stuck measure (`stopFrom`, `STUCK_TICKS`) if it fits; log the choice.
- **Acceptance:**
  - the tests pass
  - `spec/rooms.test.ts` clears every room in every rotation; this is the real guard that bot-guided Can't see still gets through
  - `pnpm playtest --room 01` passes

  If a room stops clearing, park (§1 rule 3) rather than adding repeats back.
- **Break check:** by script, put back the `REPEAT_MS` repeat; the "exactly once" test goes red.
- **Depends on:** none.

## Phase Definition of Done

Tasks 272–273 are ticked or parked, `pnpm check` is green, then commit `Unit done: p3fix02`.

## Corrections log

(empty)
