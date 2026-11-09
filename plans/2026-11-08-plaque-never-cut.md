# A plaque's words are never cut off by the light

- **Date:** 2026-11-08
- **Tier:** Slice
- **Status:** Built; sign-off pending (overnight run, review queued)
- **Requirements confirmed by user:** yes, 2026-11-08, in conversation (bug report with screenshot 131: room 5's keypad-room plaque, "Bare of red, the bundle gives up second." reads without "its", cut at the right edge)
- **Comes from:** the user's playthrough, 2026-11-08; `overnight/playtest-2026-11-08-shots/131.png` (copy it there from the message before running)
- **Runs:** first of the plans, with `2026-11-08-los-cut-fixes.md`. It is a small, separate fix and does not depend on it.

## What you'll see

- A plaque's whole plate and every word on it are drawn whenever you can see the sign, wherever the cone's edge falls across the plate.

## Demo script

Run locally: `pnpm build && PORT=8092 pnpm start:check`, a sighted seat in room 5.

1. Stand in the keypad room so the plaque S1's tile is in the cone but the plate's right end would fall beyond the cone's edge (screenshot 131's view) → the plate shows "Bare of red, the bundle gives up its second." in full, on a whole plate.
2. Step so the sign's tile leaves the light → the plate is gone (no new information is shown).
3. Same at 375 wide, where the plate is wider than the canvas → the plate is slid inside the canvas and whole, as `plaqueBox` already promises.

## Requirements

- R1 A reproduction: a failing test that draws the plate with a cone edge across it and finds words missing (demo 1) → Task 1.
- R2 A plate whose sign is in sight is drawn unclipped to the light; a sign out of sight draws no plate (demo 1, 2, 3) → Task 2.
- R3 The label chips still keep off the plate (`spec/layout/labels.test.ts`), and DESIGN.md §4.8's plaque line says the plate is never cut (Task 2).

Cause, read from the code: in `drawScene` (`src/client/render/index.ts`, the "a sign's own words (a plaque)" block) the plaques are drawn inside `ctx.save(); clipToLight(ctx, cam, light); … ctx.restore()`. The plate floats over its tile and is up to four tiles wide, so a cone edge across it cuts the words. `plaqueBox` already slides the plate inside the canvas "so its words are never cut off", so the light clip undoes that promise. Task 1 confirms it before anything is changed.

Default taken, to veto: the sign's text is not new information at that point, because the server only sends a sign whose tile is in the seat's `seen` set (the last `seen.has(...)` branch of the view builder in `src/game/perception.ts`; `litEntities` does not drop signs, since `sign` is not in `STANDS`), and the words are the same ones the plate shows when drawn whole. A plate drawn whole therefore reveals nothing the seat was not already sent.

## Out of scope

- The line-of-sight cuts on figures, stations and glass (`2026-11-08-los-cut-fixes.md`).
- The plate's size, wording or brass look.

## Tasks

Each new or changed assertion is shown red first with a break script that asserts the text it replaces, and the commit says what was broken. A bug fix starts with a failing test that reproduces it. `pnpm check` green against `PORT=8092 pnpm start:check`.

- [x] **Task 1: Reproduce it**
  - Files: `src/client/render/standing.test.ts` or a new `src/client/render/plaque.test.ts`: build a scene with a `sign` entity and `text` from `src/game/sim/stations.ts`'s "Bare of red, the bundle gives up its second.", a `light` polygon whose edge crosses the plate's box (read the box from `plaqueBox`), draw it through `drawScene`'s path, and assert the recorded text calls draw every word inside the plate's box.
  - Acceptance: the test fails today, with the words after the cone's edge missing. If it passes, the cause is elsewhere: stop and say so, do not guess.
  - Depends on: none.

- [x] **Task 2: Draw the plate whole**
  - Files: `src/client/render/index.ts` (draw the plaques outside `clipToLight`, still after what stands and before the UV pool, and only for a `sign` with `text` the scene already kept), `DESIGN.md` §4.8 (the clues line: "never cut by the light").
  - Tests first: the Task 1 test goes green; a sign the server did not send (its tile not in `seen`) still draws no plate; `spec/layout/labels.test.ts` stays green (chips keep off the plate). Break: put the clip back.
  - Acceptance: demo 1 to 3, with a screenshot of screenshot 131's view at 1280 and 375.
  - Depends on: Task 1.
  - Human review: that screenshot, in a local build. A pass means the plate reads whole and does not look pasted over the veil.

## Human review

- **Task 2 on a local build**: screenshot 131's view at both widths. Your sign-off is needed.

## Corrections log

<!-- one line per user redirect during execution: date — what changed and why -->
