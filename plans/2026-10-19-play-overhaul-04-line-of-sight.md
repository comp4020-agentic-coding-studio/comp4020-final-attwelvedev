# Play overhaul — Phase 04: Line of sight, glass and vents, held sequences, bots

- **Date:** 2026-10-19
- **Status:** Approved
- **Requirements confirmed by user:** yes — 2026-10-19
- **Part of:** `plans/2026-10-19-play-overhaul-00-overview.md`. Read it first,
  especially §2.1 A2–A3, §3 (perception and parity rules). ADR 0012 is the
  decision.
- **Depends on phases:** 01 (may run before 02–03).

## 1. Summary

Sighted roles see only what is in their line of sight; glass passes sight but
not sound, vents pass sound but not sight; sounds stop at walls and glass;
faces and marks show in the dark; sequence doors need every plate held; one
new `clue` sound with no visual half; the room format declares lead beats and
cue beats, and the linter checks the new rules; bots perceive under the same
limits, and a spec harness can switch off one role's sending to prove that
role is needed. The three existing rooms keep working (no glass or vents yet).

## 2. Requirements (this phase)

### 2.1 Functional

FR5, FR6, FR7, FR9, FR11, FR13, FR14 (harness; the rooms that satisfy it are
phase 06), A2, A3, A4 (`CLAUDE.md` sensory parity line).

### 2.2 Non-functional

20 Hz holds: one server tick for 10 lobbies × 3 seats with LOS stays under
10 ms on the dev machine (measured by a bench script and recorded in
`PROCESS_LOG.md`); views stay under 8 KiB; `pnpm check` time grows by less
than 20 %.

### 2.3 Out of scope for this phase

Drawing mist and edge pills (Task 20); new rooms (Tasks 22–23); the 3/4 look.

### 2.4 Assumptions

See overview §2.4. Hide spots keep blocking hazards' sight (cover) but don't
block players' line of sight (you see a teammate crouched behind cover).

## 3. Existing code context (verified 2026-10-19)

- `src/game/sim/sight.ts` (51 lines): `blocksSight(world, tx, ty)` — `#`,
  off-map, hide spots, closed doors; `lineOfSight(world, a, b)` samples every
  0.1 tile skipping the end tiles; `inCone(from, facing, target, range,
  fovDeg)`.
- `src/game/sim/collide.ts`: `RoomIndex { doorAt; plateAt; exitAt; hideAt }`,
  `indexOf(room)` (WeakMap cache), `tileKey`, `solidTile(world, tx, ty)`
  (lines 47–56: `#`, off-map, closed `D`, crates), `blockedAt`,
  `crateTouching`, `crateAt`.
- `src/game/sim/step.ts`: `step(world, inputs, dtMs = TICK_MS): World`;
  `updatePlates` (97–110), `updateSequences` (122–153, press order only, wrong
  plate resets, `SEQUENCE_GAP_MS = 5000`), `updateDoors` (155–169, latching);
  `floorNear`/`pushCrate` need `ch === "."`.
- `src/game/sim/hazards.ts`: `laserBeam(room, o)` stops at `#`, `D`, off-map;
  `findCatch(world)` uses `inCone && lineOfSight` for guards/cameras.
- `src/game/rooms/format.ts`: `Tile` union and `TILES` set (`. # 1 2 3 B p D E
  G C L h K $ S`); `RoomObject.kind` union; `Beat { name; x; intent }`;
  `Room.grid` is built at line 282 by `raw.map((row) => row.replace(/[^#D]/g,
  "."))`; `NUMBERED` letters → kinds; `PARAMS`; `DEFAULT_VISIBLE_TO = ["deaf",
  "mute"]`; `flipsOf(room): Flip[]` (dark zone `[x0,y0,x1,y1]` inclusive,
  alarm `{ trigger; durationS }`); `parseRoom(text)`.
- `src/game/rooms/lint.ts`: `lintRoom(room): LintIssue[]`, rules 1–8 (grid,
  spawns, exit, doors, FR10 three-plate beat, hazards incl. a sign for every
  sequence door, hints, reachability BFS through everything but `#`).
  Tests: `lint.test.ts` ("lintRoom", "lintRoom: hazards", "lintRoom hints").
- `src/game/perception.ts` (503 lines): `EntityView`, `SoundCue` (kinds listed
  in the overview investigation; Task 4 added `dir?: Vec`), `RoleView { tick;
  ack; room; role; full; you: { seat; pos? }; tiles?; entities; sounds; status;
  elapsedMs; alarm; dark }`; private `entitiesFor` (all three players always,
  objects filtered by `visibleTo` only), `cue(kind, source, listener)` (distance
  only, `HEARING_RANGE = 12`, `RANGE` overrides), `soundsFor` (events this
  tick; local via `cue`, global at gain 1), `hazardSounds`, `darken`,
  `sightInLight` (`SIGHT_RAYS = 32`), `maskTiles`; exports `viewFor(world,
  seat, role, full)`, `spectatorView(world, follow, roles, full)` (Task 9 made
  `follow: Seat | null`).
- `src/game/cone.ts`: `visiblePolygon(shape, blocked, rays = 48)`.
- `src/game/parity.test.ts`: `PARITY: Record<SoundCue["kind"], Scenario>`
  (scenario `{ world; act; sees(before, after); exempt? }`), a 30×5 corridor
  `BASE`; each row checks Can't see hears it and Can't hear sees it in the same
  tick; `src/client/hud.ts` `CUE_WORD: Record<SoundCue["kind"], string>`.
- Bots (`src/game/bots/`): `brain.ts` `observe(room, view, m)` keeps `Known`
  across ticks; private `blockedFor(room, known, goal)` treats `#` and closed
  `D` as blocked; `decide` plans with `forecastFor(room, alarms)` danger/rest
  (from the room file — every hazard, perceived or not); `sequenceTurn`,
  `goalFor` (steps off a sequence plate on a restart), `guideBlind` (deaf only,
  dead-reckons the blind seat when unseen), `muteClip` (needs the blind seat
  visible). `forecast.ts` steps a shadow world with all doors open.
  `crew.ts` `botsAct(room, world, roles, bots, cooldowns, now, nickname, full)`.
  `solve.ts` `solveRoom(room, roles, budgetS = 600, humans = new Set()):
  SolveResult { world; cleared; ticks; caught; refused; messages }`.
  `attract.ts` `HUMAN` pacing (blind 0.6/0, deaf 0.9/0.01, mute 0.8/0.015).
- Specs: `spec/rooms.test.ts` (every room × 3 rotations: cleared, within
  `budgetS`, never caught, every checkpoint, no refusals), `spec/bots.test.ts`
  ("moves a bot's avatar in a person's view within 5 s of Ready" assumes the
  deaf human sees bot seat 2), `spec/perception.test.ts`
  ("…tiles only on the first (full) view" expects `entities.length > 3`),
  `src/game/perception.test.ts`, `src/game/sim/testing.ts` (`roomFrom`,
  `worldFrom`, `input`, `hold`, `gather`, `place`, `roomWith`, `worldWith`,
  `tap`).

### Interfaces from earlier phases (exact)

From Task 1: `Method`, `SENDS`, `RECEIVES`, `canSend`, `canReceive`
(`src/game/types.ts`); `Outgoing` with `{ method: "mark"; id: Stamp; at: Vec }`
and `{ method: "face"; id: string }`; `ChannelMessage.from.pos?: Vec`;
`route(roles, from, msg, cd, now)` (`src/game/channels.ts`); `relay` refuses a
mark not in the sender's sight using `lineOfSight(world, senderPos, at)`
(`src/net/game.ts`). From Task 4: `SoundCue.dir?: Vec`; `cueCaptions(sounds):
CueCaption[]` with `CueCaption { text: string; dir: Dir8 | null }`
(`src/client/hud.ts`).

## 4. Approach

**Tiles.** Two letters: `=` glass, `%` vent. `parseRoom` keeps them in
`grid` (regex becomes `/[^#D=%]/g`). Movement: both are solid in `solidTile`,
`laserBeam` stops at both, the linter's BFS treats both as walls, the bots'
`blockedFor` blocks both, `floorNear`/`pushCrate` already need `.`.
`blocksSight`: `#`, `%`, off-map, closed `D` block players' sight; hide spots
additionally block hazards' sight → split into `blocksSight(world, tx, ty,
forHazard = false)`; `=` never blocks sight. `blocksSound(world, tx, ty)`: `#`,
`=`, off-map, closed `D` block; `%` and open doors pass.

**Visibility.** `src/game/sim/visibility.ts` (pure):

```ts
export interface Visible { has(tx: number, ty: number): boolean; tiles: string[] } // tiles: "x,y" keys, for the view
export function visibleFrom(world: World, from: Vec): Visible;
```

Symmetric shadowcasting (8 octants, radius = max(room width, height)) over
`blocksSight` with no range limit; a blocking tile is itself visible (you see
the wall's face). Cached per world tick per seat. `perception.ts` uses it for
sighted roles: an entity is sent if any of its tiles is visible (players by
their tile); dark-zone tiles are never visible except to the Show rule; faces
and marks are always sent (stamps already are entities; faces travel as `msg`).
`RoleView` gains `seen?: string[]` — the visible tile keys, run-length encoded
per row as `"y:x0-x1,x2-x3"` strings to stay small — sent every tick for
sighted roles (the client draws mist outside them in Task 20). Hazard cones
(`cone` on camera/guard entities, `sight` polys) are sent only for hazards you
can see; a hazard you can't see still catches you (unchanged sim).

**Sound occlusion.** `cue()` gains a path check: the straight segment from
source to listener crossing a `blocksSound` tile (sampled like `lineOfSight`)
drops the cue unless the blocking tiles are all `%` vents (sound passes).
Team-wide events (`loot`, `checkpoint`, `caught`, `alarm`, `cleared`, `flag`,
`exit`, `seq-*`) stay global and unblocked (FR9).

**Clue sound (A2).** Object kind `clue`, letter `c`, params `{ n: 1 | 2 | 3;
everyS: number }` (default `everyS` 2): emits `{ kind: "clue", n }` every
`everyS` seconds, local (occluded, `RANGE.clue = 8`), `visibleTo: []` by
default. Caption: "chime ×n". `PARITY.clue` has `exempt` text: "A clue is the
one sound with no picture: rooms use it for twin and split cues (A2), and the
linter only allows it inside a beat that declares one."

**Room format additions.** `Beat` gains `lead?: Role` and `cue?: "twin" |
"split"`. Meta may set `hue` (Tasks 22–23 use it).

**Linter additions** (`lint.ts`):
1. Every `c` clue lies inside a beat (by x) with `cue` set.
2. No role is left with no input (playtest 1's dead end): reject any beat
   whose floor tiles are all inside a dark zone while an alarm can sound in
   that beat (its trigger plate lies in the beat), because then the sighted
   roles see nothing and the hearing roles hear only the alarm. A beat that is
   dark everywhere without an alarm is fine: faces and marks still show in the
   dark (FR7) and sound still carries.
3. Held sequences: the plates of a sequence door are pairwise ≥ 3 tiles apart
   (Chebyshev), so one body can't hold two.
4. If any beat has `lead`, every role in the room is a `lead` of some beat
   (rooms 2–4 each lead one role, the tutorial none: the linter only requires
   that declared leads are valid roles and that rooms 02–04 — files whose meta
   has `"leads": true` — declare all three).

**Held sequence (`step.ts`).** In `updateSequences`, before handling new
presses: if any plate in `order[0..next-1]` is no longer `world.pressed`,
reset `next = 0` and say `"wrong"`. The 5 s gap rule stays. The door still
latches once open.

**Bots (A3).**
- `observe` already keeps `Known` from visible entities; add `seenHazards:
  Record<string, { lastTick: number }>` and plan danger only for hazards seen
  in the last 2 s (sighted) or heard (`guard`/`camera`/`laser` cues, blind);
  the forecast is filtered to those hazard ids (`forecastFor(room, alarms,
  only?: ReadonlySet<string>)`).
- `guideBlind`: when the blind seat isn't visible, the guide moves to regain
  sight of it (path to the last estimate) before giving more callouts.
- Tolerant guide (backlog): `guideBlind` decides at any position (not only
  tile centres) and resends "stop"/"go" if the blind seat's motion doesn't
  match within 800 ms; `attract.ts` `HUMAN` pauses are then allowed again for
  Can't see (pauseChance 0.01).
- Clue: a sighted bot of role mute or blind hearing a `clue` cue records `n`
  in `Known.clues[id]`; jobs may name `{ "goTo": "clue:c1" }` meaning "the plate
  whose number equals the clue's n among the beat's plates, in reading order"
  (parsed by `parseJob`).
- **Muted roles for the harness:** `solveRoom(room, roles, budgetS, humans,
  opts?: { mute?: Role })` drops every send from the seat holding that role.

## 5. Task breakdown

### Task 13: Glass and vent tiles

- **Description:** `=` and `%` in the format, movement, lasers, linter BFS,
  bots' paths, sight and sound blocking helpers (§4 "Tiles").
- **Files touched:** `src/game/rooms/format.ts` (+ test),
  `src/game/sim/collide.ts`, `src/game/sim/sight.ts` (+ test: `blocksSight`
  with `forHazard`, new `blocksSound`), `src/game/sim/hazards.ts` (+ test),
  `src/game/sim/step.ts`, `src/game/rooms/lint.ts` (+ test),
  `src/game/bots/brain.ts`, `src/game/bots/forecast.ts`,
  `src/client/predict.ts` (+ test: glass and vents stop you),
  `src/client/render.ts` (flat drawing for now: glass as a light outlined
  tile, vent as slatted wall), `src/game/sim/testing.ts` unchanged.
- **Tests first (red):** a player walking into `=` or `%` stops; a laser beam
  stops at glass; a guard sees through glass and catches a player behind it;
  a guard can't see through a vent; `blocksSound` true for `#` and `=`, false
  for `%`; the linter says an exit behind a vent wall is unreachable;
  `parseRoom` keeps `=` and `%` in `grid`.
- **Implementation (green):** §4 "Tiles".
- **Acceptance criteria:** tests green; `pnpm lint:rooms` and
  `spec/rooms.test.ts` green (no room uses them yet).
- **Depends on:** none in this phase (Task 1 for the build to be green).

### Task 14: Line-of-sight views, sound occlusion, Show in the dark, clue sound

- **Description:** `visibleFrom`, the per-seat filter, `RoleView.seen`,
  occluded cues, the `clue` object and cue, the parity rewrite, `CLAUDE.md`'s
  sensory-parity paragraph, a tick bench.
- **Files touched:** new `src/game/sim/visibility.ts` (+ test),
  `src/game/perception.ts` (+ test), `src/game/rooms/format.ts` (`c`, `clue`
  kind) + test, `src/game/sim/step.ts` (emit clue cues via world events:
  `{ kind: "clue"; id; n; at }`), `src/game/sim/world.ts` (`WorldEvent` adds
  clue), `src/client/hud.ts` (`CUE_WORD.clue = "chime"`, word adds "×n"),
  `src/client/audio.ts` (a clue sound: n soft bell tones), `src/client/fx.ts`
  unchanged (no visual by design), `src/game/parity.test.ts` (rewrite: each
  local row puts Can't see within hearing and Can't hear within sight, plus new
  rows proving a local event behind a wall is neither seen nor heard; team-wide
  rows unchanged; `clue` row exempt), `src/net/game.ts` (`relay`'s mark check
  uses `visibleFrom(world, pos).has(...)`), `CLAUDE.md` (sensory parity
  paragraph: team-wide events reach every role in the same tick; local events
  reach the roles that can perceive them from where they stand; `clue` is the
  second deliberate exception; new effects still need `detectFx` + a sound),
  new `scripts/bench-tick.ts` (10 worlds × 3 seats of room 03, 200 ticks, prints
  ms/tick), `spec/perception.test.ts` (the `entities.length > 3` case keeps
  three players in one open area), `spec/bots.test.ts` (the avatar case uses a
  spawn area where seats see each other — true today).
- **Tests first (red):** `visibility.test.ts`: in an L-shaped corridor a
  viewer sees round nothing past the corner; sees through `=`; not through `%`
  or a closed door; sees the wall tiles bounding the area. `perception.test.ts`:
  a guard behind a wall isn't in Can't hear's entities but its footsteps reach
  Can't see when a vent is between them, and not when glass is; a teammate out
  of sight isn't sent; a mark in a dark zone is sent to Can't hear; `seen` is
  present for sighted roles and absent for Can't see; team-wide `loot` reaches
  everyone wherever they stand; a clue reaches Can't see and Can't speak within
  8 tiles and never Can't hear. `parity.test.ts` green with the `clue` row.
- **Implementation (green):** §4 "Visibility", "Sound occlusion", "Clue sound".
- **Acceptance criteria:** tests green; `node scripts/bench-tick.ts` < 10 ms
  per tick for 10 lobbies on the dev machine, result logged in
  `PROCESS_LOG.md`; if over, cache `visibleFrom` per tile position (players
  rarely change tile) before anything else; `spec/rooms.test.ts` green — if a
  rotation fails because a bot now can't see what it relied on, that's
  Task 16's job: mark the failing rotations `it.fails` with a pointer to
  Task 16 only if Task 16 is the very next commit, else fix here.
- **Depends on:** Task 13.

### Task 15: Held sequences, beats with leads and cues, new linter rules

- **Description:** §4 "Held sequence", "Room format additions", "Linter
  additions". Room 03's sequence plates fail the 3-tile spacing rule today: p7 (24,6),
  p1 (24,2), p4 (24,4) are 2 apart. Move p1 to (24,1) and p7 to (24,7)
  (both floor; reading-order ids are unchanged), then re-run the linter and
  the bots.
- **Files touched:** `src/game/sim/step.ts` (+ test),
  `src/game/rooms/format.ts` (+ test), `src/game/rooms/lint.ts` (+ test),
  `rooms/03-vault.room`, `src/game/bots/brain.ts` (`goalFor`/`sequenceTurn`
  keep earlier plates held: a bot that pressed its plate stays on it until the
  door opens).
- **Tests first (red):** step: stepping off the first plate after the second
  is pressed resets the sequence; holding all three in order opens and latches;
  lint: a clue outside a cue beat is an issue; a beat dark everywhere and
  alarmed is an issue; two sequence plates 2 tiles apart is an issue; a
  `leads: true` room missing a role's lead is an issue; an unknown `lead` value
  is a format error.
- **Implementation (green):** as described.
- **Acceptance criteria:** tests green; `pnpm lint:rooms` green on all three
  rooms; `spec/rooms.test.ts` green (room 03 needs three bodies on the
  sequence).
- **Depends on:** Task 14.

### Task 16: Bots perceive like their role; the lead-role harness

- **Description:** §4 "Bots (A3)": hazards planned only when perceived,
  regaining sight of Can't see, a tolerant guide, clue jobs, and
  `solveRoom(…, { mute })`; a spec helper that asserts a room fails without a
  lead role's sends.
- **Files touched:** `src/game/bots/brain.ts` (+ test),
  `src/game/bots/forecast.ts` (+ test), `src/game/bots/jobs.ts` (+ test:
  `clue:` targets), `src/game/bots/solve.ts`, `src/game/bots/crew.ts`,
  `src/game/bots/attract.ts` (blind pauses back on), `spec/rooms.test.ts` (a
  second describe: "each lead role is needed": for every beat with `lead`, run
  `solveRoom(room, roles, budgetS, new Set(), { mute: lead })` in one rotation
  and expect it not cleared or the beat's door never opened; skipped with a
  clear message while no room declares leads), `specs/backlog.md` (tolerant
  bots → Decided).
- **Tests first (red):** brain: a sighted bot that has never seen a guard
  walks into its lane (and a bot that saw it 1 s ago waits); the deaf guide
  moves toward the blind seat's last estimate when it loses sight; the guide
  recovers when the blind seat pauses for 1 s mid-tile (no endless "go");
  `solveRoom` with `mute: "deaf"` records zero sends from the deaf seat.
- **Implementation (green):** as described.
- **Acceptance criteria:** `spec/rooms.test.ts` green for rooms 01–03 in every
  rotation (budget may rise; record new budgets in each room's `budgetS`);
  `spec/bots.test.ts` green; the home page feeds still clear room 01
  (`spec/layout/home.test.ts`).
- **Depends on:** Task 15.

## 6. Phase Definition of Done

- [ ] Every task in §5 is complete and its tests pass
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start` then `pnpm check` passes
- [ ] Bench result recorded in `PROCESS_LOG.md`
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR5 | Task 14 |
| FR6 | Tasks 13, 14 |
| FR7 | Task 14 |
| FR9 | Task 14 |
| FR11 | Task 15 |
| FR13 | Task 15 |
| FR14 (harness) | Task 16 |
| A2 | Tasks 14, 15 |
| A3 | Task 16 |
| A4 (CLAUDE.md parity) | Task 14 |

## 8. Risks / open questions

None.
