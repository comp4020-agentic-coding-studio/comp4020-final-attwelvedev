# Sensory heist — Phase 01: Pivot and lobbies

- **Date:** 2026-10-08
- **Status:** Approved
- **Requirements confirmed by user:** yes — 2026-10-08
- **Part of:** `plans/2026-10-08-sensory-heist-00-overview.md`. Read it first,
  especially §3 (conventions, layering), §4.1 (process shape), §4.2 (shared
  types) and §4.3 (protocol table).
- **Depends on phases:** none.

## 1. Summary

The pantry is archived at a tag and removed from `main`; the harness, logging,
`/stats`, `/readme/` and the check scripts survive. A custom `server.ts` serves
the Astro handler and a WebSocket endpoint at `/ws`. Players get an anonymous
device cookie, create and join lobbies by a 4-letter code, see seats and the
open-lobby list change live, and the home and lobby screens are built at both
viewports. Ends deployed.

## 2. Requirements (this phase)

### 2.1 Functional

- FR35 (pivot) — fully.
- FR1 — device cookie and nickname.
- FR2 — create, join by code, open-lobby list.
- FR3 — seats, spectators, 4th joiner choice, live within ~1 s (spectator
  *view* is Task 20).
- FR4 — team name (Start and bots are later).
- FR5 — lobby not found, lobby full, server full (reconnecting is Task 8).
- FR33 — `/` and `/readme/` stay green throughout.

### 2.2 Non-functional

Lobby updates reach other sessions within 1 s (asserted in spec). Home and
lobby pages: no horizontal overflow and no axe violations at `PHONE` and
`DESKTOP`; keyboard operable; Archivo font self-hosted ≤ 45 KB (existing
`spec/font.test.ts` bound).

### 2.3 Out of scope for this phase

Starting a game (Task 7), settings and the real-life wizard (Task 19),
spectating a game (Task 20), game logging (Task 11), leaderboard (Task 18).

### 2.4 Assumptions

See overview §2.4. Phase-specific: the user confirms dropping the deployed
pantry tables before the first deploy of this phase (Task 1 step).

## 3. Existing code context (verified 2026-10-08)

**Kept as-is:** `src/lib/log.ts` (`redact`, `logDetail`, `stdoutSink`,
`withRequestContext`, `inRequest`, `newRequestContext`), `src/lib/db.ts`
(`openDb(path)`, `db`, migrations from `./drizzle` at open),
`src/lib/cookie.ts` (`deviceCookieOptions(url: URL, forwardedProto: string | null)`),
`src/lib/throttle.ts` (`failureThrottle`, `joinThrottle`, `throttleKey`),
`src/pages/readme.astro`, `src/pages/stats.json.ts`, `scripts/check-evidence.ts`,
`spec/invariants.test.ts`, `spec/global-setup.ts` (both fixed by the course;
a hook blocks edits), `spec/readme.test.ts`, `spec/font.test.ts`,
`spec/suite-size.test.ts`, `spec/http.ts`, `spec/browser.ts`, `harness/`.

**Kept but changed:**

- `src/lib/session.ts`: `export const DEVICE_COOKIE = "pantry_device";`,
  `newDeviceToken(): string`, `hashToken(token: string): string`,
  `newLinkToken(): string`. Becomes `DEVICE_COOKIE = "heist_device"`;
  `newLinkToken` deleted.
- `src/middleware.ts`: resolves `context.locals.session = token ?
  sessionForToken(db, token) : null` then writes one `describeRequest` line
  and calls `stats.record(line)`. Pantry session lookup goes; the middleware
  instead **issues** the cookie on any `GET` without one.
- `src/lib/requestLog.ts`: `RequestLine` has `who` and `hh`; `ACTIONS` is a
  pantry table; `describeRequest({ method, route, status, ms, token, session,
  detail, error, now })`; `anon(value)`. `hh` and `session` are removed;
  `who` becomes `token ? anon(token) : null`.
- `src/lib/stats.ts`: `createStats(since?)` returning `{ record(line: RequestLine), snapshot(now?) }`
  and `export const stats = createStats();`.
- `src/lib/http.ts`: `json(body, status)` is kept; `withSession`, `failure`,
  `cleanRid`, `wantsJson` and the `Session` import go. `src/lib/errors.ts` is
  deleted (only `withSession` used it).
- `src/env.d.ts`: `App.Locals` lists pantry fields; becomes
  `{ who: string | null }`.
- `src/layouts/Base.astro`: pantry nav and household brand; rewritten in Task 4.
- `src/pages/stats.astro`: kept; copy changes ("no names or food" →
  "no names or messages").
- `spec/stats.test.ts`: posts `/households` and `/items`; rewritten to use
  page views (`GET /`, `GET /leaderboard` later) and a socket action.
- `astro.config.ts`: `adapter: node({ mode: "standalone" })`.
- `Dockerfile`: runtime copies `node_modules`, `dist`, `drizzle`; `CMD ["node", "./dist/server/entry.mjs"]`.
- `package.json` `start`: `node ./dist/server/entry.mjs`.

**Deleted (pantry):** every other file in `src/components/`, `src/lib/`,
`src/pages/` (except `index.astro`, `readme.astro`, `stats.astro`,
`stats.json.ts`), `src/data/`, `src/styles/offers.css`, `panel.css`,
`pantry.css`, `tape.css`; `scripts/build-foodkeeper.ts`,
`scripts/guess-sample.ts`, `scripts/data/`; every `spec/` file not listed as
kept, and `spec/layout/*`; `src/lib/migrations.test.ts` (it tests pantry
migrations). `specs/` and `plans/` pantry documents stay as history.

**Uncommitted at plan time:** `plans/2026-10-06-shared-pantry-05a-pantry-view.md`,
`spec/items.ts`, `src/components/ItemRow.tsx`, `OfferSheet.tsx`,
`PantryList.tsx`, `pantryState.ts` (+ test), `pantryView.ts` (+ test),
`src/styles/pantry.css`.
Also untracked at execution time (added 2026-10-08 after the Phase 1 review;
user approved including them in the WIP commit): `src/components/CountStepper.tsx`,
`EstimateAttribution.tsx`, `ExpiryPicker.tsx`, `FillSlider.tsx`, `ItemPanel.tsx`,
`MeasureTypeSwitch.tsx`, `exactAmount.ts` (+ test), `itemWrites.ts` (+ test),
and `spec/layout/pantry-panel.test.ts`. `spec/http.ts` also gets a one-word
comment fix ("household" → "device") so the Task 1 grep criterion holds.
`spec/README.md` is kept. In dev the port is 8080 (`astro.config.ts`), not 4321.

### Interfaces from earlier phases (exact)

None.

## 4. Approach

**Archive.** Commit the WIP as is, tag it, then delete in one commit. The
history stays on `main`, so every SHA cited in `PROCESS.md`/`PROCESS_LOG.md`
still resolves for `pnpm check:evidence`.

**Schema reset.** `src/lib/schema.ts` becomes empty of pantry tables (the
`runs` table arrives in Task 18). `pnpm db:generate` emits a migration that
drops them. Older migrations stay in `drizzle/` because Drizzle replays the
journal.

**Server shape** (overview §4.1). `astro.config.ts` switches to
`mode: "middleware"` and adds the integration from `src/net/devSocket.ts`.
`server.ts` at the repo root:

```ts
// server.ts — production entry (Node type stripping)
import { createServer } from "node:http";
import { handler } from "./dist/server/entry.mjs";
import { attachSockets } from "./src/net/attach.ts";
const server = createServer((req, res) => handler(req, res));
attachSockets(server);
server.listen(Number(process.env.PORT ?? 8080), process.env.HOST ?? "0.0.0.0");
```

Static assets: in middleware mode the handler serves `dist/client` assets
itself (`@astrojs/node` `serve-static`); Task 2 verifies `/_astro/*` and the
font answer 200 with the long cache header (`spec/font.test.ts`).

**Lobby codes.** 4 letters from `ABCDEFGHJKMNPQRSTUVWXYZ` (no I, L, O; 23⁴ ≈
280k codes); retried until free among live lobbies. Failed joins go through
`joinThrottle` keyed by device hash.

**Lobby registry** is in memory in the socket module (`src/net/lobbies.ts`),
pure enough to unit-test without sockets: functions take the registry and
return the lobbies whose state changed; `attach.ts` broadcasts. A lobby with
no connected humans for 10 minutes is removed.

## 5. Task breakdown

### Task 1: Archive the pantry, remove it from `main`, reset the harness text

**Status:** done — archive `a53b516` (tag `archive/pantry-2026-10-08`), docs `22bbaef`, removal `463b7b6`. README.md prose is the user's to write.

**Description.** Preserve the pantry at a tag, delete it from `main`, and
leave a green, minimal app (`/`, `/readme/`, `/stats`) that the game builds
on. Rewrite the pantry-specific parts of `CLAUDE.md`. Log the pivot.

**Files touched.** Deleted files per §3. `src/lib/session.ts`,
`src/middleware.ts`, `src/lib/requestLog.ts` (+ test), `src/lib/http.ts`,
`src/env.d.ts`, `src/lib/schema.ts`, `drizzle/0008_*.sql` (generated),
`src/pages/index.astro` (placeholder: an `<h1>` with the working title and a
link to `/readme/`), `src/layouts/Base.astro` (strip the pantry nav and
session brand only), `src/pages/stats.astro` (copy), `spec/stats.test.ts`,
`CLAUDE.md`, `README.md`, `PROCESS_LOG.md`.

**Steps.**
1. Ask the user to confirm (a) committing the uncommitted files as WIP and
   (b) that dropping the deployed pantry tables is fine. Stop if not.
2. Commit **only the pantry WIP paths** listed in §3 "Uncommitted at plan
   time" (`git add <those paths>`), message "WIP: pantry phase 05a, abandoned
   at the pivot to the sensory heist game". `git tag archive/pantry-2026-10-08`
   on that commit. Then commit the pivot's documents separately: the new spec
   `specs/2026-10-08-sensory-heist.md`, ADRs 0007–0010 and the status lines on
   0002–0006, the `doc/prompts/` drafts (DESIGN.md, LEVEL_FORMAT.md), and these `plans/2026-10-08-sensory-heist-*.md` files ("Spec,
   ADRs and plan for the sensory heist pivot"). Ask before `git push --tags`.
3. Delete the pantry files; change the kept files as §3 says; regenerate the
   migration.
4. `CLAUDE.md`: replace "Shape of the app", "Live changes" and "Item values
   are estimates" with game invariants: the layering rules from overview §3;
   "the server sends each client only what its role perceives (ADR 0007);
   never add a field to a view or message without checking it against the
   role tables in `src/game/types.ts`"; "rooms are linted (`pnpm lint:rooms`)
   and must be cleared by bots"; the persistence line (ADR 0009); the run
   command (`node server.ts` from Task 2). Keep every "Working method"
   section. Update the stale `.ts` names (`offerEvents`, `itemEvents`) out.
5. `README.md`: replace with the user's headings only (`# <working title>`,
   `## What good means here`, `## What I read`, `## What I chose not to build`,
   `## The pantry, archived`) and one line under the last linking the tag.
   **The user writes the prose** (course advice); the agent writes no
   argument text.
6. Append a `PROCESS_LOG.md` entry "2026-10-08 — Pivoting from the pantry to
   the sensory heist" citing the archive commit and the deletion commit: why
   (co-presence, third food app, domain friction), what carried over (the
   harness), how it was decided (spec + ADRs 0007–0010).

**Tests first (red).**
- `src/lib/requestLog.test.ts`: rewrite against the new `describeRequest`
  input (no `session`): "who is 8 hex of the token hash when a token is
  present", "who is null without a token", "detail is redacted", "an error
  becomes err with the class name only". Red until `requestLog.ts` changes.
- `spec/stats.test.ts`: "counts what people do" now does `GET /` twice from
  a client and asserts `actions["view.home"]` grew and a `recent` row has an
  8-hex `who`; "shows no name or message" sends a page request with a
  `?nickname=SECRET-…` query and asserts the secret never appears in
  `/stats.json` or `/stats` (routes are patterns, so queries never log).

**Implementation (green).** As steps 3–5. `ACTIONS` becomes
`{ "GET /": "view.home", "GET /readme": "view.readme", "GET /lobby/[code]": "view.lobby", "GET /leaderboard": "view.leaderboard" }`.
The middleware sets `context.locals.who` and, on a `GET` with no cookie,
`context.cookies.set(DEVICE_COOKIE, newDeviceToken(), deviceCookieOptions(context.url, context.request.headers.get("x-forwarded-proto")))`
before `next()`.

**Refactor.** Remove now-unused exports flagged by Biome/TypeScript.

**Acceptance criteria.**
- `git tag --list 'archive/*'` shows the tag on a commit containing
  `src/components/PantryList.tsx`.
- `pnpm build && pnpm start` then `pnpm check` is green; `pnpm check:evidence`
  is green.
- `grep -ri "pantry\|household" src spec` finds nothing except
  `README.md`'s archive line (which is outside `src`/`spec`).
- A first `GET /` without cookies receives `Set-Cookie: heist_device=…; HttpOnly`.

**Depends on:** none.

### Task 2: Serve WebSockets at `/ws` from a custom server, in prod and dev

**Description.** Run the Astro handler inside our own Node server and attach
a `ws` server at `/ws` that identifies the device from its cookie, answers
`welcome` and `ping`, and shares stats with the pages.

**Files touched.** `package.json` (add `ws`, `@types/ws`; `start` →
`node server.ts`), `astro.config.ts`, `server.ts` (new),
`src/net/attach.ts` (new), `src/net/devSocket.ts` (new),
`src/net/protocol.ts` (new), `src/lib/stats.ts` (`sharedStats`),
`src/middleware.ts` and `src/pages/stats*.{astro,ts}` (use `sharedStats()`),
`Dockerfile` (copy `server.ts` and `src/` into the runtime stage; `CMD
["node", "server.ts"]`; `rooms/` is added by Task 5), `tsconfig.json` (`"erasableSyntaxOnly": true`),
`spec/ws.ts` (new helper), `spec/ws.test.ts` (new), `CLAUDE.md` run line,
a new `doc/adr` is **not** needed (ADR 0007 covers `ws`).

**Interfaces produced (exact).**

```ts
// src/net/attach.ts
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
export function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void; // ignores paths other than /ws
export function attachSockets(server: Server): void; // server.on("upgrade", handleUpgrade)

// src/net/devSocket.ts
import type { AstroIntegration } from "astro";
export default function devSocket(): AstroIntegration; // name "dev-socket"

// src/lib/stats.ts (added)
export function sharedStats(): ReturnType<typeof createStats>; // one per process, on globalThis

// src/net/protocol.ts (this task's part)
export type ClientMsg = { t: "ping"; at: number }; // widened by later tasks
export type ServerMsg = { t: "welcome"; who: string } | { t: "pong"; at: number }; // widened by later tasks
export function parseClientMsg(raw: string): ClientMsg | null; // null for malformed or unknown

// spec/ws.ts
export interface Socket {
  send(msg: unknown): void;
  next<T = { t: string }>(t: string, timeoutMs?: number): Promise<T>; // resolves on the next message of type t (default 2000 ms)
  close(): Promise<void>;
}
export async function connect(baseUrl: string, cookie?: string): Promise<Socket>; // cookie defaults to a fresh one fetched via GET /
```

**Tests first (red).**
- `src/net/protocol.test.ts`: `parseClientMsg` returns null for non-JSON,
  non-object, unknown `t`, and over-long frames (> 8 KB); returns the message
  for `{ t: "ping", at: 1 }`.
- `src/lib/stats.test.ts`: `sharedStats()` returns the same object twice.
- `spec/ws.test.ts`: "an upgrade without the device cookie is refused";
  "a connection with a cookie gets welcome with 8 hex who"; "ping answers pong
  with the same at within 1 s"; "a malformed frame doesn't close the socket
  (a later ping still answers)".

**Implementation (green).** `attachSockets` creates `new WebSocketServer({
noServer: true, maxPayload: 64 * 1024 })`, handles `server.on("upgrade")`
only for `/ws`, parses the cookie header for `heist_device`, rejects with
`HTTP/1.1 401` when absent, then wires messages through `parseClientMsg`.
Heartbeat: server pings every 15 s and terminates sockets that miss two.
`devSocket()` uses `astro:server:setup` → `server.httpServer?.on("upgrade",
…)` after `const { handleUpgrade } = await server.ssrLoadModule("/src/net/attach.ts")`,
so dev and prod share one upgrade path.

**Refactor.** None expected.

**Acceptance criteria.**
- `pnpm build && pnpm start`: `/`, `/readme/`, `/stats`, the font and
  `/_astro/*` assets answer as before (`spec/font.test.ts`,
  `spec/invariants.test.ts`, `spec/readme.test.ts` green).
- `spec/ws.test.ts` green against `pnpm start` and against `pnpm dev`
  (run `APP_URL=http://localhost:4321 pnpm vitest run spec/ws.test.ts` with dev
  on its port, or 8080 if configured).
- `docker build .` succeeds and the container answers `/ws` (CI path).

**Depends on:** Task 1.

### Task 3: Lobbies: create, join by code, seats, spectators, open list

**Description.** The in-memory lobby registry and its protocol messages.

**Files touched.** `src/game/types.ts` (new; overview §4.2 verbatim),
`src/net/lobbies.ts` (+ `lobbies.test.ts`), `src/net/codes.ts`
(+ test), `src/net/protocol.ts`, `src/net/attach.ts`,
`spec/lobby.test.ts` (new).

**Interfaces produced (exact).**

```ts
// src/net/lobbies.ts
import type { Seat } from "../game/types.ts";
export type LobbyPhase = "open" | "playing" | "done";
export interface SeatState {
  who: string | null; // device hash (8 hex) or null when empty
  nickname: string | null;
  connected: boolean;
  bot: boolean;
}
export interface LobbyState {
  code: string;
  teamName: string;
  host: string; // device hash
  phase: LobbyPhase;
  seats: [SeatState, SeatState, SeatState];
  spectators: { who: string; nickname: string }[];
}
export interface LobbySummary {
  code: string;
  teamName: string;
  filled: number; // humans seated, 0–3
  phase: LobbyPhase;
}
export type ErrorCode =
  | "lobby-not-found"
  | "lobby-full"
  | "server-full"
  | "bad-nickname"
  | "bad-team-name"
  | "not-host"
  | "throttled";
export class LobbyError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string); // assigns this.code explicitly (erasableSyntaxOnly forbids parameter properties)
}
export interface Registry {
  lobbies: Map<string, LobbyState>;
  byDevice: Map<string, string>; // device hash → lobby code
}
export const MAX_LOBBIES = 40;
export function createRegistry(): Registry;
export function createLobby(reg: Registry, who: string, nickname: string): LobbyState;
export function joinLobby(reg: Registry, code: string, who: string, nickname: string, as: "player" | "spectator"): LobbyState;
export function leaveLobby(reg: Registry, who: string): LobbyState | null; // the lobby that changed, if any
export function setTeamName(reg: Registry, who: string, name: string): LobbyState;
export function setConnected(reg: Registry, who: string, connected: boolean): LobbyState | null;
export function openLobbies(reg: Registry): LobbySummary[]; // phase "open" and filled < 3, newest first
export function cleanNickname(raw: string): string; // trims, collapses spaces, ≤ 16 chars; throws LobbyError("bad-nickname") if empty
```

**Tests first (red).** `src/net/codes.test.ts`: codes are 4 chars from the
alphabet, never contain I/L/O, and `normaliseLobbyCode(" k7mq ")` → `"K7MQ"`
(rejects anything not 4 alphabet chars). `src/net/lobbies.test.ts`:
- create seats the creator in seat 0 as host, team name defaults to
  "Team <code>";
- join fills seats 1 and 2 in order; a 4th `player` join throws
  `lobby-full`; a `spectator` join always succeeds;
- the same device joining again returns the same seat (rejoin, FR28 basis);
- a device in one lobby that creates/joins another leaves the first;
- host leaving passes host to the next seated human; last human leaving
  removes the lobby;
- `setTeamName` by a non-host throws `not-host`; names are trimmed to 24
  chars, empty → `bad-team-name`;
- creating the 41st lobby throws `server-full`;
- `openLobbies` excludes full and playing lobbies.

`spec/lobby.test.ts` (three sockets via `spec/ws.ts`):
- "a seat filled in one session shows in the others within 1 s" (A creates,
  B and C join; A receives `lobby` with 3 filled seats; measure ≤ 1000 ms);
- "a watcher of the open list sees a new lobby within 1 s and sees it vanish
  when full";
- "a wrong code answers error lobby-not-found"; "a fourth player answers
  lobby-full"; "a fourth spectator is listed";
- "ten wrong codes from one device are throttled" (`throttled`).

**Implementation (green).** Registry per §4; `attach.ts` keeps
`Map<string, Set<WebSocket>>` of sockets per device and a set of list
watchers; after every change it sends `lobby` to every socket of every member
and spectator of the changed lobby, and `lobbies` to watchers.

**Refactor.** Pull the broadcast into `src/net/broadcast.ts` if `attach.ts`
passes ~200 lines.

**Acceptance criteria.** Unit and spec tests above green. No lobby state is
imported by any file under `src/pages/`.

**Depends on:** Task 2.

### Task 4: Home and lobby screens, tokens and font, at both viewports

**Description.** Build the home and lobby UI from spec §4.1 (wireframes
"Home" and "Lobby", and the "Loading / … / not found" states) as Preact
islands talking to the socket, with the new tokens and Archivo.

**Files touched.** `src/styles/tokens.css` (rewritten to spec §4.1 tokens),
`src/styles/pages.css`, `src/styles/shell.css`, `src/layouts/Base.astro`,
`src/assets/fonts/` (Archivo subset woff2 + `OFL.txt` + `FONT.md`; delete
Atkinson), `scripts/build-font.ts` (Archivo, width + weight axes, Latin),
`src/pages/index.astro`, `src/pages/lobby/[code].astro` (new),
`src/client/socket.ts` (new: reconnecting client), `src/components/Home.tsx`,
`src/components/Lobby.tsx` (new), `spec/layout/home.test.ts`,
`spec/layout/lobby.test.ts` (new).

**Interfaces produced (exact).**

```ts
// src/client/socket.ts
import type { ClientMsg, ServerMsg } from "../net/protocol.ts";
export type ConnectionState = "connecting" | "live" | "weak" | "offline";
export interface GameSocket {
  send(msg: ClientMsg): void;
  on<T extends ServerMsg["t"]>(t: T, fn: (msg: Extract<ServerMsg, { t: T }>) => void): () => void;
  onState(fn: (state: ConnectionState, rttMs: number | null) => void): () => void;
  close(): void;
}
export function openSocket(url?: string): GameSocket; // default `${ws|wss}://${location.host}/ws`; reconnects with backoff 0.5 s → 5 s; pings every 2 s; "weak" when RTT > 250 ms
```

**Tests first (red).** `src/client/socket.test.ts` (unit, with a fake
WebSocket class injected): reconnect backoff sequence; state goes
`connecting → live → offline → connecting`; RTT > 250 ms reports `weak`.
`spec/layout/home.test.ts` and `spec/layout/lobby.test.ts`: at `PHONE` and
`DESKTOP`, zero `horizontalOverflow`, zero `axeViolations`; keyboard-only:
Tab reaches "Create lobby", Enter creates and lands on `/lobby/XXXX` showing
the code; a second browser context types the code and Join, and the first
page shows the second seat filled within 1 s; a wrong code shows "No lobby
with code ABCD. Check the letters." inline.

**Implementation (green).** Per spec §4.1. Code display uses the code size
`clamp(72px, 22vw, 160px)`, Archivo expanded black. "Show QR" uses the
existing `qrcode-generator` dependency. Seats show seat shapes, not roles.
Copy is sentence case.

**Refactor.** Delete unused tokens and styles.

**Acceptance criteria.** Layout specs green; `spec/font.test.ts` green with
the new font (≤ 45 KB, long cache); `/readme/` still renders through `Base`.

**Human review:** on a local build (`pnpm build && pnpm start`), the user
looks at `/` and `/lobby/<code>` on a phone (or 375px devtools) and a desktop
window, with a second session joining. Pass = the code is readable from
across a room, the open list updates without reload, errors read as written
in spec §4.1, and nothing looks like the pantry.

**Depends on:** Task 3.

## 6. Phase Definition of Done

- [ ] Tasks 1–4 complete, tests passing, Task 4 accepted by the user
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start`, then `pnpm check` and `pnpm check:evidence` pass
- [ ] Deployed (ask first): `flyctl deploy --remote-only --ha=false -a <app>`; then `APP_URL=https://<app>.fly.dev pnpm vitest run --project spec` is green, including `spec/ws.test.ts` and `spec/lobby.test.ts` (proves Fly's proxy passes WebSocket upgrades and the 1 s bound holds from Sydney)
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR35 | Task 1 |
| FR1 | Task 1 (cookie issued), Task 3 (nickname) |
| FR2 | Task 3, Task 4 |
| FR3 (seats, spectators, live) | Task 3, Task 4 |
| FR4 (team name) | Task 3 |
| FR5 (not found, full, server full) | Task 3, Task 4 |
| FR33 | Task 1, Task 2 |

## 8. Risks / open questions

None.
