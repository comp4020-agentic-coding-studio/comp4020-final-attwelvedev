# Sensory heist — Phase 02: Simulation and one room

- **Date:** 2026-10-08
- **Status:** Approved
- **Requirements confirmed by user:** yes — 2026-10-08
- **Part of:** `plans/2026-10-08-sensory-heist-00-overview.md`. Read it first,
  especially §3 (layering: `src/game/` is pure), §4.1, §4.2, §4.3, §4.4.
- **Depends on phases:** 01.

## 1. Summary

Rooms become linted text files; a deterministic headless simulation runs
top-down movement, crates, stations, doors and the exit; the server runs one
per game at 20 Hz and sends each seat a per-role view; the browser draws each
role's view on a canvas with keyboard and phone-joystick controls. Ends with
Loading Dock playable by three people on the deployed app: the **week 10
crit** milestone (real-time).

## 2. Requirements (this phase)

### 2.1 Functional

- FR4 — host Start (bots filling seats is Task 16; until then Start needs 3
  seated humans and says so).
- FR8 — reveal and Ready for room 1 (rotation across rooms is Task 14).
- FR9 — no abilities: any seat pushes, holds, acts.
- FR10 — top-down rooms with a three-station beat.
- FR13 — exit clears the room (loot is Task 12).
- FR15 — per-role perception for this phase's objects (tiles, players,
  crates, doors, stations, exit) and the basic blind audio cues (footsteps of
  others, hum on a station, click when a door opens). Hazards and flips are
  Tasks 12–13.
- FR5 — reconnecting state.

### 2.2 Non-functional

Server tick 50 ms (20 Hz); a view reaches the client within one tick plus
network; own avatar predicted locally. Canvas HUD at `PHONE` and `DESKTOP`
without overflow; keyboard WASD/arrows + Space; `prefers-reduced-motion`
respected (no camera shake, cross-fade instead of morph).

### 2.3 Out of scope for this phase

Channels (phase 03), hazards/loot/checkpoints (Task 12), flips and full audio
cues (Task 13), rooms 2–3 and rotation (Task 14), bots (phase 06),
disconnect pause (Task 17).

### 2.4 Assumptions

See overview §2.4. Room metadata is a JSON block (no YAML dependency).

## 3. Existing code context (verified 2026-10-08)

`doc/prompts/LEVEL_FORMAT.md` is the side-on draft this format replaces;
keep its ideas (one file per room, grid + metadata, per-object visibility,
beats, solver-first) and drop gravity and push strength. `spec/browser.ts`
exports `launch`, `openPage(browser, url, viewport)`, `PHONE`, `DESKTOP`,
`horizontalOverflow`, `axeViolations`. `harness/claude-settings.json` has a
`PostToolUse` hook on `Edit|Write|MultiEdit` running
`harness/hooks/format-on-edit.sh`.

### Interfaces from earlier phases (exact)

From overview §4.2: `Role`, `ROLES`, `ROLE_LABEL`, `Family`, `CHANNEL_RULES`,
`Vec`, `Seat`, `PlayerInput` in `src/game/types.ts`.

From Task 2:

```ts
// src/net/attach.ts
export function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void;
export function attachSockets(server: Server): void;
// src/net/protocol.ts
export function parseClientMsg(raw: string): ClientMsg | null;
// spec/ws.ts
export interface Socket {
  send(msg: unknown): void;
  next<T = { t: string }>(t: string, timeoutMs?: number): Promise<T>;
  close(): Promise<void>;
}
export async function connect(baseUrl: string, cookie?: string): Promise<Socket>;
// src/lib/stats.ts
export function sharedStats(): ReturnType<typeof createStats>;
```

From Task 3 (`src/net/lobbies.ts`):

```ts
export type LobbyPhase = "open" | "playing" | "done";
export interface SeatState { who: string | null; nickname: string | null; connected: boolean; bot: boolean; }
export interface LobbyState {
  code: string; teamName: string; host: string; phase: LobbyPhase;
  seats: [SeatState, SeatState, SeatState];
  spectators: { who: string; nickname: string }[];
}
export type ErrorCode = "lobby-not-found" | "lobby-full" | "server-full" | "bad-nickname" | "bad-team-name" | "not-host" | "throttled";
export class LobbyError extends Error { code: ErrorCode; constructor(code: ErrorCode, message: string); }
export interface Registry { lobbies: Map<string, LobbyState>; byDevice: Map<string, string>; }
export function createRegistry(): Registry;
export function setConnected(reg: Registry, who: string, connected: boolean): LobbyState | null;
```

From Task 4 (`src/client/socket.ts`):

```ts
export type ConnectionState = "connecting" | "live" | "weak" | "offline";
export interface GameSocket {
  send(msg: ClientMsg): void;
  on<T extends ServerMsg["t"]>(t: T, fn: (msg: Extract<ServerMsg, { t: T }>) => void): () => void;
  onState(fn: (state: ConnectionState, rttMs: number | null) => void): () => void;
  close(): void;
}
export function openSocket(url?: string): GameSocket;
```

`src/pages/lobby/[code].astro` hosts `src/components/Lobby.tsx` (Task 4).

## 4. Approach

### 4.1 Room file format (`rooms/NN-slug.room`)

```
{"id":"01-loading-dock","name":"Loading Dock","version":1,
 "beats":[{"name":"Three hands","x":[20,39],"intent":{"blind":"holds the far plate","deaf":"sees which plate is free","mute":"signals timing"}}],
 "objects":{"D1":{"opensWhen":["p1","p2","p3"]}}}
---
########################################
#1..#.................#................#
#2..#......p1.........D...........E....#
#3..B.................D................#
#...#.....p2....#.....D......p3........#
########################################
```

- Everything before the line `---` is one JSON object; after it, the grid.
- Legend (this phase): `.` floor, `#` wall, `1` `2` `3` seat spawns, `B`
  crate, `p` pressure plate (held while a player or crate stands on it),
  `D` door (solid until open), `E` exit. Phase 05 adds `G` guard, `C`
  camera, `L` laser emitter, `h` hide spot, `K` checkpoint, `$` loot.
- Objects get ids by letter and reading order (left→right, top→bottom):
  `p1`, `p2`, `D1` … Adjacent `D` tiles in one row or column form one door.
  Metadata keys address these ids.
- Visibility defaults (per ADR 0007): every object `visible_to: ["deaf","mute"]`,
  `audible_to: []`; metadata may override per object.

### 4.2 Simulation rules

- Top-down, 32 px tiles, avatar radius 0.4 tile, speed 4 tiles/s, axis-
  separated collision against walls, closed doors and crates.
- Crates are tile-aligned. Pushing into a crate for 200 ms continuous moves it
  one tile if the next tile is floor/plate and empty. Any seat can push.
- A plate is pressed while any player centre or crate is on it. A door opens
  while every id in `opensWhen` is pressed, and closes when one releases
  unless a player overlaps it (then it stays open until clear).
- The room clears when all three players' centres are on `E` tiles.
- Deterministic: `step` uses no clock, no randomness; `dtMs` is always
  `TICK_MS` on the server.

### 4.3 Perception (this phase)

| Data | Can't see | Can't hear | Can't speak |
| --- | --- | --- | --- |
| `tiles`, entities (players, crates, doors, plates, exit) | no | yes | yes |
| own position `you.pos` | no | yes | yes |
| sound cues (others' footsteps panned, hum on a plate you stand on, door click) | yes | no | yes |

Pan is `clamp((source.x − listener.x) / 8, −1, 1)`; gain falls off linearly to
0 at 12 tiles. `tiles` is sent only on a `full` view (first after reveal or
reconnect).

## 5. Task breakdown

### Task 5: Room format, loader and linter, with Loading Dock

**Description.** Parse `.room` files into a typed `Room`, lint them, run the
linter in `pnpm check` and on every room edit, and author room 01.

**Files touched.** `src/game/rooms/format.ts` (+ test), `src/game/rooms/load.ts`
(reads files; the one `node:fs` user in `src/game/`), `src/game/rooms/lint.ts`
(+ test), `scripts/lint-rooms.ts` (new), `rooms/01-loading-dock.room` (new),
`package.json` (`"lint:rooms": "node scripts/lint-rooms.ts"`, and `check`
becomes `pnpm typecheck && pnpm lint && pnpm lint:rooms && pnpm test`),
`harness/hooks/lint-rooms-on-edit.sh` (new), `harness/claude-settings.json`
(add it to `PostToolUse`), `Dockerfile` (copy `rooms/`), `CLAUDE.md`
(rooms rule).

**Interfaces produced (exact).**

```ts
// src/game/rooms/format.ts
import type { Role, Vec } from "../types.ts";
export type Tile = "." | "#" | "1" | "2" | "3" | "B" | "p" | "D" | "E";
export interface RoomObject {
  id: string; // "p1", "D1", "B2", "E1"
  kind: "plate" | "door" | "crate" | "exit" | "spawn";
  tiles: Vec[]; // integer tile coordinates
  visibleTo: Role[];
  audibleTo: Role[];
  opensWhen?: string[]; // doors only
}
export interface Beat {
  name: string;
  x: [number, number];
  intent: Record<Role, string>;
}
export interface Room {
  id: string;
  name: string;
  version: number;
  width: number;
  height: number;
  grid: string[]; // rows; object letters replaced by "." except "#" and "D"
  objects: RoomObject[];
  beats: Beat[];
  meta: Record<string, unknown>; // the raw JSON, for later phases' keys
}
export class RoomFormatError extends Error {
  line: number;
  constructor(message: string, line: number);
}
export function parseRoom(text: string): Room;

// src/game/rooms/lint.ts
export interface LintIssue { room: string; message: string }
export function lintRoom(room: Room): LintIssue[];

// src/game/rooms/load.ts
export function loadRooms(dir?: string): Room[]; // default "./rooms", sorted by file name; throws on parse error
```

**Tests first (red).** `format.test.ts`: parses the §4.1 example; an unknown
character fails with its line; a missing `---` fails; ids follow reading
order; adjacent `D` tiles merge into one door; metadata overrides visibility.
`lint.test.ts`: flags missing or duplicate spawns `1/2/3`, no `E`, a door
whose `opensWhen` names an unknown id, a door with no `opensWhen`, a room with
no beat whose door needs ≥ 3 plates (FR10), a non-rectangular grid, and an
unreachable exit from the spawns assuming all doors open (flood fill).

**Implementation (green).** As §4.1. `scripts/lint-rooms.ts` prints issues
and exits 1 if any. The hook runs it when the edited path matches `rooms/*`
and prints issues to stderr (non-blocking, exit 0, like the formatter).

**Refactor.** None.

**Acceptance criteria.** `pnpm lint:rooms` passes on room 01 and fails on a
deliberately broken copy (checked in the unit tests, not on disk). Room 01 has
three beats as in `doc/prompts/LEVEL_FORMAT.md` "Room 1" re-laid top-down,
the middle one a three-plate door.

**Depends on:** Task 1.

### Task 6: Headless simulation: movement, crates, plates, doors, exit

**Description.** A pure, deterministic `step` over a `World`.

**Files touched.** `src/game/sim/world.ts`, `src/game/sim/step.ts`,
`src/game/sim/collide.ts` (each + test).

**Interfaces produced (exact).**

```ts
// src/game/sim/world.ts
import type { Room } from "../rooms/format.ts";
import type { PlayerInput, Seat, Vec } from "../types.ts";
export const TICK_MS = 50;
export const SPEED_TPS = 4;
export const RADIUS = 0.4;
export type RoomStatus = "playing" | "cleared";
export interface PlayerState { seat: Seat; pos: Vec; facing: Vec; lastSeq: number; pushMs: number; moving: boolean }
export interface CrateState { id: string; tile: Vec }
export interface World {
  room: Room;
  tick: number;
  players: [PlayerState, PlayerState, PlayerState];
  crates: CrateState[];
  doorOpen: Record<string, boolean>;
  pressed: Record<string, boolean>;
  status: RoomStatus;
  events: WorldEvent[]; // emitted this tick only, cleared at the start of step
}
export type WorldEvent =
  | { kind: "door"; id: string; open: boolean; at: Vec }
  | { kind: "plate"; id: string; pressed: boolean; at: Vec }
  | { kind: "crate"; id: string; at: Vec }
  | { kind: "cleared" };
export function createWorld(room: Room): World;

// src/game/sim/step.ts
export function step(world: World, inputs: Partial<Record<Seat, PlayerInput>>, dtMs?: number): World; // mutates and returns world; missing input = no movement
```

**Tests first (red).** Movement at 4 tiles/s over 20 ticks moves 4 tiles;
diagonal input is normalised; walls and closed doors block; a held push for
200 ms moves a crate one tile and not into a wall or another crate; **any
seat can push and press** (FR9: run the same scenario for seats 0, 1, 2);
a door opens only when all three plates are pressed and emits one `door`
event; a crate on a plate presses it; all three on `E` sets `cleared` and
emits `cleared` once; replaying the same input sequence twice yields
identical worlds (determinism).

**Implementation (green).** As §4.2.

**Refactor.** Keep `step` under ~150 lines by splitting movement, crates,
plates/doors into functions.

**Acceptance criteria.** Tests green; `src/game/sim/` imports nothing outside
`src/game/`.

**Depends on:** Task 5.

### Task 7: Per-role views and the game loop over the socket

**Description.** Filter the world per role (§4.3), start a game from a lobby,
reveal roles, run 20 Hz, accept inputs, send views.

**Files touched.** `src/game/perception.ts` (+ test), `src/net/game.ts`
(+ test), `src/net/protocol.ts`, `src/net/attach.ts`, `src/net/lobbies.ts`
(phase → playing), `spec/perception.test.ts`, `spec/game.test.ts` (new).

**Interfaces produced (exact).**

```ts
// src/game/perception.ts
import type { World, RoomStatus } from "./sim/world.ts";
import type { Role, Seat, Vec } from "./types.ts";
export interface EntityView {
  id: string;
  kind: "player" | "crate" | "door" | "plate" | "exit";
  pos: Vec;
  state?: "open" | "closed" | "pressed" | "up";
  seat?: Seat;
  role?: Role;
  facing?: Vec;
}
export interface SoundCue { kind: "footsteps" | "hum" | "door"; pan: number; gain: number }
export interface RoleView {
  tick: number;
  ack: number; // last input seq applied for this seat
  room: string;
  role: Role;
  full: boolean; // true when tiles are included
  you: { seat: Seat; pos?: Vec };
  tiles?: string[];
  entities: EntityView[];
  sounds: SoundCue[];
  status: RoomStatus;
  elapsedMs: number;
}
export function viewFor(world: World, seat: Seat, role: Role, full: boolean): RoleView;

// src/net/game.ts
import type { LobbyState } from "./lobbies.ts";
export interface CrewMember { seat: Seat; nickname: string; role: Role; bot: boolean }
export interface Game {
  lobby: string; // code
  roomIndex: number;
  roles: [Role, Role, Role];
  world: World;
  ready: Set<Seat>;
  inputs: Partial<Record<Seat, PlayerInput>>;
  startedAt: number;
}
export function rolesFor(roomIndex: number): [Role, Role, Role]; // seat i gets ROLES[(i + roomIndex) % 3]
export function startGame(lobby: LobbyState, rooms: Room[]): Game; // the caller checks host; throws LobbyError("need-three") unless 3 seats are filled
export function tickGame(game: Game): { views: Map<Seat, RoleView>; cleared: boolean };
```

Protocol additions (overview §4.3): `lobby.start`, `reveal`, `ready`,
`input`, `view`. `ErrorCode` gains `"need-three"` (Start with fewer than 3
seated humans, until Task 16).

**Tests first (red).**
- `perception.test.ts`: a blind view has no `tiles`, no `entities`, no
  `you.pos`, even when `full`; a deaf view has no `sounds`; a mute view has
  both; footsteps pan left for a source to the left; hum only when the blind
  player's centre is on a plate; JSON of a blind view contains no `"#"`.
- `game.test.ts`: `rolesFor(0)` = `["blind","deaf","mute"]`, `rolesFor(1)`
  rotates; inputs with `seq` lower than the last are ignored; views carry
  `ack`.
- `spec/perception.test.ts` (three sockets, a started game): the blind
  socket's `view` messages never contain `tiles` or `entities` with items,
  over 40 views; the deaf socket's never contain `sounds` items.
- `spec/game.test.ts`: a non-host `lobby.start` → `not-host`; with 3 seated,
  Start sends `reveal` to each with distinct roles; after 3 `ready`, `view`
  messages arrive at ≥ 15 per second; an `input` moving right changes the
  deaf socket's own `you.pos.x` within 500 ms.

**Implementation (green).** One `setInterval(TICK_MS)` per game in
`attach.ts`, cleared when the lobby ends. Only ready games tick. Views are
built per seat and sent only to that seat's sockets; spectators get nothing
yet (Task 20).

**Refactor.** None.

**Acceptance criteria.** Unit and spec tests green; a view JSON for room 01
is under 2 KB except `full` views.

**Depends on:** Task 3, Task 6.

### Task 8: Canvas client: per-role rendering, controls, HUD frame

**Description.** Play the room in the browser per spec §4.1 "In-game HUD"
(top bar, crew strip, role frame, map, control zone; the tray is drawn as
three placeholder tiles labelled with receiver arrows, wired in Task 10).

**Files touched.** `src/client/tokens.ts`, `src/client/render.ts`,
`src/client/input.ts`, `src/client/predict.ts` (+ test), `src/client/audio.ts`
(Web Audio: footsteps, hum, door click, stereo pan), `src/components/Game.tsx`,
`src/components/RoleReveal.tsx`, `src/components/Lobby.tsx` (switch to the
game when `reveal` arrives), `public/sfx/` (three short cues made in code or
CC0, credited), `spec/layout/game.test.ts` (new).

**Interfaces produced (exact).**

```ts
// src/client/predict.ts
import type { PlayerInput, Vec } from "../game/types.ts";
export interface Predictor {
  apply(input: PlayerInput, dtMs: number): Vec; // predicted own position
  reconcile(serverPos: Vec, ack: number): Vec; // drops acked inputs, replays the rest
}
export function createPredictor(start: Vec, tiles: string[]): Predictor;

// src/client/input.ts
export interface InputSource { read(): PlayerInput; dispose(): void } // keyboard + touch joystick merged
export function createInput(root: HTMLElement): InputSource;
```

**Tests first (red).** `predict.test.ts`: predicted position after inputs
matches `step` for the same inputs on an empty room; reconcile with a later
ack replays only unacked inputs. `spec/layout/game.test.ts` (three browser
contexts: 1 phone, 2 desktop): a started game shows the role frame with the
role's shape and `ROLE_LABEL` text in each; the blind context's canvas
contains no pixels in the `solid` colour (sample a grid of points via
`getImageData`); zero overflow and zero axe violations on the HUD chrome at
both viewports; pressing D in the deaf context moves its avatar (canvas
changes) within 500 ms.

**Implementation (green).** Render order: tiles, plates, doors, crates, exit,
players (role colour + shape), then frame. Blind: `ink` black map, dim own
ring at centre (role colour at 40%). Desktop fits the room to height; phone
follows the team centroid with a max spread clamp. Joystick bottom-left, Act
bottom-right on touch devices. Connection pill uses `onState`. Reconnecting
shows spec §4.1 "Reconnecting" and sends no input while offline.

**Refactor.** Move magic numbers to `src/client/tokens.ts`.

**Acceptance criteria.** Layout spec green; manual three-session run of
room 01 to the exit on a local build.

**Human review:** on a local build, the user and two others play Loading Dock
(one phone, two desktops). Pass = each role's screen matches spec §4.1 HUD
wireframes; the blind screen gives nothing visual away; movement feels
responsive; the three-plate door needs all three people.

**Depends on:** Task 4, Task 7.

## 6. Phase Definition of Done

- [ ] Tasks 5–8 complete, tests passing, Task 8 accepted by the user
- [ ] `pnpm test:unit` and `pnpm lint:rooms` pass
- [ ] `pnpm build && pnpm start`, then `pnpm check` and `pnpm check:evidence` pass
- [ ] Deployed (ask first); `APP_URL=https://<app>.fly.dev pnpm vitest run --project spec` green, including `spec/perception.test.ts` and `spec/game.test.ts` (views ≥ 15/s through Fly's proxy)
- [ ] Before the week 10 crit: the user writes the "one decision about several people at once" (suggested: per-role perception filtering, ADR 0007, or seat-held rejoin) in `README.md`/`PROCESS.md` and `reflections/crit-9.md` — the agent may suggest, the user drafts
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR4 (Start) | Task 7 |
| FR5 (reconnecting) | Task 8 |
| FR8 (reveal, Ready, room 1) | Task 7, Task 8 |
| FR9 | Task 6 |
| FR10 | Task 5, Task 6 |
| FR13 (exit) | Task 6 |
| FR15 (this phase's objects, basic cues) | Task 7, Task 8 |

## 8. Risks / open questions

None.
