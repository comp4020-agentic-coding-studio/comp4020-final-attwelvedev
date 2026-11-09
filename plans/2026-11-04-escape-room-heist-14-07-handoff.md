# Escape-room heist: Phase 14 handoff 3 (2026-11-04), cut-off rendering: the user's review and what is left

Written when the user went to sleep, so a fresh session can continue. Read this, then
`plans/2026-11-03-escape-room-heist-14-06-handoff.md` (the previous handoff; its "what the user wants" items 1 to 3
are now BUILT but not accepted, see below), then `CLAUDE.md`. Branch `auto/escape-room`. **Nothing is pushed.**
The user authorised, for the night, "the most reasonable action/s" on blockers, and will do the human review in
the morning. Nothing below has been shown to them as accepted; **do not commit the render work before they accept.**

## Where the tree is

HEAD is `c200ef2` (a checkpoint, `pnpm check` green). Commits this session, on top of `71740e7`:

| Commit | What |
| --- | --- |
| `0647e9a` | `viewFor` keeps, per world, standing place and door state, the tile set, its encoding and the light's touches (`placeOf` in `src/game/perception.ts`). Room lint 18 s -> 8.8 s. It had been 2 s from `load.test.ts`'s 20 s timeout (cause: `bdd5150` added `lightTouches`; most of the 15 s base was `encodeSeen`/`reveal` called 437k times by the bots). Two tests in `perception.test.ts`, both shown red |
| `c200ef2` | The WIP from the previous handoff (column cuts, mist split floor/per row), committed as a checkpoint after `pnpm check` went green |

**Uncommitted (the new render work, unit tests green: 485 in `src/client`, `pnpm tsc --noEmit` clean, `pnpm check` NOT run):**
`src/client/render/column.ts`, `index.ts`, `sight.ts`, `standing.test.ts`, `render.test.ts`.

What it does:
- `column.ts` no longer clips a thing by a swept column of lit ground. `regionOf(cam, light, parts, height)` returns
  `"whole"` (every part's footprint fully lit and no cone edge crosses it: draw with NO clip), `"none"` (no ground lit:
  not drawn) or the lit cells of a rectangle (the footprint's front, up by `height`, `SIDE` = 0.3 tiles each side) split
  along the cone edges' lines on screen. `coneEdges(cam, light)` takes the polygon's non-grid edges (the shadow edges),
  each as a half-plane in screen space (the floor's projection is affine, so a floor line is a screen line). `cells()`
  splits a rectangle by up to 3 edge lines and calls a cell lit if a sample point of the ground that falls in it is in
  the light (`inLight`), or if it is on the lit side of every line.
- `darkOfWall(cam, light, tiles, tx, ty, rect, touched)` (used by `drawMist` in `sight.ts`) cuts a wall's veil on the
  edges that land on the south face of the run of wall tiles it belongs to, or pass through the tile; with no edge a wall
  is lit or dark whole (`touched` = a light vertex lies on it). Glass (`=`) is NOT cut: it still uses `glassLit`, whole tile.
- `index.ts`: station parts and every standing thing go through `drawCut`; the safe is no longer a "box" part (all
  parts are ground slices); the plates through `clipToColumns`. `SWEEP_TILES`, `sweptLight` and `flatLight` still exist
  (`clipToLight(.., 0)` serves the floor layer and plaques); the swept variant is dead code.
- Tests: `standing.test.ts` rewritten to the diagonal rule (an oracle from the corridor-corner geometry), a wall-veil
  walk test (walk in 0.01 steps, the veil must change continuously) and a "lit figure has no box" test; three
  `render.test.ts` tests rewritten to assert the promise instead of the old clip shape. **Red checks done and confirmed
  to have landed**: lit figure kept a clip (fails "clips with the figure: expected 4 to be 3"); wall cut dropped (fails
  "the veil does change as they walk: expected 2 to be greater than 20"); the safe's cut replaced by the whole rect
  (2520 points wrong).
- Cost, measured (a throwaway test, kept at `plans/attachments/2026-11-04-render-review/cost.test.ts.txt`: rooms 4, 7,
  9, about 15 to 24 spots each, 1200x700): canvas calls per frame 4,615 / 6,050 / 5,920 (the checkpoint: 4,618 /
  6,070 / 5,893); time about 2.9 ms a frame (checkpoint 1.7 to 2.5 ms). A first version of the wall cut ran `inLight`
  on 36 samples for every wall tile and cost 8 to 19 ms: fixed by only sampling walls an edge reaches.

## The user's review of that render (their words, after seeing it; they said "Much better than it was before ... we're on the right track now")

Screenshots are saved in `plans/attachments/2026-11-04-render-review/` (`47.png` ... `56.png`); numbers below are theirs.

1. **47**: "the wire is still visible outside the LoS cone, and so is part of the top of the safe. Everything else looks ok."
2. **48** (moved left): "The top of the other player, can't speak, is visible even though half their character is outside the cone."
3. "the vent still seems to use the tile-by-tile wall misting like before. **All wall materials should use this new
   dynamic veiling, including vents and glass.**"
4. **49**: "an edge case where the safe shouldn't be visible at all, apart from the dial, but it is visible." **50**: "After
   taking the screenshot, it disappeared, as it should've in the first place." (Intermittent: it corrected itself.)
5. **51**: "a sliver of safe that should be invisible is in fact visible."
6. **52**: "the open door frame disappears prematurely ... the dotted frame should still be visible with this LoS cone."
7. **53**: "Here the different tile should also be invisible" (the lighter grey slab with two rivets is a cache dial's
   inspection plate, `drawInspectionPlate`, drawn in the station's standing pass).
8. **54**: "The clipping of this tile is also not right, where the top is weirdly clipped, but the left side isn't correctly
   clipped." **55**: "More incorrect clipping similar to described previously."
9. **56**: "I can also get the corners of a room to flicker by standing roughly anywhere in the middle ... After a second or
   two, it does settle, but sometimes the corners settle to being not misted, and others misted, so it is inconsistent."

## My diagnoses (hypotheses, NOT verified: reproduce each before fixing, with a failing test first)

- **1, 2, 5, 8, 55 (a thing cut in the wrong place, its top or sides):** the cone edges are used as the polygon's
  *finite* segments, and a thing is cut only if a segment passes through its ground box. A real shadow edge is a ray: it
  lands on a wall and the line goes on up the wall and over what stands in front of it. Anything drawn above or beyond
  where the segment ends (a wall wire's top, the safe's top, a figure's head, the top of a plate) is not cut by it.
  **Fix idea:** make an edge a ray on screen (start = the wall corner the shadow starts at, direction away from the
  viewer, no end). I started this: `plans/attachments/2026-11-04-render-review/column.ray-halfdone.ts.txt` has a new
  `ConeEdge` (`sx, sy, ux, uy, len, ray`), `rememberOrigin(light, origin)` (needs `lightOf` in `index.ts` to call it),
  `boxOf`, `hits`, `edgesNear(edges, screenBox)`. It does NOT compile with the rest of `column.ts` (`cells`, `regionOf`,
  `edgesOfWall`, `darkOfWall` still use `edgesThrough` and the old fields), so the tree has the older, compiling version
  (`/tmp` copies are gone by morning). Finish it as one change, keep `standing.test.ts` green.
- **7, 8 (inspection plate, other station parts):** `index.ts` cuts a station as ONE `drawCut` over the union of all
  its parts' rectangles, so a flat part (the plate, pads, a sliver) is covered by a lit neighbour's tall rectangle.
  **Fix idea:** cut each part by its own region (a flat part: ground only, no `height`), then draw that part alone.
- **3 (vents, glass):** glass (`=`) is skipped by `darkOfWall` on purpose (it passes sight, so no ray lands on it), so
  it is whole-tile. The user's rule is every wall material cut dynamically, so glass needs the same cut (its lit part
  by the perimeter samples or `glassLit`'s grid). I do not know why a vent (`%`) still looks tile-by-tile: `%` goes
  through `darkOfWall`. **Reproduce it first** (see "Repro harness"); a vent is drawn by `vent()` in `blocks.ts`, and
  `H` (hatch) is not a sight blocker, so check how its tile is judged.
- **4 (visible, then not):** it corrected itself, so suspect a client/server mismatch: the client casts the light
  from its predicted `scene.self`, while the station parts and `seen` are the server's view, one or more ticks old. A
  part the server sent for an older position is cut by the newer light. Check by comparing `scene.self` with
  `view.you.pos` in a recorded frame.
- **9 (corner flicker, settles in 1 to 2 s):** the settling time matches the eased camera (`cam.vx`, `cam.vy`), so
  the cut is probably camera-dependent. Candidates: `edgeCache` is keyed by `cam.scale * 1e6 + cam.ox * 1e3 + cam.oy`
  (a sum, so two cameras can collide, and a stale entry survives); the `areaOf(cell) < 0.25` cutoff in `cells()` drops
  a cell by pixel area, which changes with scale; and the `win` (tile window) culling in `drawMist`. Reproduce by
  drawing one fixed position at several camera offsets and comparing the veiled area of the corner tiles.
- **6 (open door frame):** the door's dashed slot is `drawFlat` inside `clipToLight(.., 0)` (the exact floor outline),
  and its stroke lies on the tile's edge, so half the stroke is outside the light the moment the cone's edge passes
  through that tile. Not verified; the user says it should still show with that cone. Decide whether a door's slot
  should be cut like what stands, or never cut (it is "part of the map every sighted player holds", per the comment
  in `perception.ts` where it is sent veiled). If never cut, say so in DESIGN.md.

## Repro harness (so you do not need to walk)

`plans/attachments/2026-11-04-render-review/shot-at.ts.txt` (copy it to `/tmp/h/shot.ts`) draws the real `viewFor`
output through the real `draw` in Chrome at an exact position: `node shot.ts <room-prefix> <out.png> <x,y> [other;...]
[w,h]`, for example `node /tmp/h/shot.ts 04 /tmp/h/a.png 5.5,3.6 "20.5,1.5" 760,460`. Build the bundle first:
`node_modules/.bin/esbuild src/client/render.ts --bundle --format=iife --global-name=R --outfile=/tmp/h/render.js`.
Caveat: the harness gives `viewFor` a full-room tile set and no camera easing (`layout: "follow"`), so it will not show
items 4 and 9 (they need the live client). For those use the real game: the scripted walk used last session
(`/tmp/shot/shot2.ts`, gone; see the previous handoff's "Commands" for how to rebuild it) with `pnpm build` first.

## Still to do (in this order)

1. Fix items 1 to 9 above, each with a failing test first and a red check that is **confirmed to have landed** (a short
   Python replace that asserts the text, then `grep`, then run; CLAUDE.md and the previous handoff's mistakes list).
2. Look at desktop **and phone width** screenshots of every one of the user's positions (the render is the truth).
3. Update `DESIGN.md` §4.4 ("veiled whole", "A wall is lit where a ray lands on its face", glass by `glassLit`) in the same
   commit as the wall change; `spec/design.test.ts` must stay green.
4. Remove the dead `sweptLight` / `SWEEP_TILES` if nothing uses them (check `render.test.ts`'s "sweep covers the tallest
   thing" test, which reads `SWEEP_TILES`/`HEIGHT`), then `pnpm check` (start the app first: `pnpm build && pkill -f
   "node server.ts"; PORT=8181 pnpm start:check &`, then `rm -f /tmp/check.log; APP_URL=http://localhost:8181 pnpm check`;
   about 390 s; do not build while it runs).
5. Show the user; commit only after they say "accepted" (one commit, message says what changed and why).
6. Delete `plans/attachments/` before the final commit unless the user wants the screenshots kept (it is 360 KB of
   review images and notes, not part of the app; `biome check .` ignores `.txt`).

## Still open from earlier handoffs (untouched; the user chose "render items 1 to 4 only" for this phase)

- Items 5 and 6 of the first handoff: planning the cache-reveal phase (`specs/2026-11-03-escape-room-cache-reveals.md`,
  ADR 0021) and closing phase 14 (Tasks 66, 58, 59, 60 carry a Human review line and are not accepted; ADRs 0020 and
  0021 stay `proposed`; `PROCESS_LOG.md` and the plan's corrections log are not written; real SHAs now include
  `26c418e`, `113e565`, `f252845`, `70ae790`, `bdd5150`, `71740e7`, `0647e9a`, `c200ef2`).
- Lint: the two `noCommaOperator` warnings (`render.test.ts`, `note(a[1]), note(a[3])` lines) and a `hazards.ts`
  unused parameter pre-date this work.

## Corrections log (the user redirected after seeing results; copy into `PROCESS_LOG.md` at phase close)

- Expected a vertical cut on what stands; the user wanted the cone's own diagonal ("no I want the diagonal"). The
  first rule ("a point is drawn iff the ground under it is lit") looked exact on paper and was wrong by eye.
- The walls' tile-by-tile misting was "jarring"; they want it gradual with the player's movement, on every wall
  material including vents and glass. First attempt cut only walls an edge touched and left glass whole.
- A box around a lit figure was ugly: a lit figure is drawn whole with no clip, an unlit one not at all.
- After the first diagonal render, edge cases remain (items 1 to 9). The pattern: a rule that held on the test's
  corridor scene broke in rooms the test did not model. **Candidate prevention:** drive the render test over the real
  rooms (`rooms/*.room`) at many positions, with an oracle that does not share the code's geometry (for instance: a
  pixel is drawn iff the ground it belongs to is lit, with the edge line carried up), like `spec/light-sweep.test.ts` does
  for `lightTouches`. A hand-built corridor with 3 viewers is not enough.
- Candidate `CLAUDE.md` rule (from the previous handoff, still not added): a red check must show a failing assertion,
  not only a "Tests" line, and must confirm the edit landed. Also new this session: a profile before a perf guess
  (the wall cut was 8 to 19 ms and the cause was one function, found by timing it, after I had guessed at `cells`).

- (2026-11-04, session 4) I read screenshot 48 wrong: I took the viewer for the sighted player in the room. The
  viewer is Can't hear, far to the left; Can't speak is the other player in the room, half in the cone, and
  the hat above the cone's edge was drawn whole. Cause of the miss: I sized the test on my own corridor scene
  and never rebuilt the user's frame. Prevention applied: a test on the real room 4 at the user's positions
  (`standing.test.ts`, "a figure the cone's edge crosses, in room 4"), red on the segment edges, green on rays.
  Same pattern as the plate (item 7): a corridor stand-in passed while the real room failed.
- (2026-11-04, session 4) Vents: the user wants only the part of a vent outside the cone veiled, on the cone's
  line, not tile by tile. My probe walked viewers where no edge landed on the vents and found nothing; it
  measured the wrong frames. Not fixed yet.

- (2026-11-04, session 4) After I closed vents as "no reproduction" the user sent 59 and 60 (room 4, Can't hear in
  the long corridor near x = 26, looking up through the opening at x = 25 into the room whose west wall is the vent
  column x = 22). 59: the top vent is cut on the cone's line but the second is veiled whole; Q2's wire is cut off at
  its left end although all of it should show; the wall of the room to the left is fully visible. 60 (a step to the
  right): all of that room's wall is suddenly veiled, "jarring". They want the veil to follow the cone's line, not
  jump. My miss: I measured walks at positions I chose (y = 5.05 to 6) and compared a vent to a `#` column, never
  asking for or deriving the user's own frame; the sweep never put the viewer in the corridor at x > 25.
  Also 57/58 (room 3 camera, unrelated): the camera's cone is not drawn from far away and appears when close.

- (2026-11-04, session 4) Camera cone (57/58, room 3, user: "unrelated"): from far away the camera's cone does
  not show although it should poke out through the glass; one step closer it does. Not yet diagnosed: it may be
  what the server sends (perception), what the floor layer draws, or the light clip.

- (2026-11-04, session 4) Item 9 (corner flicker): the user says it "seems to be resolved now". I could not
  reproduce it in the real client (rooms 4 and 7, standing and arriving), so I cannot say what resolved it.
- (2026-11-04, session 4) After the far camera cone (user, images 61 to 68): (a) the cone is partial: the active
  cone shows far away but the dashed idle one does not, because `farSights` skips an idle camera; (b) 62: a vent
  column's corner tile is wholly veiled while the wall behind it is cut right; (c) 64: two LoS cones, one right of
  the left wall and another further left, from the far-left hallway tile; (d) 65: a LoS cone starting in the open
  against the bottom wall, not off in the hallway either side; (e) 66/67: a veiled triangle in the hallway mouth and
  a pink triangle below the wall; (f) 68: a far edge that does not start at the wall's bottom-left corner. Taken
  in that order; (b) to (f) not yet reproduced. My miss on (a): I wrote the idle case into ADR 0022 as "sends
  nothing" without asking whether a near idle camera, which is drawn dashed, should look different far away.

- (2026-11-04, session 4) 66 to 68 took five wrong sweeps before the frame matched. The user's hint ("the room with
  the audio box in room 4") showed why: my harness builds worlds with `worldAt`, which opens every cache
  (`mockup.ts`: "a cache is shown open"), so Q3's secret door at (26, 6) was open in my frames and the light ran
  through the hallway into the chamber; in the real game it is closed and reads as wall. Prevention: any
  harness that reproduces what a player saw uses `createWorld` (the real start state), not `worldAt`; `worldAt`
  answers "what does each role perceive from here with the caches open" (its own comment), not "what did the
  player see".

- (2026-11-04, session 4) 66 to 68 resolved: the wall to the left of the triangle was veiled whole because the gate
  (`lightBorders`) only opened for a tile with a light vertex on or beside it; it now also opens for the tile either
  side in the row, so the lit stripe continues across the seam (test: row 6, tiles 23 to 27, red with 29 wrong points
  on the old gate). The user then asked why the stripe's right edge does not reach the visible bottom-left corner of
  the wall on the right of the opening. It is correct: the edge is a line on the floor through the real corner,
  carried up the screen, so it tilts away from the wall's drawn corner (16 px at the box top). Understood from an
  annotated diagram, not from prose; no code change. Variant A (veil a wall lit only through its hidden north
  face) and a size threshold for slivers were both tried and rejected on evidence: A veiled the left wall the
  user can see in 66, and 25.8% lit is not a sliver (36.7% of partly lit boxes in room 4 are below 0.3).

- (2026-11-04, session 4) 62 resolved, accepted by the user ("looks good now"): the middle vent's corner, which the
  stripe through the opening clips, was veiled whole while the top vent was cut. Cause: the gate that decides
  whether a wall tile is looked at for cutting had no light vertex in its window for the middle tile (the vertices
  sit at y = 1.0, east of the column), so the edge that cuts the top vent was never tried on it. Fix: the gate also
  opens for a tile whose column neighbour above or below is reached. Test: "draws the small corner of the middle vent
  that the wedge clips" (fine sampling, 10,000 points a tile; red with 9 positions wrong without the rule). My misses
  on the way: a first test with a 0.05 edge filter passed on the old code because the corner is a few points wide;
  a plus-shaped widening of the window did nothing (the vertex is diagonal to the tile); several probes called
  `darkOfWall` with `touched = false`, which the game never does, so only tests through `drawMist` count.
  Prevention: a test of a thin sliver samples finely and keeps only a hair clear of the line; probes go through
  `drawMist`, not `darkOfWall` alone.

- (2026-11-04, session 4) After 62 (user, images 69 and 70, room 4's second room, viewer in the room above the
  hallway at about (25.4, 1.4)): (a) 69: Q2's wire is "cut off abruptly, even when the wall is visible" (it stops
  at about x = 22.7 along the room's top wall); (b) 70: below the hallway the wall tile outside it is veiled, which is
  right, but the wall tiles to its left and right each show a small lit cut, which "looks weird": the user wants those
  two entirely veiled. And for 64 (two LoS cones): room 4, right side, the viewer is standing near the last door in
  the hallway to the right. Not yet reproduced. A suspect for (a) from my own code: `regionOfWire` calls
  `splitOfWall` with `touched = false`, which the game's wall veil (`drawMist`) never does.

- (2026-11-04, session 4) 64, 69 and 70 resolved, accepted by the user ("looks good now").
  64 (corridor, viewer at the hallway's foot): the corridor's walls were cut by cone edges although their faces were
  lit end to end; the user's principle was "standing in the hallway, none of its walls should be veiled" and "the
  cutting of the top of the bottom wall doesn't make sense". Fix: `splitOfWall` returns "lit" whole when a face
  looking onto open ground is lit along its whole width (`faceLitEndToEnd`), asked only of a tile an edge would cut
  (the first version asked of every tile and cost 0.6 to 1.9 ms a frame). Test: "a corridor wall lit along its whole
  face is clear whole" (red with 1,894 walls veiled). 69 (the wire along the top wall): `regionOfWire` called
  `splitOfWall` with `touched = false`, which `drawMist` never does; `touchedOf` moved into column.ts so both use the
  real value (red with 1,603 wire points hidden over clear wall). 70: a wall tile with wall on all four sides is behind
  the wall in front of it and is veiled whole (red with 213 tiles). My own errors on the way: I read my 64 frame
  as the user's twice with a weak pixel fit (15.1 against 18.7 grey levels) and built an annotation on it; the user
  caught that by seeing the picture; a first annotation put circles in the wrong place; probes that call
  `darkOfWall` with `touched = false` showed 6,000 false positives. Prevention: a position is read off the user's
  image (a known tile edge and the tile width give the camera), not fitted by pixel difference alone; and the
  wedge oracle for a wall front reads only that row's `drawMist` pass.
- 65 (the LoS cone starting in the open against the bottom wall in room 4's first room, not in the hallway either side):
  the user checked after the 62/64/69/70 fixes and judged it fixed. I did not reproduce it: my frame fit of image 65
  (`/tmp/h/fit65-best.png`) found no matching camera, so this is the user's own check, not mine.
- 71 to 73 (standing in the stub of room 4's first room, or in the hallway): the front (south face) of a wall with
  open ground behind it was lit because the light touched its north edge or top, "the player is literally on the opposite
  side of the wall"; it should be veiled whole. A wall's top is seen from the north and its front only from the south, so
  the box is cut at the seam and the front is judged by the ground south of the tile alone (red with 614 fronts; the
  guard removed again gives 614). My first version switched the whole tile at that test and made the veil jump by a
  whole face between two steps (two older tests caught it); it now cuts top and front apart and keeps each continuous.
  66 reported resolved by the user. Cost: rooms 4/3/7/9 +0.3/+0.2/+0.25/+1.0 ms a frame (1.21 to 1.49, 2.21 to 2.43,
  3.49 to 3.74, 4.59 to 5.56).
- 74 and 75 (open): 74's north wall front of the top-left tile is veiled whole where the cone's line should cut it. The
  fix tried (cut the front by the edges that cross it, veil it whole by any other edge) left tiles beside the stub
  wrongly clear; testing an edge as a ray (only what lies ahead of its start) fixed that tile and broke 71 to 73. Neither
  is kept. I also rewrote the 71 to 73 oracle three times in one go instead of stopping after the second; it is back to the
  accepted form. The 74 test (`the north wall's front is cut on the cone's line from the stub`) is red and left red.
  Prevention: after two failed oracles stop and ask, do not make a third.

## Mistakes this session, so the next does not repeat them

- I stashed (`git stash` then `apply`) as a backup mid-edit and had to drop it: a leftover stash is debris. Copy to `/tmp`.
- I rewrote `column.ts`'s edge type in one pass without finishing its callers, leaving a file that did not compile;
  I restored the last compiling version. Change a type and all its users in one step, or keep the old one beside it.
- A throwaway timing wrapper edited into `column.ts` broke its own import and printed nothing; I restored the file from a
  copy and did not chase the last 1 ms. Keep instrumentation in the test, not the source.
- Screenshots 74 and 75 (stub of room 4): expected the front (south face) of a wall to be cut on the cone's line when
  seen from south of it, and veiled whole when the viewer is level with or north of it. The 71 to 73 fix judged a front
  by the ground south of the tile alone, so a lit-by-edge front (tile 23 of row 0, seen from the stub) was veiled whole.
  Fix: `splitOfWall` judges a front by where the viewer stands (`viewer.y > ty + 1`, from `origins`), then lets the
  edges cut it. One oracle (the light itself, `onLit` in `standing.test.ts`) covers 74 and 75; shown red by putting the
  old rule back (270 wrong) and by dropping the viewer guard (139 and 118 wrong). The earlier 74 oracle (the stub's four
  corners) was wrong, not the code; I rewrote it three times before asking, against the rule to stop after two.
- Screenshots 76 to 78 (room 4 with the second cache open): the front of the chamber's south wall (the map's last row)
  was lit by an edge carried down from the stub, "straight down through the wall". `splitOfWall` read the missing row
  below the map as wall (`?? "#"`), which sent the last row down the old path that can light a front. Fix: the map's
  edge is open ground (`?? " "`), so the viewer-south rule applies. Test: "the front of a wall in the map's last row is
  veiled whole from the north", red at 132 clear fronts with the line put back. My first reading of the tiles was wrong
  twice (I probed floor tiles, not wall fronts); the user's circled screenshots settled it. Not yet judged by the user:
  76's lit floor tile and 77's veiled wall top, see the report.
- Screenshot 82 (room 4, cache open): a lit polygon showed on the wall at the right end of the hidden chamber, "through
  the wall". An edge's carried-up line (`edgesOfWall`, the `reached` branch) cut walls more than a tile beyond the face the
  edge lands on. User agreed to the rule "a wall behind where the light lands is veiled whole". Fix: skip such edges there
  (`behind`, one tile of slack, because the 59 vent test needs the landed tile cut; my first version with no slack broke it).
  Test: "a wall behind where the light lands is veiled whole", red at 10 lit walls with the rule removed. Open: 85's wall
  tile (28,8) is still veiled whole, 82's smaller circle (a corner that should be cut), and 83/84 (cone on the neighbouring
  rooms in the doorway). The user could not state a viewer fraction; I will fit it from their screenshots.
- Screenshots 82 to 85, after a day of patching `edgesOfWall` (seven rules, each one broke an accepted test or missed the
  next frame): the user proposed "wall tops just don't get veiled at all", "wires always show", clear tops for walled-in
  tiles and vents too. A scratch model of "a wall pixel is lit only if the viewer's ray lands on that wall's face" matched
  the renderer on 98.9% of visible fronts (tops: no sound rule), which is why the user's call was the better one. Fix:
  `splitOfWall` returns a lit top always; the front keeps the viewer-south rule and the edge cut. Tests rewritten, not
  loosened without a reason: render.test (front veiled whole, top never), 66-68 (top clear across the seam), 69 and the
  47 wire test (wire never hidden over a wall), 59/62/70/82 now measure the front only. New: "a wall's top is never
  veiled". Red with the old column.ts: the new test, the two wire tests, 66-68, render.test. NOT red with the old code
  (they measure fronts, which did not change; the `cutBy toBe(0)` lines in 59/62 are vacuous): 59, 62, 70, 82. Prevention:
  one rule per surface, written down before code; a day of "add a rule" patches is the signal to stop and model it.
  Not yet done: DESIGN.md 4.4, `pnpm check`, timing, phone-width look, the 354 front disagreements not opened.
- Screenshots 88 to 92: the user saw the lit triangles of the diagonal cut on the outer walls of the next rooms (89), which
  went away one step up (90), and proposed the geometrically true cut: a shadow edge is a vertical plane, so on a wall's
  front it is a vertical line from where the light meets the wall's foot (91, 92). Fix: `frontByFoot` in `column.ts`
  (a column of the front is lit where the foot ground at the same x is lit; viewer must be south of it). The 74/75 diagonal
  oracle is replaced, not loosened, by "a wall's front is cut by a vertical line from where the light meets its foot",
  red with the old diagonal rule (21,020 wrong), with the viewer-south guard dropped (112) and with the span split
  removed (2,216). The edge-carrying code (`edgesOfWall` etc.) still serves walls with wall south of them, glass and
  figures; not yet measured for what can go. Open: 88's saturated pink tops (tint with mist, or leave), DESIGN.md 4.4,
  `pnpm check`, timing, phone-width look.
- Screenshots 94 and 95 (stations and wires still cut on the old diagonal): the user agreed "faces vertical, tops diagonal"
  (the shadow plane), asked to try per-part top heights (option 1) and, when asked how a figure should look, said they
  could not imagine it and accepted leaving figures on the current cut. Fix: `regionOf` cuts a part that opts in
  (`planar`, set for dial stations) by the shadow plane: the front by a vertical line from where the light meets the
  foot's south edge, the top by the lit foot lifted by the part's own height (`top`: the box 0.7, the plinth 0.25). Every
  other thing keeps the old cut. New oracle: "what stands is cut by the shadow plane", red when the safe is not opted in
  (991 wrong), with one lift for the whole station (460) and with the foot ignored (4,186). Two tests that pinned the safe
  on the old diagonal were deleted, not loosened ("cuts the safe on the edge's line", "cuts the top of the safe on the
  edge's line"). A first full rewrite (all things planar) broke six tests, among them the lamp, the name plate and the
  figure; opting in only the safe removed four of them. NOT done: the name plate over the safe is still cut on the diagonal
  (it clips with `clipToColumns`, not opted in), wires on the floor and down a wall front, figures, lamps, bells.
- Screenshots 94 and 95, name plate and wire ("yes both"): a name plate is a flat face hung over a thing, so it is cut as a
  wall front is, by a vertical line from where the light meets the ground under it (`faceOnly` in `regionOf`, set by the plate
  clip in `index.ts`). New test "a name plate is cut by a vertical line", red with the plate back on the diagonal (268
  columns) and with it never cut (468). The wire: two attempts failed (my oracle judged each point of a one-line climb
  separately; the wire's first segment runs straight up from the safe over the north wall, not up a wall beside it). The user
  chose "always shown": `regionOfWire` is deleted and the wire is drawn uncut. New test "a wire is never cut by the light",
  red with the old clip put back (488 points). Three older wire tests (47, 59, 69) passed with the old clip restored, so
  they pinned nothing the new one does not, and were deleted with the orphaned wired-safe fixture. Prevention: when a
  test's oracle is wrong twice, read what is actually drawn before writing a third; the probe of the wire's vertices
  showed the geometry in one print.
- Screenshot 97: the safe's cut left a hole its wall showed through ("the mist veil should cover the gap that is now left by
  the veiling of the object"). I first misread this as a mismatch between the safe's cut and the wall's cut and proposed
  bringing the diagonal back, which was wrong (withdrawn when the user asked what "real geometry" meant: the safe's front cuts
  at its own x, the wall's at another, and they need not match). Fix: a dial cut by the light is drawn whole, veiled by
  the mist over its own outline (`dialOutline`, `veilShapes`), then its lit part on top. New test "a cut safe's dark part is
  veiled by the mist over its own outline", red with no veil (4,723), with the outline covering only the top face (2,807) and
  with the draw order swapped. Two tests updated for the safe now drawn twice (4 fills, not 2) and the shadow-plane oracle
  reading the last (lit) draw. Prevention: when a user's wording and my reading disagree about geometry, restate the
  geometry in one picture before proposing a rule.
- Screenshot 97, name plates: the user has thought them unnecessary for a while ("players have the option of using
  labels"), so the brass name plate is removed: `namePlate`, `drawStationPlates`, `clipToColumns`, `HEIGHT.plate` and the
  `faceOnly` flag are deleted; `plateAt` and `NAME` stay (the label chips anchor on them). This reverses the phase 02
  decision ("nothing said what an object was", plan 14-02 acceptance criteria): with the Labels setting off, a station
  has no name on it. The user knew; recorded here. Tests deleted with it, each only about the plate: "names every
  station on the object itself, in words", the two name-plate clip tests, "draws the name plate where it always is",
  and "a name plate is cut by a vertical line". The symbol/tick overlap test keeps its guard, minus the name plate.
- Screenshot 96, camera: the pink layer still covered the wall-mounted camera. The user chose "by the wall column
  behind it": a camera is now cut by the vertical line of the wall it is bolted to (foot on the wall row, faces only,
  no lifted top). Guarded by "a wall-mounted camera is cut by the wall's vertical line (screenshot 96)"; break checks:
  camera back on the old cut (red, 47 columns), wrong row foot (red, 199). Gap: removing `faceOnly` (a top lifted over
  the camera) still passes, so "no top" is not pinned. Not yet confirmed by eye on screen.
- Station cut shelved (after 96/97): the user doubted the planar (vertical faces, lifted tops) cut for stations: their
  geometry is varied, a visual overhaul is planned, and the chase of edge cases would start again ("a diagonal cut is
  easiest; maybe later"). Stations, the safe and the camera are back on the diagonal cone-edge cut. Removed: `planar`,
  `faceOnly`, per-part `top`, `dialOutline`, `SAFE_BOX` export, `veilShapes`, and the tests "what stands is cut by the
  shadow plane (94/95)", "a cut safe's dark part is veiled ... (97)", "a wall-mounted camera is cut ... (96)". The
  safe test is back to one draw. Kept: tops never veiled, vertical wall-front cut, wires always shown, plates removed.
- Correction to the "station cut shelved" entry (screenshots 98 to 105): the user wanted the camera's wall-column cut
  back, and for stations the plain diagonal straight across, with the wall's vertical cut taking over where the station
  overlaps the wall behind it (`wallBehind`, `behindWall`). A planar safe cut, per-part tops and the veil outline are
  gone again; the camera keeps `planar` + `faceOnly`. A wire stops at the wall's foot (no test yet). Screenshot 105:
  the wire vanished at a distance because the server sent a station only while a part was lit; it now also sends it
  (furniture, no state) when any tile of the wire's route is lit. `linkPath`/`linkOf` moved to `src/game/links.ts` so
  the server can use them. Guards: "a safe is sent as furniture while any of its wall-run wire is lit" (red with the
  route clause off) and "a station over the wall behind it is cut by the wall's vertical line" (red with the rule off).
- Screenshots 106/107, the wire again: the "send the station when its route is lit" change did not help, because at the
  user's spot no tile of the route was lit (room 4's second safe's wire runs on the outer wall, row 0). The user chose
  option A: a wire is layout, sent to every sighted seat from anywhere as its own `wire` entity (`route` only). The
  route clause in the station rule is gone. Guards: "a safe's wire is sent to every sighted seat from anywhere"
  (perception) and `links-far.test.ts` (room 4, from where none of Q2 is sent; red with the push removed). A first
  break check of the latter was vacuous (the oracle counted other dashed strokes, and one `sed` silently did not apply);
  both were fixed before it counted.
