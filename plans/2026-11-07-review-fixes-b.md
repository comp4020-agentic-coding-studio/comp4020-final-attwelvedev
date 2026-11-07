# Review fixes B: high contrast, the role tab and menu sounds

- **Date:** 2026-11-07
- **Status:** Draft (not yet approved to run)
- **Requirements confirmed by user:** no. They come from three cold, read-only code reviews of the units
  bp04, bp05, caches, doors, sounds, dl01, dl02 and dl03. This plan is half of a split: the other half is
  ``plans/2026-11-07-review-fixes-a.md` (Tasks 132, 133, 134 and 138, Opus)`.
- **Tier:** Slice (no new ADR; no new dependency).
- **Model:** Sonnet 5.5. The driver sets it for the whole unit; the plan does not switch models.
- **Comes after:** `plans/2026-11-07-review-fixes-a.md` (the unit `fixesA`); Task 136 comes after Task 135. Comes before dl05, because it edits files that dl05 to dl09 also edit. Task
  numbers are those of the original single plan (132 to 138).

## 1. Summary

Three fixes to styles and the menu sounds. Each task starts with a test that fails on today's code, shows it
red by breaking the guarded code on purpose, then fixes it. No test is weakened.

The findings come from the reviewers' reading of the code. When this was drafted, I had re-read the code
for these and they match the reviewers' description: the cache job in `currentJob` (it has no give-up
rule), `plateLeak`'s keypad branch (it returns `null`), `drawFx`'s `inSight` skip, the `.reveal-frame`
high-contrast rule against `.covering`, `.notch`'s `z-index: 4`, and `uiSound`'s `SILENT` list. These were
NOT re-read and are the reviewers' word only: the room 8 digit order (`decode.ts`), the `thinkBlind` hint
match, the `--lift: none` shadow invalidation, `SHELL.glass`, the `Lobby.tsx` diff, and the `GearSlot`
ticks. The `uiSound` suspended-context queueing is only partly confirmed: the code calls `resume()` and then
schedules the note straight away, and whether notes pile up depends on the browser. Each task therefore
begins by reproducing its finding; one that will not reproduce is not fixed. Each task starts
with a test that fails on today's code (CLAUDE.md: a bug fix starts with a failing test), shows it red by
breaking the guarded code on purpose, then fixes it. No test is weakened. Tasks 132 and 133 are the most
important: one can hang a room, the other restores a check CLAUDE.md says must stay.

## 2. Requirements

4. **FR4 (high contrast).** In high contrast the map keeps its 1 px role rim, the reveal never covers the
   game with an opaque sheet while it rises, and the canvas's chip glass follows `--glass`.
5. **FR5 (role tab).** The role tab never covers an overlay's content.
6. **FR6 (menu sounds).** A menu sound never plays while the audio context is locked, never ticks during
   play, and the in-game "Menu sounds" switch works when storage is blocked.

## 3. Tasks

### Task 135: High contrast keeps the rim, the reveal and the glass (FR4)

- **Description:**
  - `src/styles/game.css` `.frame { box-shadow: var(--lift), 0 0 0 1px var(--frame) }`: high contrast sets
    `--lift: none`, which is invalid inside a list, so the whole value falls back to `none` and the rim is
    lost. Give high contrast a valid empty shadow instead (for example `0 0 0 0 transparent`) and check the
    other places that list `--lift` or `--sheen` with other shadows.
  - `:root[data-contrast="high"] .reveal-frame { background: var(--ink) }` (0,3,0) beats
    `.reveal-frame.covering { background: transparent }` (0,2,0): in high contrast the game is covered by
    black for 900 ms (300 ms with reduced motion). Raise `.covering` or scope the rule with `:not(.covering)`.
  - `SHELL.glass` (`src/client/tokens.ts`) is a canvas copy of `--glass` that `setContrast` never swaps and
    `tokens.test.ts` never checks. Give it a high-contrast value and a row in `tokens.test.ts`.
  - The test `buttons.test.ts` "in high contrast no panel has a box-shadow" passes because an invalid list
    computes to `none`; make it assert the computed value for a reason.
- **Files touched:** `src/styles/game.css`, `src/styles/tokens.css`, `src/client/tokens.ts`,
  `src/client/tokens.test.ts`, `spec/layout/frame.test.ts`, `spec/layout/reveal.test.ts`,
  `spec/layout/buttons.test.ts`, `DESIGN.md` (the contrast section, in the same commit).
- **Tests first (red):** in high contrast the frame's computed `box-shadow` contains a 1 px role-coloured
  ring; during the reveal's rise the `.reveal-frame` background is transparent; the `SHELL.glass` row.
- **Acceptance criteria:** all pass, a screenshot of the game and the reveal in high contrast at 1280 and
  375 (looked at, per CLAUDE.md), `spec/design.test.ts` green.
- **Break check:** restore each of the three causes with a script; each test goes red.
- **Depends on:** none.

### Task 136: The role tab never covers an overlay (FR5)

- **Description:** `.notch` now has `z-index: 4` and sits first in the frame, so it paints over
  `.top-stack` and `.vote-prompt` (3), the in-frame overlays and Can't see's braille card at 375 px. Before
  dl03 it had no `z-index`. Lower it to 0 (it stays decorative, `pointer-events: none`). If that hides it
  under the canvas at either width, use 1.
- **Files touched:** `src/styles/game.css`, `spec/layout/frame.test.ts`.
- **Tests first (red):** at 375 px, as Can't see in the first plate room, the plate card's box and the
  tab's box do not intersect; today the tab covers the card's corner. (`frame.test.ts` today only checks
  `.side-job`.)
- **Acceptance criteria:** the test passes; the tab is still visible at 1280 and 375 (screenshots, looked
  at); `wheel.test.ts` still green.
- **Break check:** restore `z-index: 4`; the test goes red.
- **Depends on:** Task 135 (same file, same rules nearby).

### Task 137: Menu sounds play only when they can, and never during play (FR6)

- **Description:** `src/client/uiSound.ts`:
  - `uiSound` schedules a note while the context is suspended, where the clock stays at 0, so every join,
    leave, reveal and ready sound asked for with no gesture plays at once on the first press. Play only
    when `state === "running"`.
  - `SILENT` is `.wheel, .touch-zone, canvas, [data-no-ui-sound]`, so the gear slot (`GearSlot.tsx`), the
    talk bar's Comms, Write and push-to-talk buttons tick during play. Mark them with `data-no-ui-sound`.
  - `Lobby.tsx` keeps diffing `people` while the game shows, so a teammate leaving mid-heist plays the
    "leave" chime: stop the diff once the game is on.
  - The in-game "Menu sounds" switch reads settings back from `localStorage`; with storage blocked, an
    unticked switch is read as `true` again. Pass the live settings in (as the plan's alternative says).
- **Files touched:** `src/client/uiSound.ts`, `src/components/GearSlot.tsx`, the talk bar component,
  `src/components/Lobby.tsx`, `src/components/Game.tsx` (the switch), and their tests.
- **Tests first (red):** four unit tests: a sound asked for in a suspended context schedules nothing; a
  press on the gear slot and on a talk-bar button asks for no sound; a person leaving while the game shows
  asks for none; with `localStorage` throwing, unticking the switch silences the next press.
- **Acceptance criteria:** all pass; the existing menu-sound specs stay green.
- **Break check:** each fix reverted with a script; each test goes red.
- **Depends on:** none.

## 4. Closing the unit

`pnpm check` green, `pnpm check:flaky` once on the spec files this unit touched, the plan ticked, and the
marker commit `Unit done: fixesB`. Human review: Tasks 135 and 136 get screenshots at 1280 and 375 (looked at, per CLAUDE.md), queued in
`review/QUEUE.md` as the overnight rules say.
