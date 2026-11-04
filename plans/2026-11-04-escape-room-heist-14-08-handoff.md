# Escape-room heist: Phase 14 handoff 4 (2026-11-04), cut-off rendering: 74 and 75 are open

Written because the session hit its context limit. A fresh session should read this, then
`plans/2026-11-04-escape-room-heist-14-07-handoff.md` (the running record: its **Corrections log** has an entry for
every user correction and the prevention rules), then `CLAUDE.md`. Branch `auto/escape-room`. **Nothing is pushed and
nothing from this session is committed.** The user judges every change by eye on screenshots (numbered images), so
the render is the truth. Standing rules: failing test first and shown red by breaking the guarded code; never weaken a
test; never retry to get green; format only with `pnpm format`; one commit per unit of work after `pnpm check` is green;
a task with a `Human review:` line is not committed before the user accepts; ADRs start `proposed`; never push; log every
user redirection in the 14-07 plan's Corrections log.

## State of the tree

Uncommitted, all of it (the 14-07 plan lists the files): `src/client/render/{column,index,sight,hazards,stations}.ts`,
`src/client/render/standing.test.ts`, `src/client/render.test.ts`, `src/game/{clip,perception}.ts` and their tests,
`DESIGN.md` (§4.4 rewritten this session), `doc/adr/0022-...md` (status `proposed`), `plans/`.

`pnpm tsc --noEmit` is clean. `pnpm vitest run src`: **1,696 pass, 1 fails**, and the failure is deliberate: the new
test `the north wall's front is cut on the cone's line from the stub (screenshot 74)` in `standing.test.ts` (146 wrong
points). `column.ts` is the version the user accepted for 71 to 73 (backup `/tmp/h/column.front-good.ts`, may be gone
in a new environment; the same code is in the working tree). `pnpm check` has not been run since the render work.

## Accepted by the user this session

1 to 3, 5 to 8, 57/58 camera cone (far, active, idle), 59, 60, 62, 64, 66 (resolved), 67, 68, 69, 70, **71 to 73** (see
below). 65 the user judged fixed by the earlier changes (I did not reproduce it; logged). Item 9 (corner flicker) the
user says is resolved; the cause was never found.

## What 71 to 73 changed (accepted)

A wall is drawn as a top (seen from the north) and a front (its south face, seen only from the south). With open ground
behind it, the front is judged by the ground just south of the tile alone. In `column.ts`:
`splitOfBody` is the old `splitOfWall`; the new `splitOfWall` wrapper splits the tile's box at the seam
`k = LIVE.depth / (LIVE.depth + LIVE.wall)` into `topRect` and `frontRect`, runs the old rule on the top as before, and
for the front: `southLit` (some `faceSamples` point with `y > ty + 1` is in the light) ? `splitOfBody(..., frontRect,
true, true)` (the `south` flag judges only the south face in `faceLitEndToEnd` and `cells`) : `"dark"`. A wall with wall
behind it (`BLOCKS` at `ty + 1`, the map's edge counts as wall) takes the old path. Test: `a wall's front is veiled when
the viewer is north of it and its ground is dark (screenshots 71 to 73)`, red at 614 clear fronts with the guard
removed, green with it. Cost: rooms 4/3/7/9 +0.3/+0.2/+0.25/+1.0 ms a frame (1.21 to 1.49, 2.21 to 2.43, 3.49 to 3.74,
4.59 to 5.56 ms).

## OPEN: screenshots 74 and 75 (the user's latest message)

Images: `/private/tmp/claude-501/-Users-aaronnguyen-Documents-Education-AustralianNationalUniversity-Year4-Semester2-COMP4020/74e029f5-b7ae-49eb-829b-f9e923fd7e93/images/74.png` and `75.png` (may not survive; ask the user to
resend). Room 4 (`rooms/04-the-safe.room`), the one-tile stub at x 25, y 4 to 5 that joins the hallway (row 5) to the
first room above (rows 1 to 3).

The user, on 74 (viewer standing near the bottom of the stub, looking up the first room): the cone cuts the top of the
north wall on a diagonal, but **the top-left wall tile's front (south face) is entirely veiled, and should be cut to
follow the cone's line**. Also in the bottom right, through the hidden room, a sliver of a wall top shows that does not
continue in front or behind. On 75 (viewer higher in the stub): the cone is better, but some tiles in the cone's path
are still fully veiled that should be cut, and **the bottom side of a wall is lit, which contradicts the 71 to 73 rule**,
so "maybe this side of the wall should also be fully veiled". I told the user I agreed on all three and proposed to
veil a front with nothing south of it whole unless an edge lands on it. The user said "go ahead", then "option 1, then
take 75".

### What I established

- I could not match the user's exact frames: the viewer position is not known. My renders at about (25.4, 4.95), size
  880x1366 `layout: "fit"` show the stub and the diagonal on the top wall like 74, but I never confirmed the exact
  tile. **Ask the user for the player's tile, or a screenshot with it marked, for 75 especially.**
- Row 0 north wall, viewer in the stub: `darkOfWall` returns `lit` for tiles 24 to 26 and one dark piece for tiles 22,
  23, 27, 28. The front of the outer tile (23) is wholly veiled in the code (verified with a `drawMist` probe), where the
  doorway oracle expects it cut by the wedge through the stub. Edge landing points from (25.1, 4.3): (24, 1), (28, 3.33),
  and two long hallway edges landing at y = 6 (27.29, 24.86). Row 1 is lit at x from 24.1 to 27 only.
- The cause in `splitOfWall`: when `southLit` is false the front returns `"dark"` outright, so the carried-up edge never
  gets a say. The 71 to 73 test requires exactly that for the row-4 walls beside the stub.

### What I tried (none kept)

1. `darkFront(cam, light, frontRect, reached)` (cut the front by `edgesNear` edges, veil whole if any other edge has
   its midpoint on the dark side): the two long hallway edges veiled tile 23 (the midpoint is behind where they start).
2. Same, but only counting an edge as a ray (`(mid - start) . u >= 0`): fixed tile 23 but the 71 to 73 test went from
   139 to 312 wrong fronts. Reverted.
3. `cells(..., sampled)` (a cell is lit only if a sample is in it) and using every cone edge for the front: broke
   `render.test.ts` "veils a wall the light never reaches, whole" and the 60 jump tests.
Also: I rewrote the doorway oracle in the 71 to 73 test and the 74 test three times in one go. The 71 to 73 test is back
to its accepted form. The 74 test (below) is the newest and may itself be wrong; see its oracle before trusting its
count.

### The 74 test, as written

`the north wall's front is cut on the cone's line from the stub (screenshot 74)`, in `standing.test.ts` before
`a lit figure has no box around it`. Viewers on a grid of 0.2 over x 25.1 to 25.9, y 4.1 to 5.9, camera 880x1366
`layout "fit"`, row 0's own `drawMist` pass, front of tiles 22 to 28. A point is expected clear iff the viewer's line to
the ground under its pixel crosses the stub's mouths (`y = 4` always, `y = 5` only when the viewer is south of it,
`v.y > 5`), skipping points within 0.12 of a corner line. It currently reports 146 wrong, all `veiled` on tiles 23 and 27,
at viewers such as 25.1,4.3 and 25.3,4.9. **Check first** whether the oracle's `y = 5` mouth rule is right for a viewer
inside the stub (y 4 to 5): the probe at (25.1, 4.3) showed the cone itself lit row 1 only at x 24.1 to 27, which
suggests tiles 23 and 27 should be veiled there and the oracle is too strict. Fix the oracle before the code.

### What I'd do next

1. Get the exact 74/75 frames (tile) from the user.
2. Decide the oracle from the cone itself (`inLight` on the ground under each front point's screen position carried to the
   floor), not from the doorway geometry: a front point is clear iff the ground it stands for is lit **or** the cone's
   edge line, carried up, has it on the lit side. Then write one test that covers 74, 75 and 71 to 73, red first.
3. Then 75: a front with nothing south of it (the map's last row, or wall behind, depending on the frame) and no edge
   landing on it should be veiled whole. The current wrapper treats "nothing south" (`?? "#"`) as wall and falls back
   to the old rule; for the last row of the map the old rule can light the front. Probably the fix is to treat it as open
   ground (`?? " "`) so the south-ground rule applies; I tried that once and it left 139 slivers in the 71 to 73 test,
   which may be that test being too strict about edges that merely pass over a tile.
4. After each change: `pnpm vitest run src`, the per-frame timing (`/tmp/h/time-many.ts`, copy into
   `src/client/render/` as `time-many.test.ts`, run with `OUT=... pnpm vitest run`, delete after), and renders.

## Other work still open (in priority order the user agreed to)

- Item 4 (the safe visible, then not) and item 6 (door frame is never cut: note it in `DESIGN.md`; §4.4 already says it)
  are not started.
- Remove dead code: `sweptLight`/`SWEEP_TILES` in `index.ts` are NOT dead (used at `index.ts:231`); leave them. The
  `sight.ts` helpers `insideLight`, `GLASS_SAMPLES`, `glassLit` were removed this session. A comment above the removed
  helpers at `sight.ts` ~151 ("The wall tiles the light touches...") is orphaned: delete or attach it to `touchedOf`.
- `pnpm check` (start `pnpm start:check` first; build first; about 390 s; do not build while it runs), phone-width
  screenshots, a sweep of rooms 3, 5 to 9 for regressions from the widened gates. Not done.
- Rooms 7 and 9 still cost about 0.7 and 0.3 ms more than before the lit-face rule; cause not separated.
- PROCESS_LOG.md entries not written. `plans/attachments/` should be deleted before the final commit unless the user
  wants it kept. ADR 0022 stays `proposed` (also 0020 and 0021). Tasks 58, 59, 60 and 66 carry `Human review:` lines and
  must not be committed before the user accepts them.

## Harness (in `/tmp/h/`, may not survive)

`render.js` is a bundle: `npx esbuild src/client/render/index.ts --bundle --format=iife --global-name=R
--outfile=/tmp/h/render.js`. `shot-real.ts <room-prefix> <out.png> <x,y> <others> <w,h>` renders a real room
(`createWorld`, not `worldAt`, which opens every cache) from a viewer position; **the fourth argument is the other
players, pass `""` to give only the size** (I lost time passing the size in that slot). Probes: write a temporary
`src/dbg.test.ts` that writes to `/tmp/h/*.txt`, run it with `pnpm vitest run`, delete it. Camera of a user image: read
it from a known tile edge and the tile width, never from a weak pixel fit. Tests that read the veil must use one row's
pass: `drawMist(ctx, cam, tiles, light, win, row)`.

## Mistakes this session, so the next does not repeat them

- I rewrote a test oracle three times in a row while chasing a count instead of stopping after the second. After two
  failed oracles: stop, say what the oracle assumes, ask.
- I removed a debug line by index after the formatter had reflowed it and cut a statement in half. Re-read before editing.
- I passed the canvas size in the wrong argument of the render script and read renders at the wrong size.
- A first version of the 71 to 73 fix switched a whole tile at one test and made the veil jump a whole face between two
  steps; two older tests caught it. Keep each half of a tile continuous in the viewer's step.
