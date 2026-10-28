# Escape-room heist: Phase 01, the framework

- **Date:** 2026-10-28
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-10-28
- **Part of:** `plans/2026-10-28-escape-room-heist-00-overview.md`. Read it
  first, especially §3 (commands, conventions), §4.1 (format), §4.2 (shared
  types), §4.3 (randomness), §4.4 (wrong = caught).
- **Depends on phases:** none.

## 1. Summary

Lands the uncommitted overhaul work, then builds every new mechanic headless:
stations, gear, holding hands, hatch, bell, lamp and the dye pack in the
simulation; what each role perceives of them; parity rows; logging; bot jobs
that can work stations; and the presence linter that replaces lead beats. Ends
with no new room shipped, but a fixture room exercising every object, cleared
by bots, linted, and every test green.

## 2. Requirements (this phase)

### 2.1 Functional

P1, P2; spec FR1, FR3 (bot side), FR4, FR5, FR6–FR16 (sim and perception),
FR17–FR25 (sim and perception), FR29 (sim event only).

### 2.2 Non-functional

Perception gating in `viewFor`; parity rows for every new sound; logging kinds
only; `step` deterministic for a given world and seed.

### 2.3 Out of scope for this phase

Drawing, audio synthesis and HUD (phase 02); real rooms (phases 03, 04); side
jobs and results (phase 05).

### 2.4 Assumptions

See overview §2.4.

## 3. Existing code context (verified 2026-10-28)

- `src/game/rooms/format.ts` — `Tile` union, `RoomObject` (`kind` union,
  `params?: Record<string, unknown>`), `Beat` (`lead?: Role; cue?: "twin" |
  "split"`), `TILES` set, `NUMBERED` map (letter → `[kind, prefix]`), `PARAMS`
  set, `DEFAULT_VISIBLE_TO: Role[] = ["deaf", "mute"]`, `parseRoom(text:
  string): Room`. `grid` keeps only `#D=%`; other letters become `.`.
- `src/game/sim/world.ts` — `World`, `Snapshot { players; crates; lootTaken }`,
  `WorldEvent` union, `createWorld(room: Room): World`, `TICK_MS = 50`.
- `src/game/sim/step.ts` — `step(world, inputs, dtMs = TICK_MS): World`; order:
  move/push, `updatePlates`, `updateSequences`, alarm trigger, `updateDoors`,
  `moveGuards`, `updateHide`, `updateFlags`, `updateCheckpoints`,
  `updateLoot`, `updateClues`, `updateExitCount`, then `findCatch` →
  `sendBack(world, caught)` else `updateExit`. `sendBack` restores
  `snapshot.players/crates/lootTaken` and pushes `{ kind: "caught", ...caught }`.
  `updateCheckpoints` writes `world.snapshot`.
- `src/game/types.ts` — `PlayerInput { seq; move: Vec; act: boolean }`. `act`
  is sent by the client (`src/client/input.ts`, Space or the Act button),
  validated in `src/net/protocol.ts` and passed through
  `applyInput(game, seat, input)` in `src/net/game.ts`, but **nothing in the
  sim reads it today**.
- `src/game/sim/hazards.ts` — `HazardKind = "guard" | "camera" | "laser"`,
  `findCatch(world): { by; hazard: HazardKind; seat } | null`.
- `src/game/sim/sight.ts` — `blocksSight(world, tx, ty, forHazard?)`,
  `blocksSound(world, tx, ty)`, `lineOfSight`, `soundReaches(world, a, b)`.
  `src/game/sim/visibility.ts` — `visibleFrom(world, from: Vec): Visible`
  (`has(tx, ty)`, `tiles`). `src/game/sim/collide.ts` — `solidTile`,
  `blockedAt`, `indexOf(room)`.
- `src/game/perception.ts` — `EntityView`, `SoundCue`, `RoleView`,
  `viewFor(world, seat, role, full): RoleView` (sighted: `visibleFrom`,
  `darken` for dark zones, `inSight`; non-deaf: `soundsFor`), `cue(world,
  kind, source, listener)` with `RANGE` per kind (`clue: 8`),
  `spectatorView(...)`.
- `src/game/parity.test.ts` — one row per `SoundCue["kind"]` in a typed
  `Record`, using `worldWith`, `place`, `input`, `hold` from
  `src/game/sim/testing.ts`; the alarm is the documented exception.
- `src/game/rooms/lint.ts` — `lintRoom(room): LintIssue[]`, includes
  `lintLeadBeats` and the `meta.leads === true` check, and the FR10
  three-plate rule ("no beat has a door that needs three plates").
- `src/game/rooms/mockup.ts` — `buildMockup(room): Mockup`, steps a world
  with seat 1 placed on each floor tile and records `viewFor` per role.
- `src/game/bots/jobs.ts` — `JobTarget` (`plate | flag | tile | exit |
  push`), `Job`, `Known`, `parseJob(room, j, index): Job | string`,
  `isDone`, `isOpen`, `claimJobs`. `src/game/bots/brain.ts` (956 lines)
  `think(...)`, `src/game/bots/solve.ts` `solveRoom(room, roles, budgetS = 600,
  humans?, opts?: { mute?: Role })`.
- `spec/rooms.test.ts` — "each lead beat holds something only its lead
  perceives" describe (to remove) and `clearEveryRotation` (keeps).
- `src/lib/gameLog.ts` — `GameEvent` union, `logGame`.
- Working tree: 52 uncommitted files from overhaul phase 06 (Tasks 22, 28,
  the "c2" lead lint, `rooms/01-first-job.room` added and
  `01-loading-dock.room` deleted, mockup tool, `spec/fixtures/drafts/`).
  `scripts/solve-rooms.ts` still names `01-loading-dock`.

### Interfaces from earlier phases (exact)

None.

## 4. Approach

**Act becomes real.** `act` is edge-triggered per seat (`PlayerState.actHeld`
remembers last tick). On an Act edge, in order of precedence: a turn pad, key,
wire, switch, bell or lever under you → that station; gear under you and an
empty slot → take; a hatch sill adjacent → put or take; an adjacent teammate →
hold or release; a bell rope or lamp switch under you → ring or flash. `gear`
edge → give to an adjacent teammate with an empty slot, else drop on your tile.

**Stations** (`src/game/sim/stations.ts`, pure, called from `step` after
`updateDoors`). Metadata per type:

| Type | Metadata | Answer | Input / solve |
| --- | --- | --- | --- |
| `dial` | `pads: [[x,y],[x,y]]` (◀, ▶), `back: [x,y]`, `digits` 1–3, `range` (default 10) | `digits` numbers in `[0,range)` | each pad Act turns ±1 (wraps), `tick` event; pressing the anchor confirms the current number; all digits confirmed in order solves; a confirmed wrong number is wrong |
| `wires` | `wires: [[x,y],...]` 3–5, `plaque: "Sxx"`-style id of an `ink` or sign object | colours (6 code colours) and the index to cut, from a rule table chosen with the colours | Act under wire i cuts it; the right index solves; any other is wrong |
| `keypad` | `keys: 9 tiles`, `clue: id` (a `clue` object or `earpiece`), `length` 3–4 | key indices | Act on a key appends; a full correct sequence solves; a wrong key is wrong |
| `radio` | `pads`, `range`, `yields` | setting in `[0,range)`, digit 1–3 | turning to the setting makes `tone` instead of `static`; then `pip` n times every 2 s; no wrong answer (it just stays static) |
| `switches` | `buttons: tiles`, `lamps: tiles` (behind glass), lights-out over 3×3 or 2×3 | a reachable target pattern | Act toggles the button and its neighbours' lamps; matching solves; no wrong answer |
| `bells` | `bells: 4–6 tiles`, `tune: tile` (the music box with lights) | a 4-note order | Act strikes; wrong note is wrong |
| `vault` | `sockets: tiles`, `from: [station ids]` | each socket's symbol is the symbol the named station revealed when solved; order clue in `ink`/sign | Act on a socket pad cycles 6 symbols; pressing the anchor with all set solves or is wrong |
| `sync` | `keys: tiles` 2–3, `windowMs` 500 | none | all keys Acted within `windowMs` solves; a miss resets input only (never wrong) |

`answer` is drawn per §4.3 of the overview. The wires' rule table is fixed in
code (6–8 rules, each a pure function of the colour list); the plaque text is
generated from the chosen rule and placed in the `ink` or `sign` object's
`text`. A test proves every drawn answer is solvable for each type (property
test over 200 seeds).

**Gear and team mechanics** (`src/game/sim/gear.ts`). Holding: the towed seat's
input is ignored and it is moved to the nearest free floor tile behind the
leader each tick (no wall clipping, uses `blockedAt`); either Acting releases;
a release also happens on `sendBack`. Hatch: a solid tile (in `solidTile`)
that blocks sound like glass; an item on its sill is in `GearState.sill`.

**Perception** (`src/game/perception.ts`): stations show only what the viewer
can perceive from where they stand: sighted roles get `station.shows`
(dial number, wire colours, lit keys, lamp pattern, needle, sockets) when in
sight; Can't see gets nothing visual. Sounds: `tick` (range 6), `tumbler`
(range 1, only when the listener holds the stethoscope and is next to the
`back` tile), `key` with `n`, `snap`, `static`/`tone` (range 6), `pip`,
`clunk`, `bellnote` with `n`, `bell` (everywhere in the room, via
`soundReaches` ignored like team sounds), `dye` and `solved` (team-wide),
`earpiece` (only the holder, any range, never if deaf), `gear` (pick up/drop
click, range 6). UV pool: sighted viewers get a `uv` entity with `polys` (wall-
clipped 2.5-tile disc around the holder, intersected with their own sight);
`ink` entities are included only when their tile is inside the pool and in
the viewer's sight. Goggles: `darken` treats the wearer as if no dark zone
applied (their `inSight` uses `visibleFrom` unchanged). Lamp: `view.lamp` for
sighted roles only. Act hint: `view.act` phrased per role ("Cut wire 2" for
blind, "Cut the blue wire" for sighted, "Turn the dial", "Take the goggles",
"Hold Bo's hand"). Own `gear` and `sideJob` (phase 05) on every role's view.

**Parity exceptions** (rows in `parity.test.ts` with `exempt` and a reason):
`tumbler` and `earpiece` (sound with no picture, like `clue`). UV ink and
goggles sight are pictures with no sound: covered by a comment and a test in
`perception.test.ts` that they are gated by gear.

**Presence linter** (`lintPresence` in `src/game/rooms/lint.ts`): for each
station, compute its clue, control and feedback tiles from metadata (table
below) and, for each role × each floor tile × each gear item (or none), use
`viewFor` on a world with seat 1 placed there (as `buildMockup` does) to
decide whether that loadout perceives all three. Any hit is an issue. A second
rule: at least two stations' controls are reachable at once from the room
start or from each checkpoint without solving anything (FR2).

| Type | Clue | Control | Feedback |
| --- | --- | --- | --- |
| dial | `back` tumbler sound | pads | dial number (sight) or `tick` (sound) |
| wires | plaque/ink | wire tiles | wire colours (sight) |
| keypad | `clue` object or earpiece | keys | key lights (sight) or `key` pitch (sound) |
| radio | none (search) | pads | `static`/`tone` (sound) or needle (sight) |
| switches | lamps | buttons | lamps |
| bells | tune tile (sight and sound) | bells | `bellnote` and bell colour |
| vault | symbols in the world | socket pads | sockets (sight) |
| sync | none | keys | `solved`/reset |

Radio, switches, sync carry no secret clue, so for them the rule is relaxed to
"control and feedback not perceivable by one loadout from one tile"
(switches: lamps behind glass in another chamber; radio: the pip count goes
to a station elsewhere via `yields`; sync: keys ≥3 tiles apart).

## 5. Task breakdown

### Task 1: Land the overhaul phase 06 work in progress

- **Status:** done, c326813 (2026-10-28).

- **Description:** Get `pnpm check` green on the current working tree and
  commit it as the end of overhaul Tasks 22 and 28 (P1), with Task 28's open
  seed sweep left as logged. Fix `scripts/solve-rooms.ts`'s stale
  `01-loading-dock` skip to `01-first-job`.
- **Files touched:** the 52 files in `git status`; `scripts/solve-rooms.ts`;
  pulled forward (ruled 2026-10-28): delete `spec/fixtures/drafts/02-airlock-draft.room`
  (from Task 5), remove the lead-beat describe in `spec/rooms.test.ts` (from Task 4), skip
  `03-vault` in `rooms.test.ts` and `brain.test.ts` with a note until phase 04; `specs/backlog.md`
  (the check overloading the machine);
  `plans/2026-10-19-play-overhaul-06-rooms-results.md` (tick Task 22 if the
  user accepted its human review; otherwise leave unticked and say so);
  `.gitignore` (`.vitest/`, agreed 2026-10-28); the escape-room spec and
  its six plan files (ADR 0017 and the ramp proposal wait for Task 6).
- **Tests first (red):** none new; any red test found is a bug fixed with its
  failing test kept.
- **Implementation (green):** run `pnpm build && pnpm start`, then `pnpm check`;
  fix failures; `pnpm check:flaky 3` on anything that went red then green.
- **Refactor:** none.
- **Acceptance criteria:** `git status` clean except ADR 0017 and the ramp
  proposal (Task 6 commits them); `.vitest/` ignored; one commit; `pnpm check`
  green. Task 22 stays unticked (its human review is not yet accepted).
- **Depends on:** none.

### Task 2: Stations, seeded answers and the dye-pack reset in the simulation

- **Status:** done (2026-10-28). Beyond the file list: `hazard` widened to `"station"` in
  `net/protocol.ts`, `net/game.ts`, `client/hud.ts` (`caughtText`: "Wrong answer.", tested) because
  the typecheck needs it; `src/net/game.ts` seeds each world (`freshWorld`). `World` gains one field
  beyond overview §4.2: `syncAt` (sync key ticks). Wires keep `[cut, rule, ...colours]` in `answer`;
  plaque text is `plaqueText(world, id)`.

- **Description:** Add the `station` kind and `Q` tile, `StationState`, the
  RNG, Act edge handling for stations, the eight station types, wrong answer
  = dye + `sendBack`, solved stations surviving resets, unsolved re-drawn.
- **Files touched:** `src/game/rooms/format.ts` (+ `format.test.ts`),
  new `src/game/sim/rng.ts` (+ test), new `src/game/sim/stations.ts` (+
  `stations.test.ts`), `src/game/sim/world.ts`, `src/game/sim/step.ts` (+
  `step.test.ts`), `src/game/sim/hazards.ts` (`HazardKind` gains `"station"`),
  `src/game/sim/testing.ts` (a `stationWorld` helper).
- **Tests first (red):**
  - `format.test.ts`: `Q` parses to a `station` with `params.type`; unknown
    type is a `RoomFormatError`.
  - `rng.test.ts`: same seed → same sequence; different seeds differ.
  - `stations.test.ts`, per type: turning, pressing, cutting changes `input`;
    the right input solves and emits `station solved`; a wrong input emits
    `dye`, then `caught` with `hazard: "station"`, and players are at the
    snapshot; after a reset the solved station is still solved and an unsolved
    one has a different answer (fixed seed); a missed sync resets without
    `caught`; radio and switches never emit `dye`. Property test: 200 seeds per
    type, every answer is reachable by some input sequence (wires: the rule
    table always names a wire that exists).
  - `step.test.ts`: `step` with the same world, seed and inputs gives the same
    events twice.
- **Implementation (green):** per this file's §4.
- **Refactor:** keep `step.ts` a list of `update*` calls; station logic stays
  in `stations.ts`.
- **Acceptance criteria:** tests green; `World` and events match overview
  §4.2 exactly; no `Math.random` in `src/game/`.
- **Depends on:** Task 1.

### Task 3: Gear, holding hands, hatch, bell and lamp, and what each role perceives

- **Description:** Sim for gear (take, give, drop, sill, reset like loot),
  holding (tow, release, release on reset), hatch, bell, lamp; perception of
  stations, gear, UV pool and ink, goggles in the dark, bell, lamp, Act hint,
  own gear; parity rows for every new sound.
- **Files touched:** `src/game/rooms/format.ts` (`g H b l u` letters), new
  `src/game/sim/gear.ts` (+ test), `src/game/sim/world.ts`, `step.ts`,
  `collide.ts` (`H` solid), `sight.ts` (`H` blocks sound, passes sight),
  `src/game/types.ts` (`gear?: boolean`), `src/net/protocol.ts` (+ test:
  parses `gear`), `src/client/input.ts` (G key; phone: the gear slot tap is
  phase 02), `src/game/perception.ts` (+ `perception.test.ts`),
  `src/game/parity.test.ts`.
- **Tests first (red):**
  - `gear.test.ts`: Act on gear takes it into an empty slot, never a second;
    G next to a teammate with an empty slot gives, else drops on your tile; an
    item on a sill is reachable from both sides; caught → gear back where it
    lay at the checkpoint; Act on an adjacent teammate holds, the towed seat's
    input is ignored and it follows behind the leader without entering walls;
    either Acting releases; reset releases.
  - `perception.test.ts`: a sighted viewer sees wire colours in sight and
    Can't see's view has no `station.shows`; `tumbler` reaches only a hearing
    holder of the stethoscope beside `back`; `earpiece` reaches only its
    hearing holder; goggles let a sighted wearer see entities in a dark zone
    and a non-wearer still sees none; ink is in a sighted view only inside the
    UV pool and in sight, never in Can't see's; `lamp` is absent for blind;
    `act` for blind never contains a colour word (`/red|blue|yellow|green|white|black/`);
    a teammate's `item`/`heldBy` is visible to the sighted in sight.
  - `parity.test.ts`: a row for each new sound kind; `tumbler` and `earpiece`
    exempt with a reason.
  - `protocol.test.ts`: `gear: true` round-trips; a non-boolean is rejected.
- **Implementation (green):** per this file's §4.
- **Refactor:** none expected.
- **Acceptance criteria:** tests green; every new `RoleView` field gated in
  `viewFor` with a comment naming the role rule.
- **Depends on:** Task 2.

### Task 4: Bots that work stations, carry gear and tow; logging

- **Description:** New job targets so the room solver clears station rooms
  (bots read answers from the world: FR3), and `logGame` lines for the new
  events.
- **Files touched:** `src/game/bots/jobs.ts` (+ test), `src/game/bots/brain.ts`
  (+ test), `src/game/bots/solve.ts` (drop `opts.mute`; `solve.test.ts` loses
  its two mute cases, superseded by spec FR3, ruled 2026-10-28), `src/lib/gameLog.ts`
  (`GameEvent` gains `"station"`, `"gear"`, `"hold"`, `"signal"`),
  `src/net/attach.ts` (log on the matching world events, kind only:
  `station` with `detail.kind` = `solved|wrong`, `gear` with
  `take|give|drop|sill`, `hold` with `on|off`, `signal` with `bell|lamp`),
  new fixture `spec/fixtures/drafts/00-stations-draft.room` (every object
  type, small; it also has a three-plate door so it passes the FR10 rule
  until Task 5 drops it for station rooms), `spec/rooms.test.ts` (remove the lead describe; drafts
  include the fixture).
- **Tests first (red):**
  - `jobs.test.ts`: `{"beat":1,"station":"Q1"}` parses to `{ kind: "station";
    id }`; `{"take":"g1"}`, `{"give":"g1","to":"deaf"}`, `{"sill":"g1","hatch":"H1"}`,
    `{"tow":"blind","to":[x,y]}` parse; unknown ids are the linter's message.
  - `brain.test.ts`: a bot on a `station` job walks to the right pad and
    enters the answer from `world.stations[id].answer` (the one place bots read
    hidden state, commented as FR3); a `take` job picks the item up.
  - `spec/rooms.test.ts`: `00-stations-draft` clears in every rotation, no
    catches.
  - `src/lib/gameLog.test.ts` (or the existing log test): a station line's
    detail has `kind` only, never the answer.
- **Implementation (green):** new `JobTarget` variants
  `{ kind: "station"; id }`, `{ kind: "take"; gear }`, `{ kind: "give"; gear; to: Role }`,
  `{ kind: "sill"; gear; hatch }`, `{ kind: "tow"; role: Role; to: Vec }`.
- **Refactor:** none.
- **Acceptance criteria:** tests green; the fixture clears in all three
  rotations under 600 s.
- **Depends on:** Task 3.

### Task 5: The presence linter replaces lead beats

- **Description:** `lintPresence` (FR1 and FR2) per this file's §4; remove
  `Beat.lead`, `Beat.cue`, `lintLeadBeats` and `meta.leads`; drop the FR10
  three-plate rule for rooms with stations (keep it for room 1, which has
  none); mockup drops `lead`/`cue`.
- **Files touched:** `src/game/rooms/lint.ts` (+ `lint.test.ts`),
  `src/game/rooms/format.ts` (+ test), `src/game/rooms/mockup.ts` (+ test),
  `scripts/mockup-page.ts`, `spec/fixtures/drafts/02-blackout-draft.room` and
  `02-airlock-draft.room` (delete: superseded drafts),
  `spec/rooms.test.ts`.
- **Tests first (red):** `lint.test.ts`:
  - a dial whose `back` is audible from its pads (no vent, adjacent) is
    flagged for a hearing role holding the stethoscope;
  - wires whose plaque is in sight of the wire tiles are flagged for sighted roles;
  - a keypad whose clue `earpiece` can be worn at the keypad is flagged (the
    spec probe #12 case);
  - switches with lamps visible from the buttons are flagged;
  - a room whose only open station at the start is one is flagged (FR2);
  - `00-stations-draft` passes;
  - a room with `"lead"` in a beat is a format error ("lead beats were removed").
- **Implementation (green):** `lintPresence(room, issue)` reusing the
  `buildMockup` placement (refactor the "place seat 1 at (x,y)" world builder
  into an exported `worldAt(room, x, y, role, gear?)` in `mockup.ts`).
- **Refactor:** `buildMockup` uses `worldAt`.
- **Acceptance criteria:** tests green; `pnpm lint:rooms` green on shipped
  rooms; lint run time for a 60×30 room under 10 s (measured, number written
  beside the test).
- **Depends on:** Task 4 (its fixture; ruled 2026-10-28: tasks run 1 to 6 in order).

### Task 6: Supersede the old plan and spec lines; park the backlog

- **Description:** P2 and the brainstorm's housekeeping.
- **Files touched:** `specs/2026-10-19-play-overhaul.md` (FR12, FR14:
  "Superseded by `specs/2026-10-28-escape-room-heist.md` (2026-10-28)"),
  `plans/2026-10-19-play-overhaul-06-rooms-results.md` (Task 23: cancelled;
  Tasks 24/25: moved to Tasks 18/19 of this plan; Corrections log line),
  `plans/2026-10-19-play-overhaul-00-overview.md` (phase 06 row note),
  `plans/2026-10-21-room-ramp-proposal.md` (Status: superseded),
  `specs/backlog.md` (four dated lines: distraction job, periscope, team
  codebook, spectators voicing the earpiece; and a Decided line for
  "Can't speak has little to do" pointing here), `PROCESS_LOG.md` (one entry:
  the presence rethink and the user's corrections: dog → dye pack, no speech
  anywhere, whole-team failure, larger rooms; cite this task's commit),
  `doc/adr/0017-…` committed with this task (status stays `proposed`).
- **Tests first (red):** none (docs). `pnpm check:evidence` after committing.
- **Implementation (green):** edits as listed; no accepted ADR edited.
- **Acceptance criteria:** `pnpm check` green; `check:evidence` green.
- **Depends on:** Task 1.

## 6. Phase Definition of Done

- [ ] Every task in §5 is complete and its tests pass
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start` then `pnpm check` passes
- [ ] `00-stations-draft` lints clean and bots clear it in every rotation
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| P1 | Task 1 |
| P2 | Task 6 |
| FR1, FR2 (rule), FR4 | Task 5 |
| FR3 | Task 4 |
| FR5–FR15 (sim) | Task 2 |
| FR6–FR25 (perception), FR16–FR25 (sim) | Task 3 |
| FR29 (event) | Task 2 |
| NFR logging | Task 4 |
| NFR parity rows | Tasks 2, 3 |

## 8. Risks / open questions

None.

## 9. Corrections log

<!-- one line per user redirect during execution -->

- 2026-10-28, Phase 1 review: the plan had Task 1 leave a clean tree while Task 6 commits ADR 0017,
  Task 4 drop `opts.mute` without naming the two `solve.test.ts` cases it breaks, and Task 4 add a
  draft that the pre-Task-5 linter (three-plate rule) would fail. Ruled: spec and plans land in
  Task 1, ADR and ramp proposal in Task 6; the mute cases go (FR3); tasks run 1 to 6 in order and the
  fixture carries a three-plate door. `.vitest/` ignored. Task 22 not yet accepted, stays unticked.
- 2026-10-28, Task 1: expected `pnpm check` to go green on the overhaul WIP with bug fixes only. Eight
  tests were red for reasons later work removes: the lead-beat describe (no room declares a lead),
  `02-airlock-draft` (not cleared) and old `03-vault` (perception-only bots caught in its dark, in
  `rooms.test.ts` and `brain.test.ts`). Ruled (option 1): Task 4's describe removal and Task 5's
  airlock deletion are pulled into Task 1; `03-vault` is skipped with a dated `NOT_YET` note until
  phase 04 rewrites it. The full check also overloaded the machine (load 300–485, 107 browser
  timeouts that pass alone): logged to the backlog, not fixed here.
