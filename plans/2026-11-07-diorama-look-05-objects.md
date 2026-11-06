# Diorama look — Phase 4: object materials

- **Date:** 2026-11-07
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-07
- **Part of:** `plans/2026-11-07-diorama-look-00-overview.md`. Read it first: §2 (FR8 objects, FR9,
  FR17 goggles, NFR-perf), §3, and §4.4.
- **Depends on phases:** 3 (`materials.ts`, `atlas.ts`, `mix`, `worldStamp`, the bench).

## 1. Summary

The things in the world take on material: doors with inset panels and a bevel, crates with grain and a
live shadow, graded glass with a sheen band, brushed-steel vents and stations with brass bands, and
figures with a soft gradient and a hat sheen. Swatches, lamps, keys, numbers, outlines and every piece
of information stay flat. The goggles' grain drops to 6 fps.

## 2. Requirements (this phase)

### 2.1 Functional

- FR8: doors, crates, glass, vents, station bodies, figures.
- FR9: for everything this phase draws.
- FR17: the goggles' grain at 6 fps.

### 2.2 Non-functional

- NFR-perf: compare after Tasks 107 and 108.
- NFR-verify: screenshots at 1280 and 375 for both sighted roles and a spectator, in rooms 02, 04,
  05, 06 and 09.

### 2.3 Out of scope for this phase

- Motion (phase 6). The intro (phase 5). Decor (phases 7 and 8).

### 2.4 Assumptions

- See overview §2.4.

## 3. Existing code context (verified 2026-11-07)

- `src/client/render/blocks.ts`:
  - `glass(ctx, cam, x, y)`: a top at 0.55 alpha, a front at 0.7, two `COLOR.ui` glints, and a
    `WORLD.line` outline.
  - `vent(ctx, cam, x, y)`: a block plus 4 slats at `i/5` of the wall height. The slat count must
    stay 4.
  - `drawStanding(ctx, e, cam, scene)` draws, by `e.kind`: a door (a block of `LIVE.block` height plus
    a centre seam), a crate (inset 0.08 and an X brace on its front), loot, a checkpoint and a stamp.
- `src/client/render/stations.ts`: `drawStationStanding(ctx, e, cam, scene, row)` (line 636),
  `drawStationFloor` (581), `codeSwatch` (35, must stay flat), `SAFE_BOX`. Steel bodies use
  `WORLD.steel`/`steelFront`, rails `WORLD.brass`.
- `src/client/render/figures.ts`: `drawPlayer(ctx, e, cam, scene)` (221), `drawHidden` (205), and
  `drawOwnBlind` (294). A pill body in the role colour, a 2 px outline, a face disc, a hat by role
  shape, and a floor shadow (radius 0.36 tile).
- `src/client/render/gear.ts:13–14`: `const GRAIN = 0.08; const GRAIN_FPS = 12;`, used by
  `drawGoggles(ctx, scene)` (line 312) with `frame` from `nowMs`.
- The keepsakes (`src/client/items.ts`, `render/items.ts`) are the reference realism: banded metal
  gradients, a bevel, a south-east drop shadow, and HC flat.
- `src/client/render.test.ts` has tests that pin today's door, crate, glass and figure ops. Update
  each one where it pinned the old look, never where it pins information (an outline, the number,
  the slat count).

### Interfaces from earlier phases (exact)

From Tasks 104 and 103:

```ts
// src/client/render/atlas.ts
export interface AtlasKey { scale: number; dpr: number; tokens: string; theme: string }
export function atlasTile(key: AtlasKey, tile: string,
  paint: (c: CanvasRenderingContext2D, s: number) => void): CanvasImageSource;
export function clearAtlas(): void;
// src/client/tokens.ts
export const mix: (a: string, b: string, t: number) => string;
export function worldStamp(): number;
export const isHighContrast: () => boolean;
```

`src/client/render/materials.ts` exists with the floor and wall painters, and `materials.test.ts` with
its recorder. `pnpm bench:frame --compare` exists.

## 4. Approach

Each object gets a painter in `materials.ts` (`paintDoor`, `paintCrate`, `paintGlass`, `paintVent`,
`paintSteel(c, rect, banded)`, `paintFigureBody`). The old drawers call them. Glass and vents are
static tiles and go through the atlas. Doors, crates, stations and figures move or change, so they
are drawn live (each is a handful of gradient fills).

- **Door:** two inset panels per leaf (`mix(doorFront, black, .12)` with a 1 px `mix(door, white,
  .3)` bevel), a top-face sheen (a 135° gradient), and the seam kept.
- **Crate:** a lit north-west corner (a gradient across the top), 3 grain lines on the front in
  `mix(crateFront, crateBrace, .4)`, the brace kept, and a live drop shadow (an ellipse of
  `WORLD.line` at 18 %, offset south-east by 0.08 tile) drawn on the floor under it.
- **Glass:** the front graded from 0.55 to 0.8 alpha downwards, one 0.12-tile sheen band at 20°, a
  1 px bright top edge `mix(glass, white, .6)`, and the outline kept.
- **Vent:** a brushed-steel front (fine horizontal lines at 4 % alternating light and dark), and each
  slat gets a 1 px highlight above. Still 4 slats.
- **Station bodies:** `paintSteel` gives a banded gradient like the keepsakes (lit edge, dark band,
  second light), with brass rails banded the same. Swatches, lamps, keys, numbers, the tick plate and
  every `--w-line` outline are untouched.
- **Figures:** the body gets a soft vertical gradient (`mix(role, white, .18)` → role colour →
  `mix(role, black, .12)`), the hat a sheen arc, and the shadow becomes radial (`WORLD.line` 22 % → 0).
  The 2 px outline and the face are kept. `drawOwnBlind` gets the same body.
- **HC:** every painter falls back to today's flat path.

## 5. Task breakdown

### Task 106: Doors, crates, glass and vents in material (FR8, FR9)

- **Description:** add `paintDoor`, `paintCrate`, `paintGlass` and `paintVent`, and wire them into
  `drawStanding`, `glass` and `vent` (glass and vent through `atlasTile`).
- **Files touched:** `src/client/render/materials.ts`, `src/client/render/materials.test.ts`,
  `src/client/render/blocks.ts`, `src/client/render.test.ts` (only the pinned-look cases).
- **Tests first (red):** `materials.test.ts`:
  - "a vent still draws exactly 4 slats, each with a highlight"
  - "glass keeps its WORLD.line outline and adds a sheen band"
  - "a crate draws a drop shadow under it before its body"
  - "a door draws two inset panels and keeps its seam"
  - "in high contrast, each of the four draws no gradient" (the recorder sees no
    `createLinearGradient`/`createRadialGradient`)
- **Implementation (green):** as described.
- **Acceptance criteria:** the tests pass, and `render.test.ts`, `standing.test.ts` and
  `sight.test.ts` are green.
- **Break check:** draw 5 slats (scripted). The vent case goes red.
- **Depends on:** none in this phase.

### Task 107: Station bodies in brushed steel and brass, information flat (FR8, FR9)

- **Description:** `paintSteel` is used for every steel body and brass rail in `drawStationStanding`.
  Swatches (`codeSwatch`), lamps, keys, numbers, the tick plate, motif badges and outlines are drawn
  exactly as now, after the body.
- **Files touched:** `src/client/render/materials.ts`, `src/client/render/stations.ts`,
  `src/client/render/materials.test.ts`.
- **Tests first (red):** `materials.test.ts`:
  - "a safe's body is a banded gradient; its number and swatches are flat fills drawn after it"
  - "a code swatch is never drawn with a gradient" (spy over every station type in
    `src/game/sim/stations.ts`'s types)
  - "in high contrast a station body is a flat fill"
- **Implementation (green):** as described.
- **Acceptance criteria:**
  - The tests pass, and `links-room4.test.ts`, `links-far.test.ts` and `jammed.test.ts` are green.
  - `pnpm bench:frame --compare` passes.
- **Break check:** let `codeSwatch` use `paintSteel` (scripted). The swatch case goes red.
- **Human review:** on a local build, look at room 4's safe, room 5's wires and room 9's vault, as Can't
  hear and Can't speak at 1280 and 375. A pass is: the stations look like metal furniture, and every
  colour code and number is as easy to read as before.
- **Depends on:** Task 106.

### Task 108: Figures with a soft gradient and a radial shadow; goggles' grain at 6 fps (FR8, FR9, FR17)

- **Description:** `paintFigureBody` is used in `drawPlayer`, `drawHidden` (its outline path is
  unchanged) and `drawOwnBlind`. `GRAIN_FPS` goes to 6. DESIGN.md §4.2 Figures (gradient, hat sheen,
  radial shadow, outline kept) and §4.8 Goggles ("6 fps").
- **Files touched:** `src/client/render/materials.ts`, `src/client/render/figures.ts`,
  `src/client/render/gear.ts`, `src/client/render/materials.test.ts`, `src/client/render.test.ts`
  (pinned-look cases), `DESIGN.md`.
- **Tests first (red):**
  - `materials.test.ts`: "a figure keeps its 2 px WORLD.line outline and its hat shape, and its shadow
    is a radial gradient"; "in high contrast a figure is flat".
  - `render.test.ts` (an existing goggles case is extended): "the goggles' grain changes at most 6
    times a second" (draw at `nowMs` 0, 100 and 170: the first two are equal and the third differs).
- **Implementation (green):** as described.
- **Acceptance criteria:**
  - The tests pass.
  - `pnpm bench:frame --compare` passes.
  - Screenshots `review/diorama/p4-*.png` at 1280 and 375: rooms 02, 04, 05, 06 and 09, for both
    sighted roles and a spectator, plus HC.
- **Break check:** set `GRAIN_FPS = 12` (scripted). The grain case goes red.
- **Human review:** on a local build, three tabs in room 2 at 1280 and 375. A pass is: the figures look
  soft and lit but are still told apart instantly by hat and colour, and the goggles' grain no longer
  buzzes.
- **Depends on:** Task 106.

## 6. Phase Definition of Done

- [ ] Tasks 106 to 108 are complete and their tests pass.
- [ ] `pnpm test:unit` passes.
- [ ] The full check passes (overview §3).
- [ ] `pnpm bench:frame --compare` passes, and the numbers are in the Task 108 commit.
- [ ] The user has accepted the reviews for Tasks 107 and 108.
- [ ] Tick phase 4 in overview §5 and commit.

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR8 (doors, crates, glass, vents) | Task 106 |
| FR8 (station bodies) | Task 107 |
| FR8 (figures) | Task 108 |
| FR9 | Tasks 106, 107, 108 |
| FR17 (goggles) | Task 108 |
| NFR-perf | Tasks 107, 108 |

## 8. Risks / open questions

None.

## Corrections log
