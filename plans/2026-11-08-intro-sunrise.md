# The start of a room as a window and a sunrise

- **Date:** 2026-11-08
- **Tier:** Slice
- **Status:** Built (Tasks 1-4, 2026-11-08 overnight); Human review pending
- **Requirements confirmed by user:** yes, 2026-11-08, in conversation (R2 in the playtest list: line the rooms up, fade the HUD in as a window, blend dusk to the room's colours like a sunrise)
- **Comes from:** `overnight/playtest-2026-11-08-findings.md` (R2); DESIGN.md §4.5 (the start of a room)
- **Runs after:** the overnight lane (dl09 and its fixes) and `2026-11-08-playtest-polish.md`, which also edits the reveal. It builds on `intro.ts`, the reveal cover and `setDusk`.

## What you'll see

- The room behind the role card is the same picture, in the same place, as the first frame of the game.
- As the card fades, the HUD fades in over the room as if it were a window into it.
- While the board tilts and the camera flies in, the colours warm from the shell's dusk to the room's own colours, like a sunrise, landing on them as you land.

## Demo script

Needs the real hold: `INTRO_MS` unset (`pnpm build && PORT=8092 pnpm start`, not `start:check`), three tabs, press ready.

1. The reveal, then freeze at the first intro frame (hold) → the room's walls and floor are in the same place and the same size in both. A screenshot diff of the room region is under 1 px of movement.
2. The next 2.1 s → the card and scrim fade out while the HUD fades in; no frame shows both at full strength.
3. The same, watching the walls and floor → the colours move from dusk to the room's hue between the start of the tilt and the end of the swoop, with no jump at the first game frame. Try two rooms with different hues.
4. Reduced motion, or high contrast → the existing 300 ms hold then cross-fade; no tilt, no sunrise.
5. Can't see → the black reveal gives way to their screen; only the HUD fades in.
6. Restart a passed room → the sunrise plays again from dusk.

## Requirements

- R1 The reveal's backdrop and the game's first frame draw the room in the same rectangle at the same scale (demo 1) → Tasks 1, 2.
- R2 The HUD fades in during the intro, on the intro's own timeline (scaled to `INTRO_MS`), and never overlaps the card at full strength (demo 2) → Task 3.
- R3 The world's palette blends from dusk to the room's colours across the tilt and swoop, driven by the intro frame, ending at the room's colours when the land begins; none for reduced motion or high contrast (demo 3, 4) → Task 4.
- R4 A restart replays it; Can't see gets only the HUD fade (demo 5, 6) → Tasks 3, 4.
- R5 DESIGN.md §4.5 and §1's dusk paragraph updated in the same commits.

## Out of scope

- A longer intro: the total stays `INTRO_TOTAL` (2400 ms).
- The reveal card's layout; the alarm's dusk blend (`scene.alarm` keeps its own path).
- Server timing: `INTRO_MS` is unchanged.

## Tasks

Each new or changed assertion is shown red first with a break script, and the commit says what was broken. A render bug that will not reproduce from the model is reproduced by drawing the real scene and looking, before any fix (CLAUDE.md). Browser specs that need the real hold run their own app, as `spec/layout/intro.test.ts` and `spec/leaderboard.test.ts` do; read how `intro.test.ts` gets its hold before adding to it.

- [x] **Task 1: Find out why the rooms do not line up**
  - Files: `spec/layout/intro.test.ts` (a new spec: measure the room's origin and tile size on the reveal's backdrop canvas, drawn by `useDraw(..., true)` in `Game.tsx`, and on the game canvas at the first intro frame; assert they match to 1 px, at 1280×800 and 375×812, for each role), `review/intro-align-2026-11-08.md` (new: the measured numbers and the cause).
  - Hypothesis to confirm or refute: the backdrop canvas fills the whole `.reveal-frame`, while the game canvas sits inside the HUD's layout, so the same flat plan is drawn at two sizes. DESIGN.md says the hold shows the plan "as the reveal showed it"; the measurement says whether it does.
  - Acceptance: the spec fails today, and the finding names the cause. If the rooms already match and only the colour differs, say so: Task 2 is then dropped.
  - Depends on: none.

- [x] **Task 2: One rectangle for both**
  - Files: whichever of `src/components/Game.tsx`, `src/styles/game.css` and `src/client/render/index.ts` Task 1 names. Two options, chosen from the finding: size the backdrop canvas to the game canvas's rectangle, or fit the flat camera inside it. Either way the first intro frame is the same picture as the backdrop.
  - Test: the Task 1 spec goes green; `introAt`'s first frame is unchanged (`src/client/intro.test.ts` stays green).
  - Acceptance: demo 1. The reveal card's own layout does not move (`spec/layout/reveal.test.ts` stays green).
  - Depends on: Task 1.

- [x] **Task 3: The HUD fades in as a window** (review queued)
  - Files: `src/styles/game.css` (the HUD's elements under `.game[data-intro="playing"]` fade from 0 to 1 over the same window that `.reveal-frame.covering` fades out, using the existing `--intro-delay` and `--intro-cover` values from `coverTiming` in `Game.tsx`; the reduced-motion rule keeps its 300 ms linear), `DESIGN.md` §4.5.
  - Test first, in `spec/layout/intro.test.ts`: sample the HUD's and the card's computed opacity at three points in the fade (`getComputedStyle`, with the intro clock paused as the existing intro tests do); the HUD's rises as the card's falls, and never both above 0.9. Red by removing the HUD fade. Can't see: the same, with no card to cross.
  - Acceptance: demo 2 and 5.
  - Depends on: Task 2.
  - Human review: a contact sheet of the first intro frame, the middle and the end, at both widths, in a local build. A pass means it looks like a window opening on the room.

- [x] **Task 4: The sunrise** (review queued)
  - Files: `src/client/tokens.ts` (`setDusk` gains a way to be set from a 0 to 1 amount, not only from a clock and a target; the existing clock path stays for the alarm), `src/client/render/index.ts` (`drawScene`: today the first frame after a dusk scene is drawn at once in normal colours, "must not start in dusk and ease back"; with a `scene.sunrise` the world's dusk amount is `1 - sunrise` instead), `src/components/Game.tsx` (`introScene`: `sunrise` runs 0 → 1 from the start of the tilt to the end of the swoop, from the `IntroFrame`; none under reduced motion, high contrast, or on a restart before the flat plan), `src/client/intro.ts` if the amount belongs on `IntroFrame`, `DESIGN.md` §1 and §4.5.
  - Tests first: in `src/client/render/` and `src/client/intro.test.ts`: at the start of the tilt the palette equals the dusk set, at the end of the swoop it equals the room's, and it never goes backward in between; reduced motion and high contrast draw the room's colours straight away; a restarted room's first frame is dusk again. If any test pins the instant switch, change it first and say so in the commit. Red by returning the old instant switch.
  - Acceptance: demo 3, 4 and 6, with a screenshot for each of two rooms with different `hue` values.
  - Depends on: Task 3.
  - Human review: the same contact sheet, for two hues. A pass means a sunrise, with no jump at the first game frame.

## Human review

- **Tasks 3 and 4 on a local build** with the real hold, at 1280×800 and 375×812. Your sign-off is needed.

## Corrections log

<!-- one line per user redirect during execution: date — what changed and why -->
