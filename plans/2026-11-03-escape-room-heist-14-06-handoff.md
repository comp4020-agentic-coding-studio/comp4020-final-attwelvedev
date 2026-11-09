# Escape-room heist: Phase 14 handoff 2 (2026-11-03), light and cut-off rendering

Written mid-session so a fresh one can continue. Read this, then `plans/2026-11-03-escape-room-heist-14-05-handoff.md`
(the earlier handoff; its items 1 to 3 are done, see below), then `CLAUDE.md`. Branch `auto/escape-room`.
HEAD is `71740e7`; **the working tree is dirty with uncommitted render work** (listed below). `pnpm check` has
NOT been run on the uncommitted work.

## What is committed (all on top of `baa2aaa`, none pushed)

| Commit | What |
| --- | --- |
| `70ae790` | A station's floor parts (pads, keys, sockets) are drawn inside the flat light clip, so a veiled one is invisible |
| `bdd5150` | The server sends every station the exact light touches (`lightTouches` in the new `src/game/light.ts`; `lightPolygon` moved there, `src/client/render/sight.ts` re-exports it; `viewFor` caches the answers per world, position and door state). `spec/light-sweep.test.ts` sweeps all 9 rooms against `lightPolygon` |
| `71740e7` | Label chips keep clear of the riddle chip (`Scene.avoid`, measured from the DOM in `Game.tsx`; layout spec in `spec/layout/cache-chip.test.ts`) |

`pnpm check` was green (146 files, 2143 tests, 12 skipped) on exactly the `71740e7` code. `stash@{0}` from the
earlier session was dropped at the user's request (its commit was `9e33d4eb47e508f2a620c761f1793bbf73ce92bf`).

## What is uncommitted in the tree (a work in progress, not a finished change)

Modified: `src/client/render.test.ts`, `src/client/render/index.ts`, `src/client/render/links-room4.test.ts`,
`src/client/render/sight.ts`. New: `src/client/render/column.ts`, `src/client/render/standing.test.ts`.
`pnpm tsc --noEmit` is clean and all 480 tests in `src/client` pass. What the changes do:

- **`column.ts`**: each standing thing is clipped by the lit part of its own footprint, swept straight up by
  its own height (`HEIGHT` table, `groundSlice`, `columnsOf`, `drawCut`, `clipToColumns`). A box (the safe's
  body, a crate) is a top plus a front strip; everything else is a "billboard": a thin slice of ground, cut
  straight up.
- **`index.ts`**: the row loop uses `drawCut`; the name plates use `clipToColumns`; the mist is split.
  `drawMist(ctx, cam, tiles, light, win, part)` is now called once with `"floor"` (right after the sight cones,
  before any wall or standing thing) and once per row with the row number (after that row's blocks, before
  what stands in it), so nothing lit is ever veiled and no mist hole is cut for a thing. The old single late
  mist call and the `columns` holes are gone.
- **`SWEEP_TILES`, `sweptLight`, `flatLight`, `clipToLight`** are still in `index.ts`: `clipToLight(.., 0)` serves
  the floor layer and `clipToLight(..)` the plaques. The swept variant is otherwise dead now.
- **Tests rewritten**: the two old "clip reaches up past the floor edge" tests in `render.test.ts` now check the
  figure's and the crate's own clip (red-checked by making `HEIGHT.player` / the crate body too short); the
  "sweep covers the tallest thing" test now checks `HEIGHT` both ways (at least as tall as drawn, at most 0.12
  more); `links-room4.test.ts` reads the mist as several fills instead of one (red-checked by skipping the
  walls' veil). `standing.test.ts` holds the new tests (see "Tests that must change" below).
- A **feather** (fade over 0.12 tiles at the cone's edge, in nested bands) was built and then removed because
  the user found it ugly (visible steps across the dial). Nothing of it is left.

Cost, measured with a throwaway recorder over rooms 4, 7 and 9: canvas calls per frame went from 6,947 /
11,279 / 10,888 (committed global sweep) to 4,033 / 5,599 / 5,398; frame time from about 1.4 ms to 1.7 ms.

## What the user wants next (their words, in order)

1. **The diagonal cut for what stands.** After seeing the exact vertical cut on the safe's front (the cone's
   edge crosses its front face and the cut runs straight up, a different angle from the floor's diagonal edge),
   the user said: "no I want the diagonal." So a standing thing crossed by the cone's edge is cut on that same
   edge, continued up, so it lines up with the floor beside it. This **replaces** the earlier rule "a point is
   drawn iff the ground directly under it is lit" (which the committed-in-the-tree `standing.test.ts` encodes).
   It will show parts of a thing whose ground is in shadow; the user accepted that.
2. **The walls' mist is "tile-by-tile misting ... jarring".** They want it "more gradual with the player's
   movement on the walls", lining up with the LoS cone. Today `drawMist(.., rowNumber)` veils a wall tile whole
   when the light never touches it (`touchedTiles`, plus `glassLit` for glass), so a wall flips from clear to
   veiled in one step as you walk. The veil on walls should be cut by the cone's own edges, continued up the
   wall (a wall's face is lit in part), like the floor's. `DESIGN.md` §4.4 says "veiled whole" and "A wall is
   lit where a ray lands on its face"; update it in the same commit, and `spec/design.test.ts` must stay green.
3. **The rectangle around the player is ugly.** Why it exists: a billboard's clip is `groundSlice(.., half=0.3)`
   wide (0.6 tiles) and about 0.06 tiles deep, swept up by `HEIGHT.player`. The figure's pill and arrow are
   wider than that, so the sides are cut off, and its shadow (an ellipse on the ground south of the line) is
   boxed off. The earlier pink rectangle was the same box cut out of the mist. The plan agreed with the user
   (not yet built): a thing whose footprint is **fully lit is drawn whole with its shadow and no clip**; one
   whose footprint the light **does not touch is not drawn**; one the cone's edge **crosses is cut on that
   edge, continued** (item 1). No rectangular box anywhere. Use the real footprint (the figure's ellipse
   radius, `s * 0.36`/`0.5` in `figures.ts`, and the arrow), not a thin line.
4. "I want to maintain a high visual standard for this game." Look at every change rendered, at desktop and
   phone width, before saying it is done. The user judges by eye and has rejected three approaches by looking
   at them: the global sweep (strips, half-veiled safe), the vertical exact cut, and the feather.

The user has not yet seen a render of the diagonal cut, the gradual wall veil or the box-free figure.

## How to do it (a suggestion, not a decision)

The cone's edges are the polygon edges that run along a ray from the viewer. A first attempt at finding them
is in the uncommitted history of this session (`coneEdges` in `column.ts`, removed with the feather): an
edge is a cone edge when the two points a hair either side of its middle disagree on `inLight`. For a thing
the edge crosses, the clip is "the thing's drawn shape, intersected with the half-plane on the lit side of
the edge's line" in **screen space**, where the edge's line is the floor edge projected and continued: a
straight line on screen, so it lines up with the floor. A wall's face is a vertical rectangle on screen and the
same half-plane cuts it, which gives the gradual veil. A pillar's shadow inside one footprint makes two edges
that face opposite ways; the earlier `nearEdges` guard returned no edges then; think about it rather than
copy it. Measure canvas calls per frame before and after (the handoff's rule; baseline numbers above).

## Tests that must change, and the red checks to show

- `src/client/render/standing.test.ts` currently has three tests. "draws a point of the safe exactly when the
  ground under it is lit" encodes the vertical rule and **must be rewritten** to the diagonal rule (a point
  is drawn iff it lies on the lit side of the cone edge's screen-space line when the edge crosses the thing's
  footprint, whole when fully lit, absent when untouched). "veils the floor before it draws the safe" should
  stay. "draws the safe once at full strength, cut on the edge and never faded" should stay.
- Add: no clip box around a lit figure (its left and right edges and its shadow are all drawn when its footprint
  is fully lit; test against the real `drawPlayer` extents, not a hard-coded width).
- Add: a wall's veil is cut by the cone, not whole-tile (walking a hair changes the veiled area by a hair).
  Test it by walking a viewer in 0.01 steps and requiring the veiled area of one wall to change continuously,
  not in one step.
- Every new test is shown red first, by breaking the code it guards, and the break is **confirmed to have landed**
  (see the mistakes below). A test that cannot be made red is deleted (CLAUDE.md).

## Still open from the first handoff

- **Item 4 (browser verification)** is only partly done. A scripted walk in room 4 got screenshots at desktop and
  phone; it never reached the safe's pads or an uncovered cache. Not seen rendered: a half-lit object cut at a
  corner (now being redesigned), the final-room restart (only the pure `afterRestart` is tested), the
  tumbler's loudness (needs the user's ear), the plate's new look in a real room.
- **Image 46** (the user's third screenshot, the safe "half veiled, half invisible, with clear thin strips" and
  the left player "cut off strangely") was never reproduced; the strips matched the global sweep's gaps, which are
  gone. Confirm by eye after the new cut.
- **Items 5 and 6 of the first handoff are untouched**: planning the reveal phase (a new `plan-feature` session,
  spec `specs/2026-11-03-escape-room-cache-reveals.md`, ADR 0021) and closing phase 14 (Tasks 66, 58, 59, 60
  carry a Human review line and the user has not said "accepted"; ADR 0020 and 0021 stay `proposed`; the
  `PROCESS_LOG.md` entries and the plan's corrections log are not written. Real SHAs now exist: `26c418e`,
  `113e565`, `f252845`, `70ae790`, `bdd5150`, `71740e7`).
- **Corrections to log** (the user redirected after seeing results): the global sweep left strips and a
  half-veiled safe (fixed at the cause, now column cuts); the exact vertical cut and the feather were both
  rejected by eye; the "veiled floor" rule must cover every part of a station, not only the floor parts I fixed
  first and reported as done. A candidate `CLAUDE.md` rule: a red check must show a failing assertion, not only
  a "Tests" line, and must confirm the edit landed.
- **Lint**: `pnpm biome check` reports warnings in files this work did not touch (`src/client/render/hazards.ts`,
  `spec/heist-cache.test.ts`, `spec/room07.test.ts`) and in two places I created or changed in
  `render.test.ts` (a comma operator at the two `note(a[1]), note(a[3])` lines, which pre-date this work, and an
  unused `wash`). Check which are new before `pnpm check`.

## Mistakes this session, so the next does not repeat them

- **A red check that did not land.** A `sed` with GNU flags errored on macOS and a second one did not match, so a
  "red" run changed nothing and I read a green run as meaningful. Use a short Python replace that asserts the
  text is present, then `grep` that the change is in the file, then run. Twice a rewritten test passed with the
  guarded code removed (the mist test was vacuous: the scene had no veiled floor behind the safe).
- **`git stash -u` took the new test files with it** when I wanted only a "before" measurement. For a before/after
  measurement use `git worktree add /tmp/x <sha>` with `node_modules` linked and a throwaway `.test.ts`
  under `src/`, and remove the worktree after.
- **Guessing at a slowdown.** The view cost regression took four wrong guesses before measuring per view.
  Measure first (`viewFor` per view, canvas calls per frame), as CLAUDE.md says.
- **Overlapping commands kill the check** (from the first handoff, still true): do not build or typecheck while
  `pnpm check` runs. Clear `/tmp/check.log` first and match on this run's own `CHECK_EXIT` line.
- **A "red" screenshot crop looked at the wrong place twice.** Crop with the figure's pixel position, and
  compare before and after on the same positions.

## Commands

Build and a one-room app for screenshots: copy one `rooms/NN-*.room` into a temp dir and run
`ROOMS_DIR=<dir> PORT=<n> node server.ts`. The scripted playtest used in this session (not saved in the repo,
`/tmp/shot/shot.ts`) imports `launch` from `spec/browser.ts` and `playRoom` from `spec/playUi.ts`, walks the
sighted seat (`table.byRole.mute`, desktop) with key presses read against `data-self` on `canvas[data-camera]`,
and screenshots `.frame`. Room 4: the player starts at (1.5, 3.5); the corridor into the safe's room is at
x = 5, the safe in the screenshots is the teaching dial `Q1` (anchor (6, 1), pads (5, 1) and (7, 1), see
`rooms/04-the-safe.room`; `Q3` at (24, 9) is the cache dial, not this one). Rebuild with `pnpm build` before every screenshot run; a stale `dist` shows old code.
Full check: `pnpm build && pkill -f "node server.ts"; PORT=8181 pnpm start:check &` then
`rm -f /tmp/check.log; APP_URL=http://localhost:8181 pnpm check`.
