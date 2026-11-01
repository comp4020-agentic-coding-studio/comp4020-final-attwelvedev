# Escape-room heist: Phase 13 (render)

- **Status:** Approved
- **Part of:** `plans/2026-11-01-escape-room-heist-13-00-overview.md` (read it first: requirements, demo script, conventions, coverage).
  Depends on phase 12. Task numbers are global.
- **Commits:** one per task once `pnpm check` is green, ending with
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never push or deploy without the user's go-ahead.
- **Review mode:** build and commit as checks go green; `Human review:` items are reviewed together at the end of phase 13 (overview §5).

## Interfaces from earlier phases (exact)

None.

## Tasks

### Task 43: UV ink: short, always shown in the light, no ring  [ ]  (demo 4)

`drawUv` (`src/client/render/gear.ts:250`) strokes a dashed rim round the pool, clips the ink to the pool polygon and
`inkBox` centres each line on the ink tile. A long ink at x=1 pokes past the left wall; to the right of the pool the ink is clipped out entirely.

- **Red first:** `render.test.ts` / `gear.test.ts`: (a) no `setLineDash` or rim stroke is called by `drawUv`; (b) an ink box wider than its
  distance to the left canvas wall is shifted right so its left edge is on screen and inside the wall tile's face; (c) with the torch holder
  three tiles to the right of the ink, the part of the ink inside the pool's polygon is still drawn (the ink is clipped to the pool, not hidden).
  Break the clip by hand and watch (c) go red.
- **Green:** remove the dashed rim (keep the wash and, for high contrast, a solid edge only if the wash is off, as DESIGN.md says: update it). Draw the ink
  so the pool's clip shows whatever part is lit, however far the holder stands; clamp the ink box into the wall's face. Shorten
  the room 7 ink to a bare number via the `u1`/`u2` text plus `plaqueText` (`src/game/sim/stations.ts:193`, `src/game/perception.ts:858`):
  "Wire 2" style, written so it needs no wrapping at 5 tiles.
- **Done when:** unit tests pass and screenshots `review/13-task43-uv-{1280,375}.png` show full ink at the left wall, no ring, and ink with the holder far right.
  **Human review:** play room 7 with the torch.

### Task 46: A solved ring plays once  [ ]  (demo 8)

`detectFx` (`src/client/fx.ts:46`) fires the goal ring when `e.station.solved && !wasById.get(e.id)?.station?.solved`, so a station coming back
into line of sight (absent from `prev`) looks newly solved. Doors, plates and checkpoints already compare `was.get(key(e))` first.

- **Red first:** `fx.test.ts`: a solved station absent from `prev` and present in `next` makes no ring; a station that is unsolved in `prev` and
  solved in `next` still does (one ring). Same cases for a door already open on entering view.
- **Green:** require `wasById.has(e.id)` (and an unsolved `before`) for that branch. Check the other branches for the same shape (`bell`, `sign`).
- **Done when:** tests pass; a layout-free check by hand: walk out of and into sight of a solved station.

### Task 47: Link wires: only where there is a remote box, to the middle  [ ]  (demo 6)

`drawLink` (`src/client/render/stations.ts:552`) takes `partsOf(st, "back" | "tune")[0]` and draws a link for every dial and bells station; a
bells station's tune box is at one end, so the line meets the right of the bells; room 4's first safe has `back` at `[6,3]` with no audio box behind a wall.

- **Red first:** `stations.test.ts` (render): (a) a dial links only when its remote part is not in the same room area as its anchor (use the wall tiles
  between them: a link only where a wall tile lies on the straight line, so the first safe, `back [6,3]`, gets none and the second, `back [23,1]`, does); (b) a bells link ends at the middle
  of the bells (the mean of `bells` tiles), not the first bell.
- **Green:** change the two conditions in `drawLink`; keep the straight and wall-route fallbacks (`links.ts`).
- **Done when:** tests pass; screenshots `review/13-task47-links-{1280,375}.png` of rooms 4 and 8.
  **Human review:** the second safe's wire reads as passing through the wall, bells meet in the middle.

## Phase Definition of Done

- [ ] Tasks 43, 46 and 47 committed, \`pnpm check\` green, \`DESIGN.md\` updated for the UV rim and links, review screenshots written.
- [ ] Covers demo 4, 6, 8.
