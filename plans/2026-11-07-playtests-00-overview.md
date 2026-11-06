# Playtests: a regression run and a screenshot review — Plan overview

- **Date:** 2026-11-07
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-07 (`specs/2026-11-07-playtests.md`, approved in the
  brainstorm, then revised the same day: the user chose option B, a screenshot review in place of the
  agent playtest, on cost).
- **Tier:** Architecture (ADR 0027 autopilot seam, ADR 0028 screenshot review and its dev dependency,
  both proposed).
- **Comes after:** `plans/2026-11-07-diorama-look-*` (Tasks 96 to 120). Task numbers continue from 120.

## 0. How to use these plans

| File | Holds |
| --- | --- |
| `plans/2026-11-07-playtests-00-overview.md` | this file: requirements, shared design, coverage |
| `plans/2026-11-07-playtests-01-seam.md` | Tasks 121–124: proxy proof, autopilot seam, page hook |
| `plans/2026-11-07-playtests-02-regression.md` | Tasks 125–128: `pnpm playtest` |
| `plans/2026-11-07-playtests-03-review.md` | Tasks 129–131: `pnpm playtest:review`, one measured room, docs |

A session reads this overview plus exactly one phase file. Task numbers are global. A phase is ticked in
§5 once its phase Definition of Done is met.

## 1. Summary

The bugs the phase 14 human playtest found lived between layers (server sends, client draws, renderer
lights), so no unit test of one layer reached them. This plan adds two on-demand commands, neither in
`pnpm check`:

1. **The regression run** (`pnpm playtest`): the real server, three real browser tabs, an input check
   per room, then the server's perception-only bots drive the seats (a test-only autopilot) while frame
   and room-end invariants are checked. At each beat it saves each role's screenshot and what that role
   perceives as text. Deterministic in what it checks, and free.
2. **The screenshot review** (`pnpm playtest:review <run>`): offline, one model call per role per beat
   of a finished run, given only what that player perceived. It reports what a first-time player could
   not read, would be misled by, or would not know to do next, beside the beat's designed intent. About
   $2 a heist. Its findings are leads, not verdicts.

The run rests on one server seam (ADR 0027): with `PLAYTEST_AUTOPILOT=1`, a person's seat can be handed
to a bot, and the page exposes a small hook. The deployed app can never have it. Agents that play the
heist (about $55 a heist) were planned first and dropped for cost; they are parked in the backlog. Comms
gaps and fun stay with human playtests.

## 2. Requirements

The FR numbers are the spec's (`specs/2026-11-07-playtests.md` §2.1). They are restated here in short
so this file stands alone.

### 2.1 Functional requirements

1. **FR1 Autopilot seam.** With `PLAYTEST_AUTOPILOT=1`, client message `{ t: "autopilot"; on: boolean }`
   puts the sender's seat under a bot memory: the bot supplies its input and messages, the socket's own
   input is ignored, and the socket still receives the seat's views. Without the flag the server replies
   `error` with code `refused`. The server exits with a clear message if the flag is set and
   `FLY_APP_NAME` is present. One `logGame` `autopilot` event per toggle. The message is validated in
   `protocol.ts`.
2. **FR2 Regression setup.** Throwaway server (flag on, temporary DB). Three tabs (two at 1280, one
   phone at 375, as `playRoom`). Lobby, join, start and ready through the real UI. Every room in heist
   order through the real Next flow; roles rotate as in the real heist.
3. **FR3 Input check per room, before autopilot.** Each tab: each move key briefly; Act once; opens the
   comms wheel and sends one message its role may send; opens the menu and uses each action that does
   not leave or restart (a restart vote is proposed and then declined). The phone moves by touch. Each
   action is checked against what the page and the server show next. Then all three go on autopilot.
4. **FR4 Frame invariants**, every 250 ms per tab once the canvas has settled: *nothing unsent is drawn*
   (sighted; pixel at an unsent tile's centre equals a render without entities, via
   `window.__playtest`); *every sound plays* (`window.__cuesPlayed`) and every captioned cue appears in
   the captions region; *doors* (every door label chip matches the door's `opens`).
5. **FR5 Room-end invariants.** HUD loot and time, the cleared card and the heist screen equal the
   server's `cleared` (and `heist`) message. On the last room the heist-complete screen's actions work.
6. **FR6 Evidence.** Per beat, under `review/playtest/<run>/<room>/`: `<role>-<width>-<beat>.png` and
   `<role>-<width>-<beat>.txt` (the page's accessible text and the captions with direction words). Once
   per run, each seat's prior knowledge as text: the home page, and per room the reveal and (Can't see)
   the sound briefing. Layout in §4.5.
7. **FR7 Failures** recorded with the frame's screenshot, the view JSON, role, room, tick and the
   invariant's name; play continues; non-zero exit at the end if any failed; `report.html` lists every
   finding with links.
8. **FR8 Flags.** `--room NN`, `--width 1280|375`, `--rotations all`. Default: every room, one rotation,
   both widths.
9. **FR9 Review perception.** Offline over a run's evidence. Sighted: the beat's screenshot plus its
   `.txt`. Can't see: the `.txt` only, no screenshot. Never `RoleView` JSON, decoders, source, README or
   room design data (beats' intents, hints, answers).
10. **FR10 Prior knowledge.** Each call carries that seat's saved prior knowledge as text. The system
    prompt says only: a first-time player of a browser game, its role, its team's goal to clear rooms.
11. **FR11 The question.** One call per role per beat: what that player cannot read or make out, what
    misleads them, what is missing, what they would do next. Structured answer: findings (`unreadable`,
    `misleading`, `missing`, `unclear-next`, each with what and where) and one `next` line.
12. **FR12 Report and cost.** `review/playtest/<run>/review.html`: per room, beat and role, the
    screenshot (or "screen dark"), the findings, and `next` beside the beat's designed intent (read from
    the room file for the reader only). Prints the call count and estimate first and needs `--yes`;
    `--room NN`; model configurable (default `ANTHROPIC_MODEL`); the report gives calls and tallied cost.

### 2.2 Non-functional requirements

- **NFR1** Neither command is in `pnpm check`. The regression run uses one browser with three contexts
  (within the 3-at-once cap); the review uses no browser.
- **NFR2** `review/playtest/` is added to `.gitignore` (narrows; never widens to keys).
- **NFR3** `@anthropic-ai/sdk` is a devDependency only; nothing in `src/` imports it
  (`src/layering.test.ts`); the production image is unchanged (`pnpm prune --prod` in the Dockerfile).
- **NFR4** No key in the repo; the SDK reads `ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_API_KEY` and
  `ANTHROPIC_BASE_URL` from the environment.
- **NFR5** The page hook and `__cuesPlayed` exist only when the server reports autopilot enabled.
- **NFR6** Frame checks start after a settled canvas (`settledHash`) and follow
  `spec/flaky-patterns.test.ts` (no single frame compared with a fixed sleep: drawn and bare pixels are
  read in the same animation frame).

### 2.3 Out of scope

Agents that play the heist (parked in the backlog); comms gaps (human playtests); a scripted
puzzle-solving player; running against the deployed app; judging fun; a model hearing real audio; making
either command a release gate.

### 2.4 Assumptions

- Confirmed by the user: the regression run plus a screenshot review (option B), not the agent
  playtest, on cost; Can't see from captions plus page text; prior knowledge only from what players
  see; record and continue; default 9 rooms × 1 rotation × both widths; the env flag with a refusal on
  Fly.
- **Gate:** the course proxy must accept image input (Task 121). If it does not, stop and return to the
  user before Task 122.
- Design calls made in this plan (inside the spec's freedom, named so they can be overruled at review):
  - Autopilot ends when the room advances (`advanceRoom`): the run switches it on per room, after FR3's
    input check.
  - `--room NN` serves a temporary `ROOMS_DIR` holding only that room, so it plays at index 0 (the
    first rotation of roles).
  - `--width 1280` or `--width 375` makes all three tabs that width; the default is the mixed table.
  - `--rotations all` plays the heist three times, the phone tab joining at seat 0, 1 then 2, so the phone
    plays every role in every room.
  - The review reads each role at the width that seat played (the phone seat's 375 shots included), so
    a phone-only legibility problem is found too.
  - Beats for the evidence are "start", each beat the seat's position enters, and "end". The review skips
    "end" (the cleared card is checked by FR5), so a heist is 3 × (35 beats + 9 starts) = 132 calls.

## 3. Shared context & conventions

- **Stack.** Node 24 with type stripping (`node file.ts`), pnpm ≥ 11, Astro 7 + Preact, `ws`, vitest 5,
  Playwright 1.63 driving system Chrome (`spec/browser.ts` `launch(args)`), Biome 2.5.
- **Commands.**
  - `pnpm check` = `pnpm typecheck && pnpm lint && pnpm lint:rooms && pnpm test`. It needs the app
    running: `pnpm build && pnpm start:check` (throwaway DB) in another shell.
  - `pnpm test:unit` runs only the unit project.
  - `pnpm format` is the only formatter. Run `git status` after it.
- **Test layout.** Unit tests beside code (`src/**/*.test.ts`, unit project). Promises to users in
  `spec/<area>.test.ts` (spec project, against the running app, at most 3 files at once). Task 125 adds
  `scripts/**/*.test.ts` to the unit project's `include` (in `vitest.config.ts`) so the playtest's pure
  checkers are tested in `pnpm check`. The runs themselves are not.
- **Layering** (`src/layering.test.ts`): `src/game/` pure; `src/net/` never imports client, pages or
  astro; `src/client/` imports game and only `net/protocol.ts`; pages never import `src/net/`. The
  playtest code lives in `scripts/playtest/` (outside `src/`) and may import from `src/` and `spec/`.
- **Logging.** New socket event → `logGame` via `record(event, who, lobby, detail)` in
  `src/net/attach.ts`, name added to `GameEvent` (`src/lib/gameLog.ts`). Detail keys only from
  `ALLOWED` (`src/lib/log.ts`): `kind` is allowed.
- **Break checks.** Every new test guarding a promise is shown red first. The code is broken by a
  script that asserts the text it replaces (never a bare `sed`), then restored. The commit says what
  was broken.
- **Commits.** One per task once `pnpm check` is green. End with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. ADR 0027 is committed with Task 122, and
  ADR 0028 (`doc/adr/0028-a-screenshot-review-from-what-a-player-perceives.md`) with Task 121. Their
  status becomes `accepted` only when the user approves.
- **Needs the user's go-ahead:** spending model budget beyond the Task 121 probe (Task 131, and any full
  heist review), deploying, flipping ADR status.

## 4. Shared design

```
pnpm playtest                                  pnpm playtest:review <run> --yes
  scripts/playtest/server.ts (flag, tmp DB)      reads review/playtest/<run>/ (no browser)
  scripts/playtest/table.ts  3 tabs via UI       per room, beat, role: screenshot (sighted) + .txt + prior
  scripts/playtest/wire.ts   socket frames         -> one model call -> findings + next
  per room:                                      review.html: findings, next vs designed intent, cost
    drive.ts input check
    hook.autopilot(true) x3
    every 250 ms: invariants.ts
    each beat: .png + .txt (perceived text)
    room end: roomEnd checks, Next
  report.ts -> review/playtest/<run>/report.html, exit code
```

### 4.1 Wire contract (Task 122, consumed by phase 02)

Added to `src/net/protocol.ts`:

```ts
// ClientMsg gains:
| { t: "autopilot"; on: boolean } // playtest only (ADR 0027): a bot plays my seat; refused unless PLAYTEST_AUTOPILOT=1
// ServerMsg's welcome becomes:
| { t: "welcome"; who: string; autopilot?: true } // autopilot: the server runs with PLAYTEST_AUTOPILOT=1
```

`ErrorCode` in `src/net/lobbies.ts` gains `| "refused"`.

### 4.2 Page hook (Task 124, consumed by phase 02)

`src/client/playtest.ts`, installed only when `welcome.autopilot` is true:

```ts
export type Rgba = [number, number, number, number];
export interface PlaytestFrame {
  seat: Seat;
  role: Role;
  cam: Camera; // the eased camera of the last frame drawn
  labels: Label[]; // the label chips on show, with the tile each points at
  boxes: Box[]; // chips, plaques and avoid boxes as drawn (canvas CSS px)
}
export interface PlaytestSample {
  at: Vec; // the tile asked about
  drawn: Rgba; // the canvas pixel at the tile's projected centre
  bare: Rgba; // the same pixel in the same scene drawn with entities and floorEntities removed
}
export interface PlaytestHook {
  frame(): PlaytestFrame | null;
  sample(tiles: Vec[]): Promise<PlaytestSample[]>; // fulfilled after the next draw, from that frame
  autopilot(on: boolean): void; // sends { t: "autopilot", on } on the page's own socket
}
// window.__playtest: PlaytestHook and window.__cuesPlayed: string[] exist only once installed
```

### 4.3 Playtest modules (Tasks 125–126; used across phase 02, and kept to this contract so an agent loop could reuse them later)

```ts
// scripts/playtest/server.ts
export interface PlaytestServer { url: string; stop(): Promise<void> }
export function startServer(options: { rooms?: string[] }): Promise<PlaytestServer>;
// rooms: room ids to serve (a temp ROOMS_DIR holding copies); absent = ./rooms

// scripts/playtest/table.ts
export interface Seat3 { page: Page; width: 375 | 1280; wire: Wire }
export function openTable(browser: Browser, url: string, widths: [375 | 1280, 375 | 1280, 375 | 1280]): Promise<Seat3[]>;
// by seat; creates, joins and Starts through the real screens, stops at the reveal (nobody ready)
export function readyAll(table: Seat3[]): Promise<void>; // presses I'm ready on each, waits for the canvas

// scripts/playtest/wire.ts
export interface Wire {
  latest(): RoleView | null;
  views(sinceMs: number): { at: number; view: RoleView }[];
  messages<T extends ServerMsg["t"]>(t: T): { at: number; msg: Extract<ServerMsg, { t: T }> }[];
  sent(): { at: number; msg: ClientMsg }[];
}
export function wireOf(page: Page): Wire; // attach before the page's first navigation

// scripts/playtest/drive.ts
export type Dir8 = "up" | "down" | "left" | "right" | "up-left" | "up-right" | "down-left" | "down-right";
export function move(seat: Seat3, dir: Dir8, ms: number): Promise<void>; // keys on desktop, the touch stick on 375
export function act(seat: Seat3): Promise<void>; // Space, or the Act button on 375
export function gear(seat: Seat3): Promise<void>; // G (desktop only)
export function sendByWheel(seat: Seat3, slot: { page: WheelPage; name: string }): Promise<void>;
export function sendText(seat: Seat3, text: string): Promise<void>;
export function placeMark(seat: Seat3, stamp: Stamp, at: { x: number; y: number }): Promise<void>; // at: screenshot px
export function menu(seat: Seat3, action: MenuAction): Promise<void>;
export type MenuAction = "settings" | "restart-room" | "restart-heist" | "vote-yes" | "vote-no";
```

(`WheelPage` is `import type { Page as WheelPage } from "../../src/client/wheel.ts"`, renamed to avoid
the clash with Playwright's `Page`.)

### 4.4 Cost model (Task 130, set from a measured room in Task 131)

Per call: cached system prefix (role, prior knowledge) ≈ 1.5k tokens; a 1280×800 screenshot ≈ 1.4k
(w·h/750; a 375×812 one ≈ 0.4k); perceived text ≈ 1.5k; output ≈ 500 including thinking at effort `low`.
On `claude-sonnet-5-5` ($2 in, $10 out, $0.20 cache read per MTok) that is about $0.012 for a sighted
desktop call and about $0.009 for Can't see. Room 01 is 9 calls ≈ $0.10; a heist is 132 calls ≈ $1.60,
quoted as "about $2". Task 131 measures room 01 and corrects the constants.

### 4.5 Evidence layout (Tasks 125 and 128 write it; Task 129 reads it)

```
review/playtest/<run>/
  run.json                                  { rooms: string[]; widths: number[]; seats: { seat: number; width: number }[] }
  prior/<seat>-home.txt                    the home page as text, before joining
  <room-id>/prior/<role>-reveal.txt        that room's reveal as text (+ the sound briefing for blind)
  <room-id>/<role>-<width>-<beat>.png      beat screenshot (beat: "start", "1".."n", "end")
  <room-id>/<role>-<width>-<beat>.txt      perceived text: the ariaSnapshot of the body, then "Captions:" and each caption line, arrows as "from the north-east"
  <room-id>/fail-<n>.png, fail-<n>.json    a finding's evidence (FR7)
  report.html                               the run report (Task 128)
  review.html                               the review (Task 130)
```

`scripts/playtest/report.ts` exports `escapeHtml(text: string): string` and
`page(title: string, body: string): string` (Task 128), reused by the review.

## 5. Phases

| Phase | File | Tasks | Needs | Ends with | Done |
| --- | --- | --- | --- | --- | --- |
| 01 | `…-01-seam.md` | 121–124 | — | Proxy proven (gate); autopilot seam, refusal on Fly and page hook live behind the flag; `spec/autopilot.test.ts` green and shown red first | [ ] |
| 02 | `…-02-regression.md` | 125–128 | 01 | `pnpm playtest` plays all 9 rooms at both widths, report.html written; **Human review** of the report | [ ] |
| 03 | `…-03-review.md` | 129–131 | 01, 02 | `pnpm playtest:review` refuses without `--yes`; room 01 reviewed for real, its estimate within 15% of the tally; docs; ADRs put to the user; **Human review** of the review and README | [ ] |

## 6. Feature-level Definition of Done

- [ ] Every phase in §5 is ticked, and every task is complete with tests passing
- [ ] `pnpm test:unit` passes
- [ ] `pnpm check` passes against `pnpm start:check`
- [ ] Manually verified: `pnpm playtest` completes nine rooms at both widths and exits 0 (or each
      failure it reports is a real bug, logged and fixed test-first); `pnpm playtest:review <run> --room
      01 --yes` writes a `review.html` the user has read
- [ ] Every requirement in §2 is covered (see §7)
- [ ] Every `Human review:` task explicitly accepted by the user
- [ ] No item remains in §8

## 7. Requirements coverage check

| Requirement | Covered by |
| --- | --- |
| FR1 | Tasks 122, 123 |
| FR2 | Task 125 |
| FR3 | Task 126 |
| FR4 | Tasks 124, 127 |
| FR5 | Task 128 |
| FR6 | Task 125 |
| FR7 | Task 128 |
| FR8 | Task 125 |
| FR9 | Task 129 |
| FR10 | Task 129 |
| FR11 | Task 129 |
| FR12 | Tasks 130, 131 |
| NFR1 | Tasks 125, 130 |
| NFR2 | Task 125 |
| NFR3 | Task 121 |
| NFR4 | Task 121 |
| NFR5 | Task 124 |
| NFR6 | Task 127 |
| Proxy gate (§2.4) | Task 121 |

## 8. Risks / open questions

None open. The known risks have owners: the proxy refusing images is Task 121's gate; cost is §4.4, the
`--yes` guard and Task 131's measurement; a model reading screenshots differently from people is why
findings are leads, read by the user in Task 131's review.
