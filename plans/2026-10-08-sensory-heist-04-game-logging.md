# Sensory heist — Phase 04: Game logging

- **Date:** 2026-10-08
- **Status:** Approved
- **Requirements confirmed by user:** yes — 2026-10-08
- **Part of:** `plans/2026-10-08-sensory-heist-00-overview.md`. Read it first,
  especially §3 (logging rules) and §4.1 (`sharedStats()` across module
  instances).
- **Depends on phases:** 03.

## 1. Summary

Everything players do over the socket becomes a redacted JSON log line on
stdout, alongside the existing request lines, and `/stats` shows the game
right now: lobbies open, games playing, players connected, events by kind,
channel use by role, and the server's memory. This is the **week 11 crit**
("fly by instruments") milestone.

## 2. Requirements (this phase)

### 2.1 Functional

FR34 fully. NFR resources: memory is visible on `/stats`.

### 2.2 Non-functional

A broken stdout never breaks the game (use `stdoutSink`). Logging adds no
per-tick lines (inputs and views are never logged; only discrete events).
Never logged: chat text, callout or clip choices, face/stamp ids, nicknames,
team names, lobby codes, raw tokens.

### 2.3 Out of scope for this phase

Voice latency lines (Task 21 adds `voice.latency` using this machinery).
Events from hazards, bots and disconnects are added by the tasks that create
them (12, 15, 17) using `logGame`.

### 2.4 Assumptions

See overview §2.4.

## 3. Existing code context (verified 2026-10-08)

`src/lib/log.ts`:

```ts
const ALLOWED = new Set(["outcome", "via", "kind", "count", "reason"]);
export type Detail = Record<string, string | number | boolean>;
export function redact(fields: Record<string, unknown>): Detail;
export function stdoutSink(line: unknown, write?: (text: string) => unknown): void;
```

`src/lib/requestLog.ts` (after Task 1): `RequestLine { ts; kind: "request";
method; route; action; status; ms; who: string | null; detail?; err? }`,
`anon(value: string): string` (8 hex of `hashToken`), `ACTIONS`,
`isLogged(route)`, `describeRequest(...)`.

`src/lib/stats.ts`: `createStats(since?)` with `record(line: RequestLine)` and
`snapshot(now?)` returning `StatsSnapshot { since; now; requests; errors;
actions; activeDevices; perMinute; recent }`; `stats` (module instance) and,
from Task 2, `sharedStats()`. `src/pages/stats.astro` renders the snapshot and
polls `/stats.json` every 2 s. `spec/stats.test.ts` asserts the snapshot's
exact key set.

### Interfaces from earlier phases (exact)

From Task 2: `sharedStats(): ReturnType<typeof createStats>`. From Task 3:
`Registry`, `LobbyState`, `openLobbies(reg)`. From Task 7: `Game`,
`rolesFor`. From Task 9:

```ts
export type Outgoing =
  | { family: "say"; kind: "callout"; callout: Callout }
  | { family: "say"; kind: "text"; text: string }
  | { family: "sound"; clip: string }
  | { family: "show"; kind: "face"; id: string }
  | { family: "show"; kind: "stamp"; id: Stamp; at: Vec };
export type RouteResult =
  | { ok: true; receivers: Seat[]; cooldownKey: string | null; until: number }
  | { ok: false; code: "cant-send" | "cooldown"; until?: number };
```

## 4. Approach

A game line is `{ ts, kind: "game", event, who, lobby, detail? }` where `who`
is the 8-hex device hash, `lobby` is `anon("lobby:" + code + ":" + createdAt)`
(stable for a lobby's life, unlinkable to its code), and `detail` passes
through `redact`. The allowlist grows on purpose by `role`, `family`, `room`,
`seat`, `ms`, `bots`, each with a comment saying why.

Events (this phase): `socket.open`, `socket.close`, `lobby.create`,
`lobby.join` (`detail.kind` = player/spectator), `lobby.leave`,
`lobby.error` (`detail.reason` = ErrorCode), `game.start` (`detail.bots`),
`room.start` / `room.clear` (`detail.room`, `detail.ms`), `channel.send`
(`detail.family`, `detail.role`, `detail.kind` = callout/text/face/stamp/clip
— the *kind*, never the content), `channel.refused` (`detail.family`,
`detail.reason`).

Stats gain a `game` block: `{ lobbiesOpen, gamesPlaying, playersConnected,
events: Record<string, number>, channelsByRole: Record<Role, Record<Family,
number>>, rssMb }`. The live counts come from a provider the socket module
registers on the shared stats (`setLiveProvider(fn)`), so the Astro page
never imports `src/net/`.

## 5. Task breakdown

### Task 11: Log game events and show the game live on `/stats`

**Files touched.** `src/lib/log.ts` (allowlist), `src/lib/gameLog.ts`
(+ test), `src/lib/stats.ts` (+ test), `src/net/attach.ts`, `src/net/game.ts`,
`src/pages/stats.astro`, `src/pages/stats.json.ts`, `spec/stats.test.ts`,
`spec/game-log.test.ts` (new), `CLAUDE.md` (logging section: game lines).

**Interfaces produced (exact).**

```ts
// src/lib/gameLog.ts
import type { Detail } from "./log.ts";
export type GameEvent =
  | "socket.open" | "socket.close" | "lobby.create" | "lobby.join" | "lobby.leave" | "lobby.error"
  | "game.start" | "room.start" | "room.clear" | "channel.send" | "channel.refused";
// later tasks widen GameEvent: "caught" (12), "bot.takeover" (17), "pause" (17), "voice.latency" (21), "run.saved" (18)
export interface GameLine { ts: string; kind: "game"; event: GameEvent; who: string | null; lobby: string | null; detail?: Detail }
export function describeGame(input: { event: GameEvent; who?: string | null; lobbyKey?: string | null; detail?: Record<string, unknown>; now?: number }): GameLine;
export function logGame(input: Parameters<typeof describeGame>[0]): void; // describeGame → sharedStats().recordGame → stdoutSink
export function lobbyKey(code: string, createdAt: number): string; // anon(`lobby:${code}:${createdAt}`)

// src/lib/stats.ts (added)
export interface LiveCounts { lobbiesOpen: number; gamesPlaying: number; playersConnected: number }
// createStats() result gains:
//   recordGame(line: GameLine): void
//   setLiveProvider(fn: () => LiveCounts): void
// StatsSnapshot gains:
//   game: LiveCounts & { events: Record<string, number>; channelsByRole: Record<string, Record<string, number>>; rssMb: number }
```

`LobbyState` gains `createdAt: number` (set in `createLobby`) so `lobbyKey`
is computable.

**Tests first (red).**
- `gameLog.test.ts`: `describeGame` drops non-allowlisted fields
  (`text`, `nickname`, `code`, `callout`, `clip`); `lobby` never equals or
  contains the code; `channel.send` keeps `family`, `role`, `kind` only.
- `stats.test.ts` (unit): `recordGame` counts events and channel use by role;
  `snapshot().game` merges the live provider's counts; without a provider the
  counts are 0.
- `spec/stats.test.ts`: key set now includes `game`; existing tests stay.
- `spec/game-log.test.ts` (sockets + `/stats.json`): creating a lobby and
  joining increments `game.events["lobby.create"]` and `["lobby.join"]`;
  `playersConnected` rises by 3 with three sockets and falls when they close
  (within 2 s); after a deaf player sends a callout with a secret-looking
  nickname (`NOSY-<uuid>`) and team name, neither string, nor the lobby code,
  nor the callout text appears in `/stats.json` or `/stats`; `rssMb` is a
  positive number.

**Implementation (green).** Per §4. `attach.ts` calls `logGame` at each event
point and registers the live provider at startup. `stats.astro` gains a "Right
now" section (lobbies, games, players, memory) and "Channels by role" table,
redrawn by the existing 2 s poll.

**Refactor.** If `stats.astro`'s inline script grows past ~80 lines, move it
to `src/client/statsView.ts`.

**Acceptance criteria.** Tests green. Running three local sessions through a
room and reading `pnpm start` stdout shows only `request` and `game` lines
with no chat text, nicknames or codes (grep for them).

**Depends on:** Task 9.

## 6. Phase Definition of Done

- [ ] Task 11 complete, tests passing
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start`, then `pnpm check` and `pnpm check:evidence` pass
- [ ] Deployed (ask first); `spec/game-log.test.ts` and `spec/stats.test.ts` green against fly.dev; `flyctl logs` shows `game` lines while a group plays
- [ ] Before the week 11 crit: the user rehearses narrating a game from `/stats` and `flyctl logs` alone, and drafts `reflections/crit-10.md`
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR34 | Task 11 |
| NFR resources (memory visible) | Task 11 |

## 8. Risks / open questions

None.
