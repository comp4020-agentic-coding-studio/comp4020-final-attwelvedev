# Sensory heist — Phase 06: Bots and disconnects

- **Date:** 2026-10-08
- **Status:** Approved
- **Requirements confirmed by user:** yes — 2026-10-08
- **Part of:** `plans/2026-10-08-sensory-heist-00-overview.md`. Read it first,
  especially §3 (pure `src/game/`), §4.2, §4.3.
- **Depends on phases:** 05.

## 1. Summary

Heuristic bots fill empty seats. They perceive only their own role's view,
talk only through their role's channels, and follow per-room hints. Three
bots clear every room in a headless spec, which is the room solver. A
dropped player pauses the game for 45 s with their seat held; after that the
host chooses a bot takeover or a return to the lobby.

## 2. Requirements (this phase)

### 2.1 Functional

FR4 (Start fills bots), FR24, FR25, FR26, FR27, FR28, FR29.

### 2.2 Non-functional

A bot's think step costs < 1 ms per tick for room-sized grids (path cache).
Bots obey the same cooldowns as humans (the router enforces it anyway).

### 2.3 Out of scope for this phase

Smarter bots (learning, LLMs); bots reading free text.

### 2.4 Assumptions

See overview §2.4. Bots may know the room's hints (a "plan"), but never
anything their role's view doesn't contain about the live state.

## 3. Existing code context (verified 2026-10-08)

Code from phases 01–05 only.

### Interfaces from earlier phases (exact)

Overview §4.2 types. From Task 3 (`src/net/lobbies.ts`): `SeatState { who;
nickname; connected; bot }`, `LobbyState { code; teamName; host; phase;
seats; spectators; createdAt }` (`createdAt` added in Task 11),
`setConnected(reg, who, connected): LobbyState | null`, `LobbyError`,
`ErrorCode` (includes `"need-three"` from Task 7, `"cooldown"`,
`"cant-send"` from Task 9).

From Task 5/12 (`src/game/rooms/format.ts`): `Room { id; name; version;
width; height; grid; objects; beats; meta }`, `RoomObject { id; kind; tiles;
visibleTo; audibleTo; opensWhen?; mode?; params? }`, `loadRooms(dir?)`.

From Task 6/12/13 (`src/game/sim/*`): `TICK_MS`, `World`, `createWorld`,
`step(world, inputs, dtMs?)`, `WorldEvent` (incl. `caught`, `checkpoint`,
`loot`, `cleared`), `cameraWatching(params, tick)`, `laserOn(params, tick)`.

From Task 7/12/13 (`src/game/perception.ts`):

```ts
export interface RoleView { tick: number; ack: number; room: string; role: Role; full: boolean;
  you: { seat: Seat; pos?: Vec }; tiles?: string[]; entities: EntityView[]; sounds: SoundCue[];
  status: RoomStatus; elapsedMs: number; alarm: boolean; dark: boolean; }
export function viewFor(world: World, seat: Seat, role: Role, full: boolean): RoleView;
```

From Task 9 (`src/game/channels.ts`): `CALLOUTS`, `Callout`, `Outgoing`,
`ChannelMessage`, `CooldownState`, `route(roles, from, msg, cd, now)`.

From Task 7/14 (`src/net/game.ts`): `Game`, `CrewMember`, `rolesFor`,
`startGame(lobby, rooms)`, `tickGame(game)`, `advanceRoom(game, rooms)`.
From Task 11: `logGame(...)`, `GameEvent`.
From Task 14: `src/game/rooms/solve.test.ts` with scripted inputs (replaced
here).

## 4. Approach

### 4.1 Hints (room metadata key `hints`)

```json
"hints": { "jobs": [
  { "beat": 1, "goTo": "p2", "prefer": "blind" },
  { "beat": 1, "goTo": "p1", "prefer": "deaf" },
  { "beat": 1, "goTo": "p3", "prefer": "mute" },
  { "beat": 2, "push": "B1", "to": [31, 9] }
] }
```

Jobs for a beat are claimed by seats (humans first, by proximity; bots take
the rest, preferring their role). After the beat's door opens, everyone heads
to the next beat's jobs; after the last beat, to `E`.

### 4.2 Behaviour by role

- **Sighted bots (deaf, mute):** A* on the cached tiles to the job, waiting
  at the edge of a camera zone or laser while it's active (they can see it).
- **Deaf bot as guide:** every 1.5 s, if a blind teammate (bot or human) has
  a job, it computes the blind player's next path segment and sends the
  callout for it (`left/right/up/down`), `stop` on arrival, `wait`/`go`
  around active hazards on that path. It adds a flavour text phrase at most
  every 10 s, drawn without repeats from a list per situation.
- **Mute bot:** can't Say; plays a sound clip when a blind teammate is on the
  wrong side of a door it can see, and sends a face on room clear.
- **Blind bot:** has no position. It moves in the direction of the last
  directional callout it received until `stop`, `wait` or a new direction;
  `go` resumes. Hearing `hum` (on a plate) it stops and holds. With no
  callout for 5 s it stays put.

### 4.3 Disconnect state machine

`playing` → (seated human's last socket closes) → `paused { seat,
deadline = now + 45 s }`: ticks stop, `pause` broadcast. Reconnect from the
same device before the deadline → `resume`. After the deadline the current
host (or, if the host is the one missing, the next connected human, who
becomes host) gets the choice; others see "Waiting for the host to choose".
`bot` → that seat becomes a bot and play resumes; `lobby` → game discarded,
lobby `open`. If no humans remain connected at the deadline, the game ends.

## 5. Task breakdown

### Task 15: Bot brains per role, talking through the channels (done)

**Files touched.** `src/game/bots/brain.ts`, `src/game/bots/path.ts`,
`src/game/bots/phrases.ts`, `src/game/bots/jobs.ts` (each + test),
`rooms/0[1-3]-*.room` (add `hints`), `src/game/rooms/lint.ts` (hints refer to
real ids; every beat has jobs).

**Interfaces produced (exact).**

```ts
// src/game/bots/brain.ts
import type { ChannelMessage, Outgoing } from "../channels.ts";
import type { RoleView } from "../perception.ts";
import type { Room } from "../rooms/format.ts";
import type { PlayerInput, Seat } from "../types.ts";
export interface BotMemory {
  seat: Seat;
  tiles: string[] | null;
  heading: PlayerInput["move"]; // blind bots: last commanded direction
  holding: boolean;
  lastSpokeAt: number;
  lastFlavourAt: number;
  usedPhrases: Set<string>;
  seq: number;
  humans: ReadonlySet<Seat>; // ruling 1: who is human, so jobs go to them first
}
export interface BotTurn { input: PlayerInput; send: Outgoing | null }
export function createBotMemory(seat: Seat, humans?: ReadonlySet<Seat>): BotMemory; // humans: seats held by people (ruling 1)
export function think(room: Room, view: RoleView, inbox: ChannelMessage[], memory: BotMemory, now: number): BotTurn;
```

**Tests first (red).** `path.test.ts`: A* around walls and closed doors.
`jobs.test.ts`: claim order (humans by proximity first, bots by preference).
`brain.test.ts`: a blind bot given `left` moves left until `stop`; holds on
`hum`; idles after 5 s silence; a deaf bot guiding a blind teammate emits a
callout at most every 1.5 s and never a `say` for a mute bot (it returns
`null` for say when role is mute); a sighted bot waits at a watched camera
zone and goes when it stops; `think` reads only `view` (a test passes a blind
view with no tiles/entities and asserts no throw and no movement without
callouts). `phrases.test.ts`: no phrase repeats until the list is exhausted.

**Implementation (green).** Per §4.1–4.2.

**Refactor.** None.

**Acceptance criteria.** Tests green; `src/game/bots/` imports only
`src/game/`.

**Depends on:** Task 14.

### Task 16: Bots fill empty seats, and three bots clear every room (done)

**Files touched.** `src/net/game.ts` (bot seats: build view → `think` →
inputs and routed messages each tick), `src/net/lobbies.ts` (Start marks
empty seats `bot: true`, nickname "Bot <shape>"), `src/net/attach.ts`,
`src/components/Lobby.tsx` ("Start (n bots fill)"), `spec/rooms.test.ts`
(new; imports `loadRooms`, `createWorld`, `step`, `viewFor`, `think`,
`route` and runs headless), `spec/bots.test.ts` (new),
`src/game/rooms/solve.test.ts` (deleted; superseded), `CLAUDE.md` (rooms
must pass `spec/rooms.test.ts`).

**Tests first (red).** `spec/rooms.test.ts`: for each room in `rooms/`,
three bots (roles from `rolesFor(i)` for that room's index) clear it within
its time budget (`meta.budgetS`, default 600 s simulated), with the channel
router in the loop (bots' messages are delivered only per `route`). Also run
once per rotation (all three role assignments) so no assignment is
unwinnable. `spec/bots.test.ts`: one socket creates a lobby and starts →
`reveal.crew` has two bots; within 5 s of `ready`, a bot's avatar moves in the
human's view; if the human is blind, it receives `msg` callouts from the deaf
bot within 5 s.

**Implementation (green).** `need-three` is removed from `ErrorCode` usage
(Start always succeeds for the host). Bot inboxes collect the `msg`s their
seat would receive.

**Refactor.** None.

**Acceptance criteria.** Specs green; the rooms spec runs in < 20 s.

**Depends on:** Task 15.

### Task 17: Pause on disconnect, rejoin, bot takeover (done)

**Files touched.** `src/net/game.ts` (+ test: state machine), `src/net/attach.ts`,
`src/net/protocol.ts` (`pause`, `resume`, `host.choice`), `src/lib/gameLog.ts`
(`"pause"`, `"bot.takeover"`), `src/components/Disconnect.tsx`,
`spec/disconnect.test.ts` (new).

**Interfaces produced (exact).**

```ts
// src/net/game.ts (added)
export const PAUSE_MS = 45_000;
export interface Paused { seat: Seat; deadline: number; choosing: boolean }
// Game gains: paused: Paused | null
export function pauseFor(game: Game, seat: Seat, now: number): void;
export function resumeIfBack(game: Game, seat: Seat): boolean;
export function takeOverWithBot(game: Game, lobby: LobbyState, seat: Seat): void;
```

`PAUSE_MS` is overridable by `process.env.PAUSE_MS` (read once in
`attach.ts`) so the spec can use a short pause against a local build; the
spec skips the timeout cases with a message when the server's `pause.deadline`
is more than 10 s away (as on the deployed app).

**Tests first (red).** `game.test.ts`: a pause stops ticking; resume
restores; the host leaving hands the choice to the next connected human;
`takeOverWithBot` sets `bot: true` and keeps the world. `spec/disconnect.test.ts`:
closing one of three sockets sends `pause` to the others with `waitingFor`
the nickname; reconnecting with the same cookie sends `resume` and the game
ticks again; (short pause) after the deadline the host's `host.choice: bot`
resumes with a bot in that seat; `host.choice: lobby` returns everyone a
`lobby` with phase `open`.

**Implementation (green).** Per §4.3; spec §4.1 "Disconnect" panel.

**Refactor.** None.

**Acceptance criteria.** Tests green.

**Depends on:** Task 16.

## 6. Phase Definition of Done

- [x] Tasks 15–17 complete, tests passing
- [x] `pnpm test:unit` and `pnpm lint:rooms` pass
- [x] `pnpm build && PAUSE_MS=3000 pnpm start`, then `pnpm check` passes (disconnect timeouts included); then a normal `pnpm start` and `pnpm check:evidence` (run on :8081, 2026-10-09: 65 files, 640 tests, 41 s; the timeout cases skip on a 45 s server)
- [ ] Deployed (ask first); `spec/bots.test.ts` green against fly.dev
- [ ] Manually: one person plays the whole heist solo with two bots, once in each role
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR4 (bots fill) | Task 16 |
| FR24, FR25, FR26 | Task 15 |
| FR27 | Task 16 |
| FR28, FR29 | Task 17 |

## 8. Risks / open questions

None.

## 9. Review rulings (Phase 1, 2026-10-09)

1. **Crew info.** `createBotMemory(seat, humans)` stores a `humans` set on
   `BotMemory`; jobs are claimed humans-first by the player positions a bot's
   role can see. Blind bots only follow callouts.
2. **Guide pace.** The 1.5 s limit is on *repeated* direction callouts. State
   changes (turn, stop, wait, go) send at once. The unit test asserts repeats
   are spaced at least 1.5 s apart.
3. **Old solver.** Delete only `src/game/rooms/solve.test.ts`. Keep
   `solveBuilder.ts`, `solvePlans.ts`, `scripts/solve-rooms.ts`,
   `solutions/*.json` and `pnpm solve:rooms`; report them as dead tooling.
4. **Hints.** `jobs` may carry extra optional fields (`order`, `hold`,
   `together`, ...) with matching lint rules. Bots may compute hazard timing
   (cameras, lasers, guards) from the room's static params and `view.tick`,
   which is what lets them cross dark zones. Never live state their role
   cannot perceive.
5. Existing `need-three` tests (`src/net/game.test.ts`, `spec/game.test.ts`)
   are replaced by start-fills-bots tests: FR4 changes the behaviour, so this is
   not a weakened test.
6. **BotMemory** carries internal state beyond the listed fields (the roles in
   the room, what the bot has seen, its place in each job queue, its plan, the
   guide's belief about the Can't-see seat, alarm windows), and
   `createBotMemory(seat, humans, roles)` takes the roles too. A bot's memory is
   made afresh at each room start, restart and takeover. `src/game/bots/` also
   holds `forecast.ts` (hazard timing from static params and the tick, FR24),
   `crew.ts` (one tick of every bot, through `route`) and `solve.ts` (three bots
   in a room, the headless solver).
7. **Delivery order.** `botsAct` thinks the Can't-see seat last, so a callout
   sent this tick is heard this tick. Without that the guide would have to
   predict the blind bot's lag; with it a stop sent at a tile centre lands there.
8. **Hum.** The Can't-see bot holds on the third tick of a hum in a row, which
   is when it has walked to the middle of the plate's tile: a bot that stopped
   on the first tick would stand at the plate's edge, in a guard's sweep.
9. **Task 16 notes.** The lobby shows no per-seat "bot fills" tag (the spec
   wireframe has one): `spec/layout/lobby.test.ts` finds a seat by `hasText:
   "Bo"`, which any text containing "bot" matches. The Start button and the line
   under it say how many bots fill. Bots' messages are not logged as `game`
   lines: bots are not players. `spec/playUi.ts` waits for the button named
   exactly "Start", so a helper never starts a game with bots by mistake.
10. **Task 17 notes.** On the wire, `pause` is `{ waitingFor, deadline, left,
    choosing }` (`left` is the server's count of ms to go, so a page whose clock
    is off still counts down right; `choosing` is true once the host is asked)
    and `resume` is `{ back }` (the nickname, or null when a bot took the seat).
    A game pauses only while a room is being played, not on the cleared screen,
    and a page that opens mid-pause is told. A takeover rebuilds every bot's
    memory (who is a person changed, so their claims would disagree) and sends
    the reveal again so the crew list shows the bot. The overlay is an
    `alertdialog`: `spec/layout/game.test.ts` expects one `status` mentioning
    the dropped player. `PAUSE_MS` is read once in `attach.ts`.
11. **Not done here, found on the way.** A person who presses Leave mid-game
    frees their seat without a bot taking it, so the game carries on short of a
    player. That is older than this phase; it wants its own task.

## 10. Corrections log

- 2026-10-09, room 3 with the user as Can't speak (seat 0): the bots ran through
  the dark and were caught, and the two on the sequence plates just sat on them.
  Expected: bots that cope with a person on the team. First attempt missed
  because the solver only ever had three bots: nobody was slow, so (a) a caught
  team's bots kept their plans and the Can't-see bot walked on in its old
  direction, and (b) a bot pressed its sequence plate at once and held it, so
  when the person was late the sequence reset and nothing could restart it.
  Fixed: bots forget their plans when sent back (a jump, or the caught sound,
  read before the inbox); sequence plates follow the sign's progress, step off
  and press again when it resets, and the first press waits until a visible
  person is beside their plate. Tests: sent back at six moments, a slow person
  in each seat, no early press. Earlier the same day: a person's Say never
  reached a bot (relay now delivers to bot inboxes).
  Pattern (two misses of the same kind, both "the solver has no person in it"):
  the headless solver should grow a person who is slow, wrong or absent; the
  new tests are the start of that.
- 2026-10-09, playing room 3: (a) the bots ignored checkpoints; (b) when the team
  failed nobody could tell who or why, least of all in the dark. Expected: bots
  set the flags with the team, and a caught team is told what got whom. First
  attempt missed because the hints had no checkpoint jobs (a caught team went
  back to the start), and the server sent only a hazard id inside a sound cue.
  Fixed: `goTo: "K1"` jobs for every checkpoint in all three rooms (done once the
  flag is reached; the solver now requires every checkpoint), and a `caught`
  message (hazard kind, which player, checkpoint) shown to everyone as a banner
  and spoken to Can't see. A bug found on the way: the "skip a job once a later
  one is done" rule skipped a push when the flag after it was set first; it now
  applies to waypoints only.

