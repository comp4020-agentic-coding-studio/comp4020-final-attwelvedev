# Diorama look — Phase 7: the decor engine, and rooms 05, 08 and 09

- **Date:** 2026-11-07
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-07
- **Part of:** `plans/2026-11-07-diorama-look-00-overview.md`. Read it first: §2 (FR10, FR11, FR12,
  FR9), §2.4 **R2** (decor reads layout only; the station-anchor test), §4.1 (`--w-sconce`), §4.3
  (the decor interfaces, exact) and §4.4 (the atlas).
- **Depends on phases:** 3 (`atlas.ts`, `materials.ts`, the wall painters decor draws inside) and 4
  (the bench at its latest).

## 1. Summary

A seeded, layout-only placement engine puts themed decor on wall faces and tops: sconces, paintings,
cladding and so on. Each item is drawn inside its own wall tile's paint call, so it shares the wall's
see-through alpha and mist cut, and it is clipped to its face so a glow never reaches the floor. This
phase builds the engine and three themes: 05 gallery, 08 music salon and 09 strongroom. A test proves
that no decor pixel ever lands on the floor.

## 2. Requirements (this phase)

### 2.1 Functional

- FR10 in full (placement, exclusions, density, room 01 at half, a secret wall's decor sinking, never
  reading cache state).
- FR11 in full.
- FR12: themes 05, 08 and 09, and the banned list (as a test that covers every theme).
- FR9: no decor in high contrast.

### 2.2 Non-functional

- NFR-perf: decor is baked into the wall-front and wall-top atlas tiles (keyed by theme and item), so
  it costs nothing per frame once cached. Compare after Task 115.
- NFR-parity: decor is computed from layout every sighted client already has (R2). Nothing is sent.

### 2.3 Out of scope for this phase

- Themes 01, 02, 03, 04, 06 and 07, and the home feeds (phase 8).

### 2.4 Assumptions

- See overview §2.4, R2.

## 3. Existing code context (verified 2026-11-07)

- `src/client/render/index.ts` per-row wall loop (lines 346–359):
  ```ts
  ctx.save();
  ctx.globalAlpha = wallAlpha(cam, x, y, behindWalls);
  if (ch === "#") wall(ctx, cam, x, y, !isBlock((tiles[y + 1] ?? "")[x]));
  else if (ch === "H") drawHatch(ctx, x, y, cam);
  else if (ch === "%") vent(ctx, cam, x, y);
  else glass(ctx, cam, x, y);
  ctx.restore();
  ```
  Then `drawMist(ctx, cam, tiles, light, win, y)` veils that row's unlit wall fronts. Decor drawn
  inside `wall()` is therefore covered by the same alpha and veil.
- `src/client/render/chamber.ts` `drawSlide(ctx, pos, cam, age, reduced)` draws a secret door sinking:
  its top lowered by `drop` and its front `h = full × rest` tall, in `WORLD.door` tones. While closed,
  a secret door's tile and its chamber are `#` in the view's masked `tiles` (`maskCache` in
  `perception.ts:1059`). Once open, the tile is a door entity and its rect is floor.
- Tile letters in a client's `tiles` (`src/game/rooms/format.ts` `grid`): `#` wall, `D` door, `=`
  glass, `%` vent, `H` hatch, `.` floor, and `" "` night (`maskTiles` in a dark zone). Wires arrive as
  entities `kind: "wire"` with a `route: Vec[]`, sent to every sighted seat wherever it stands.
- Room ids: `05-the-gallery`, `08-music-room`, `09-the-vault` (and 01 to 09 as in `rooms/`).
- Rooms are parsed in tests with `loadRooms("./rooms")` (`src/game/rooms/load.ts`). Each `Room` has
  `objects: RoomObject[]` with `kind` and `tiles`. Station anchors, signs (plaques), cameras and ink
  are `kind` `"station"`, `"sign"`, `"camera"` and `"ink"`.
- A view's tiles for a sighted seat equal `maskCache(world, room.grid)` (closed chambers become `#`).
  The R2 test builds that with `createWorld(room)` and `viewFor(world, 1, "deaf", true).tiles`.
- `src/client/tokens.ts` holds `WORLD`, `WORLD_NORMAL`, `WORLD_HIGH`, `isHighContrast()` and `mix`.

### Interfaces from earlier phases (exact)

From Tasks 103–105:

```ts
// src/client/render/atlas.ts
export interface AtlasKey { scale: number; dpr: number; tokens: string; theme: string }
export function atlasTile(key: AtlasKey, tile: string,
  paint: (c: CanvasRenderingContext2D, s: number) => void): CanvasImageSource;
export function clearAtlas(): void;
// src/client/tokens.ts
export const mix: (a: string, b: string, t: number) => string;
export function worldStamp(): number;
// src/client/render/index.ts
// Scene.roomId?: string   (set by Game, Spectator and Feeds; Task 104)
```

`src/client/render/materials.ts` has `paintWallTop` and `paintWallFront`. `blocks.ts` `wall()` calls
them through `atlasTile` when settled, and directly otherwise.

## 4. Approach

- **Seeded RNG:** mulberry32 from a 32-bit FNV-1a hash of `roomId + ":" + salt`, with
  `SALT: Record<string, number>` (default 0) in `decor.ts` (R2's nudge).
- **Eligibility.** A `#` at (x, y) has an eligible **front** if `y < rows - 1` and `tiles[y+1][x]` is
  not a block (`#`, `=`, `%`, `H`) and not `D`. Every `#` has a **top**. A tile is excluded if any tile
  within Chebyshev 1 is `D`, `H`, `=`, `%` or `" "`, or lies on a wire route (rounded). A wire is
  layout the client has, and placement takes `wires: Vec[][]` as an optional third argument:
  `decorFor(roomId, tiles, wires = [])`, as overview §4.3 states.
- **Density:** fronts are walked in reading order. An item is placed when `rng() < 1/6` and it is
  at least 3 tiles (Chebyshev) from the last front item placed. Tops use `1/8`. Room 01 halves both.
- **Kinds per theme** (`THEME_KINDS`), front or top:
  - gallery 05: `painting` (front, gilt frame, an abstract field in 2 of `--w-code-*` at 30 % mixed to
    the wall, never a recognisable shape), with `lit` (a picture light, a sconce glow above it).
  - salon 08: `violin`, `lute` (front, silhouettes in `mix(wallFront, black, .35)`), `staff` (front,
    5 lines **without notes**), `swag` (front, a curtain swag across the top).
  - strongroom 09: `rivets` (front, a row of 6 dots along the top), `cladding` (front, steel panel with
    **vertical** seams), `cagedSconce` (front, `lit`).
- **Banned** (a test over `THEME_KINDS` and the painters): no kind named or shaped as a clock, dial,
  bell, horn, window, horizontal slat or rail, a lantern with rays, a role shape, any motif (moon,
  star, wave, key, eye, leaf), or a note head. Enforced by:
  1. a name denylist over `THEME_KINDS`;
  2. a recorder test per kind: a painter makes no `arc` with radius ≥ 0.15 × face (no dial or bell
     face) unless the kind is on an allowlist with a reason (`sconce`: a 0.1 face-width bulb), and no
     more than 2 parallel horizontal lines across more than half the face (no slats or rails;
     `staff` is allowed 5 because it carries no notes, and the test asserts it draws no filled
     ellipse).
- **Drawing.** `paintDecor(c, item, w, h)` first does `c.save(); c.beginPath(); c.rect(0, 0, w, h);
  c.clip()`, then paints, then `c.restore()`. A `lit` item draws a radial gradient of `WORLD.sconce`
  at ≤ 0.35 alpha centred on its bulb, inside that clip. `wall()` calls it after `paintWallFront` and
  `paintWallTop`, with `ctx.translate` to the face's origin, both on the live path and inside the
  atlas painter (the tile key gains `:<kind>:<variant>`). `isHighContrast()` → return.
- **Secret walls.** `drawSlide` takes an optional `decor?: { front?: DecorItem; top?: DecorItem }`
  and paints each item scaled to the remaining face height (`h`), so it sinks with the block.
  `drawFx`'s slide passes `decorAt(scene.decor, x, y)`.
- **Once per room.** `Game.tsx` and `Spectator.tsx` keep `rt.decor`, set from the first full view of
  each room (`view.tiles` and the wire entities' routes) and cleared when the room id changes. The
  scene carries `decor`.

## 5. Task breakdown

### Task 113: `decorFor` placement, the R2 anchor test, and the banned-kind test (FR10, FR12 banned)

- **Description:** write `src/client/render/decor.ts` (pure, no DOM): the RNG, eligibility, density,
  `THEME_OF` (all nine rooms mapped, even though only 05, 08 and 09 have kinds yet; the others map to
  themes with an empty kind list until phase 8), `THEME_KINDS`, `decorFor` (with the `wires`
  argument) and `decorAt`.
- **Files touched:** `src/client/render/decor.ts` (new), `src/client/render/decor.test.ts` (new).
- **Tests first (red)**, in `decor.test.ts`:
  - "the same room and tiles give the same decor; another room id gives another"
  - "no item on a front whose south tile is a block, a door, or past the last row"
  - "no item within 1 tile of D, H, =, %, night, or a wire route"
  - "fronts: at most 1 per 6 eligible, and items are at least 3 apart; tops at most 1 per 8"
  - "room 01 places at most half of what the same tiles would get under another id"
  - "decorFor never reads anything but its arguments" (call it with a frozen tiles array and no
    globals; a structural check that `decor.ts` imports nothing from `perception`, `sim` or `net`)
  - **R2:** "in every shipped room, as a sighted seat's tiles at tick 0, no decor item is within 1
    tile of a station part, sign, camera, bell, lamp, lever or ink tile". The test reads
    `loadRooms("./rooms")`, `createWorld(room)`, and the decor input from `viewFor(world, 1, "deaf",
    true)` (its `tiles` and wire routes). The exclusion tiles come test-side only, from
    `spectatorView(world, null, roles, true).entities` (every station's `station.parts[].at`, and the
    sign, camera, bell, lamp and lever `pos`) plus the room's `ink` objects' `tiles`.
  - **banned names:** "no theme kind is named as a banned thing"
- **Implementation (green):** as described. If the R2 test fails for a room, raise that room's `SALT`
  until it passes, and note each salt in the commit.
- **Acceptance criteria:** the tests pass, and `src/layering.test.ts` is green.
- **Break check:** drop the wire exclusion (scripted). Its case goes red. Drop the 3-apart rule. The
  spacing case goes red.
- **Depends on:** none in this phase.

### Task 114: Painters for the gallery, salon and strongroom, drawn inside the wall (FR11, FR12)

- **Description:**
  - Write `src/client/render/decor-paint.ts`: `paintDecor` and one painter per kind for 05, 08 and 09.
  - Add `--w-sconce` (`#ffe9c4`, HC `#ffffff`) to `tokens.css`, and `sconce` to `WorldTokens`
    (normal and HC).
  - Add `Scene.decor`. `wall()` gets the item through `decorAt` and paints it inside its own call, on
    both the live and atlas paths.
  - `drawSlide` paints the sinking decor.
  - `Game.tsx` and `Spectator.tsx` compute `rt.decor` once per room.
- **Files touched:** `src/client/render/decor-paint.ts` (new), `src/client/render/decor-paint.test.ts`
  (new), `src/client/render/blocks.ts`, `src/client/render/chamber.ts`, `src/client/render/index.ts`,
  `src/client/render/atlas.ts` (key), `src/styles/tokens.css`, `src/client/tokens.ts`,
  `src/components/Game.tsx`, `src/components/Spectator.tsx`.
- **Tests first (red)**, in `decor-paint.test.ts`, with the recorder:
  - "every kind clips to its face rect before it paints anything"
  - "a lit item's glow is a radial gradient of WORLD.sconce at ≤ 0.35 alpha"
  - "no decor painter ever strokes in WORLD.line" (no outline)
  - "in high contrast paintDecor draws nothing"
  - "decor is drawn inside its wall's save/restore, after the wall's own fills" (via `wall()` with a
    decor scene)
  - "a sliding secret wall draws its decor shorter at age 0.5 than at 0"
  - **banned shapes** (this file's §4): the arc and horizontal-lines rules, per kind; `staff` draws no
    filled ellipse
- **Implementation (green):** as described.
- **Acceptance criteria:** the tests pass, and `tokens.test.ts` (sconce mirrored), `render.test.ts`
  and `chamber.test.ts` are green.
- **Break check:** remove the clip in `paintDecor` (scripted). The clip case goes red.
- **Depends on:** Task 113.

### Task 115: Decor never paints a floor pixel, in a real browser; rooms 05, 08 and 09 reviewed (FR11, NFR-perf)

- **Description:** a browser check that draws the real scene on a real canvas (CLAUDE.md "A render bug
  … reproduced by drawing the real scene on a real canvas"). For rooms 05, 08 and 09, as Can't hear at
  1280 and 375: render once with decor and once with `decor: []` (a test-only `?nodecor` flag read by
  `Game.tsx` only when `BENCH=1` or a spec query is allowed; reuse the `/bench` page from Task 103
  instead, which takes `?decor=0|1`). Diff the two `getImageData` buffers, and assert that every
  changed pixel lies inside a wall-front or wall-top rect from the tile grid and `data-camera`. Then
  DESIGN.md: a "Decor" section under §4 (themes, placement rules, clipped glow, no outline, HC off,
  never shaped like a game object or motif), and `--w-sconce` in the token table.
- **Files touched:** `spec/layout/decor.test.ts` (new), `src/pages/bench.astro` (the `decor` and
  `room` params), `DESIGN.md`.
- **Tests first (red):** `spec/layout/decor.test.ts`: "for rooms 05, 08 and 09 at 1280 and 375, every
  pixel decor changes is on a wall face". Prove that it can go red with the break check below.
- **Acceptance criteria:**
  - The spec passes.
  - `pnpm bench:frame --compare` passes.
  - Screenshots `review/diorama/p7-*.png` of rooms 05, 08 and 09 at 1280 and 375, for both sighted
    roles and a spectator, plus HC (no decor).
- **Break check:** remove the clip in `paintDecor` (scripted) so a sconce glow spills. The spec goes
  red with a floor pixel named.
- **Human review:** on a local build, walk rooms 5, 8 and 9 as Can't hear and Can't speak at 1280 and
  375. A pass is:
  - the rooms feel like a gallery, a salon and a strongroom;
  - no decor is mistaken for a clue, a station or something to use;
  - no light falls on the floor;
  - it stays simple, in the Monument Valley sense.
- **Depends on:** Task 114.

## 6. Phase Definition of Done

- [ ] Tasks 113 to 115 are complete and their tests pass.
- [ ] `pnpm test:unit` passes.
- [ ] The full check passes (overview §3).
- [ ] `pnpm bench:frame --compare` passes.
- [ ] The user has accepted Task 115's review.
- [ ] Tick phase 7 in overview §5 and commit.

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR10 | Task 113 |
| FR11 | Tasks 114, 115 |
| FR12 (05, 08, 09; banned) | Tasks 113 (names), 114 (painters, shapes) |
| FR9 (no decor in HC) | Task 114 |
| NFR-perf | Task 115 |
| NFR-parity | Task 113 (layout-only, structural check) |

## 8. Risks / open questions

None.

## Corrections log
