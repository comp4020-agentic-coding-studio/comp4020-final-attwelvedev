# Playtest 3 fixes: Phase 01, bugs and copy

- **Status:** Approved
- **Tier:** bugs and tweaks
- **Overview:** `plans/2026-11-10-playtest-3-fixes-00-overview.md`. Read its §1 (run rules) first. Spec: `specs/2026-11-10-playtest-3-fixes.md` (B1–B3, B5, T1–T3).

## Tasks

### Task 265: The wheel keeps its tabs on a short window (B1) — [x]

- **Found:** at 1280×560 the comms wheel opens with no Talk / Faces / Soundboard / Marks row. At 1280×800 it's there (`product/2026-11-10-shots/09-wheel-560.png`, `09-wheel-800.png`).
- **Files:** `src/components/CommsWheel.tsx`, `src/styles/game.css`, `spec/layout/wheel.test.ts`.
- **Test first (red):** in `spec/layout/wheel.test.ts`, at 1280×560, open the wheel for each role and assert:
  - all four tab buttons are in the viewport, at least 48 px tall, and not covered by the ring (their boxes never touch the ring's buttons)
  - the ring is fully in the frame

  Place figures; don't walk them (`CLAUDE.md`, flaky tests). Also run the existing 1280×800 and 375×812 cases.
- **Fix:** whatever the measured cause is. Likely the ring's size doesn't shrink with the frame height, so the tabs are pushed off or hidden.
- **Acceptance:** the new case passes at 560, 800 and phone. `pnpm check:flaky 4` is green on the file. Screenshots `review/p3-265-wheel-{560,800,375}.png`.
- **Break check:** a script restores the old sizing rule; the 560 case goes red.
- **Depends on:** none.

### Task 266: No bot line after the room ends (B2) — [ ]

- **Found:** in playtest 3, a bot kept sending callouts or talking on the next role reveal.
- **Files:** to be found. Start at `src/game/bots/brain.ts:1159` (the bot's one `cleared` line) and `src/net/attach.ts` (where bot sends are relayed), then `src/client/speech.ts` (the spoken-line queue).
- **Reproduce first (red):** a unit test that drives a room to `cleared` with a bot guiding. Then advance into the next room's reveal and assert that:
  - no bot `callout`, `text` or `face` message reaches any seat after the next reveal opens
  - the client speech queue is empty once the reveal is shown (`speech.ts` has a `cancel()`; test the hook that should call it)

  If neither reproduces it, park with what you tried (§1 rule 3).
- **Fix:** the cause the test shows: stop relaying bot sends once the room's status leaves `playing`, plus the one `cleared` line, and/or flush speech when the reveal opens.
- **Acceptance:** the test passes, and `spec/rooms.test.ts` still clears every room.
- **Break check:** revert the guard by script; the test goes red.
- **Depends on:** none.

### Task 267: An off-screen face's pill faces the sender (B3) — [ ]

- **Found:** a face sent through a wall showed its edge pill in the top-right corner, cut off, while the sender was elsewhere.
- **Files:** `src/client/render/pops.ts` (`drawEdgePills`, line 57), `src/components/Game.tsx:227-238` (where pops get `from`), and their unit tests.
- **Test first (red):** a unit test of the pill's placement. Senders sit north, south, east and west of the viewer and out of sight (no entity sent for them; only `from`). Assert that:
  - the pill sits on the frame edge facing the sender
  - its box lies wholly inside the frame

  Check whether the bug is that `from` is missing when out of line of sight (falling back to a corner). If it is, test that case.
- **Fix:** the measured cause.
- **Acceptance:** the test passes. A screenshot of a face sent through a wall: `review/p3-267-pill.png`.
- **Break check:** by script; red.
- **Depends on:** none.

### Task 268: Phone movement, triage (B5) — [ ]

- **Found:** `pnpm playtest` run `2026-11-10T04-39` showed Move left and right do nothing on the 375 tab in rooms 02 and 03, and Can't see "never showed moving" in room 04. Backlog 2026-11-08 says it passes alone.
- **Steps:**
  1. Run `pnpm playtest --room 02 --width 375`, then `--room 03 --width 375`, three times each.
  2. **All pass:** it's the harness, under load in a full run. Log it in `plans/2026-11-07-overnight.md` and add a backlog line naming the harness file. Fix it only if the cause is plain and the fix touches `scripts/playtest/` alone. Then tick the task.
  3. **Any fails alone:** it's a game bug. Write a component or unit test of the touch joystick's left and right input for that seat (`src/client/input*`), see it fail, and fix it. Never a browser walk (`CLAUDE.md`).
- **Human review:** the user moves left and right on a real phone in room 02 (`review/QUEUE-p3.md`).
- **Depends on:** none.

### Task 269: A label for checkpoints (T1) — [ ]

- **Files:** `src/client/labels.ts` (`LABEL_COPY`, `KIND_OF`), `src/client/labels.test.ts`, `DESIGN.md` (if it lists label copy).
- **Copy:** `checkpoint: "Checkpoint: caught after this, you start here"`. The checkpoint's entity kind is `checkpoint` (`src/game/rooms/format.ts:43`). Confirm the view sends it under that kind before mapping it.
- **Test first:** `labelsFor` returns the checkpoint chip for a checkpoint entity in range.
- **Acceptance:** the test passes, and there's a screenshot in a room with a checkpoint at 1280 and 375. **Human review:** the wording, in `review/QUEUE-p3.md`.
- **Depends on:** none.

### Task 270: Earplugs copy (T2) — [ ]

- **Files:** `src/components/YourSetup.tsx:53`, its spec if one asserts the label (`spec/setup.test.ts`), and `DESIGN.md` copy if listed.
- **Change:** the label becomes `Ears blocked (earplugs or earmuffs)`, with visible space between the Headphones row and this checkbox (an existing spacing token, no new token).
- **Acceptance:** a lobby screenshot at 1280 and 375. Any spec naming the old label is updated in the same commit.
- **Depends on:** none.

### Task 271: The goal line for the sighted in room 1 (T3) — [ ]

- **Found:** at 0:11 in room 1, Can't hear's and Can't speak's HUD has no goal. Can't see's has "No map. Listen. Get to the exit with the others." (`src/components/Game.tsx:1269`).
- **Files:** `src/components/Game.tsx` near line 1269, `spec/layout/hud.test.ts`, `DESIGN.md`.
- **Change:** in the first room only, the sighted HUD shows "Get all three onto the exit.", in the same place and style as Can't see's line, the same text the reveal uses (`RoleReveal.tsx:128`). It's hidden after the first room, as Can't see's is if that's how it works now. Match Can't see's rule exactly.
- **Test:** the HUD spec asserts the line for each sighted role in room 1 at 1280 and 375. Text isn't clipped (`scrollHeight`), and the line doesn't touch the top bar or the frame.
- **Acceptance:** the spec passes, with screenshots. **Human review:** placement, in `review/QUEUE-p3.md`.
- **Depends on:** none.

## Phase Definition of Done

Tasks 265–271 are ticked or parked, `pnpm check` is green, then commit `Unit done: p3fix01`.
