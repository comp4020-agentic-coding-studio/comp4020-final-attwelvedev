# Diorama look — Phase 6: object motion and the reserved ring

- **Date:** 2026-11-07
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-07
- **Part of:** `plans/2026-11-07-diorama-look-00-overview.md`. Read it first: §2 (FR15, FR16, FR17,
  NFR-a11y, NFR-parity), §2.4 **R1** (doors get their own motion, never a ring), §3, and §4.5 (the
  primitives and `Fx.targetId`, exact).
- **Depends on phases:** 5 (the "you landed" ring, `Fx` `targetId: "landed"`, is the second reserved
  trigger, and the ring test must allow it).

## 1. Summary

Each event animates the object it happened to, in that object's own painter row and light clip, with
its own silhouette. The one ring stays only for "station solved" and "you landed", and a test makes
sure of it. This phase also carries out the audit's rulings: the bell swings once per ring, everyone
hops on room cleared, hands join and part, a catch squashes the team into a puff and pops them up at
the flag, and the inspection plate does not dip.

## 2. Requirements (this phase)

### 2.1 Functional

- FR15 in full (every row of spec §4.2, as in this file's §4.2).
- FR16 in full: the test and every other ring removed.
- FR17: bell, cleared hop, hands, caught, inspection plate. (The goggles were Task 108.)

### 2.2 Non-functional

- NFR-a11y: no more than 3 flashes a second (no motion here flashes; the seq-wrong shake is one
  ±4 px shake, not a flash). Reduced motion is each row's end state (at most a 150 ms fade).
- NFR-parity: motion reads only the views the client already gets (`detectFx`), so nothing on the wire
  changes. `parity.test.ts` stays green.
- Can't hear: no two events differ only by colour or size (the old plate press/release and seq
  ok/wrong pairs).

### 2.3 Out of scope for this phase

- Sounds (unchanged). Decor (phases 7 and 8).

### 2.4 Assumptions

- See overview §2.4, R1.
- **Task 89 of `plans/2026-11-07-team-wide-doors.md` may or may not have landed** when this phase
  starts. Check `src/client/fx.ts`: if `detectFx` still takes `seenBefore` and only fires a door on a
  seen tile, keep that guard. Otherwise, fire wherever the door is. Either way the door's fx is
  `kind: "door"` (the part-and-sink), never `ring`. If Task 89 added a door ring, this task removes it
  and says so in its commit. Its off-screen door pill stays.

## 3. Existing code context (verified 2026-11-07)

- `src/client/fx.ts`:
  - `Fx { kind: "ring" | "dust" | "spark" | "swing" | "arc" | "cloud" | "slide" | "lift"; pos; tone;
    big?; to?; item?; keep? }`, `FX_MS = 600`, `LIFT_MS = 1000`, `FX_MAX = 24`, and
    `fxMs(f)`.
  - `fxOfCacheEvent(event)`: on "taken" it emits lift, spark and a **ring**. Otherwise slide and dust.
  - `detectFx(prev, next, seenBefore?)` (line 53) emits a **ring** for: a plate state change, a door
    closed→open, a braille `flash: "ok"`, a checkpoint up→reached, and sign progress up or down (and
    for a station solved, which stays). It also emits swing (bell on), arc (gear between players),
    dust (a crate moved by ≥ 0.4), cloud (newly dyed) and spark (loot gone).
- `src/client/render/index.ts`, `drawFx(ctx, scene, cam)` (line 485): every fx is drawn **after** the
  whole scene, outside any row or light clip. The ring is an ellipse of radius `scale × (big ? 1.6 :
  0.9) × grow`.
- Painter rows: in `drawScene`, per row `y`, the walls, then `drawMist(…, y)`, then closed doors,
  then (if `hasStanding`) wires, stations (`cut(parts, height, …)`), then `STANDING` kinds through
  `cut(...)`. `drawCut(ctx, cam, light, parts, height, draw)` (`column.ts`) clips a draw to the lit
  part of its footprint.
- `src/client/render/signals.ts` `drawBell(ctx, e, cam, scene)`: while `e.state === "on"` it swings
  `SWING_DEG × sin(t × 2π × 3) × (1 - t)` with `t = (nowMs % SWING_MS) / SWING_MS`. That is a **loop**
  for as long as the state is "on".
- `src/client/render/chamber.ts` `drawInspectionPlate(ctx, t, cam)` (line 95) is flat already. Confirm
  no `sunk`/press offset is applied to it by `drawStationFloor`'s pressed-part sinking
  (`stations.ts:596` `const pressed = new Set(st.shows)`).
- `src/components/Game.tsx`: `rt.fx: { fx: Fx; at: number }[]`. The scene's `fx` maps each to
  `{ ...fx, age }`. `socket.on("caught", m => …)` (line 882) sets the caught text only.
- `EntityView` fields motion reads (`src/game/perception.ts:57–160`): `state`
  (open/closed/pressed/up/watching/idle/on/off/reached/hidden/occupied), `station.shows`,
  `station.solved`, `station.jammed`, `flash`, `progress`, `present`, `item`, `heldBy`, `holding`,
  `pulling`, `dyed`, and `pos`.
- `src/components/Feeds.tsx` `advance()` also calls `detectFx` per seat, so the home feeds get the same
  motion.

### Interfaces from earlier phases (exact)

From Task 109:

```ts
// src/game/intro.ts
export const INTRO_TOTAL = 2400;
// Game.tsx pushes, once, when the land begins:
{ kind: "ring", pos: self, tone: "ui", targetId: "landed" } // big absent: the small ring
```

`Scene.landing?: number` (0–1) exists. `Fx` has `targetId?: string` (added by Task 109 for the landed
ring). This phase widens its use.

## 4. Approach

### 4.1 Mechanism

- `Fx.kind` is widened to one kind per row of §4.2 (e.g. `"plate"`, `"door"`, `"crate"`, `"seq"`,
  `"pip"`, `"unfurl"`, `"hop"`, `"squash"`, `"stamp"`, `"bell"`, `"read"`, `"jam"`, `"dye"`,
  `"hands"`, `"lever"`, `"camera"`, `"laser"`, `"caught"`, `"part"` for station parts), and
  `targetId` names the entity.
- `activeFx(scene.fx, id)` (overview §4.5) returns the live one for an entity. **Each object's own
  drawer** (in its row and clip) reads it and applies the motion. `drawFx` keeps only: the ring
  (solved, landed), dust and puff particles, the arc (gear in flight), the cloud, the lift and the
  slide. Each of those is anchored to an entity's tile, and it is drawn inside that row's
  `clipToLight` (moved into the row loop, so a puff behind a wall is cut by the wall like its object).
- `fxMs(f)` reads a `DURATION: Record<Fx["kind"], number>` table (this file's §4.2).
- Reduced motion: each drawer, when `scene.reducedMotion`, draws its end state. A fade (where the row
  says one) is at most 150 ms.

### 4.2 Trigger and motion table (spec §4.2, mapped to views)

| Event | Detected in `detectFx` from | Motion (drawer) | ms | RM |
| --- | --- | --- | --- | --- |
| Plate press / release | `plate.state` up↔pressed | press: `sink` + side puffs; release: `spring` up, no dust (`drawFlat`) | 180 / 200 | end state |
| Door | `door.state` closed→open (R1, §2.4) | leaves part and `sink`, a `line` puff along the seam, 1 px thud offset (`drawStanding` door, then the slot) | 450 | slot |
| Crate | crate moved ≥ 0.4 | `pivot` 2° rock and a `trail` puff (`drawStanding` crate) | 250 | moved |
| Loot | loot gone | `hop` and `arc` to the nearest player, then a spark | 400 | 150 ms fade |
| Keepsake take | `cacheEvent` taken | rise, gloss sweep, glide to the owner; **no ring, no spark** (`fxOfCacheEvent`) | 1000 | fade in place |
| Gear take / drop / sill / give | gear entity gone + `player.item` set / reverse / on a hatch tile / arc between players | `hop` / `outBounce` / `slide` / `arc` | 250 / 250 / 300 / 250 | end state |
| Flag pip / checkpoint | `present` up / up→reached | pip `pop` + pole wobble / pennant `unfurl` + one wave | 220 / 500 | end state |
| Exit occupied / cleared | `exit.state` → occupied / `status` → cleared | hatch marches outward / **every visible figure hops twice** (FR17) | 400 / 600 | static / none |
| Hide | `player.state` → hidden | `squash` into the box | 250 | hidden |
| Seq ok / wrong / open | sign `progress` up / down / door open by sequence | `stamp` on the sign / `shake` ±4 px and a steady danger outline for 600 ms / `ripple` fill | 200 / 300 (+600) / 400 | end state |
| Solved | `station.solved` false→true | the **ring** (big, at the anchor), tick plate drops, type flourish | 600 | 150 ms fade |
| Dial / key / practice / wire / radio / switch | `station.shows` changed, by `station.type` | detent / piano tip / dull tip / ends curl / needle slide / throw + rays | 150 / 200 / 200 / 300 / 250 / 270 | end state |
| Bell / music-box bell | bell `state` off→on | 3 swings **once** (FR17), then still while "on" / 1 nod | 1200 / 300 | static tilt |
| Braille read | braille `flash: "ok"` | studs lift in reading order; **no ring** | 400 | outline only |
| Jam | `station.jammed` set | a stutter, then the tape unrolls | 240 + 200 | tape at once |
| Dye | `player.dyed` newly true | puffs, then blotches splat 80 ms apart | 600 | blotches at once |
| Hands join / part / tug | `heldBy` set / cleared / `pulling` | beads meet / retract / arc tremor ±1 px at 2 Hz | 150 / 150 / loop | end state |
| Lever | lever `state` changed | throw, then a thud | 280 | thrown |
| Secret door / vault | `cacheEvent` uncover / vault | the block sinks with a `curtain` puff / the keepsake rises on its plinth | 600 / 600 + 500 | 300 ms cross-fade |
| Camera / laser / guard | camera idle→watching / laser off→on / guard moving | nod and hatch fill / the beam draws / heavy hop and torch sway at 1.5 Hz | 250 / 150 / loop | instant / translate |
| Caught | the `caught` message, and every player whose `pos` jumps ≥ 2 tiles in one view | squash into a `burst` puff where they were, then `pop` up at the checkpoint | 200 + 250 | teleport |
| Inspection plate | — | **no dip** (FR17): never sinks when walked on | — | — |

Hands join and part are picture only (no sound is added). A tug is a steady ±1 px tremor while
`pulling`, at 2 Hz, so it is never a flash.

### 4.3 The ring test (FR16)

`src/client/render/ring.test.ts` (new):
- **Behavioural:** for each scenario in a table (plate press, door, braille, checkpoint, seq up/down,
  bell, crate, loot, gear, dye, hands, lever, camera, caught, cleared, the keepsake take, uncover),
  `detectFx`/`fxOfCacheEvent` emit **no** `kind: "ring"`. For "station solved" exactly one, `big`.
- **Structural:** a source scan of `src/client/**/*.ts{,x}` (not tests) for `kind: "ring"`. The only
  allowed sites are the solved branch in `fx.ts` and the landed push in `Game.tsx`, each with a
  `// ring: reserved (FR16)` comment on the line before. Any other match fails with its file and line.

## 5. Task breakdown

### [x] Task 111: Motion primitives, `activeFx`, and fx drawn in their object's row (FR15 mechanism)

- **Description:**
  - Write `src/client/render/motion.ts` (overview §4.5, exact).
  - In `fx.ts`: add `activeFx` and the `DURATION` table, and widen `Fx.kind`.
  - In `drawScene`, move the drawing of particle fx (dust, puff, spark, arc, cloud, lift, slide, ring)
    into the row loop for the row of its `pos`, inside that row's light clip. A row with an active fx
    counts as `hasStanding`.
  - Behaviour is unchanged in this task: existing kinds keep their look, now in-row.
- **Files touched:** `src/client/render/motion.ts` (new), `src/client/render/motion.test.ts` (new),
  `src/client/fx.ts`, `src/client/fx.test.ts`, `src/client/render/index.ts`,
  `src/client/render.test.ts`.
- **Tests first (red):**
  - `motion.test.ts`: each primitive at t = 0 and 1 hits its end values (`sink(1) === 1`,
    `hop(0) === hop(1) === 0`, `swing(1, d, 3) === 0`, `shake(1, 4) === 0`, `arc(1, a, b) === b`, and
    `puff(t, shape)` alphas fall to 0 at 1). Every ease maps 0→0 and 1→1.
  - `render.test.ts`: "a dust fx behind a wall in row 3 is drawn before row 4's wall front" (its ops sit
    between rows 3 and 4 in the trace); "a fx outside the light is clipped like its row".
- **Implementation (green):** as described.
- **Acceptance criteria:** the tests pass, and `render.test.ts`, `sight.test.ts`, `standing.test.ts`
  and `spec/layout/sight.test.ts` are green.
- **Break check:** draw dust after the loop again (scripted). The row-order case goes red.
- **Depends on:** none in this phase.

### [x] Task 112: Every event's own motion, the reserved ring, and the audit's rulings (FR15, FR16, FR17)

- **Description:**
  - Implement each row of this file's §4.2: the detection in `detectFx`/`fxOfCacheEvent` (with
    `targetId`), and the motion in that object's own drawer through `activeFx` and the primitives.
  - Remove every ring except solved and landed (plate, door, braille, checkpoint, sign, keepsake).
  - `drawBell` swings only within its fx's 1.2 s, not on `state === "on"` (FR17).
  - Caught: `Game.tsx` adds a `caught` fx to each player entity whose position jumped ≥ 2 tiles, from
    the view after the `caught` message.
  - Cleared: every visible figure hops twice over 600 ms.
  - Confirm that the inspection plate never sinks (FR17).
  - DESIGN.md §5 Motion is rewritten as spec §4.2's table, with the primitives named, and the line
    "The ring is reserved for station solved and you landed (FR16)". The `Fx` doc comments are
    updated.
  - R1: see this file's §2.4 for Task 89.
- **Files touched:** `src/client/fx.ts`, `src/client/fx.test.ts`, `src/client/render/ring.test.ts`
  (new), `src/client/render/index.ts`, `src/client/render/blocks.ts`, `src/client/render/stations.ts`,
  `src/client/render/signals.ts`, `src/client/render/figures.ts`, `src/client/render/gear.ts`,
  `src/client/render/hazards.ts`, `src/client/render/chamber.ts`, `src/client/render/dye.ts`,
  `src/client/render/motion.test.ts`, `src/components/Game.tsx`, `DESIGN.md`.
- **Tests first (red):**
  - `ring.test.ts` (this file's §4.3): red today (plate, door, braille, checkpoint, sign and take all
    ring).
  - `fx.test.ts`: one case per row of §4.2: "<event> emits a <kind> fx targeting <id>".
    - "plate press and release emit different kinds of motion, not one in two colours"
    - "seq ok and wrong differ in kind"
  - `motion.test.ts`, drawer cases with a recorder:
    - "a door with an active door fx at age 0.5 draws its leaves apart and lower than at age 0"
    - "a rung bell is still once its 1.2 s fx is over, though its state is still on"
    - "on cleared every visible figure is drawn higher at age 0.25 than at 0"
    - "reduced motion: each drawer draws its end state at age 0"
    - "the inspection plate draws the same pressed or not"
- **Implementation (green):** row by row. Each row is red then green on its own, in the same task.
- **Acceptance criteria:**
  - All the above pass.
  - `parity.test.ts`, `src/client/render.test.ts`, `spec/layout/sight.test.ts`,
    `spec/layout/chamber.test.ts` and `spec/caught.test.ts` are green.
  - `pnpm check:flaky 3` on `spec/layout/*` shows no new flake (the longer motions are the risk named
    in overview §8).
  - Screenshots or short recordings (`review/diorama/p6-*.gif`) of: a door, a crate, a plate press and
    release, a solve, a bell, a catch, and the cleared hop, at 1280 and 375.
- **Break check:** restore the plate's ring (scripted). `ring.test.ts` goes red with the line named.
  Restore the bell loop. The bell case goes red.
- **Built smaller (overnight run, see `plans/2026-11-07-overnight.md` dl07):** one shared 250 ms
  dip for every station type's part change; no guard walk cycle or music-box nod; the vault keeps
  its slide; screenshots are a contact sheet, not gifs. The rest went to `specs/backlog.md`.
- **Human review:** on a local build, three tabs through rooms 1, 3 and 5, then reduced motion on. A
  pass is:
  - each event's motion is about its object and is told apart without colour (watch with Can't hear's
    tab);
  - the only rings you ever see are a solve and your landing;
  - nothing feels busy or flashes;
  - reduced motion shows plain end states.
- **Depends on:** Task 111.

## 6. Phase Definition of Done

- [x] Tasks 111 and 112 are complete and their tests pass.
- [x] `pnpm test:unit` passes.
- [x] The full check passes (overview §3). (176 files, 445 s; `pnpm check:flaky 3`: clean, 3 of 3)
- [x] `pnpm bench:frame --compare` passes (fx are now in-row; confirm no regression). (p95 83.2 / 91.4 / 162.6 / 184.3 ms, within 10 %)
- [x] The user has accepted Task 112's review. (review queued)
- [x] Tick phase 6 in overview §5 and commit.

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR15 | Tasks 111 (mechanism), 112 (every row) |
| FR16 | Task 112 (`ring.test.ts`) |
| FR17 (bell, cleared, hands, caught, plate) | Task 112 |
| NFR-a11y (flashes, RM) | Task 112 |
| NFR-parity | Task 112 (`parity.test.ts` green; motion reads views only) |

## 8. Risks / open questions

None.

## Corrections log
