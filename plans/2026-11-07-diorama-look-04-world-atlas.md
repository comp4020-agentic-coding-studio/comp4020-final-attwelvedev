# Diorama look — Phase 3: the phone baseline, the tile atlas, and base materials

- **Date:** 2026-11-07
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-07
- **Part of:** `plans/2026-11-07-diorama-look-00-overview.md`. Read it first: §2 (FR8 floor, AO,
  walls, backdrop, water; FR9; NFR-perf), §3 (new test files beside modules), §4.2 (hue) and §4.4
  (the atlas and the bench, exact).
- **Depends on phases:** 0 (`setHue`, `HUE_WALLS`; the atlas key includes the hue).

## 1. Summary

First, the frame time on a phone-class profile is measured and committed as the baseline. Then a
per-room tile atlas lets the static layers carry gradients cheaply. The floor becomes stone flags (wood
in rooms 04 and 08) with grooved seams and speckle, with ambient occlusion at wall bases. Walls get lit
tops and graded fronts, and the backdrop gets a sun glow, cliff strata and a foam line, with a still
water reflection. High contrast draws none of it.

## 2. Requirements (this phase)

### 2.1 Functional

- FR8: floor, floor at a wall's base, wall tops, wall fronts, backdrop, water. (Doors, crates, glass,
  vents, stations and figures are phase 4.)
- FR9: for everything this phase draws.

### 2.2 Non-functional

- NFR-perf in full: the baseline (Task 103), the atlas (Task 104), and the compare after Task 105.
- NFR-verify: screenshots at 1280 and 375, both sighted roles and a spectator, rooms 01, 04, 05 and 09.

### 2.3 Out of scope for this phase

- Object materials (phase 4). Decor (phases 7 and 8). The intro's use of the live path (phase 5 only
  consumes `clearAtlas`).

### 2.4 Assumptions

- See overview §2.4.
- Playwright's Chromium and CDP CPU throttling are close enough to a phone for a relative
  before/after comparison. The bench compares runs on the same machine, never absolute numbers.

## 3. Existing code context (verified 2026-11-07)

- `src/client/render/index.ts`, `drawScene`: floor tops first (lines 293–301): `nightTile` for `" "`,
  `floorTop(ctx, cam, x, y, WORLD.floor)` for floor, glass and hatch tiles. Then, per row north to
  south (346–443), each block tile is drawn inside `ctx.save(); ctx.globalAlpha = wallAlpha(cam, x, y,
  behindWalls); … ctx.restore();` with `wall(ctx, cam, x, y, southOpen)`, `drawHatch`, `vent` or
  `glass`. Then `drawMist(..., y)` for that row. `tileWindow(cam, w, h, cols, rows)` bounds the loops.
- `src/client/render/blocks.ts`:
  - `block(ctx, cam, box, top, front)` fills two rects.
  - `floorTop(ctx, cam, x, y, fill)` fills a rect, plus 1 px `WORLD.seam` on the north and west edges
    when `fill === WORLD.floor`.
  - `wall(ctx, cam, x, y, southOpen)` is a block with a 3 px `wallShade` foot when south-open.
- `src/client/render/backdrop.ts`, `drawBackdrop(ctx, scene, cam)`: a sky gradient, a water gradient,
  7 ripples (`DRIFT_PX_PER_S = 6`, still under reduced motion or no clock), the slab
  (`SLAB_TILES = 0.3`) and the cliff gradient (`CLIFF_TILES = 2`), then a 2 px `COLOR.ui` line at 35 %
  where cliff meets water.
- `src/client/render/project.ts`: `TILT = { depth: 0.82, wall: 1.1, block: 0.7 }`.
  `LIVE` is mutated by `setRise(rise)`. `toScreen(cam, x, y, z)`.
- `src/client/render/sight.ts:279`: the one offscreen canvas today (a stipple tile), made with
  `document.createElement("canvas")`, sized by `window.devicePixelRatio`.
- `src/client/tokens.ts`: `isHighContrast()`, `WORLD`, private `paintWorld()`. From phase 0:
  `setHue`, `currentHue()`.
- Dpr: `Game.tsx:168`, `Spectator.tsx:211` and `Feeds.tsx:126` call `ctx.setTransform(dpr, …)`, so draw
  code works in CSS px. The atlas must render at `scale × dpr` device px and blit with
  `drawImage(img, x, y, w, h)` in CSS px.
- Unit tests run in node with no canvas. `render.test.ts:355` has a `recorder()` Proxy that records
  ops (`fillRect`, `drawImage`, `createLinearGradient` returns `{ addColorStop() {} }`). The atlas must
  degrade to direct drawing when `document` is absent (`typeof document === "undefined"`), so unit tests
  still see the ops.
- Rooms 04 (`04-the-safe`) and 08 (`08-music-room`) take wood floors.
- `scripts/bench-tick.ts` is the precedent for a bench script (a plain `node` script printing ms).
  `playwright` ^1.63 is a dev dependency.

### Interfaces from earlier phases (exact)

From Task 96 (`src/client/tokens.ts`):

```ts
export type Hue = "rose" | "teal" | "amber" | "violet" | "indigo";
export function setHue(hue: string | undefined): void;
export function currentHue(): Hue;
```

## 4. Approach

- **The bench** (overview §4.4). No game, server or bots. Neither esbuild nor vite can be imported
  from the project root (pnpm's strict layout, verified 2026-11-07), so the page is built by the app's
  own Astro build: `src/pages/bench.astro` returns 404 unless the server runs with `BENCH=1`
  (checked in the page's frontmatter via `process.env.BENCH`, like `VOTE_MS`). Its client script
  imports `src/client/render.ts` and `src/game/rooms/format.ts`, parses `rooms/05-the-gallery.room` or
  `rooms/09-the-vault.room` (`?raw`, as `Feeds.tsx` does; chosen by `?room=`), seats three players at
  their spawns, and draws in a `requestAnimationFrame` loop with the camera panning slowly (so the
  window moves). It times `draw()` with `performance.now()` over 300 frames and puts
  `{ p50, p95 }` on `window.__bench`. `scripts/bench-frame.ts` runs `pnpm build` if `dist/` is stale,
  spawns `BENCH=1 PORT=8282 node server.ts` with a temp `DATABASE_PATH` (as
  `spec/leaderboard.test.ts` spawns its own app), opens the page in Playwright's Chromium, and sets
  `Emulation.setCPUThrottlingRate { rate: 4 }`. It runs at 375×667 dpr 3 and at 1280×800 dpr 2, and
  prints `{ room, viewport, p50, p95 }[]` as JSON. `--compare` reads
  `review/diorama/bench-baseline.json`. A spec, `spec/bench.test.ts`, asserts that `/bench` is 404 on
  the check app (no `BENCH`).
- **The atlas.** One offscreen canvas per tile type. A `Map<string, HTMLCanvasElement>` keyed by
  `${scale*dpr}|${worldStamp()}|${hue}|${theme}|${tile}`, capped at 64 entries (LRU). Tiles: floor
  variants 0–3 (stone) or the wood plank variants; wall-top; wall-front (with and without the
  south-open AO strip, since the AO belongs to the floor tile *south* of a wall, below); glass; vent.
  A tile at 28 px and dpr 3 is about 84×(84+92) device px, so 64 tiles are well under 4 MB.
- **Live vs atlas.** Use the atlas when `LIVE.wall === TILT.wall` (settled), and dusk is either 0 or 1
  (not blending). Otherwise draw live with the same painter function. One function per tile, called
  either way, so the two can never differ.
- **Materials** (all colours from `WORLD`, mixed with `mix()` from `tokens.ts`, exported for this):
  - **Stone floor:** the flag's tone is `mix(WORLD.floor, black, 0.02 × variant)`, with the variant
    from a hash of `(x, y)`. A 1.5 px groove: `WORLD.seam` with a 1 px highlight `mix(floor, white,
    .35)` just south-east of it. A speckle of 6 dots per tile at 8 % `WORLD.seam`, from the hash.
  - **Wood floor (04, 08):** 3 boards per tile running east–west, each tone a variant, a 1 px gap in
    `WORLD.seam`, and a grain of 2 thin lines.
  - **AO:** on a floor tile whose north neighbour is `#`, a vertical gradient from `WORLD.wallShade`
    at 16 % to 0 over 0.25 tile. On one whose west neighbour is `#`, a horizontal one over 0.15 tile.
    It is drawn as part of the *floor* tile, so it is cut by the floor's mist like the floor.
  - **Wall top:** a 135° gradient from `mix(wallTop, white, .12)` to `wallTop`, and a 1.5 px lit lip
    `mix(wallTop, white, .3)` along its south edge.
  - **Wall front:** a vertical gradient from `wallFront` at the top to `mix(wallFront, wallShade, .5)` at
    the foot, a 1 px bevel highlight `mix(wallFront, white, .25)` along the top edge, and the existing
    3 px foot.
  - **Backdrop:** a sun glow (a radial gradient at the canvas's top-left, `mix(skyHi, white, .5)` at
    40 % to 0). Cliff strata: 3 bands across the cliff at `mix(cliffHi, cliffLo, k)`, 1 px darker
    lines. A foam line replacing the 35 % `COLOR.ui` line: 2 px `WORLD.ripple` at 70 % with a 1 px
    white crest. Water: a still reflection of the slab, a rect under the cliff at 12 % of
    `WORLD.cliffHi`, 0.6 tiles tall, faded down. The ripples are unchanged.
- **High contrast:** every painter checks `isHighContrast()` and draws today's flat fills.
- **Information stays flat:** `nightTile`, `drawMist`, cones and labels are not touched.

## 5. Task breakdown

### Task 103: The phone-profile frame bench and its committed baseline (NFR-perf)

- [x] Done (overnight run): bench page, script, spec and baseline committed.

- **Description:** Write `src/pages/bench.astro` (gated by `BENCH=1`) and `scripts/bench-frame.ts`
  (this file's §4). Run it 3 times on today's renderer, take the median of each `p95`, and commit
  `review/diorama/bench-baseline.json` with the machine named in it. Add
  `"bench:frame": "node scripts/bench-frame.ts"` to `package.json` scripts. No dependency is added
  (Playwright is already a dev dependency).
- **Files touched:** `src/pages/bench.astro` (new), `scripts/bench-frame.ts` (new), `spec/bench.test.ts`
  (new), `package.json`, `review/diorama/bench-baseline.json` (new).
- **Tests first (red):** `spec/bench.test.ts`: "GET /bench is 404 without BENCH". It is red before the
  gate exists (once the page exists). The tool's own check: `--compare` against a baseline whose p95 is
  halved (a temp file) must exit 1. Run it once and record it in the commit.
- **Acceptance criteria:**
  - `pnpm bench:frame` prints JSON for rooms 05 and 09 at both viewports.
  - `pnpm bench:frame --compare` exits 0 against the committed baseline, and 1 against a halved one.
- **Depends on:** none. **Must land before Task 104.**

### Task 104: The tile atlas, stone and wood floor, AO, and lit walls (FR8 floor and walls, FR9, NFR-perf)

- **Description:**
  - Create `src/client/render/atlas.ts` (overview §4.4) and `src/client/render/materials.ts`, which
    holds the painters: `paintFloor(c, s, d, variant, kind)`, `paintAo(c, s, d, north, west)`,
    `paintWallTop(c, s, d)` and `paintWallFront(c, s, h, southOpen)`.
  - `tokens.ts` exports `mix` and `worldStamp()`.
  - `floorTop` and `wall` in `blocks.ts` call the painters through `atlasTile` when settled, or
    directly otherwise.
  - Wood is chosen by `FLOOR_OF: Record<string, "stone" | "wood">` in `materials.ts` (04 and 08 wood),
    from a `Scene.roomId?: string` the game, spectator and feeds set.
  - `setContrast`, `setHue` and a dusk step call `clearAtlas()`.
- **Files touched:** `src/client/render/atlas.ts` (new), `src/client/render/materials.ts` (new),
  `src/client/render/atlas.test.ts` (new), `src/client/render/materials.test.ts` (new),
  `src/client/render/blocks.ts`, `src/client/render/index.ts` (`Scene.roomId`), `src/client/tokens.ts`,
  `src/components/Game.tsx`, `src/components/Spectator.tsx`, `src/components/Feeds.tsx`.
- **Tests first (red)**, with a small recorder copied from `render.test.ts:355–398`:
  - `materials.test.ts`:
    - "a stone floor tile draws a gradient-free fill, a groove and speckle; in high contrast only
      today's fill and seam"
    - "room 04's floor is drawn as boards"
    - "a floor tile south of a wall gets an AO gradient of wallShade at no more than 16 % alpha; in
      high contrast none"
    - "a wall top draws a gradient and a lip; a wall front a gradient and a bevel"
  - `atlas.test.ts`:
    - "the same key returns the same canvas; a WORLD change (setContrast, setHue) gives a new one"
    - "worldStamp() changes whenever WORLD changes" (setDusk, setContrast, setHue)
    - "while LIVE.wall < TILT.wall the atlas is not used" (a rise of 0.5 records direct fill ops)
    - "with no document, tiles are drawn directly"
- **Implementation (green):** as described.
- **Acceptance criteria:**
  - The tests pass, and `render.test.ts`, `sight.test.ts` and `standing.test.ts` are green (painter's
    order and cuts are unchanged).
  - `pnpm bench:frame --compare` passes.
- **Break check:** make `paintAo` ignore `isHighContrast()` (scripted). The HC case goes red. Make
  `paintWorld` skip the stamp bump. The stamp case goes red.
- **Depends on:** Task 103.

### Task 105: Backdrop sun glow, cliff strata, foam, and the still water slab (FR8 backdrop and water)

- **Description:** In `backdrop.ts`, as in this file's §4. HC keeps today's flat draw. DESIGN.md §2
  World gets the material recipe (one paragraph: light from the north-west, every tone a world token
  mixed toward white or black, the atlas, and HC flat). §4.1 notes stone or wood and AO.
- **Files touched:** `src/client/render/backdrop.ts`, `src/client/render/materials.test.ts`,
  `DESIGN.md`.
- **Tests first (red):** `materials.test.ts`: "the backdrop draws a radial sun glow and a slab
  reflection at 12 %; the ripples still drift; in high contrast neither glow nor reflection".
- **Implementation (green):** as described.
- **Acceptance criteria:**
  - The test passes.
  - `pnpm bench:frame --compare` passes.
  - Screenshots `review/diorama/p3-*.png` at 1280 and 375: rooms 01, 04 (wood), 05 and 09, for Can't
    hear, Can't speak and a spectator, plus one HC shot.
- **Break check:** draw the reflection at 0.5 alpha (scripted). The 12 % case goes red.
- **Human review:** on a local build, walk room 4 and room 5 as Can't hear at 1280 and 375. A pass
  is: the floor reads as stone (or wood in 4), walls look lit from the upper left, the wall bases sit
  in soft shadow, the mist and night still read clearly as unseen, and nothing stutters.
- **Depends on:** Task 104.

## 6. Phase Definition of Done

- [ ] Tasks 103 to 105 are complete and their tests pass.
- [ ] `pnpm test:unit` passes.
- [ ] The full check passes (overview §3).
- [ ] `pnpm bench:frame --compare` passes, and the numbers are pasted into the Task 105 commit.
- [ ] The user has accepted Task 105's review.
- [ ] Tick phase 3 in overview §5 and commit.

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR8 (floor, AO, walls) | Task 104 |
| FR8 (backdrop, water) | Task 105 |
| FR9 | Tasks 104, 105 (HC-flat cases) |
| NFR-perf | Tasks 103, 104, 105 |

## 8. Risks / open questions

None.

## Corrections log
