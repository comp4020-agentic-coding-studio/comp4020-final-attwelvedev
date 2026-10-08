# Sensory heist — Phase 05: Hazards, audio, rooms 2–3

- **Date:** 2026-10-08
- **Status:** Approved
- **Requirements confirmed by user:** yes — 2026-10-08
- **Part of:** `plans/2026-10-08-sensory-heist-00-overview.md`. Read it first,
  especially §3 (pure `src/game/`), §4.2, §4.3.
- **Depends on phases:** 04.

## 1. Summary

The heist gets its threats and rewards: guards with sight cones and hide
spots, CCTV cameras, timed lasers, checkpoints, loot, a sequence door, and
the two environment flips (darkness, alarm). Can't see gets a full set of
panned audio cues. Rooms 2 and 3 are authored, and the heist runs all three
rooms in order with roles rotating and a room-cleared screen between.

## 2. Requirements (this phase)

### 2.1 Functional

FR8 (rooms 2–3, rotation), FR11, FR12, FR13 (loot), FR14, FR15 (hazards,
flips, audio cues), FR30 (room cleared screen).

### 2.2 Non-functional

Flashing ≤ 3 per second always (alarm pulse ~1 Hz; lasers switch on/off, no
flicker); reduced motion: static alarm, no shake. Cue-dependent safe windows
≥ 2 s (linted).

### 2.3 Out of scope for this phase

Bots (phase 06), heist-complete screen and records (Task 18), masking noise
for real-life mode (Task 19).

### 2.4 Assumptions

See overview §2.4.

## 3. Existing code context (verified 2026-10-08)

Code from phases 01–04 only; nothing pre-existing is touched.

### Interfaces from earlier phases (exact)

From Task 5 (`src/game/rooms/format.ts`):

```ts
export type Tile = "." | "#" | "1" | "2" | "3" | "B" | "p" | "D" | "E";
export interface RoomObject {
  id: string; kind: "plate" | "door" | "crate" | "exit" | "spawn";
  tiles: Vec[]; visibleTo: Role[]; audibleTo: Role[]; opensWhen?: string[];
}
export interface Beat { name: string; x: [number, number]; intent: Record<Role, string> }
export interface Room { id: string; name: string; version: number; width: number; height: number;
  grid: string[]; objects: RoomObject[]; beats: Beat[]; meta: Record<string, unknown>; }
export function parseRoom(text: string): Room;
// src/game/rooms/lint.ts
export interface LintIssue { room: string; message: string }
export function lintRoom(room: Room): LintIssue[];
// src/game/rooms/load.ts
export function loadRooms(dir?: string): Room[];
```

From Task 6 (`src/game/sim/world.ts`, `step.ts`):

```ts
export const TICK_MS = 50;
export type RoomStatus = "playing" | "cleared";
export interface PlayerState { seat: Seat; pos: Vec; facing: Vec; lastSeq: number; pushMs: number; moving: boolean }
export interface CrateState { id: string; tile: Vec }
export interface World { room: Room; tick: number; players: [PlayerState, PlayerState, PlayerState];
  crates: CrateState[]; doorOpen: Record<string, boolean>; pressed: Record<string, boolean>;
  status: RoomStatus; events: WorldEvent[]; }
export type WorldEvent =
  | { kind: "door"; id: string; open: boolean; at: Vec }
  | { kind: "plate"; id: string; pressed: boolean; at: Vec }
  | { kind: "crate"; id: string; at: Vec }
  | { kind: "cleared" };
export function createWorld(room: Room): World;
export function step(world: World, inputs: Partial<Record<Seat, PlayerInput>>, dtMs?: number): World;
```

From Task 7/9 (`src/game/perception.ts`):

```ts
export interface EntityView { id: string; kind: "player" | "crate" | "door" | "plate" | "exit" | "stamp";
  pos: Vec; state?: string; seat?: Seat; role?: Role; facing?: Vec; age?: number }
export interface SoundCue { kind: "footsteps" | "hum" | "door"; pan: number; gain: number }
export interface RoleView { tick: number; ack: number; room: string; role: Role; full: boolean;
  you: { seat: Seat; pos?: Vec }; tiles?: string[]; entities: EntityView[]; sounds: SoundCue[];
  status: RoomStatus; elapsedMs: number; }
export function viewFor(world: World, seat: Seat, role: Role, full: boolean): RoleView;
```

From Task 7 (`src/net/game.ts`): `Game { lobby; roomIndex; roles; world;
ready; inputs; startedAt }`, `rolesFor(roomIndex)`, `startGame(lobby,
rooms)`, `tickGame(game)`; protocol `reveal { room, index, role, crew }`.
From Task 11: `logGame({ event, who, lobbyKey, detail })`, `GameEvent`
(widen with `"caught"`), allowlist has `room`, `ms`.

## 4. Approach

### 4.1 New legend and metadata

| Char | Object | Metadata (keyed by id) |
| --- | --- | --- |
| `G` | guard `G1…` | `{ "patrol": [[x,y],…], "speedTps": 1.5, "sightTiles": 6, "fovDeg": 70 }` |
| `C` | camera `C1…` | `{ "zone": [x0,y0,x1,y1], "periodS": 6, "watchingS": 3, "offsetS": 0 }` |
| `L` | laser emitter `L1…` | `{ "dir": "right"\|"left"\|"up"\|"down", "onS": 2, "offS": 2, "offsetS": 0 }` (beam runs to the first wall) |
| `h` | hide spot | — (a player centred on it is invisible to guards and cameras) |
| `K` | checkpoint `K1…` | — (numbered in reading order) |
| `$` | loot `$1…` | `{ "value": 1 }` |
| `S` | sign `S1` | `{ "shows": ["p4","p6","p5"] }` (glyph order for a sequence door) |

Doors gain `"mode": "all" | "sequence"` (default `all`); a sequence door opens
when its plates are pressed in `opensWhen` order, each within 5 s of the last.
Flips: `"flips": [{ "kind": "dark", "zone": [x0,y0,x1,y1] }, { "kind": "alarm", "trigger": "p7" | "caught", "durationS": 8 }]`.

### 4.2 Rules

- **Caught:** a player's centre inside an active camera zone while watching,
  on an active laser beam tile, or in a guard's cone with line of sight
  (walls and closed doors block; hide spots hide). The whole team returns to
  the last checkpoint reached (or spawns): players to the checkpoint tile and
  the three nearest floor tiles, crates and loot restored to the snapshot
  taken when that checkpoint was reached. Emits `{ kind: "caught", by: id }`
  and logs `caught`.
- **Checkpoint:** reached when any player's centre enters it; snapshot taken.
- **Loot:** collected on touch; `World` gains `loot: number`, `lootTotal`.
- **Dark zone:** for deaf and mute views, nothing inside the zone (tiles,
  entities, including other players) is sent; their own avatar is sent only
  as a dim ring when inside. Blind is unaffected (they never see anyway).
- **Alarm:** while active, blind and mute views get `sounds` = only
  `{ kind: "alarm" }`; deaf unaffected (they hear nothing anyway). Visual:
  steady red border + banner with a 1 Hz intensity pulse.
- **Audio cues for blind and mute** (`SoundCue.kind` widens): `guard`
  (footsteps of guards, panned, gain by distance), `camera` (servo whir when a
  camera in range starts watching), `laser` (hum within 3 tiles while on),
  `loot` (chime on pickup), `checkpoint`, `caught` (siren), `alarm`.

### 4.3 Lint additions

Camera `periodS − watchingS ≥ 2`; laser `offS ≥ 2`; every guard patrol point
on floor; a sequence door has a sign listing exactly its plates; every flip
zone inside the grid; every room has ≥ 1 checkpoint before its first hazard
(by beat x range).

## 5. Task breakdown

### Task 12: Guards, cameras, lasers, hide spots, checkpoints, loot, sequence doors

**Files touched.** `src/game/rooms/format.ts` (+ test), `src/game/rooms/lint.ts`
(+ test), `src/game/sim/world.ts`, `src/game/sim/hazards.ts` (+ test),
`src/game/sim/sight.ts` (+ test: line of sight, cone), `src/game/sim/step.ts`,
`src/game/perception.ts` (+ test), `src/client/render.ts`,
`src/net/attach.ts` (log `caught`), `src/lib/gameLog.ts` (`"caught"`).

**Interfaces produced (exact).**

```ts
// src/game/rooms/format.ts (widened)
export type Tile = "." | "#" | "1" | "2" | "3" | "B" | "p" | "D" | "E" | "G" | "C" | "L" | "h" | "K" | "$" | "S";
// RoomObject.kind gains: "guard" | "camera" | "laser" | "hide" | "checkpoint" | "loot" | "sign"
// RoomObject gains optional: mode?: "all" | "sequence"; params?: Record<string, unknown>

// src/game/sim/world.ts (widened)
export interface GuardState { id: string; pos: Vec; facing: Vec; target: number }
export interface Snapshot { players: Vec[]; crates: CrateState[]; lootTaken: string[] }
// World gains: guards: GuardState[]; lootTaken: string[]; loot: number; lootTotal: number;
//   checkpoint: number (0 = spawns); snapshot: Snapshot; seqProgress: Record<string, { next: number; at: number }>
// WorldEvent gains:
//   | { kind: "caught"; by: string } | { kind: "checkpoint"; index: number } | { kind: "loot"; id: string; at: Vec }

// src/game/sim/hazards.ts
export function cameraWatching(params: { periodS: number; watchingS: number; offsetS: number }, tick: number): boolean;
export function laserOn(params: { onS: number; offS: number; offsetS: number }, tick: number): boolean;
export function caughtBy(world: World): string | null; // first hazard id that sees a player, else null

// src/game/perception.ts (widened)
// EntityView.kind gains: "guard" | "camera" | "laser" | "hide" | "checkpoint" | "loot" | "sign"
// EntityView gains optional: cone?: { fovDeg: number; range: number }; zone?: [number, number, number, number]; beam?: Vec[]
```

**Tests first (red).** `hazards.test.ts`: camera watching pattern over a
period with offset; laser on/off; a player in a watched zone is caught, not
in an unwatched one; a player on a hide spot in a cone isn't caught; a wall
between guard and player blocks sight; caught restores players, crates and
loot to the checkpoint snapshot; reaching `K1` moves the snapshot; loot
counts once; a sequence door opens only in sign order and resets after a 5 s
gap. `lint.test.ts`: the §4.3 rules each reject a bad fixture.
`perception.test.ts`: blind gets no guards/cameras/lasers entities; deaf and
mute get them with cones/zones/beams.

**Implementation (green).** Per §4. Renderer draws cones hatched in
`camera-light`, beams in `danger` with no flicker, guards as `danger`
diamonds, hide spots as dashed squares, checkpoint as a white flag, loot as a
`goal` diamond, sign glyphs.

**Refactor.** Keep hazard checks in `hazards.ts`, sight geometry in
`sight.ts`.

**Acceptance criteria.** Tests green; `pnpm lint:rooms` still passes room 01
(add a checkpoint and loot to it).

**Depends on:** Task 11.

### Task 13: Environment flips and the full audio-cue set

**Files touched.** `src/game/rooms/format.ts` (flips), `src/game/sim/world.ts`
(`alarmUntil`), `src/game/sim/step.ts`, `src/game/perception.ts` (+ test),
`src/client/audio.ts`, `src/client/render.ts`, `public/sfx/*` (+
`CREDITS.md` entries).

**Interfaces produced (exact).**

```ts
// src/game/perception.ts (widened)
export interface SoundCue {
  kind: "footsteps" | "hum" | "door" | "guard" | "camera" | "laser" | "loot" | "checkpoint" | "caught" | "alarm";
  pan: number;
  gain: number;
}
// RoleView gains: alarm: boolean; dark: boolean (you are inside a dark zone)
// World gains: alarmUntil: number (tick; 0 = off)
```

**Tests first (red).** `perception.test.ts`: a deaf player inside a dark zone
receives no entities inside the zone and `dark: true`; a mute player outside
the zone still receives nothing inside it; blind cues unchanged by darkness;
while the alarm is on, blind and mute `sounds` are exactly `[{ kind: "alarm",
… }]`; a guard 3 tiles left pans < 0 with higher gain than one 10 tiles away.
(Flips are proved here, on the pure filter; the socket-level perception spec
from Task 7 already proves views go out only through `viewFor`.)

**Implementation (green).** Per §4.2. Alarm visual: border + banner, 1 Hz pulse, static under reduced motion.

**Refactor.** None.

**Acceptance criteria.** Tests green; audio cues audibly pan on a laptop's
speakers (checked in Task 14's review).

**Depends on:** Task 12.

### Task 14: Rooms 2 and 3, role rotation, room-cleared screen

**Files touched.** `rooms/02-cameras-lasers.room`, `rooms/03-vault.room`,
`src/net/game.ts` (+ test: advance), `src/net/protocol.ts` (`cleared`,
`next`), `src/net/attach.ts`, `src/components/RoleReveal.tsx` (shape morph,
cross-fade under reduced motion), `src/components/RoomCleared.tsx`,
`src/game/rooms/solve.test.ts` (**scripted** solution inputs per room proving
each is clearable — bots replace this in Task 16), `spec/heist.test.ts`.

**Interfaces produced (exact).**

```ts
// src/net/game.ts (added)
export function advanceRoom(game: Game, rooms: Room[]): "next" | "done"; // increments roomIndex, rotates roles, new world, clears ready
// protocol: C→S { t: "next" } (host, after cleared); S→C { t: "cleared"; room: string; ms: number; loot: number; lootTotal: number }
```

**Tests first (red).** `game.test.ts`: `advanceRoom` rotates so each seat
plays each role once over three rooms; returns `done` after room 3.
`solve.test.ts`: each room cleared by a recorded input script (stored beside
the test as JSON) within its time budget, with no `caught` events.
`spec/heist.test.ts`: after `cleared`, the host's `next` produces `reveal`
with rotated roles for all three sockets; a non-host `next` → `not-host`.

**Implementation (green).** Room 02 "Cameras and lasers": a camera bay the
sighted players must call timing for, a laser corridor where the blind player
has to cross on a spoken "go", a three-plate door. Room 03 "Vault": a dark
corridor the blind player leads through by sound, a sequence door whose sign
only sighted players can read, an alarm triggered by a plate that silences
audio cues so the deaf player leads, and a three-plate vault door. Each beat's
`intent` names what each role contributes.

**Refactor.** None.

**Acceptance criteria.** `pnpm lint:rooms` and all tests green; each room
takes three first-time players roughly 3–5 minutes (judged in review).

**Human review:** on a local build, three people (ideally not the author)
play the full heist once; the user watches and notes where communication
broke down, using the playtest protocol in spec §6 and logging it to
`PROCESS_LOG.md`. Pass = every role mattered in every room, nobody was idle
for a whole beat, and the flips each handed a different role the lead.

**Depends on:** Task 13.

## 6. Phase Definition of Done

- [ ] Tasks 12–14 complete, tests passing, Task 14 accepted by the user
- [ ] `pnpm test:unit` and `pnpm lint:rooms` pass
- [ ] `pnpm build && pnpm start`, then `pnpm check` and `pnpm check:evidence` pass
- [ ] Deployed (ask first); `spec/heist.test.ts` green against fly.dev
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR8 (rooms 2–3, rotation) | Task 14 |
| FR11 | Task 13 |
| FR12 | Task 12 |
| FR13 (loot) | Task 12 |
| FR14 | Task 12 (lint rules) |
| FR15 (hazards, flips, cues) | Task 12, Task 13 |
| FR30 (room cleared) | Task 14 |
| NFR flashing ≤ 3/s | Task 12, Task 13 |

## 8. Risks / open questions

None.
