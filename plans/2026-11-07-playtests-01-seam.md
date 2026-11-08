# Playtests — Phase 01: proxy proof, autopilot seam and page hook

- **Date:** 2026-11-07
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-07
- **Part of:** `plans/2026-11-07-playtests-00-overview.md`. Read it first: §2 (requirements), §3
  (conventions, break checks), §4.1 (wire contract) and §4.2 (page hook) are produced here.
- **Depends on phases:** none.

## 1. Summary

Proves the course proxy takes images (a gate: stop if not), then builds the one server seam both runs
stand on: an env-gated `autopilot` message that hands a person's seat to a bot, a refusal to start on
Fly with the flag, and a page hook (`window.__playtest`, `window.__cuesPlayed`) that exists only when the
server says the flag is on. Ends green and committed, with `spec/autopilot.test.ts` shown red first.

## 2. Requirements (this phase)

### 2.1 Functional

- FR1 in full (Tasks 122, 123).
- FR4: the page hook that the frame invariants read (Task 124). The checks themselves are phase 02.
- The proxy gate (overview §2.4) (Task 121).

### 2.2 Non-functional

NFR3 and NFR4 (Task 121: the SDK as a devDependency, no key). NFR5 (Task 124).

### 2.3 Out of scope for this phase

Everything under `scripts/playtest/` except the probe (phases 02, 03).

### 2.4 Assumptions

See overview §2.4. Autopilot ends when the room advances. It does not survive `advanceRoom`,
`finishVote` (a restart) or `restartGame`, because each of them calls `seatBots`, which rebuilds
`game.bots`.

## 3. Existing code context (verified 2026-11-07)

- `src/net/protocol.ts`: `ClientMsg` union (lines 48–71), `ServerMsg` with
  `| { t: "welcome"; who: string }` (line 74), `parseClientMsg(raw: string): ClientMsg | null`
  (switch on `m.t`, `default: return null`).
- `src/net/lobbies.ts` line 42: `export type ErrorCode = "lobby-not-found" | … | "not-in-sight";`
  `LobbyError(code: ErrorCode, message: string)`.
- `src/net/game.ts`:
  - `Game.bots: Partial<Record<Seat, BotSeat>>`
  - `function seatBots(game: Game, botSeats: readonly Seat[]): void` (not exported) sets
    `game.bots = {}`, then for each bot seat
    `game.bots[seat] = { memory: createBotMemory(seat, humans, game.roles), inbox: [] }`
    and `game.ready.add(seat)`
  - `const botSeatsOf = (game) => seats with game.bots[s]`
  - `const botSeatsIn = (lobby) => seats with lobby.seats[s]?.bot`
  - `tickGame(game, full, now, nickname)` calls `botsAct(...)` for every seat in `game.bots`, then
    `applyInput(game, seat, input)` for each
  - `relay(game, lobby, from, req, now)` pushes into `game.bots[receiver]?.inbox`, so an autopilot
    seat hears what is sent to it
  - `applyInput(game: Game, seat: Seat, input: PlayerInput): boolean`
- `src/game/bots/brain.ts` line 172:
  `createBotMemory(seat: Seat, humans: ReadonlySet<Seat> = new Set(), roles: readonly [Role, Role, Role] | null = null)`.
- `src/net/attach.ts`:
  - `record(event, who, lobby, detail?)` (line 126) wraps `logGame`
  - `handle(socket, who, msg)` (line 745) is the switch over `ClientMsg`, with
    `throw new LobbyError(...)` → `error` reply
  - `case "input"` (line 1102): `applyInput(running.game, seat, inputOf(msg))`
  - `case "send"` (line 1048) relays
  - `tick` (line 312) forwards bot `sent` to `lobby.seats[receiver]?.who`, so a message from an
    autopilot seat reaches people. Bot sends are not logged, which is acceptable for a test seam.
  - `hub.send(socket, { t: "welcome", who })` (line 1261)
  - env seams read at module top (`PAUSE_FOR`, `VOTE_FOR`)
- `server.ts`: imports `attachSockets` and listens. There is no env check yet.
- `src/lib/gameLog.ts`: `export type GameEvent = | "socket.open" | … | "pull";`. `kind` is in `ALLOWED`
  (`src/lib/log.ts`).
- `src/components/useSocket.ts` opens the socket (`openSocket()` from `src/client/socket.ts`).
  `GameSocket.on(t, fn)` subscribes.
- `src/components/Game.tsx`:
  - the render loop builds `scene: Scene` (line 240)
  - `const cam = easeCamera(...)`, `scene.cam = cam`, `draw(ctx, scene)` (line 292), with the canvas
    `el` and context `ctx` set up at DPR (lines 164–172)
  - `rt.labels: Label[]`, `scene.report: { chips: Box[]; plaques: Box[] }`
  - `audio.play(view.sounds)` (line 367)
- `src/client/audio.ts` line 255:
  `(window as { __cuesPlayed?: string[] }).__cuesPlayed?.push(...sounds.map((s) => s.kind))`. It only
  pushes when `ctx.state === "running"`, so the runs launch Chrome with
  `--autoplay-policy=no-user-gesture-required` (as `spec/layout/spectator.test.ts` does).
- `src/client/render/index.ts`:
  - `export function draw(ctx: CanvasRenderingContext2D, given: Scene): void`
  - `Scene` has `entities`, `floorEntities?`, `cam?`, `report?`
  - it re-exports `Camera`, `toScreen(cam, x, y, z = 0)` and `fromScreen`
- `src/client/labels.ts`: `export interface Label { kind: string; text: string; at: Vec }`.
- `spec/leaderboard.test.ts` lines 54–80: the pattern for a spec that runs its own app (`spawn("node",
  ["server.ts"], { env: { …, PORT, DATABASE_PATH } })`, poll `fetch` until up, `kill` after).
- `spec/play.ts`: `startedGame(baseUrl)` gives `{ players: Player[]; code }`; `ready(players)`;
  `byRole`; `nextView(p)`. `spec/ws.ts`: `connect(baseUrl, cookie?)`, `socket.next(t, timeoutMs)`.
- `Dockerfile`: builds with `pnpm install --prod=false`, then `pnpm prune --prod`, so a devDependency is
  not in the image.
- Env (this machine): `ANTHROPIC_BASE_URL` set, `ANTHROPIC_AUTH_TOKEN` set, `ANTHROPIC_MODEL` =
  `claude-sonnet-5-5`. `@anthropic-ai/sdk` latest is 1.6.0. The SDK reads `ANTHROPIC_AUTH_TOKEN` and
  `ANTHROPIC_BASE_URL` with no arguments.

### Interfaces from earlier phases (exact)

None.

## 4. Approach

**Autopilot in `src/net/game.ts`.** `Game` gains `autopilot: Set<Seat>`, the person seats a bot is
playing. Two exported functions:

```ts
export function setAutopilot(game: Game, lobby: LobbyState, seat: Seat, on: boolean): boolean; // false: no change
export const autopilotOn = (game: Game, seat: Seat): boolean;
```

`setAutopilot` adds or removes the seat, then calls
`seatBots(game, [...botSeatsIn(lobby), ...game.autopilot])`. That gives every bot a fresh memory, since
who is a person has changed, which is the same rule as `takeOverWithBot`. It also deletes
`game.inputs[seat]`, so a held key does not walk on. `seatBots`' `humans` is computed from the seats it
is given, so an autopilot seat is not a "human" to the other bots. `seatBots` itself starts with
`game.autopilot = new Set()`, and `setAutopilot` writes the set back after it calls `seatBots`, so every
other caller (`advanceRoom`, `finishVote`, `restartGame`, a takeover, a swap) clears autopilot with no
further code. `startGame`'s literal gains `autopilot: new Set()`. In `attach.ts`, `case "input"`
returns early when `autopilotOn(game, seat)`. `case "send"` does the same, and the seat's own sends are
ignored silently.

**Env gate.** `src/net/playtest.ts` (new, server-only):

```ts
export const PLAYTEST_AUTOPILOT: boolean; // process.env.PLAYTEST_AUTOPILOT === "1"
export function refuseOnFly(env: NodeJS.ProcessEnv): string | null; // the message when the flag is set and FLY_APP_NAME is present
```

`server.ts` calls `refuseOnFly(process.env)` before importing the entry. When it returns a message,
the server prints it to stderr and runs `process.exit(1)`.

**Page hook.** `src/client/playtest.ts` (new, browser) exports `installPlaytest(socket: GameSocket):
void` and the types in overview §4.2. `useSocket.ts` subscribes to `welcome` right after
`openSocket()`, in the same effect and before any frame can arrive, so the first `welcome` is never
missed. When `m.autopilot` is true it calls `installPlaytest(opened)`, which sets `window.__cuesPlayed = []` and
`window.__playtest`. `Game.tsx` publishes each drawn frame to the hook through one call,
`playtestFrame(ctx, scene)`, made right after `draw(ctx, scene)`. That call is a no-op unless the hook
is installed. It stores `{ seat, role, cam, labels, boxes }`, and it answers any pending `sample`
requests in the same frame:
- `drawn` comes from `ctx.getImageData` at `toScreen(cam, x + 0.5, y + 0.5)` × DPR
- `bare` comes from drawing `{ ...scene, entities: [], floorEntities: [], fx: [], pops: [] }` on an
  offscreen canvas of the same size and DPR, then reading the same pixel

Both pixels come from one animation frame, which matches NFR6.

## 5. Task breakdown

### Task 121: Prove the proxy takes images, and add the SDK as a dev dependency

- [x] Done (proxy gate passed: 5/5 replies, ~1.7 s each, 1358 input tokens)

- **Description.** Add `@anthropic-ai/sdk` as a devDependency (`pnpm add -D @anthropic-ai/sdk@1.6.0`).
  Write `scripts/playtest/probe.ts`. It takes one screenshot of the home page at 1280 × 800 with
  Playwright, then sends 5 sequential messages to `process.env.PLAYTEST_MODEL ??
  process.env.ANTHROPIC_MODEL`, each containing that image (base64 PNG) and the text "In one line,
  what is the page's main heading?". It prints each reply, `usage` and latency, and exits non-zero on
  any API error. Extend `src/layering.test.ts` with a rule that no file under `src/` imports
  `@anthropic-ai/sdk`. Commit ADR 0028 (status `proposed`) with this task: the review (phase 03) is the
  SDK's only user.
- **Files touched:** `package.json`, `pnpm-lock.yaml`, `scripts/playtest/probe.ts` (new),
  `src/layering.test.ts`, `doc/adr/0028-a-screenshot-review-from-what-a-player-perceives.md`.
- **Tests first (red).** In `src/layering.test.ts`, add a rule
  `{ layer: "any", why: "the Anthropic SDK is a dev dependency for the playtest review: nothing under src/ ships it", allowed: (_f, to) => !to.startsWith("@anthropic-ai/") }`,
  run it over all of `src/`, and add a "catches" assertion that `"@anthropic-ai/sdk"` is refused.
  Break check: add `import "@anthropic-ai/sdk";` to `src/game/types.ts` with a script, watch the rule go
  red, then restore.
- **Implementation (green).** The probe, using `new Anthropic()` with no arguments.
- **Acceptance criteria.**
  - `node scripts/playtest/probe.ts` (app running) prints five replies naming the heading, with
    `usage.input_tokens` per call.
  - `pnpm check` is green.
  - `grep -r "@anthropic-ai" src` finds nothing outside the layering test.
  - The Dockerfile is unchanged.
- **Gate.** If the proxy refuses the image, errors, or rate-limits within 5 calls, stop. Do not start
  Task 122. Report the exact error to the user and return to the brainstorm (`specs/backlog.md`
  line).
- **Depends on:** none.

### Task 122: The autopilot message, under the env flag, with a log line

- [x] Done

- **Description.**
  - Add the wire contract (overview §4.1) and `"refused"` to `ErrorCode`.
  - Add `src/net/playtest.ts` and `setAutopilot`/`autopilotOn` (this file's §4).
  - In `attach.ts`:
    - `case "autopilot"`: without `PLAYTEST_AUTOPILOT`, throw
      `new LobbyError("refused", "Autopilot is for playtests only.")`. Otherwise find the seat as
      `case "input"` does (return when there is no game or no seat), call `setAutopilot`, and when it
      changed, `record("autopilot", who, lobby, { kind: on ? "on" : "off" })`.
    - `case "input"` and `case "send"` return early for an autopilot seat.
    - `welcome` carries `autopilot: true` when the flag is on.
  - Add `"autopilot"` to `GameEvent`. Commit ADR 0027 (status `proposed`) with this task.
- **Files touched:** `src/net/protocol.ts`, `src/net/protocol.test.ts`, `src/net/lobbies.ts`,
  `src/net/game.ts`, `src/net/game.test.ts`, `src/net/playtest.ts` (new), `src/net/attach.ts`,
  `src/lib/gameLog.ts`, `spec/autopilot.test.ts` (new), `doc/adr/0027-…`.
- **Tests first (red).**
  1. `protocol.test.ts`:
     - `parseClientMsg('{"t":"autopilot","on":true}')` gives `{ t: "autopilot", on: true }`
     - `{"t":"autopilot"}` and `{"t":"autopilot","on":"yes"}` give `null`
  2. `game.test.ts`, on a started game with three person seats:
     - after `setAutopilot(game, lobby, 1, true)`, `tickGame` moves seat 1 with no `applyInput` from
       outside. Its position changes within 40 ticks on room 01, where its bot has a job.
     - `game.ready` still has three seats
     - `setAutopilot(…, 1, false)` removes `game.bots[1]`
     - `advanceRoom` clears `game.autopilot`
     - a seat on autopilot is not in the other bots' `humans`
  3. `spec/autopilot.test.ts`, which runs its own app with `PLAYTEST_AUTOPILOT=1` (the
     `spec/leaderboard.test.ts` pattern) for three cases:
     - (a) `welcome` has `autopilot: true`
     - (b) in a started room, a socket sends `autopilot on`, then an `input` holding right: within
       3 s, that seat's own `view` shows `you.pos` moving to wherever its bot is heading, never only
       right, and the other two sockets still get views
     - (c) on the shared app (`baseUrl`, flag off), `autopilot` gets `{ t: "error", code: "refused" }`
       and `welcome` has no `autopilot`
  - Break checks:
    - remove the flag check in `case "autopilot"` (c goes red)
    - remove the early return in `case "input"` (b goes red)
- **Implementation (green).** As described.
- **Acceptance criteria.**
  - All three tests above are green, and each was shown red by its break check.
  - Starting the app with `PLAYTEST_AUTOPILOT=1` and toggling writes exactly one `game` line per toggle,
    with `event: "autopilot"` and `detail.kind` `on` or `off`, and no other detail.
- **Depends on:** 121 (the gate).

### Task 123: The server refuses to start with the flag on Fly

- [x] Done

- **Description.** `refuseOnFly(env)` returns
  `"PLAYTEST_AUTOPILOT is set on a Fly machine (FLY_APP_NAME). It is for local playtests only; refusing to start."`
  when `env.PLAYTEST_AUTOPILOT === "1"` and `env.FLY_APP_NAME` is a non-empty string. Otherwise it
  returns `null`. `server.ts` checks it first and exits 1.
- **Files touched:** `src/net/playtest.ts`, `src/net/playtest.test.ts` (new), `server.ts`,
  `spec/autopilot.test.ts`.
- **Tests first (red).**
  - Unit: the four combinations of the two variables. Only both set gives the message.
  - Spec (`spec/autopilot.test.ts`): `spawn("node", ["server.ts"], { env: { …, PLAYTEST_AUTOPILOT: "1",
    FLY_APP_NAME: "x", PORT } })` exits with code 1 within 10 s and its stderr contains
    `"refusing to start"`. Nothing ever answers on the port.
  - Break check: comment out the call in `server.ts` with a script (the spec goes red: the process stays
    up).
- **Acceptance criteria.** Both tests green, shown red first.
- **Depends on:** 122.

### Task 124: The page hook, present only when the server says autopilot is on

- **Description.** `src/client/playtest.ts` with `installPlaytest(socket)` and
  `playtestFrame(ctx, scene)`, typed as in overview §4.2. Wire it as described in this file's §4: one
  `welcome` subscription in `useSocket.ts`, and one `playtestFrame` call after `draw` in `Game.tsx`.
  `__cuesPlayed` is created only here (the existing specs that set it themselves keep working).
- **Files touched:** `src/client/playtest.ts` (new), `src/client/playtest.test.ts` (new),
  `src/components/useSocket.ts`, `src/components/Game.tsx`, `spec/autopilot.test.ts`.
- **Tests first (red).**
  - Unit (jsdom, with a stub socket):
    - before install, `window.__playtest` is undefined
    - after install, `frame()` is null until `playtestFrame` is called, and then it gives that scene's
      seat, role, cam and labels
    - `sample([{x,y}])` resolves on the next `playtestFrame`
  - Spec (`spec/autopilot.test.ts`, own app with the flag):
    - in a started room, the sighted tab's `__playtest.frame()` has a camera
    - `sample` at the tab's own tile gives `drawn ≠ bare` (its own figure stands there)
    - `sample` at a wall tile far outside sight gives `drawn` equal to `bare`
    - Can't see's tab has `__cuesPlayed` growing once audio runs, when Chrome is launched with
      `--autoplay-policy=no-user-gesture-required`
  - Spec on the shared app (flag off): `window.__playtest` and `window.__cuesPlayed` are both
    `undefined` on a started game page.
  - Break check: install unconditionally (the flag-off case goes red).
- **Implementation (green).** As described. No change to what the canvas draws.
- **Acceptance criteria.**
  - All tests are green, shown red first.
  - `pnpm check` is green, including `spec/layout/*`: nothing visible changed.
- **Depends on:** 122.

## 6. Phase Definition of Done

- [ ] Tasks 121–124 complete, each committed with `pnpm check` green
- [ ] `pnpm test:unit` passes
- [ ] `pnpm check` passes against `pnpm start:check`
- [ ] The proxy gate passed (Task 121's probe output is recorded in its commit message)
- [ ] `spec/autopilot.test.ts` shown red for each break check, named in the commits
- [ ] One `PROCESS_LOG.md` entry if the user corrected anything
- [ ] Tick phase 01 in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR1 | Tasks 122, 123 |
| FR4 (page hook part) | Task 124 |
| NFR3, NFR4 | Task 121 |
| NFR5 | Task 124 |
| Proxy gate | Task 121 |

## 8. Risks / open questions

None.
