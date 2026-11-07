# A lit diorama world, a dusk shell, and motion that belongs to each object — Plan overview

- **Date:** 2026-11-07
- **Status:** Approved
- **Tier:** Architecture (ADR 0026, `proposed`; it supersedes the flat-shading line of ADR 0016)
- **Requirements confirmed by user:** yes, 2026-11-07
  - Design: `specs/2026-11-07-diorama-look.md`, approved, plus three planning rulings R1 to R3 (§2.4).
- **Comes after:** `plans/2026-11-07-menu-sounds-and-masking.md` (Tasks 92 to 95). Task numbers
  continue from 95.
- **Commits:** one per task, once `pnpm check` is green. Each message ends with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push or deploy without the user's
  go-ahead.
- **Review mode:**
  - A task with a `Human review:` line is not committed until the user accepts it, on a local build
    (`pnpm build && pnpm start`), at 1280 and 375.
  - Every user redirection goes in the active phase file's **Corrections log**, and into
    `PROCESS_LOG.md` when it qualifies.

## 0. How to use these plans

| File | Phase |
| --- | --- |
| `plans/2026-11-07-diorama-look-00-overview.md` | this file |
| `plans/2026-11-07-diorama-look-01-room-tints.md` | 0: room tints |
| `plans/2026-11-07-diorama-look-02-shell-tokens.md` | 1: shell retint and radii (tokens only) |
| `plans/2026-11-07-diorama-look-03-shell-surfaces.md` | 2: surfaces, buttons, type, frame, reveal and home |
| `plans/2026-11-07-diorama-look-04-world-atlas.md` | 3: phone baseline, tile atlas, base materials |
| `plans/2026-11-07-diorama-look-05-objects.md` | 4: object materials |
| `plans/2026-11-07-diorama-look-06-intro.md` | 5: the start-of-room sequence and the server hold |
| `plans/2026-11-07-diorama-look-07-motion.md` | 6: object motion and the reserved ring |
| `plans/2026-11-07-diorama-look-08-decor-engine.md` | 7: the decor engine, rooms 05, 08 and 09 |
| `plans/2026-11-07-diorama-look-09-decor-wrap.md` | 8: the other six themes, and the wrap-up |

- A session reads this overview plus exactly one phase file.
- Task numbers are global (Tasks 96 to 120). The spec numbers phases from 0, and the files from 01:
  "phase 3" in prose means file `-04-`.
- Tick a phase in §5 when its phase Definition of Done is met.

## 1. Summary

The user finds the game "too simple/cartoonish". This plan builds what the approved spec sets out:

- **A lit world.** Light comes from the north-west: gradients, soft shadows, ambient occlusion and
  stone or wood texture. Each room is tinted from its `hue`. Generated decor (sconces, paintings,
  ivy…) sits on wall faces only, and never touches the floor or carries an outline.
- **A dusk shell.** The dark shell is retinted to night plum, with lit panels, softer radii, the
  display face only for big lines, and a recessed bezel with a role tab round the canvas.
- **Motion that belongs to each object.** A door parts and sinks, and a crate rocks. The ring is
  reserved for "station solved" and "you landed".
- **A clear start.** The flat plan tilts visibly into 2.5D, then the camera swoops to your start.
  The server holds the first tick until the sequence ends.

Information stays flat (mist, night, cones, swatches, outlines, labels), and high contrast drops every
gradient, shadow, texture and decor.

## 2. Requirements

The requirements are the spec's **FR1 to FR17** and its NFRs (`specs/2026-11-07-diorama-look.md` §2),
plus the planning rulings R1 to R3 below. Phase files cite them as "FRn" or "NFR-<name>". In brief:

### 2.1 Functional requirements

1. **FR1.** Each room's `hue` picks its wall token set (`--w-wall-top`/`-front`/`-shade` per hue), with
   a dusk and a high-contrast variant. DESIGN.md's "built" claim becomes true.
2. **FR2.** The shell retint: `--bg #15121f`, `--panel #221c30`, new `--panel-hi #261f35`,
   `--ui #efeaf5`, `--ui-muted #aba1c0`, `--glass rgb(34 28 48 / 90%)`, `--scrim rgb(21 18 31 / 62%)`.
   Role, danger and goal are unchanged, and `--ink` stays `#000000`. A test measures every text pair
   at AA or better.
3. **FR3.** Surfaces: panels get a north-west gradient (`--panel-hi` to `--panel`) with `--sheen`
   and `--lift`. Nested rows are flat wells. The HUD bar gets the same. High contrast sets
   `--sheen`/`--lift` to `none` and drops the gradients.
4. **FR4.** `--r` goes to 8 px (mirrored in `tokens.ts`), and new `--r-lg` is 14 px. Chips are pills.
   Secondary buttons have a lit `--panel-hi` body and a 2 px `--ui-muted` outline (`--ui` on hover).
   Primary buttons are a `--ui` fill.
5. **FR5.** The display face (125 %/900) is used only for the home hero, the lobby code, the reveal's
   role line, and the room-cleared title and time. Every other heading is 100 %/800.
6. **FR6.** The canvas frame is a `--r-lg` `--panel` bezel with `--lift`, an inset recess, a 36 px
   role tab top-left (the role shape on the role colour), a short role line along the top, and a
   1 px role rim all round. The spectator keeps a dashed bezel.
7. **FR7.** The reveal draws the whole room in **dusk** tokens, blurred under `--scrim`. Can't see's
   reveal stays `--ink`. The home page gets a still north-west dusk glow, and its feeds become framed
   windows. The black reveal backdrop (`review/bp-02-task81-played-icons-1280.png`) is fixed.
8. **FR8.** Materials per element, as in spec FR8: stone floor (4 tones, seams, speckle) and wood in
   rooms 04 and 08, wall-base AO, lit wall tops and fronts, doors, crates, glass, vents, station
   bodies, figures, backdrop, and water.
9. **FR9.** Information stays flat. High contrast draws no gradient, shadow, texture or decor.
10. **FR10.** `decorFor(roomId, tiles)` is seeded and reads only the layout the client has (**R2**).
    It places decor on south-open `#` fronts and on `#` tops, with the exclusions and densities of
    spec FR10. A secret wall's decor sinks with it. It never reads cache state.
11. **FR11.** Decor is drawn inside its wall's own call (sharing its alpha and mist cut), with no
    outline, no animation and nothing in high contrast. A glow is a `--w-sconce` radial at ≤ 35 %,
    clipped to its own wall face.
12. **FR12.** One theme per room, with the decor from spec FR12, and its **banned** list.
13. **FR13.** The home feeds show the decor.
14. **FR14.** The start of a room: hold flat 300 ms, tilt 900 ms (walls grow, staggered north to
    south), swoop 900 ms, land 300 ms (your hop and a small ring). Input is locked throughout. The
    server holds its first tick for `INTRO_MS`. Spectators get the tilt, then a swoop to the whole
    room. Can't see gets black, with their figure fading in after the land. Reduced motion gets a
    300 ms cross-fade after the hold. A restart plays it again.
15. **FR15.** Each event animates its own object, in its own painter row and light clip, per spec §4.2.
    No two events differ only by colour or size. Each one's reduced-motion form is its end state (at
    most a 150 ms fade).
16. **FR16.** The ring is drawn only for "station solved" (big, at the anchor) and "you landed" (small,
    at your feet). A test enforces it (**R1**).
17. **FR17.** Audit rulings: the bell swings once per ring; the goggles' grain runs at 6 fps; every
    visible figure hops on room cleared; hands join and part with picture only; everyone sent back by
    a catch squashes into a puff and pops up at the checkpoint; the inspection plate does not dip.

### 2.2 Non-functional requirements

- **NFR-perf.** Static world layers come from a per-room **tile atlas** on an offscreen canvas, keyed
  by scale × dpr, token set and theme. It is rebuilt on a scale change, `setContrast`, dusk and the
  intro, and is never a whole-room canvas. Frame time is measured on a phone-class profile before
  phase 3 (Task 103) and after each world phase. It may not be worse than that baseline.
- **NFR-a11y.** An AA contrast test covers every text pair on the new shell surfaces. At most 3
  flashes a second. The radio pip is once every 2 s (`PIP_TICKS = 40`). Never colour alone. Reduced
  motion is honoured everywhere.
- **NFR-parity.** Every `parity.test.ts` row's `sees` stays true. Motion is drawing only: the view
  is unchanged, except when the first tick arrives (FR14).
- **NFR-verify.** Every visual phase is checked by screenshots at 1280 and 375 for each sighted role
  plus a spectator. DESIGN.md is updated in the same commit as the look.

### 2.3 Out of scope

- A night-interior theme. Shell layout redesigns. New gameplay objects. Sound changes. Decor placed
  by hand.
- Exclusions decor cannot know without leaking (R2): stations, plaques, cameras and UV ink that are
  not in the layout.

### 2.4 Assumptions and planning rulings (user, 2026-11-07)

- **R1. The ring is reserved, doors included.** `plans/2026-11-07-team-wide-doors.md` Task 89 (not
  built at this writing) makes a door opening ring "wherever it is". This plan replaces that ring with
  the door's own motion (leaves part and sink, a line of dust along the seam), played wherever Task 89
  shows the door. Task 89's off-screen door pill stays. Phase 6 (Task 112) must check whether Task 89
  has landed and adapt to whichever `detectFx` door branch exists.
- **R2. Decor reads layout only, on the client.** `decorFor(roomId, tiles)` excludes what the tiles
  and wires show: doors `D`, hatches `H`, glass `=`, vents `%`, night `" "`, the last row, and
  1 tile round each wire route. Stations, plaques, cameras, signs and ink are drawn after the wall
  in the painter's order, so they always sit over any decor. Room 01 is at half density. A unit
  test over every shipped room asserts that no decor item lies within 1 tile of a station anchor,
  plaque, camera or ink tile (read from the parsed room, test-side only). Where one does, that
  room's decor `salt` (§4.3) is changed until the test passes.
- **R3. `INTRO_MS` is an env seam, like `VOTE_MS`.** `src/net/attach.ts` reads
  `Number(process.env.INTRO_MS)` (default `INTRO_MS = 2400`). `pnpm start:check` sets `INTRO_MS=0`.
  CI's `checks.yml` is course-fixed and starts the app without it, so the real 2.4 s hold runs there.
  The spec helpers' first-tick wait (`nextTick` in `spec/play.ts`, `spec/playUi.ts`'s ready wait)
  therefore gets a default long enough to cover the hold (`INTRO_MS + 2000`). One spec runs its own
  app with the real hold and proves that the clock, guards and bots wait (Task 110).
- The contrast ratios in FR2 were worked out on paper. Task 98's test confirms them, and a failing
  pair is fixed by nudging that token (recorded in the Corrections log), never by dropping the pair.

## 3. Shared context and conventions

- **Stack:** Astro 7, Preact, one Node process (`server.ts`) with the WebSocket at `/ws`. vitest 5 has
  two projects:
  - `unit`: `src/**/*.test.ts`, no server.
  - `spec`: `spec/**/*.test.ts`, against a live app, with browser files capped at `maxWorkers: 3`.
- **Commands:**
  - Unit tests: `pnpm test:unit`; one file with `pnpm vitest run <path>`.
  - Rooms: `pnpm lint:rooms`, and `pnpm vitest run spec/rooms.test.ts` (no server needed).
  - Full check:
    1. `pnpm build`
    2. `pkill -f "node server.ts"`
    3. `PORT=8181 pnpm start:check`, and confirm its log has no `EADDRINUSE`
    4. `APP_URL=http://localhost:8181 pnpm check`

    Do not kill an `astro dev` on :8080.
  - Format only with `pnpm format`, then run `git status`.
  - Frame-time bench: `node scripts/bench-frame.ts` (created by Task 103; see §4.4).
- **Layering** (`src/layering.test.ts`): `src/game/` is pure. `src/client/` imports `game/` and
  `net/protocol.ts` only. Decor and the atlas live in `src/client/render/`, and decor placement is
  pure (no DOM) so it unit-tests in node.
- **Tests:**
  - Unit tests sit beside the code. Browser checks go in `spec/layout/<area>.test.ts`, and a browser
    file stays under 1000 lines (`spec/suite-size.test.ts`). `spec/layout/reveal.test.ts` is 649
    lines, so new reveal-backdrop checks go in a **new** `spec/layout/backdrop.test.ts`. New
    frame/bezel checks go in a **new** `spec/layout/frame.test.ts`, and intro checks in a **new**
    `spec/layout/intro.test.ts`.
  - `src/client/render.test.ts` is 2788 lines (a unit file, so no browser cap). It has the `recorder()`
    canvas proxy at line 355. New renderer unit tests go in **new** files beside the module
    (`render/atlas.test.ts`, `render/decor.test.ts`, `render/motion.test.ts`), each with its own
    small recorder copied from `render.test.ts` lines 355–398, not appended to `render.test.ts`.
- **Test discipline:**
  - Every new test that guards a promise is shown red by breaking the code it guards with a script
    that asserts the text it replaces (never a bare `sed`), then restored. The commit says what was
    broken.
  - A bug fix starts with a failing test. Never retry to get green. Flakes go to `pnpm check:flaky`.
  - Specs that compare frames use `settledHash`, never one `canvasHash` frame
    (`spec/flaky-patterns.test.ts`). Longer animations make this matter more: wait for an animation's
    end with its own data attribute, never a sleep.
- **Visual changes:** read `DESIGN.md` first and update it in the same commit. `spec/design.test.ts`
  fails on a token name that doesn't exist, and on any 6-digit hex in DESIGN.md.
- **Tokens:** every new CSS colour token is mirrored in `src/client/tokens.ts` if the canvas draws
  with it. `src/client/tokens.test.ts` checks that each `WORLD` key has a `--w-*` with the same first
  and second (high-contrast) values, and each `DUSK` key a `--dusk-*`.
- **Course-fixed files** (blocked by `harness/hooks/protect-fixed-files.sh`): `fly.toml`,
  `spec/invariants.test.ts`, `spec/global-setup.ts`, `.github/workflows/*`, `.githooks/*`. Don't edit
  them. Ask the user if one seems to need a change.
- **Admin:** ADR 0026 stays `proposed` until the user accepts it (asked in Task 120). The spec's
  backlog line moves to "Decided/built" in Task 120.

## 4. Shared design

### 4.1 Tokens added by this plan

| Token (CSS) | Canvas key | Value | Added by |
| --- | --- | --- | --- |
| `--w-wall-top-<hue>`, `--w-wall-front-<hue>`, `--w-wall-shade-<hue>` for hue ∈ rose, teal, amber, violet, indigo | `HUE_WALLS[hue]` | see phase 01 | Task 96 |
| `--dusk-wall-top-<hue>` … | `HUE_DUSK[hue]` | see phase 01 | Task 96 |
| `--panel-hi` | `COLOR.panelHi` | `#261f35` | Task 98 |
| `--r-lg` | — | `14px` | Task 98 |
| `--sheen` | — | `inset 0 1px 0 rgb(255 255 255 / 6%)` | Task 98 |
| `--lift` | — | `0 1px 2px rgb(0 0 0 / 30%), 0 8px 24px rgb(0 0 0 / 28%)` | Task 98 |
| `--w-sconce` | `WORLD.sconce` | `#ffe9c4` (HC `#ffffff`, unused there) | Task 113 |

The rose hue's set equals today's `--w-wall-*` values, so room 01 is unchanged by Task 96.

### 4.2 The hue switch (Task 96; read by Tasks 104, 106, 113)

```ts
// src/client/tokens.ts
export type Hue = "rose" | "teal" | "amber" | "violet" | "indigo";
export const HUES: readonly Hue[];
// Picks the room's wall set: WORLD.wallTop/wallFront/wallShade and the dusk targets follow it.
// Unknown or absent hue is rose. Re-paints like setContrast does (mutates WORLD in place).
export function setHue(hue: string | undefined): void;
export function currentHue(): Hue;
```

The hue reaches the client as a new optional field on the reveal message and on a full view:

```ts
// src/net/protocol.ts, ServerMsg { t: "reveal" }
hue?: string; // the room's wall hue (room meta `hue`), for the wall tints (FR1)
// src/game/perception.ts, RoleView
hue?: string; // only when `full` (the same message that carries `tiles`)
```

A wall hue is room layout that every role (and spectator) already gets with the tiles, so it is no
perception change. Can't see is sent it too, because their reveal draws nothing with it.

### 4.3 Decor (Task 113; read by Tasks 114 to 117)

```ts
// src/client/render/decor.ts (pure: no DOM)
export type Theme = "pavilion" | "conservatory" | "watch" | "bank" | "gallery" | "backstage"
  | "service" | "salon" | "strongroom";
export const THEME_OF: Record<string, Theme>; // room id ("05-the-gallery") → theme
export interface DecorItem {
  x: number; y: number;            // the wall tile
  face: "front" | "top";
  kind: DecorKind;                 // one of its theme's kinds (a closed union), e.g. "painting", "sconce"
  lit?: true;                      // carries a --w-sconce glow, clipped to its own face
  variant: number;                 // 0..3, seeded
}
export const THEME_KINDS: Record<Theme, readonly DecorKind[]>;
// wires: every wire entity's `route` (layout every sighted seat is sent), excluded with 1 tile round
export function decorFor(roomId: string, tiles: readonly string[], wires?: readonly Vec[][]): DecorItem[];
// The items on one wall tile's faces (a Map lookup built once per decorFor result).
export function decorAt(items: readonly DecorItem[], x: number, y: number):
  { front?: DecorItem; top?: DecorItem };
// src/client/render/decor-paint.ts (DOM-free, canvas calls only)
// Paints one item in face-local px: (0,0) is the face's top-left, w × h its size. It clips itself to
// that rect first, so nothing it draws (a glow included) can leave the face. No outline. No-op in HC.
export function paintDecor(c: CanvasRenderingContext2D, item: DecorItem, w: number, h: number): void;
// src/client/render/index.ts
// Scene gains: decor?: DecorItem[] // set once per room by the page (Task 114)
```

Density and spacing are as in FR10. `decorFor` is a pure function of its arguments. **The page
computes it once per room** from the room's first full view (`rt.decor`), and never again in that
room, so a cache opening (which changes `tiles`) never moves decor.

### 4.4 The atlas and the bench (Tasks 103 and 104; read by Tasks 105 to 117)

```ts
// src/client/render/atlas.ts
export interface AtlasKey { scale: number; dpr: number; tokens: string; theme: string }
// Draws a tile type's static layers once to an offscreen canvas and blits them after.
// tile: "floor:<variant>" | "wall-top" | "wall-front" | "glass" | "vent" | ...
export function atlasTile(key: AtlasKey, tile: string,
  paint: (c: CanvasRenderingContext2D, s: number) => void): CanvasImageSource;
export function clearAtlas(): void; // called by setContrast, setHue, a dusk step and the end of the intro
```

- `tokens` is a string that changes whenever `WORLD` changes. `paintWorld` in `tokens.ts` bumps an
  exported `worldStamp(): number`.
- During the tilt (`LIVE.wall < TILT.wall`) and while dusk is blending, tiles are drawn live, not from
  the atlas. The atlas is only for a settled projection, so it never has to keep a cache per frame of
  an animation.
- `scripts/bench-frame.ts` (Task 103) spawns its own app with `BENCH=1` and opens `/bench` (a page
  that is 404 without that flag). It drives the real `draw()` in Playwright's Chromium at 375×667,
  dpr 3 (and 1280×800, dpr 2), under CPU throttling ×4 (CDP `Emulation.setCPUThrottlingRate`). It runs
  the room 05 and room 09 scenes for 300 frames each and prints the p50 and p95 frame ms as JSON. The baseline is
  committed as `review/diorama/bench-baseline.json`, and every later bench run is compared with it
  by `node scripts/bench-frame.ts --compare`, which exits 1 if p95 is more than 10 % worse.

### 4.5 Motion primitives (Task 111) and `Fx.targetId` (Task 109); read by Task 112

```ts
// src/client/render/motion.ts (pure: numbers in, numbers out)
export type Ease = (t: number) => number;
export const ease: { out: Ease; inOut: Ease; outBack: Ease; outBounce: Ease; spring: Ease; linear: Ease };
export const sink: (t: number) => number;    // 0 → 1 depth
export const squash: (t: number) => { sx: number; sy: number };
export const pivot: (t: number, deg: number) => number;
export const swing: (t: number, deg: number, times: number) => number;
export const slide: (t: number) => number;
export const shake: (t: number, px: number) => number;
export const hop: (t: number, h: number) => number;
export const arc: (t: number, from: Vec, to: Vec, h: number) => Vec;
export const pop: (t: number) => number;
export const unfurl: (t: number) => number;
export const ripple: (t: number) => number;
export type PuffShape = "side" | "line" | "trail" | "curtain" | "burst";
export const puff: (t: number, shape: PuffShape) => { dx: number; dy: number; r: number; a: number }[];
// src/client/fx.ts
export interface Fx { /* existing fields */ targetId?: string } // added by Task 109 (the landed ring)
export function activeFx( // added by Task 111fx: readonly (Fx & { age: number })[] | undefined, id: string):
  (Fx & { age: number }) | undefined;
```

## 5. Phases

| Phase | File | Tasks | Needs | Ends with | Done |
| --- | --- | --- | --- | --- | --- |
| 0 | `…-01-room-tints.md` | 96, 97 | — | Each room's walls in its hue, day, dusk and HC (Task 97 human review) | [x] (review queued) |
| 1 | `…-02-shell-tokens.md` | 98, 99 | — | Plum retint, radii, AA test green (human review) | [ ] |
| 2 | `…-03-shell-surfaces.md` | 100, 101, 102 | 1 | Lit panels and buttons, display face trimmed, the bezel and tab, the dusk reveal, home glow (human reviews) | [ ] |
| 3 | `…-04-world-atlas.md` | 103, 104, 105 | 0 | Phone-profile baseline committed; atlas; stone/wood floor, AO, lit walls, backdrop, water; bench ≤ baseline (human review) | [ ] |
| 4 | `…-05-objects.md` | 106, 107, 108 | 3 | Doors, crates, glass, vents, stations, figures in material; HC flat; bench ≤ baseline (human review) | [ ] |
| 5 | `…-06-intro.md` | 109, 110 | 3 (the atlas's `clearAtlas` and the live/atlas switch) | The staged start; the server holds `INTRO_MS`; restart replays (human review) | [ ] |
| 6 | `…-07-motion.md` | 111, 112 | 5 (the land's ring is the second reserved trigger) | Primitives, every §4.2 row, the ring test, FR17 (human review) | [ ] |
| 7 | `…-08-decor-engine.md` | 113, 114, 115 | 3, 4 (wall materials it draws inside) | `decorFor`, `drawDecor`, rooms 05, 08, 09 themed; no-floor-pixel test (human review) | [ ] |
| 8 | `…-09-decor-wrap.md` | 116, 117, 118, 119, 120 | 7 | The other six themes; home feeds; DESIGN.md rewritten; final bench; full check; ADR asked (human review) | [ ] |

## 6. Feature-level Definition of Done

- [ ] Every phase in §5 is ticked, every task is complete, and its tests pass.
- [ ] `pnpm test:unit` passes.
- [ ] The full check passes via the recipe in §3.
- [ ] `pnpm lint:rooms` and `spec/rooms.test.ts` pass (rooms are not edited, but the hold changes the
      first tick).
- [ ] `node scripts/bench-frame.ts --compare` passes against `review/diorama/bench-baseline.json`.
- [ ] Manually verified on a local build, 3 tabs: room 1 → the tilt, swoop and land; room 5 through to
      cleared (decor, materials, a door parting, a solve ring); the alarm in room 3 (dusk tints); high
      contrast on (flat, no decor); reduced motion on (cross-fade, end states). At 1280 and 375, for
      each sighted role and a spectator.
- [ ] Every requirement in §2 is covered (§7).
- [ ] Every `Human review:` task (97, 99, 100, 101, 102, 105, 107, 108, 109, 112, 115, 117, 119) is
      explicitly accepted by the user.
- [ ] ADR 0026's acceptance has been asked for; the status changes only on the user's word.
- [ ] Nothing remains in §8.

## 7. Requirements coverage check

| Requirement | Covered by |
| --- | --- |
| FR1 | Tasks 96 (tokens, hue plumbing), 97 (walls drawn by hue) |
| FR2 | Task 98 (tokens and the AA test), Task 99 (applied across the shell) |
| FR3 | Task 100 |
| FR4 | Task 98 (`--r`, `--r-lg`), Task 100 (buttons, pills) |
| FR5 | Task 99 |
| FR6 | Task 101 |
| FR7 | Task 102 |
| FR8 | Tasks 104 (floor, AO, walls), 105 (backdrop, water), 106 (doors, crates, glass, vents), 107 (stations), 108 (figures) |
| FR9 | Tasks 104 to 108 (each has its HC-flat and info-flat test), 113 (decor off in HC) |
| FR10 | Task 113 (placement, R2 test), Tasks 114, 116 (themes keep it) |
| FR11 | Task 113 (draw inside the wall; no floor pixel; clipped glow) |
| FR12 | Tasks 114 (gallery, salon, strongroom), 116 (other six), 113 (banned-kind test) |
| FR13 | Task 117 |
| FR14 | Task 109 (client sequence), Task 110 (server hold, restart, env seam) |
| FR15 | Task 111 (primitives, `targetId`), Task 112 (each row of spec §4.2) |
| FR16 | Task 112 (the ring test; R1 door) |
| FR17 | Task 112 (bell, hands, caught, cleared, plate), Task 108 (goggles 6 fps) |
| NFR-perf | Tasks 103 (baseline), 104 (atlas), 105, 107, 108, 115, 119 (bench compare) |
| NFR-a11y | Task 98 (AA), Task 112 (flash rate, RM end states), Task 109 (RM cross-fade) |
| NFR-parity | Task 110 (`parity.test.ts` green with the hold), Task 112 (motion reads only the view) |
| NFR-verify | Every phase's DoD (screenshots); Task 118 (DESIGN.md rewrite) |

## 8. Risks / open questions

None open. Accepted risks, each with a guard:

- **The renderer's size** (~8,000 lines). Guard: new code goes in new modules (`atlas.ts`, `decor.ts`,
  `motion.ts`, `materials.ts`), and existing drawers only call into them.
- **The atlas keeping in step with dusk and the rise.** Guard: §4.4. The atlas is used only on a
  settled projection with no dusk blend, and `clearAtlas` runs on every token change. A unit test
  (Task 104) fails if a `WORLD` change does not change `worldStamp()`.
- **Flaky specs from longer animations** (`spec/flaky-patterns.test.ts`). Guard: each animation
  exposes its end as a data attribute (`data-intro="done"`), and specs wait on that, never a sleep.
- **CI's real hold** (R3). Guard: the helpers' first-tick default covers `INTRO_MS`. Task 110 times
  one full check with `INTRO_MS` unset, once, and records the time in its commit.
- **Task 89 (team-wide doors) ordering** (R1). Guard: Task 112 states both branches, and its ring test
  fails on any door ring whichever order the plans land in.
