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
11. **Leaving mid-game (done 2026-10-09, after the user asked).** A person who
    presses Leave mid-game now gets a bot in their seat at once, the same step as
    the host's "bot takes over" (`botTakesSeat`); the host role passes on as it
    already did. The others see "Cy left the game. A bot took their seat." The
    old `spec/layout/game.test.ts` expectation, that a leaver shows as "(left)"
    with the seat freed, is the behaviour this replaces; its intent (the others are
    told) is kept. `takeOverWithBot` also no longer clears a pause that is for a
    different seat.
12. **Coming back (2026-10-09, after the user asked).** The device a bot took a
    seat from (a Leave, or a drop the host answered with "bot") is remembered for
    the game (`Game.vacated`). Joining the lobby's code with that device takes the
    seat back: the bot steps aside, the world is as it was, every other bot starts
    afresh, and the person gets their role and a full view. Anyone else is told
    the lobby is full and may watch: `joinLobby` used to count a bot's seat as free.
    The host role does not come back with the seat; see the Corrections log.

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
- 2026-10-09, playing as Can't see with the Can't-hear bot guiding: the bot kept
  saying "Right" while the user pushed at a wall, with no way to tell why. Expected:
  directions a person can act on. First attempt missed because the guide steered a
  person exactly as it steers a bot, which obeys to the tick: a person hears each call
  late, holds a key until told to stop, and in a one-tile lane has to be within a
  tenth of a tile of the middle, so they oscillated at the tunnel's mouth. Fixed for a
  person (a bot is unchanged): if they push at something for half a second the guide
  says stop and lines them up; in a tight lane it says "Tap up." (in words, since a
  tap is smaller than any call) and looks again; it learns how far this person
  coasts after "stop" and says it that early; the last tile before a turn or a goal
  is taps, not a run; and a direction is always a word, never a bare "go". Test: a
  simulated person who reacts 0.3 s late, starts off-centre, holds until told to
  stop and taps on request, clears all three rooms in every rotation without
  pushing at a wall for more than a second. The same pattern as the two before
  (the solver had no realistic person in it); the person model is now in the tests.
- 2026-10-09, playing room 3: a guard's cone reaches out of the dark but nothing
  was drawn there, so a person at the edge was caught by something invisible.
  Expected: the cone shown in the light. First attempt (lit tiles, hatched)
  looked blocky; the user asked for the exact cone. Now the server cuts the guard's
  or a watching camera's real cone (walls and cover stop its rays) to the part
  outside the dark zones and sends only those polygons, as a `sight` entity, with no
  position for the hazard (ADR 0007: nothing a role cannot perceive). The client
  draws them like any cone. `cone.ts` moved from `src/client/` to `src/game/`
  because the server needs it, and `clip.ts` is the polygon cutting.
- 2026-10-09, trying leave and rejoin: (a) no message when a player came back;
  (b) going to the landing page did not count as leaving. Expected: both said, and
  the seat handled. First attempt missed because I only hooked the Leave button.
  The landing page opens a socket with the same cookie, which the server read as
  the person coming back (resuming the pause and keeping their seat while they
  stood on `/`); and creating or joining another lobby left the old seat silently.
  Fixed: one `departs` step for Leave, the landing page (a device whose every open
  page is the landing page, which a page shows by asking to watch the lobby list)
  and starting or joining another lobby; a new socket is only a return after 400 ms
  without that ask; the HUD says "Bo is back." / "Bo left the game. A bot took
  their seat." from the crew list changing. Tried in a browser: one message each way,
  none spurious. A person with the game open in a second tab has not left.
- 2026-10-09, three things after trying leave and rejoin: (a) only `/` counted as
  leaving, not About or Credits; (b) a Can't-hear player's screen was a black
  "no map" one; (c) typing another lobby's code into the address bar bounced back
  to the current lobby with no error. Causes: (a) those pages open no socket, so
  the server only saw a dropped connection; (b) `tick()` cleared the "owed a full
  view" marker every tick, including paused ticks that send no views, so a page
  that reconnected during a pause never got its map; (c) the lobby page followed
  any lobby message about another lobby, meant for starting a new team, and a
  reconnecting socket is told about the lobby it is already in. Fixed: the
  middleware reports page views (not the lobby page) through `sharedPresence()` and
  the socket server treats one as leaving when no game page is open 2 s later
  (another tab with the game open is not leaving); the marker is only cleared when
  views were sent; the lobby page only follows a lobby it asked to start. Each has a
  failing spec first, and the first two were checked in a browser.
- 2026-10-09, the user again: going to another page still did not count as leaving
  (only Leave did), and the other players still saw them as active, while on :8080.
  Expected: leaving on any navigation away. First attempt missed because every
  check of it ran in Playwright, which switches off Chrome's back/forward cache; in a
  person's Chrome the game page is kept alive with its socket open, so the server
  never saw it go. (Two more slips the same hour: I rebuilt `dist` under the running
  server, which takes it down, and I checked the not-found address in a lobby that
  had not started, where the role screen is not re-sent.) Fixed: the socket closes
  itself on `pagehide` and reconnects on a restored `pageshow`; a Chrome with the
  cache on is now in the specs (`spec/layout/cache.test.ts`, including Back returning
  to the game); a game only shows on the page whose own lobby it belongs to.
  Prevention: test navigation in the browser a person has, not only the automation
  default, and rebuild and restart in one step. The layout specs now launch a
  cache-on Chrome for anything about leaving a page.
- 2026-10-09, the user: going to another lobby, existing or not, should also leave;
  and About/Credits briefly showed "connection dropped" to the others. First attempt
  missed because a code that does not exist was rejected before anything else
  happened (so the seat was kept), and the page's own socket closing as it unloads
  reached the server before the page request had made it a leaving. Fixed: asking to
  join any other lobby leaves the current one first (an open lobby too); a page
  request from someone already in a lobby (another lobby's page, About, Credits, the
  landing page; their own lobby's page reloading does not count) is remembered for
  5 s, and a game socket closing in that time is a leaving, not a pause. Caught on
  the way: counting page requests from someone not yet in a lobby made closing a tab
  soon after joining look like leaving. Checked in a cache-on Chrome on :8080: no
  "Waiting for" overlay at any sample (every 50 ms) for About, Credits or
  /lobby/ABCD.
- 2026-10-09, after the push: the page-request specs failed against fly.dev though they
  passed locally. Cause: a game socket took ~5 s to close over the network, and the
  server only remembered a page request for 5 s, so the close looked like a plain
  drop. The window is now 15 s. Lesson: every timing in the leave logic was tuned on
  localhost; run the specs against the deployed app before calling a timing right.
- 2026-10-09, running the specs against fly.dev again: the landing page still did not
  leave a game in a cache-on Chrome. Cause: over a slow connection the landing page's
  socket opened and asked to watch before the game page's had finished closing, so the
  server saw a game page still open; when that socket then closed, the close handler
  returned early because the device still had a socket, and nothing looked again.
  Now it re-checks (is every remaining page a landing page?) on every close. A spec
  opens the landing socket first. Also found: running four spec files at once against
  the 256 MB machine makes them time out, so against the deployed app run the files
  one at a time (`--no-file-parallelism`).
- 2026-10-09, the live specs timing out at 30 s: a WebSocket close takes 5-30 s on
  fly.dev (idle too; instant on localhost), and the server learned "this page is gone"
  only from the close, so leaving by navigation would take as long to register. Fixed
  with a `bye` message the page sends before closing (client `pagehide`); the server
  treats a bye like a close, once, whichever comes first. The leave specs use a
  helper that says bye then closes, as a page does; `drop()` stays the lost-signal case.
  Lesson (third time): behaviour that depends on the network (close timing, latency)
  cannot be checked on localhost; the deployed app is part of the test environment.

