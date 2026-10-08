# Sensory heist — Plan overview

- **Date:** 2026-10-08
- **Status:** Approved
- **Requirements confirmed by user:** yes — 2026-10-08 (spec `specs/2026-10-08-sensory-heist.md`)

## 0. How to use these plans

Files in the set:

- `plans/2026-10-08-sensory-heist-00-overview.md` (this file)
- `plans/2026-10-08-sensory-heist-01-pivot-lobbies.md` (Tasks 1–4)
- `plans/2026-10-08-sensory-heist-02-sim-one-room.md` (Tasks 5–8)
- `plans/2026-10-08-sensory-heist-03-channels.md` (Tasks 9–10)
- `plans/2026-10-08-sensory-heist-04-game-logging.md` (Task 11)
- `plans/2026-10-08-sensory-heist-05-hazards-rooms.md` (Tasks 12–14)
- `plans/2026-10-08-sensory-heist-06-bots-disconnects.md` (Tasks 15–17)
- `plans/2026-10-08-sensory-heist-07-results-polish.md` (Tasks 18–20)
- `plans/2026-10-08-sensory-heist-08-voice.md` (Tasks 21–22)

A session reads this overview plus exactly one phase file (`/execute-plan
plans/2026-10-08-sensory-heist-NN-….md`). Task numbers are global. A phase is
ticked in §5 when its phase Definition of Done is met. The spec is the source
of the requirements; the numbers in §2.1 are the spec's §2.1 numbers, so
"FR15" means the same thing in both documents.

## 1. Summary

Replace the shared-pantry app with a three-player browser co-op heist game in
which each player is missing a channel (Can't see, Can't hear, Can't speak).
The server runs a headless simulation per room and sends each player only
what their role can perceive; players coordinate through role-gated channels
(Say, Sound, Show) to hold three stations at once, dodge guards, cameras and
lasers, and clear three rooms. Bots fill empty seats; heist records persist
on a leaderboard. It is designed for the capstone showcase: many teams in one
room, often playing in person.

## 2. Requirements

### 2.1 Functional requirements

FR1–FR34 exactly as numbered in `specs/2026-10-08-sensory-heist.md` §2.1
(lobbies and people 1–5, real-life mode 6–7, roles and the heist 8–14,
perception 15, channels 16–23, bots 24–27, disconnects 28–29, results and
persistence 30–32, course-fixed 33–34). Read that section before any task; it
is the contract. This plan adds no requirements of its own beyond:

- **FR35 (pivot):** the pantry is archived at tag `archive/pantry-2026-10-08`
  (including the uncommitted phase-05a work, committed as WIP first) and
  removed from `main`; ADRs 0007–0010 govern (already accepted); `CLAUDE.md`
  describes the game.

### 2.2 Non-functional requirements

As spec §2.2: ~20 Hz server-authoritative simulation over WebSockets; lobby
changes in every open session within ~1 s; voice < 250 ms measured; phone
portrait (375×812) and desktop (1280×800) both work, keyboard complete; never
colour alone, AA contrast, reduced motion, flashing ≤ 3/s, captions for
anyone, high-contrast toggle; one 256 MB machine, ~10 concurrent lobbies;
only bundled outside assets are credited bluemoji faces and Pixabay clips.

### 2.3 Out of scope

As spec §2.3 (driving interlude, other themes, rooms beyond 3, drawing,
procedural rooms, level editor, team-vs-team modes, P2P voice, role abilities,
light theme, accounts/passkeys/email, persisting lobbies or games).

### 2.4 Assumptions

As spec §2.4. Plan-level additions, verified 2026-10-08:

- Node is v24.21.0 locally and `node:24-slim` in the Dockerfile; both run
  `.ts` files directly with type stripping, and the repo already imports with
  `.ts` extensions (`tsconfig.json` has `allowImportingTsExtensions: true`).
- `@astrojs/node` supports `mode: "middleware"`, exporting `handler` from the
  built `dist/server/entry.mjs`; Astro integrations get `astro:server:setup`
  with the Vite dev server (`server.httpServer`) for dev upgrades.
- The deployed `/data/app.db` holds only test pantry data; dropping its
  tables in a migration is acceptable (confirm with the user in Task 1 before
  the first deploy).

## 3. Shared context & conventions

- **Stack:** Astro 7 SSR (`@astrojs/node`), Preact islands, better-sqlite3 +
  Drizzle, Vitest 5 (projects `unit` = `src/**/*.test.ts`, `spec` =
  `spec/**/*.test.ts` against the running app), Playwright driving system
  Chrome (`spec/browser.ts`: `launch`, `openPage`, `PHONE`, `DESKTOP`,
  `horizontalOverflow`, `axeViolations`), Biome, TypeScript 6. New dependency:
  `ws` (+ `@types/ws`), justified by ADR 0007.
- **Commands:** `pnpm install && pnpm build && pnpm start` (from Task 2,
  `start` = `node server.ts`) serves `:8080`; `pnpm dev` hot-reloads;
  `pnpm test:unit`; `pnpm check` (typecheck, lint, all tests; needs the app
  running at `APP_URL`, default `http://localhost:8080`); `pnpm check:evidence`;
  `pnpm format`. From Task 5: `pnpm lint:rooms` (also inside `pnpm check`).
- **Layering (enforced by review, then by CLAUDE.md from Task 1):**
  - `src/game/` is pure: no DOM, no `ws`, no `node:` imports except in
    `src/game/rooms/load.ts` (reads files). Simulation, perception, channel
    rules, bots and rooms live here and run headless.
  - `src/net/` is the server side of the socket: lobby registry, game loop,
    routing. It imports `src/game/` and `src/lib/`, never Astro.
  - `src/client/` is browser-only: canvas renderer, input, audio, socket
    client. It imports `src/game/types.ts` and `src/net/protocol.ts` only.
  - Astro pages in `src/pages/` stay thin and never import `src/net/`
    (the socket server runs as a separate module instance; see §4.1).
- **Tests:** unit tests beside the code; promises to users in
  `spec/<area>.test.ts`; browser checks in `spec/layout/<area>.test.ts`, one
  file per area, each under 1000 lines (`spec/suite-size.test.ts`). Socket
  specs use the helper `spec/ws.ts` (Task 2).
- **Logging:** one JSON line per request via `src/middleware.ts`; from Task 11
  also one line per game event. Only fields in `redact`'s allowlist
  (`src/lib/log.ts`) may appear; never chat text, voice, nicknames or team
  names.
- **Commits:** one per task once `pnpm check` is green; messages say what and
  why. Human-review tasks are reviewed on a local build and committed only
  after the user accepts. `flyctl deploy` and `git push` ask first.
- **Corrections:** a user redirect during execution goes into `CLAUDE.md` or
  `spec/` and `PROCESS_LOG.md` (CLAUDE.md "Corrections go into the harness").

## 4. Shared design

### 4.1 Process shape

```
node server.ts ──┬─ http.createServer(handler from dist/server/entry.mjs)   pages, /readme/, /stats
                 └─ server.on("upgrade", path "/ws") → src/net/attach.ts     lobbies, games, voice
```

`server.ts` runs under Node type stripping and imports `src/net/attach.ts`
directly, so the socket code is a different module instance from the Astro
bundle. Anything both sides must share lives on `globalThis` behind one
accessor: `sharedStats()` (Task 2, `src/lib/stats.ts`). Pages read lobbies
only over the socket, never by import. In `pnpm dev`, the integration in
`src/net/devSocket.ts` (Task 2) attaches the same handler to Vite's
`server.httpServer` via `server.ssrLoadModule("/src/net/attach.ts")`.

### 4.2 Shared types (verbatim; `src/game/types.ts`, Task 3)

```ts
export type Role = "blind" | "deaf" | "mute";
export const ROLES: readonly Role[] = ["blind", "deaf", "mute"];
export const ROLE_LABEL: Record<Role, string> = {
  blind: "Can't see",
  deaf: "Can't hear",
  mute: "Can't speak",
};
export type Family = "say" | "sound" | "show";
export const CHANNEL_RULES: Record<Family, { send: readonly Role[]; receive: readonly Role[] }> = {
  say: { send: ["blind", "deaf"], receive: ["blind", "mute"] },
  sound: { send: ["blind", "deaf", "mute"], receive: ["blind", "mute"] },
  show: { send: ["blind", "deaf", "mute"], receive: ["deaf", "mute"] },
};
export interface Vec {
  x: number; // tiles, may be fractional
  y: number;
}
export type Seat = 0 | 1 | 2;
export interface PlayerInput {
  seq: number; // client counter, echoed in views for reconciliation
  move: Vec; // each component in [-1, 1]
  act: boolean; // held
}
```

### 4.3 Socket protocol (`src/net/protocol.ts`)

JSON text frames `{ t: string, ... }`; binary frames are voice only (Task 21).
The connection is identified by the `heist_device` cookie sent with the
upgrade (Task 2); a connection without one is refused with HTTP 401.

| Direction | `t` | Body | Introduced |
| --- | --- | --- | --- |
| S→C | `welcome` | `{ who: string }` (8 hex of the token hash) | Task 2 |
| C→S | `ping` / S→C `pong` | `{ at: number }` | Task 2 |
| C→S | `lobbies.watch` | — | Task 3 |
| S→C | `lobbies` | `{ list: LobbySummary[] }` | Task 3 |
| C→S | `lobby.create` | `{ nickname: string }` | Task 3 |
| C→S | `lobby.join` | `{ code: string; nickname: string; as: "player" \| "spectator" }` | Task 3 |
| C→S | `lobby.leave` | — | Task 3 |
| C→S | `lobby.team` | `{ name: string }` (host) | Task 3 |
| S→C | `lobby` | `{ lobby: LobbyState; you: { seat: Seat \| null; host: boolean } }` | Task 3 |
| S→C | `error` | `{ code: ErrorCode; message: string }` | Task 3 |
| C→S | `lobby.start` | — (host) | Task 7 |
| S→C | `reveal` | `{ room: string; index: number; role: Role; crew: CrewMember[] }` | Task 7 (rotation Task 14) |
| C→S | `ready` | — | Task 7 |
| C→S | `input` | `PlayerInput` | Task 7 |
| S→C | `view` | `{ view: RoleView }` | Task 7 |
| C→S | `say` | `{ kind: "callout"; callout: Callout } \| { kind: "text"; text: string }` | Task 9 |
| C→S | `sound` | `{ clip: string }` | Task 9 |
| C→S | `show` | `{ kind: "face" \| "stamp"; id: string }` | Task 9 |
| S→C | `msg` | `ChannelMessage` (filtered per receiver) | Task 9 |
| S→C | `cooldown` | `{ family: Family; until: number }` | Task 9 |
| S→C | `cleared` | `{ room: string; ms: number; loot: number; lootTotal: number }` | Task 14 |
| C→S | `next` | — (host, after `cleared`) | Task 14 |
| S→C | `pause` / `resume` | `{ waitingFor: string; deadline: number }` / — | Task 17 |
| C→S | `host.choice` | `{ choice: "bot" \| "lobby" }` | Task 17 |
| S→C | `heist` | `{ ms: number; loot: number; lootTotal: number; rank: number }` | Task 18 |
| C→S | `lobby.settings` | `{ settings: LobbySettings }` (host) | Task 19 |
| C→S | `spectate` | `{ seat: Seat }` | Task 20 |
| C→S | `voice.stats` | `{ p50: number; p95: number; dropped: number }` | Task 21 |
| C↔S | binary | voice frames (phase 08 §4) | Task 21 |

`LobbySummary`, `LobbyState`, `ErrorCode` are defined verbatim in phase 01
Task 3; `RoleView` in phase 02 Task 7; `Callout`, `ChannelMessage` in phase 03
Task 9; `LobbySettings` in phase 07 Task 19. Each later phase copies the ones
it uses into its "Interfaces from earlier phases".

### 4.4 Visual tokens

Spec §4.1 is the UI contract (tokens table, role frame, receiver arrows,
wireframes). `src/styles/tokens.css` (Task 4) holds the CSS tokens;
`src/client/tokens.ts` (Task 8) mirrors the canvas colours. Code never
hard-codes a colour.

## 5. Phases

| Phase | File | Tasks | Needs | Ends with | Done |
| --- | --- | --- | --- | --- | --- |
| 01 | `…-01-pivot-lobbies.md` | 1–4 | — | Pantry archived and gone; socket server live; create/join/seats live in ~1 s across sessions; home + lobby UI at both viewports (**Human review**, Task 4); deployed | [x] |
| 02 | `…-02-sim-one-room.md` | 5–8 | 01 | Loading Dock playable by 3 people with per-role views; perception spec green; deployed — **week 10 crit (real-time)** (**Human review**, Task 8) | [x] (crit-9 write-up still owed by the user) |
| 03 | `…-03-channels.md` | 9–10 | 02 | Say/Sound/Show with server-enforced rules and cooldowns; TTS to Can't see; captions (**Human review**, Task 10) | [x] |
| 04 | `…-04-game-logging.md` | 11 | 03 | Game events logged and live on `/stats`; deployed — **week 11 crit** | [x] (`flyctl logs` check not run: local token 401) |
| 05 | `…-05-hazards-rooms.md` | 12–14 | 04 | Guards, cameras, lasers, checkpoints, loot, flips, audio cues; rooms 2–3; role rotation (**Human review**, Task 14) | [x] |
| 06 | `…-06-bots-disconnects.md` | 15–17 | 05 | Bots fill seats and clear every room; disconnect pause and rejoin | [ ] |
| 07 | `…-07-results-polish.md` | 18–20 | 06 | Leaderboard persisted; real-life wizard and settings; spectators (**Human review**, Task 19) | [ ] |
| 08 | `…-08-voice.md` | 21–22 | 07 | Server-relayed voice with latency logging (**Human review**, Task 22) | [ ] |

Phase 04 deliberately precedes 05 so the week 11 crit is safe even if rooms
slip. Each phase ends committed, green and deployed.

## 6. Feature-level Definition of Done

- [ ] Every phase in §5 is ticked, and every task is complete with tests passing
- [ ] `pnpm test:unit` passes
- [ ] `pnpm check` and `pnpm check:evidence` pass against the local build and against the deployed `*.fly.dev` URL (`APP_URL=https://<app>.fly.dev pnpm check`)
- [ ] Manually verified: the spec's Phase 4 demo script, steps 1–9, on the deployed app with one phone and two desktops
- [ ] Every requirement in §2 is covered — see §7
- [ ] Every `Human review:` task explicitly accepted by the user
- [ ] No item remains in §8

## 7. Requirements coverage check

| Requirement | Covered by |
| --- | --- |
| FR1 device + nickname | Task 2 (cookie), Task 3 (nickname) |
| FR2 home: create, join by code, open list | Task 3, Task 4 |
| FR3 seats, spectators, live within ~1 s | Task 3 (seats/spectators/4th joiner), Task 20 (spectator view) |
| FR4 host team name, Start fills bots | Task 3 (team name), Task 7 (start), Task 16 (bots fill) |
| FR5 named error states | Task 3 (codes), Task 4 (UI), Task 8 (reconnecting) |
| FR6 real-life wizard presets | Task 19 |
| FR7 honour system stated | Task 19 (wizard copy) |
| FR8 3 rooms, rotation, reveal, Ready | Task 7 (reveal/ready), Task 14 (rooms 2–3, rotation) |
| FR9 no abilities | Task 6 (any player acts on anything; unit test) |
| FR10 top-down, three-station beat | Task 5 (linter), Task 6 (stations) |
| FR11 environment flips | Task 13 |
| FR12 guards, cameras, lasers, checkpoints | Task 12 |
| FR13 loot, exit clears | Task 6 (exit), Task 12 (loot) |
| FR14 cue windows ≥ 2 s | Task 12 (linter rule) |
| FR15 per-role perception | Task 7 (filter + spec), Task 13 (audio cues, flips) |
| FR16 channel table | Task 9 |
| FR17 callout grid | Task 9 (protocol), Task 10 (UI) |
| FR18 TTS to Can't see | Task 10 |
| FR19 voice relay | Tasks 21–22 |
| FR20 faces and stamps | Task 9, Task 10 |
| FR21 cooldowns | Task 9 |
| FR22 blind may send Show | Task 9 (unit test) |
| FR23 mic denied | Task 22 |
| FR24–26 bots | Task 15 |
| FR27 bots clear every room (spec) | Task 16 |
| FR28–29 disconnect | Task 17 |
| FR30 results screens | Task 14 (room cleared), Task 18 (heist complete) |
| FR31 records persist | Task 18 |
| FR32 leaderboard | Task 18 |
| FR33 `/` and `/readme/` | Task 1 (kept, invariants stay green) |
| FR34 logging + live view | Task 11 |
| FR35 pivot | Task 1 |
| NFR real time / 20 Hz | Task 7 |
| NFR viewports + keyboard | Task 4, Task 8, Task 10 |
| NFR accessibility | Task 4 (axe, tokens), Task 8 (reduced motion, frame), Task 12 (flash cap), Task 19 (high contrast, captions) |
| NFR resources | Task 11 (memory on `/stats`), Task 21 (voice bandwidth) |
| NFR assets credited | Task 10 (CREDITS.md + licence check) |

## 8. Risks / open questions

None open. Accepted risks (spec §6): voice latency on poor Wi-Fi; in-person
speech is an honour system; the 45 s pause. Schedule risk is accepted and
handled by order: phases 01–02 must land before the week 10 crit; if they
can't, phase 02 ships Loading Dock with stations only and Task 8's polish
moves to phase 03, recorded in this file.
