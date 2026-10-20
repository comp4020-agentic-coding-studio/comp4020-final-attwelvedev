# Play overhaul — Phase 05: The tilted 3/4 world

- **Date:** 2026-10-19
- **Status:** Approved
- **Requirements confirmed by user:** yes — 2026-10-19
- **Part of:** `plans/2026-10-19-play-overhaul-00-overview.md`. Read it first,
  especially §4.4. The recipe and tokens are `specs/2026-10-19-play-overhaul.md`
  §4.1 ("Tokens", "3/4 recipe", "Principles"); build to them. ADR 0016 is the
  decision.
- **Depends on phases:** 04 (for `seen`, glass, vents). Phase 03 is not
  required, but Task 21 touches the reveal it builds; if phase 03 isn't done,
  Task 21 applies to the existing `RoleReveal`.

## 1. Summary

A living `DESIGN.md` becomes the design reference, with a `CLAUDE.md` rule
and a check that keep it current. Then the canvas draws the room as a pastel island in a tilted 3/4 view: extruded
walls and blocks, role-hatted figures that face, hop and squash, glass and
vents, mist outside line of sight, night in dark zones, a dusk palette for the
alarm, edge pills for out-of-sight senders, and the room rising out of the
flat reveal. The game, spectator view and the home page feeds all use it.

## 2. Requirements (this phase)

### 2.1 Functional

A5; FR8 (drawing), FR25, FR31; the visual side of FR5–FR7 (mist, glass, vents,
night, Show in the dark); FR2 (no family words on canvas: "Alarm" in sentence
case).

### 2.2 Non-functional

60 fps on a mid laptop at 1280×800 (static layers cached offscreen); reduced
motion: no bob, squash, dust, water drift, wall-rise (cross-fade instead);
high-contrast world set; no new image assets; AA via `--glass` behind text and
2 px `--w-line` outlines on interactables.

### 2.3 Out of scope for this phase

Room hues per room (meta `hue` used by Tasks 22–23's rooms; this phase reads it,
defaulting to rose); onboarding labels (Task 22).

### 2.4 Assumptions

See overview §2.4.

## 3. Existing code context (verified 2026-10-19)

- `src/client/render.ts` (712 lines): exports `Scene { w; h; role; seat;
  roles; tiles: string[] | null; entities; self: Vec | null; layout: "fit" |
  "follow"; pops?; fx?; alarm?; nowMs?; reducedMotion?; spectator? }`,
  `FacePop { seat; img; fade }`, `Camera { scale; ox; oy }`, `camera(scene)`,
  `draw(ctx, scene)`. Private: `windowStart`, `shapePath`, `hatch`,
  `drawTiles` (`#` solid, `" "` ink), `drawStamp` (at feet), `drawPops` (drops
  pops whose sender isn't in `entities`), `diamond`, `blockedFor(scene)` (`#`,
  closed doors, hide), `drawCone`, `drawCamera`, `drawSign`, `drawBeam`,
  `drawEntity` (per kind; players as role shapes, `dim`/`hidden` states),
  `FX_COLOR` (captured at import — doesn't follow high contrast), `drawFx`,
  `drawAlarm` ("ALARM", 1 Hz pulse). Draw order: clear → floor fill → tiles →
  entities by kind list → fx → pops → alarm. Blind view: black plus a dim ring
  of radius `MAP.blindRingTiles * MAP.phoneTilePx`.
- `src/client/tokens.ts`: `COLOR` (bg, panel, ink, ui, uiMuted, danger, goal,
  cameraLight, solid, floor, crate), `ROLE_COLOR`, `setContrast(high)`,
  `ROLE_SHAPE`, `MAP { desktopMinTilePx: 12, phoneTilePx: 28, edgeMarginTiles:
  1.5, avatarRadius: 0.4, ringWidthPx: 3, blindRingAlpha: 0.4, blindRingTiles:
  1.2, plateInset: 0.18, hatchPx: 6 }`, `NET`. `src/client/tokens.test.ts`
  matches 6-digit hex vars in `tokens.css` for a fixed list of names and checks
  `setContrast` swaps and swaps back.
- Callers of `draw`: `src/components/Game.tsx` (rAF loop; `layout: size.w >=
  720 ? "fit" : "follow"`; `self: rt.shown`; `entities: lerpEntities(...)`;
  passes `alarm`, `nowMs`, `reducedMotion`; not `view.dark`),
  `src/components/Spectator.tsx` (no pops/fx), `src/components/Feeds.tsx`
  (home page; its own zoom; passes no `nowMs`; a paused frame must be
  byte-stable).
- `src/client/fx.ts`: `Fx { kind: "ring" | "dust" | "spark"; pos; tone; big? }`,
  `detectFx(prev, next)`, `FX_MS = 600`.
- `src/components/Game.tsx` swaps `RoleReveal` for `Hud` on the first view
  (lines 150–178) — the hook for the world rising.
- Tests that pin the flat look: `src/client/render.test.ts` ("camera": fit/
  follow maths with `ox + x*scale`; "a hazard's sight reaching out of the
  dark": exact polygon coordinates via a recorder `ctx` Proxy whose every
  property is a function); `spec/layout/game.test.ts` "shows each role's
  frame, and only the sighted roles' canvas has walls" (exact `#3a4d7a`
  pixels); `spec/layout/home.test.ts` "draws the three feeds" (blind < 5 %
  non-black; sighted > 90 % non-black) and "holds still with reduced motion"
  (byte-equal frames 400 ms apart); `spec/playUi.ts` `canvasHash`.

### Interfaces from earlier phases (exact)

From Task 14 (`src/game/perception.ts`): `RoleView.seen?: string[]` — per row
`"y:x0-x1,x2-x3"` (inclusive runs of visible tiles); absent for Can't see and
spectators. Tiles `=` (glass) and `%` (vent) appear in `RoleView.tiles`
(Task 13). `EntityView` kinds unchanged plus nothing new for clues (no
visual). From Task 1: `ChannelMessage.from.pos?: Vec` on faces; marks arrive
as `stamp` entities with `state` = the `Stamp` id. From Task 1: `roomList()` honours `process.env.ROOMS_DIR`; fixture rooms in
`spec/fixtures/rooms/`. From Task 4: `Dir8`,
`dirOf(v: Vec): Dir8` (`src/client/hud.ts`), `DirArrow`
(`src/components/DirArrow.tsx`, props `{ dir: Dir8; size?: number }`).

## 4. Approach

**Module split.** `src/client/render/` with `index.ts` (`draw`, `Scene`,
`camera`, re-exported by `src/client/render.ts` so callers don't change),
`project.ts`, `backdrop.ts`, `blocks.ts`, `figures.ts`, `hazards.ts`,
`sight.ts` (mist, night), `pops.ts` (face pops and edge pills), `alarm.ts`.

**Projection (`project.ts`).**

```ts
export const TILT = { depth: 0.82, wall: 1.1, block: 0.7 } as const; // fractions of a tile
export interface Camera { scale: number; ox: number; oy: number } // unchanged shape
export function toScreen(cam: Camera, x: number, y: number, z = 0): { x: number; y: number };
// x: cam.ox + x * scale; y: cam.oy + y * scale * TILT.depth - z * scale
```

`camera(scene)` keeps its signature; it follows your avatar on both layouts
(desktop ~18 tiles wide, phone ~7), clamped to the room, with the room's
projected height `height * depth + wall` used for vertical fit. Feeds keep
their whole-room fit by passing `layout: "fit"`, which now means "fit the whole
room" (used by the home feeds and the reveal) and `"follow"` means the game
camera.

**Drawing order.** Backdrop (sky gradient + water, cached per size) → island
slab and cliff (cached per room + size) → for each row north to south: floor
tops of that row, then block fronts and tops of walls/glass/vents/doors/crates
in that row, then entities whose tile row is that row (sorted by y) → mist
and night overlays → fx → face pops → edge pills → alarm frame. A wall front
whose screen rect overlaps a figure north of it is drawn at 35 % alpha with a
dashed figure silhouette.

**Figures (`figures.ts`).** Pill body in role colour, 2 px `--w-line`
outline, face disc with eyes offset toward `facing`, hat = role shape (dome,
box, cone), floor shadow; own avatar adds a floor ring and "You" chevron; bots
an antenna. Motion state (needs Task 19's server fields): moving → hop
`sin(t·2π·2.5)·2px` and dust puffs every 250 ms; blocked → squash 10 % toward
the facing; pushing (blocked and a crate ahead) → lean 8°. Can't see's own
screen: black, the dimmed figure centred (40 % alpha, no world), facing their
input direction, hopping while `view.you.motion.moving`, squashing when
`blocked`. Reduced motion: facing only.

**Sight (`sight.ts`).** Decode `seen` into a bitset; tiles not in it are drawn
desaturated under `--w-mist` at 60 % with a static stipple; boundary feathered
over half a tile (draw the mask to an offscreen canvas at 1/4 resolution and
blur it with `filter = "blur(...)"` once per view change). Dark-zone tiles
(`" "`) are `--w-night` with the rim. Entities are already filtered by the
server; marks (`stamp`) received in unseen tiles are drawn at 35 % alpha.

**Edge pills (`pops.ts`).** A face pop whose sender isn't among `entities`
uses `from.pos` (kept with the pop in `Game.tsx`) and draws a glass pill at the
screen edge where the ray from the view centre to the sender's projected
position exits, with the sender's `RoleShape`, name and the face (1.5 s) then
the pill alone (4 s). Same for a mark placed outside the visible window. Names
are drawn on the canvas with the HUD font at 14 px on `--glass`.

**World tokens.** Spec §4.1 tokens table, alarm dusk set and high-contrast
world set, as 6-digit hex CSS vars (`--w-sky-hi` … `--w-exit`) mirrored in a
`WORLD` object in `tokens.ts` (with `setContrast` and a new `setDusk(on)`
blending toward the dusk set over 600 ms, instant under reduced motion).
`FX_COLOR` is read per frame (fixes the high-contrast miss).

**The world rises (FR25).** `Game.tsx` keeps the canvas mounted under the
reveal (phase 03 draws the flat room there, blurred). When every human is
ready (the first `view` after ready), a 900 ms transition interpolates
`TILT.depth` from 1 → 0.82 and wall/block heights from 0 → full with an
ease-out, while the blur and scrim fade; Can't see's then fades to black over
400 ms. Reduced motion: a 300 ms cross-fade. `.frame canvas` stays mounted
throughout (playUi waits for it).

**Tests that pinned the flat look** are rewritten, not deleted:
`render.test.ts` camera cases use `toScreen`; the sight-polygon case expects
the projected coordinates; `game.test.ts`'s wall check samples for the
`--w-wall-top` colour on sighted canvases and asserts none on Can't see's;
home feeds keep their thresholds (water and sky are non-black; Can't see's
feed stays black) and the reduced-motion byte-equal frame (no animation
without `nowMs`).

## 5. Task breakdown

### Task 17: A living DESIGN.md, and the rule that keeps it current [x]

- **Description:** Write `DESIGN.md` at the repo root as the current design
  reference (overview A5), from `specs/2026-10-19-play-overhaul.md` §4.1, the
  parts of `specs/2026-10-08-sensory-heist.md` §4.1 that still hold, and what
  Tasks 2 and 10–12 actually built (read the components and CSS, not just the
  spec). Sections:
  1. The idea (daylight and night: light = seen, haze = known, night = unseen)
     and principles.
  2. Tokens by name and use, with no hex values (the hex lives in
     `tokens.css`): shell and world, and the alarm and high-contrast sets.
  3. Type: Archivo's axes and roles, and the ASCII-subset rule (arrows and
     shapes are drawn).
  4. The world: the 3/4 recipe, block shading, figures and hats, hazards,
     glass, vents, mist, night, labels. Written from the spec and marked
     "planned (Task N)" until Tasks 18–22 build them.
  5. Components: what exists and when to reuse it (`RoleShape`,
     `ReceiverLine`, `DirArrow`, `ConfirmButton`, `PlayerRow`, `VotePrompt`,
     `CommsWheel`, `Connection`, glass chips…).
  6. Motion: durations, reduced motion, flashing ≤ 3/s.
  7. Accessibility: never colour alone, AA, targets, focus.
  8. Copy: name methods with verbs, name people not channels, sentence case,
     never "Say", "Sound", "Show" or "channel".

  Also: mark `doc/prompts/DESIGN.md` superseded with a pointer, fix the
  comment in `src/styles/tokens.css:22` (it cites the old file), and add the
  `CLAUDE.md` rule.
- **Files touched:** new `DESIGN.md`; `doc/prompts/DESIGN.md` (status line and
  pointer only); `src/styles/tokens.css` (comment); `CLAUDE.md` (under "Working
  method": "Visual changes: read `DESIGN.md` first; a change to the look, a
  token, a component's job or the copy rules updates it in the same commit");
  new `spec/design.test.ts`.
- **Tests first (red):** `spec/design.test.ts` (plain file reads, no app):
  - every `` `--name` `` token `DESIGN.md` mentions exists in
    `src/styles/tokens.css`;
  - every component it lists as built exists under `src/components/`;
  - `DESIGN.md` contains no 6-digit hex (values live in `tokens.css`);
  - `doc/prompts/DESIGN.md` starts with a superseded line naming `DESIGN.md`.
- **Implementation (green):** write the document, under ~300 lines.
- **Acceptance criteria:** `spec/design.test.ts` green; `pnpm check` green.
- **Human review:** the user reads `DESIGN.md` and judges it a faithful, usable
  account of the design as built, plus what phases 05–06 will add. Pass = user
  says so.
- **Depends on:** Tasks 2 and 10–12 if phase 03 is done; otherwise it documents
  what exists and marks the rest planned.

### Task 18: Projection, backdrop and blocks [x]

- **Description:** The module split, world tokens, `toScreen`, the follow
  camera, backdrop, island, extruded walls/glass/vents/doors/crates/plates/
  exit/loot/hazards in painter's order, wall fade, dusk and high-contrast sets,
  "Alarm" banner in sentence case.
- **Files touched:** new `src/client/render/*.ts`, `src/client/render.ts`
  (re-export only), `src/client/render.test.ts`, `src/client/tokens.ts`,
  `src/client/tokens.test.ts` (adds the world var names), `src/styles/tokens.css`,
  `src/components/Feeds.tsx` (passes `layout: "fit"`), `spec/layout/game.test.ts`
  (wall colour), `spec/layout/home.test.ts` (unchanged thresholds; adjust only
  if the projection changes the feed's framing).
- **Tests first (red):** `render.test.ts`: `toScreen` puts tile (0,0) at the
  camera origin and a wall top `TILT.wall` tiles above its foot; the follow
  camera keeps your avatar inside the window and the window inside the room;
  painter's order draws a figure in row 5 after row 4's wall front and before
  row 6's (recorder ctx records `fillStyle` set via a Proxy `set` trap — extend
  the recorder to record sets); a glass tile is drawn translucent; the alarm
  banner text is "Alarm". `tokens.test.ts`: every `--w-*` var has a base and
  high-contrast value matching `WORLD`.
- **Implementation (green):** this file's §4 "Projection", "Drawing order",
  "World tokens".
- **Acceptance criteria:** tests green; `pnpm check` green; the three callers `DESIGN.md`'s world section updated to match (planned → built).
  render without errors at both viewports.
- **Depends on:** Task 13 (glass/vent tiles), Task 17.

### Task 19: Figures that move; Can't see's own figure [x]

- **Description:** Role-hatted figures with facing, hop, squash, lean, dust;
  the server sends motion state; Can't see's screen shows their own dimmed
  figure.
- **Files touched:** `src/game/perception.ts` (+ test: players carry `moving`,
  `blocked`, `facing` in sighted views; `RoleView.you.motion` for every role
  including blind, from that seat's own state only), `src/net/protocol.ts`
  types only, `src/client/render/figures.ts`, `src/client/render.test.ts`,
  `src/components/Game.tsx` (own facing from the input direction, motion from
  the predictor: moving if the predicted position changed this frame),
  `spec/perception.test.ts` (Can't see's view still has no tiles, entities or
  position — only `you.motion`).
- **Tests first (red):** perception: a blind view gets `you.motion.moving =
  true` while its seat walks and `blocked = true` against a wall, and nothing
  else new; sighted views carry `moving`/`blocked` on player entities. Render:
  under reduced motion a moving figure is drawn at the same y as a still one;
  otherwise its y differs by the hop; a blind scene draws only black plus the
  dimmed figure (recorder: no tile fills).
- **Implementation (green):** §4 "Figures".
- **Acceptance criteria:** tests green; `spec/layout/home.test.ts` still `DESIGN.md`'s world section updated to match (planned → built).
  green (feeds' Can't see stays < 5 % non-black).
- **Depends on:** Task 18.

### Task 20: Mist, night, faint marks and edge pills [x]

- **Description:** `seen` decoding and mist, night in dark zones, Show items
  drawn over night, faint marks in unseen tiles, edge pills for unseen face
  senders and marks.
- **Files touched:** `src/client/render/sight.ts`, `src/client/render/pops.ts`,
  `src/client/render.test.ts`, `src/components/Game.tsx` (keep `from.pos` with
  each pop; pass `seen` into the scene), `src/components/Spectator.tsx`
  (no `seen`: no mist), new `spec/layout/sight.test.ts`.
- **Tests first (red):** unit: `decodeSeen(["2:3-5"])` has (3,2)…(5,2) only;
  an unseen tile is drawn under the mist colour; a face pop from a sender not
  in `entities` produces an edge pill on the side of `from.pos`. Browser
  (`playRoom` on a fixture room via `ROOMS_DIR` from Task 1 —
  add `spec/fixtures/rooms-sight/01-wall.room`, with a wall
  between Can't hear and Can't speak): "Can't speak's face reaches Can't hear
  as an edge pill pointing toward them"; "the area behind the wall is drawn as
  mist on Can't hear's canvas, not as floor".
- **Implementation (green):** §4 "Sight", "Edge pills".
- **Acceptance criteria:** tests green. `DESIGN.md`'s world section updated to match (planned → built).
- **Depends on:** Task 19, Task 14.

### Task 21: The world rises out of the reveal [x]

- **Description:** The 900 ms rise from the flat blurred reveal into the 3/4
  world; Can't see's fade to black; reduced-motion cross-fade.
- **Files touched:** `src/components/Game.tsx`, `src/client/render/index.ts`
  (a `rise?: number` 0..1 on `Scene` scaling depth and heights),
  `src/client/render.test.ts`, `src/components/RoleReveal.tsx` (card fades
  out), `src/styles/game.css`, `spec/layout/reveal.test.ts` (or a new
  `spec/layout/rise.test.ts` if the reveal file is absent).
- **Tests first (red):** unit: `rise: 0` draws walls with zero height (the
  flat plan) and `rise: 1` full height. Browser: "after everyone is ready the
  reveal card is gone and `.frame canvas` is visible within 1.5 s"; "with
  reduced motion the swap is a cross-fade (no intermediate rise frames:
  canvas hashes 100 ms apart during the transition differ only by opacity —
  checked by the transition class, `data-rise="fade"`)".
- **Implementation (green):** §4 "The world rises".
- **Acceptance criteria:** tests green; `spec/playUi.ts` `playRoom` unchanged `DESIGN.md`'s world section updated to match (planned → built).
  and green.
- **Human review:** on a local build at both widths, the user plays room 1 as
  each role and judges the world against the spec's Monument Valley direction
  and the reference images: palette, figures, readability of hazards, mist vs
  night, the rise, Can't see's screen. Pass = user says so; changes the user
  asks for are made in this task before commit.
- **Depends on:** Task 20.

## 6. Phase Definition of Done

Re-checked 2026-10-21 after Task 21 (commit `567d86d`). Boxes are ticked only where verified.

- [x] Every task in §5 is complete and its tests pass: Tasks 17-21 are ticked and committed
      (`7d04b87`, `7407d0e`, `409fc62`, `e73061b`, `567d86d`). Task 21 was committed with
      no clean full check, on the user's explicit "commit as is" (see below).
- [x] `pnpm test:unit` passes (1017 tests at `567d86d`)
- [ ] `pnpm build && pnpm start` then `pnpm check` passes: **not met.** Typecheck, lint and the
      unit tests are clean. Every full run after 2026-10-20 evening was wrecked by machine-wide
      load (load average 30 to 440, from orphaned `yes` loops that were killed, then macOS
      system processes) and timed out lobby, home and spectator specs; those pass alone. The one
      full run on a quiet machine (109 files, 1314 tests) was green at `e73061b`, before Task 21.
      **To close this:** wait for the load average to fall below 5, then
      `PAUSE_MS=3000 DATABASE_PATH=/tmp/x.db pnpm start` on a fresh build and run `pnpm check`
      once. If `spec/layout/sight.test.ts` (mine, in `rooms-sight`) fails again, it passes alone
      3 of 3, so run `pnpm check:flaky` before touching it: it failed in 2 of 4 earlier flaky
      runs, always in the full suite. (The flaky run started 2026-10-21 reported 152 failures in
      run 1, a stall, and tells nothing; kill it with `pkill -f check-flaky` if it is still
      going and start another on a quiet machine.)
- [x] Tasks 17 and 21 human reviews accepted (Task 17 on 2026-10-20, Task 21 on 2026-10-21 after
      four rounds of critique, all logged in section 9)
- [ ] Frame time measured in Chrome's performance panel at 1280×800 on room 03
      (≥ 55 fps) and noted in `PROCESS_LOG.md`: **not done.** Needs a quiet machine. The follow
      camera, mist (a ray cast per frame, measured under 5 ms in a unit test) and the 3/4 world
      are the new costs.
- [x] Tick this phase in overview §5 and commit: **ticked 2026-10-21 at the user's explicit
      instruction, with the two boxes above still open.** They were not met and are not being
      claimed: no clean full `pnpm check` (last green run `e73061b`; every later full run hit
      machine-wide load) and no frame-time measurement (>= 55 fps at 1280x800 on room 03; the
      per-frame ray cast in `lightPolygon` is the new cost). Both carry forward to the final
      check in the overview's feature-level Definition of Done.

Not pushed, merged or deployed. `PROCESS.md` and `reflections/crit-10.md` have uncommitted
changes that are the user's, not this phase's: leave them.

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| A5 | Task 17 |
| FR2 (canvas words) | Task 18 |
| FR5–FR7 (visual) | Tasks 18, 20 |
| FR8 (drawing) | Task 20 |
| FR25 | Task 21 |
| FR31 | Task 19 |

## 8. Risks / open questions

None.

## 9. Corrections log

One line per redirect after the user has seen a result: expected, wanted, why the first attempt missed.

- 2026-10-20, Task 19/18: expected the dashed figure behind a wall to move with the figure; user saw it lag the animation. Cause: the outline is a separate rectangle at the server's position, while the figure is drawn at your predicted position with hop, squash and lean. Fix (done): the outline is drawn by the same figure code, over the wall.
- 2026-10-20, Task 18: expected the wall fade to read as smooth; user saw wall tiles go transparent one at a time as they walked along it, "janky and cheap". Cause: the fade is a per-tile yes/no on the tile column the figure is in. Fix (done): a radius around the figure, smoothstep falloff.
- 2026-10-20, Task 20: expected tile-level mist to pass; user wants the mist to be the exact line of sight, ray-cast like the camera and guard cones. Cause: mist is drawn per tile from the server's `seen` set, Fix (done): the edge is a ray-cast polygon, clipped to the server's tiles.
- 2026-10-20, Task 18: expected the desktop follow camera to feel smooth; user saw a sudden snap once the avatar walks far enough from spawn. Cause: the camera is a pure clamp, so its speed jumps from 0 to full when your avatar reaches the margin. Fix (done): `easeCamera`.
- 2026-10-21, Task 18: user reported the camera still snapped playing with two bots, going all the way right with the bots still on the left. Expected: the first fix (an exponential ease) to be smooth. Cause: two. The target camera is centred on the team, so with the bots parked on the left it sits well behind you and starts to follow at full speed once you pass a margin; and a first-order ease still starts at full strength, so in a real browser the camera's speed changed by 1.1 to 1.5 px in one frame at that corner. My first check modelled one idealised walk and passed; it missed both. Fix: a critically damped spring with its own velocity, a wider margin, and a time constant picked from a measured sweep. Unit tests now replay the game's whole pipeline (20 Hz steps, the position smoothing, teammates left behind) at desktop and phone width, and a real-browser measurement on a 48-tile room backs it.
- 2026-10-21, Task 21: committed on the user's explicit "commit as is" with no clean full `pnpm check`: every full run after the 2026-10-20 evening hit machine-wide load (load average 30 to 440) and timed out lobby, home and spectator specs, which pass alone. `spec/layout/sight.test.ts` (mine) failed in some full runs and passes alone; a `check:flaky` on it was still running. Phase 05 is NOT ticked: the full check and the frame-time measurement (>= 55 fps at 1280x800 on room 03) are still open.
- 2026-10-21, Task 20: user (after the human review) saw whole tiles hatched where the ray should light part of them, and a pale outline round some lit tiles, both mostly at night under the alarm's dusk palette. Expected: the ray-cast mist to be exact. Cause: the first version classified each tile by a 4x4 sample (a tile 0.9% lit was veiled whole, one 4% dark left clear) and drew each veiled tile as its own rectangle, half a pixel oversized, so overlaps doubled the alpha. I also clipped the light to the server's `seen` tiles, which I had invented as a rule: `seen` leaves out whole tiles the exact ray lights. Fix: one even-odd veil region, cut by the light, cast over the layout; `seen` only filters entities. Uncommitted at the time of writing; see PROCESS_LOG if added.

