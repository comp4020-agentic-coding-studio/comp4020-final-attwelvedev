# Play overhaul — Plan overview

- **Date:** 2026-10-19
- **Status:** Approved
- **Requirements confirmed by user:** yes — 2026-10-19 (spec
  `specs/2026-10-19-play-overhaul.md`, plus amendments A1–A4 below, confirmed
  in the planning conversation the same day)

## 0. How to use these plans

Files in the set:

- `plans/2026-10-19-play-overhaul-00-overview.md` (this file)
- `plans/2026-10-19-play-overhaul-01-comms.md` (Tasks 1–4)
- `plans/2026-10-19-play-overhaul-02-lobby-server.md` (Tasks 5–9)
- `plans/2026-10-19-play-overhaul-03-lobby-screens.md` (Tasks 10–12)
- `plans/2026-10-19-play-overhaul-04-line-of-sight.md` (Tasks 13–16)
- `plans/2026-10-19-play-overhaul-05-world-renderer.md` (Tasks 17–21)
- `plans/2026-10-19-play-overhaul-06-rooms-results.md` (Tasks 22–25 and 28; Task
  28 was added after planning and runs between 22 and 23)
- `plans/2026-10-19-play-overhaul-07-sound-wrapup.md` (Tasks 26–27)

A session reads this overview plus exactly one phase file
(`/execute-plan plans/2026-10-19-play-overhaul-NN-….md`). Task numbers are
global. A phase is ticked in §5 when its phase Definition of Done is met.
"FRn" means requirement n of the spec's §2.1; "An" means an amendment in this
file's §2.1. The spec's §4.1 holds every wireframe and token; phase files cite
it rather than copy it.

## 1. Summary

The playtests found the heist fun but unbalanced (Can't see was deadweight,
Can't speak did its own thing), the comms confusing and in the way, the reveal
unclear and the real-life setup ignored. This overhaul routes messages by
method under a new send/receive table, replaces the tray with a flick-to-send
comms wheel, rebuilds the lobby around up to six people with per-person setup
and a rotating crew of three, adds restart votes, spectator chat and voice,
gives sighted roles line of sight (with glass and vents), redraws the world as
a Monument Valley-style tilted 3/4 view, ships four new rooms where each role
leads a beat, and ends each room with a comms map.

## 2. Requirements

### 2.1 Functional requirements

FR1–FR37 exactly as numbered in `specs/2026-10-19-play-overhaul.md` §2.1. Read
that section before any task; it is the contract. Amendments agreed while
planning (2026-10-19), which win over the spec where they differ:

- **A1 (replaces the leave half of FR33):** a confirmed leave mid-game in a
  lobby with nobody sitting out keeps today's behaviour: a bot takes the seat at
  once, no pause. When someone is sitting out, the game pauses at once and the
  host chooses: pull in a sitting-out person (who takes the leaver's role), a
  bot, or back to lobby. A dropped connection keeps the 45 s wait.
- **A2 (extends FR9 and FR12):** one new sound kind, `clue`, is the only sound
  with no visual half. Its parity row carries a written exemption, like the
  alarm. The linter allows a clue object only inside a beat that declares a
  `cue` of `"twin"` or `"split"`.
- **A3 (extends FR14):** bots plan only around hazards their role currently
  perceives (seen by sighted bots in their line of sight, heard by Can't see
  within hearing), never from the room file's timings of a hazard they haven't
  perceived. Otherwise "every role is needed" would pass falsely.
  *(Re-scoped 2026-10-20 after phase 04: phase 04 built the record of what a bot
  has seen or heard (`Known.seenHazards`), but wiring the planner to it broke
  rooms 02 and 03, whose dark opening only Can't see perceives. The planner
  change and the tolerant guide are now Task 28 in phase 06, built on a draft of
  the new dark-corridor room. If it can't hold there, phase 06 stops and asks the
  user; the room file is never the fallback.)*
- **A4 (housekeeping, from the brainstorm hand-off):** `CLAUDE.md` is updated
  where its invariants change (shape of the app, sensory parity); ADRs
  0011–0016 are accepted by the user before Task 1 (done 2026-10-19, `b0faa2c`).
  The backlog was sorted at planning time (2026-10-19): nine items are in
  Decided with where they went, and three stay Parked; later tasks add nothing
  to it unless something new comes up.
- **A5 (agreed 2026-10-19, after the plan was first written):** a living
  `DESIGN.md` at the repo root is the current design reference: the idea and
  principles, the 3/4 recipe, figure and hat rules, a component inventory,
  motion and accessibility rules, and copy rules. Values stay in
  `src/styles/tokens.css`; every token `DESIGN.md` names must exist there
  (checked by a test). `doc/prompts/DESIGN.md` is marked superseded.
  `CLAUDE.md` gains a rule: a visual change reads `DESIGN.md` first and updates
  it in the same commit. Written in Task 17; every later visual task keeps it
  current.
- **A6 (spec FR20a–b, agreed 2026-10-19):** preferences (nickname, setup,
  in-game settings) persist in the browser and are sent on joining a lobby;
  a /preferences page edits them outside a lobby. No server persistence.

### 2.2 Non-functional requirements

As spec §2.2. In particular, phone 375×812 and desktop 1280×800 (the existing
`PHONE` and `DESKTOP` in `spec/browser.ts`) both work, keyboard complete; never
colour alone; AA text; reduced motion; flashing ≤ 3/s; a 20 Hz tick holds for
about 10 lobbies on the 256 MB machine with line of sight on (measured in
Task 14); no new image assets; any new audio is synthesised, not bundled.

### 2.3 Out of scope

As spec §2.3. Also: the pantry-era `scripts/solve-rooms.ts`, `solvePlans.ts`,
`solveBuilder.ts` and `src/game/rooms/solutions/` are removed in Task 23 rather
than ported (nothing reads the solutions and the plans only fit the old rooms).

### 2.4 Assumptions

As spec §2.4, plus:

| Assumption | How confirmed |
| --- | --- |
| In-game `Seat` stays `0 \| 1 \| 2`: up to six *people* in a lobby, three *seats* per room | Read `src/game/types.ts:18`; every sim/bot loop assumes three; user agreed to a crew of three per room |
| The whole `LobbyState` (device hashes included) already goes to every member | Read `src/net/broadcast.ts`; unchanged, so person indexes can be used in messages |
| Room ids may change; the leaderboard's edition separates old and new boards | Spec FR36, ADR 0014 |

## 3. Shared context & conventions

- **Stack:** Astro 7 + Preact islands + one Node process (`server.ts`) with a
  WebSocket at `/ws`; better-sqlite3 + Drizzle; Vitest; Playwright; Biome.
- **Commands:** `pnpm test:unit` (fast, no app); `pnpm lint:rooms`;
  `pnpm build && pnpm start` then `pnpm check` (types, Biome, room lint, all
  tests; browser and socket specs need the app at `APP_URL`, default
  `http://localhost:8080`). Disconnect specs that wait out a pause need
  `PAUSE_MS=3000 pnpm start`. `pnpm format` auto-fixes style.
  `pnpm db:generate` makes a Drizzle migration.
- **Layering (CLAUDE.md):** `src/game/` pure (no DOM, no `ws`, no `node:`
  except `rooms/load.ts`); `src/net/` imports `src/game/` and `src/lib/`, never
  Astro; `src/client/` imports only `src/game/types.ts`, `src/game/*` pure
  helpers already imported today, and `src/net/protocol.ts`. Pages stay thin.
- **Perception rule:** never add a field to a view or message without checking
  it against the role tables (after Task 1: `SENDS`/`RECEIVES` in
  `src/game/types.ts`).
- **Parity rule:** every `SoundCue` kind has a row in
  `src/game/parity.test.ts` and a caption in `src/client/hud.ts`
  (`CUE_WORD: Record<SoundCue["kind"], string>`), enforced by the typecheck.
- **Rooms:** `pnpm lint:rooms` and `spec/rooms.test.ts` must pass for every
  room edit; never hand-write a room without running both.
- **Logging:** new socket events get a `GameEvent` name in
  `src/lib/gameLog.ts`; `detail` only carries kinds (`method`, `role`, `kind`),
  never text, nicknames, codes or choices; any new detail key is added to the
  `redact` allowlist in `src/lib/log.ts` with a reason.
- **Tests:** unit tests beside the code; promises to users in
  `spec/<area>.test.ts`; browser checks one file per area in
  `spec/layout/<area>.test.ts`. `spec/suite-size.test.ts` caps a browser spec
  file at 1000 lines: start a new area file rather than grow one.
- **Bug fixes** start with a failing test. **Corrections** from the user that
  could recur go into the harness (a rule or a check) and `PROCESS_LOG.md`.
- **Commits:** one per task once `pnpm check` passes; a task with a
  `Human review:` line is committed only after the user accepts it on a local
  build. Messages say what changed and why, ending with the attribution line
  the session's system reminder gives.
- **Ask first:** `git push`, `flyctl deploy`, accepting ADRs (the user changes
  the status), anything touching `fly.toml`, `spec/invariants.test.ts`,
  `spec/global-setup.ts`, `.github/workflows/`, `.githooks/` (blocked by hooks).
- **Visual checks:** verify every visual change at both viewports on a running
  app; the render is the truth.

## 4. Shared design

### 4.1 Process shape

Unchanged (ADR 0007): the server runs the headless sim per running lobby at
20 Hz and sends each seat a `RoleView` built for its role. What changes:
routing is by method (Task 1); the lobby holds people, and each room seats a
crew of three from them (Tasks 5–6); views for sighted roles are cut to line of
sight (Task 14); the client draws a 3/4 world (Tasks 18–21).

### 4.2 Shared types (verbatim, produced by Task 1, `src/game/types.ts`)

```ts
export type Role = "blind" | "deaf" | "mute";
export const ROLES: readonly Role[] = ["blind", "deaf", "mute"];
export type Method = "callout" | "text" | "voice" | "clip" | "face" | "mark";
export const METHODS: readonly Method[] = ["callout", "text", "voice", "clip", "face", "mark"];
// ADR 0011: who may send and who receives, per method.
export const SENDS: Record<Role, readonly Method[]> = {
  blind: ["callout", "text", "voice", "face"],
  deaf: ["callout", "text", "voice", "clip", "face", "mark"],
  mute: ["clip", "face", "mark"],
};
export const RECEIVES: Record<Role, readonly Method[]> = {
  blind: ["callout", "text", "voice", "clip"],
  deaf: ["face", "mark"],
  mute: ["callout", "text", "voice", "clip", "face", "mark"],
};
export const canSend = (role: Role, method: Method): boolean => SENDS[role].includes(method);
export const canReceive = (role: Role, method: Method): boolean => RECEIVES[role].includes(method);
```

`Family` and `CHANNEL_RULES` are deleted by Task 1. `Seat`, `Vec`,
`PlayerInput`, `ROLE_LABEL` are unchanged.

`src/game/channels.ts` after Task 1 (verbatim):

```ts
export type Outgoing =
  | { method: "callout"; callout: Callout }
  | { method: "text"; text: string }
  | { method: "clip"; clip: string }
  | { method: "face"; id: string }
  | { method: "mark"; id: Stamp; at: Vec }; // at: the tile centre the sender picked
export type ChannelMessage = Outgoing & {
  from: { seat: Seat; role: Role; nickname: string; pos?: Vec }; // pos: faces only, the sender's position
  sentAt: number;
};
export const COOLDOWN_MS: Record<Method, number> = {
  callout: 0, text: 0, voice: 0, clip: 3000, face: 1500, mark: 1000,
};
export interface CooldownState {
  until: Record<string, number>; // key `${seat}:${method}`
}
export type RouteResult =
  | { ok: true; receivers: Seat[]; cooldownKey: string | null; until: number }
  | { ok: false; code: "cant-send" | "cooldown"; until?: number };
export function route(
  roles: [Role, Role, Role],
  from: Seat,
  msg: Outgoing,
  cd: CooldownState,
  now: number,
): RouteResult;
```

`STAMPS`, `Stamp`, `STAMP_LIFE_MS` keep their names in code (the UI says
"marks"); `STAMP_COOLDOWN_MS` is deleted (it is `COOLDOWN_MS.mark`).

### 4.3 Socket protocol changes (`src/net/protocol.ts`)

| Dir | Message | Shape | Task |
| --- | --- | --- | --- |
| C→S | `send` (replaces `say`/`sound`/`show`) | `{ t: "send"; msg: SendRequest }` where `SendRequest = { method: "callout"; callout: Callout } \| { method: "text"; text: string } \| { method: "clip"; clip: string } \| { method: "face"; id: string } \| { method: "mark"; id: Stamp; at: Vec }` | 1 |
| S→C | `cooldown` | `{ t: "cooldown"; method: Method; until: number }` (replaces the `family`/`stamp` shape) | 1 |
| C→S | `lobby.nickname` | `{ t: "lobby.nickname"; nickname: string }` | 5 |
| C→S | `lobby.private` | `{ t: "lobby.private"; on: boolean }` (host) | 5 |
| C→S | `lobby.order` | `{ t: "lobby.order"; order: number[] }` (host; a permutation of person indexes) | 5 |
| C→S | `lobby.setup` | `{ t: "lobby.setup"; setup: Setup }` (your own) | 7 |
| C→S | `lobby.settings` | removed (team-wide settings are gone) | 7 |
| S→C | `reveal` | adds `rooms: number; sittingOut: string[]; played: Record<string, Role[]>; real: RealLife` (keys and names are nicknames) | 6, 7 |
| C→S | `crew.swap` | `{ t: "crew.swap"; a: number; b: number }` (host; person indexes, during a reveal) | 6 |
| C→S | `vote.propose` / `vote.cast` | `{ t: "vote.propose"; kind: VoteKind }` / `{ t: "vote.cast"; yes: boolean }` | 8 |
| S→C | `vote` / `vote.end` | `{ t: "vote"; kind: VoteKind; by: string; left: number; yes: Seat[]; no: Seat[]; voters: Seat[] }` / `{ t: "vote.end"; kind: VoteKind; result: "passed" \| "declined" \| "timeout"; by?: string }` | 8 |
| C→S | `room.restart` | removed (replaced by votes) | 8 |
| C→S | `host.choice` | `{ t: "host.choice"; choice: "bot" \| "lobby" \| "pull"; person?: number }` | 9 |
| C→S | `spec.say` | `{ t: "spec.say"; text: string }` (spectators and sitting-out people) | 9 |
| S→C | `spec.msg` | `{ t: "spec.msg"; nickname: string; text: string; at: number }` | 9 |
| bin | spectator voice | C→S frames as today (`0x01` header); from a non-seated person the server relays to the other watchers as `[0x02][u8 watcher index][u32 seq][f64 captureServerMs][opus…]` | 9 |
| S→C | `ready` | `{ t: "ready"; seats: Seat[] }` (who has pressed Ready, during a reveal) | 11 |
| S→C | `cleared` | adds `comms: CommsEdge[]` | 24 |

`RoleView` gains `seen?: string[]` (Task 14) and `you.motion?: { moving: boolean; blocked: boolean }` (Task 19). `EntityView` players gain `moving?: boolean; blocked?: boolean` (Task 19).

### 4.4 Visual tokens

From Task 17 on, `DESIGN.md` (repo root) is the design reference; before it,
spec §4.1 "Tokens" table (shell `--glass`, `--scrim`, `--hatch`; world `--w-*`
tokens; alarm dusk set; high-contrast world set) is the source. New colour
tokens are 6-digit hex in both `:root` and `:root[data-contrast="high"]` of
`src/styles/tokens.css`, mirrored in `src/client/tokens.ts`, checked by
`src/client/tokens.test.ts` (its regex only reads 6-digit hex, so rgba tokens
like `--glass` stay CSS-only and the canvas uses `globalAlpha`).

## 5. Phases

| Phase | File | Tasks | Needs | Ends with | Done |
| --- | --- | --- | --- | --- | --- |
| 01 | `…-01-comms.md` | 1–4 | — | method routing, the wheel, Enter/V, arrow captions on today's rooms; **human review** of the wheel; **playtest 3** can run | [x] |
| 02 | `…-02-lobby-server.md` | 5–9 | 01 | lobbies of 6 people with setup and rotation, swaps, votes, leave flows, spectator chat/voice over the socket (temporary UI) | [x] |
| 03 | `…-03-lobby-screens.md` | 10–12 | 02 | new lobby, reveal and HUD screens, a /preferences page; **human review** of each | [x] |
| 04 | `…-04-line-of-sight.md` | 13–16 | 01 | glass/vents, line-of-sight views, sound occlusion, held sequences, clue sounds, new linter rules, bots that regain sight of Can't see, the lead-role harness, clue jobs (A3 and the tolerant guide moved to Task 28, phase 06) | [ ] |
| 05 | `…-05-world-renderer.md` | 17–21 | 04 | `DESIGN.md` and its rule; the tilted 3/4 world, moving figures, mist, edge pills, the world rising; **human review** | [ ] |
| 06 | `…-06-rooms-results.md` | 22–25, 28 | 03, 04, 05 | four new rooms with lead beats, room-1 labels, bots that plan only around what their role perceived (A3, Task 28), comms map, versioned leaderboard; **human review** of each room; **playtest 4** | [ ] |
| 07 | `…-07-sound-wrapup.md` | 26–27 | 06 | ambience and music (cuttable), README/backlog/CLAUDE.md/process wrap-up | [ ] |

Phase 04 needs only 01, so it may run before 02–03 if that suits the user.

## 6. Feature-level Definition of Done

- [ ] Every phase in §5 is ticked, and every task is complete with tests passing
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start` then `pnpm check` passes
- [ ] Manually verified on a local build at both viewports: the spec §4 demo
      script steps 1–8 (lobby of five, reveal swap, world rises, flick a
      callout, line of sight with glass and vent, restart vote declined, comms
      map, versioned leaderboard)
- [ ] Every requirement in §2 is covered — see §7
- [ ] Every `Human review:` task explicitly accepted by the user
- [ ] ADRs 0011–0016 accepted; `CLAUDE.md` and `DESIGN.md` match the code
- [ ] No item remains in §8

## 7. Requirements coverage check

| Requirement | Covered by |
| --- | --- |
| FR1 channel table by method | Task 1 |
| FR2 verbs and receivers by name, no family words | Tasks 2, 11, 18 |
| FR3 marks placed on a tapped tile in sight | Tasks 1, 2 (sight check moves to the visibility mask in Task 14) |
| FR4 captions only for what you receive | Task 4 |
| FR5 line of sight for sighted roles | Task 14 (drawn in Task 20) |
| FR6 glass and vents | Tasks 13, 14, 18 |
| FR7 Show visible in the dark | Tasks 14, 20 |
| FR8 edge pills, faint marks | Tasks 1 (`from.pos`), 19 |
| FR9 team-wide vs local events; parity rewrite | Task 14 |
| FR10 spectators see the whole room, toggle to follow | Tasks 9, 12 |
| FR11 held sequence + linter | Task 15 |
| FR12 four rooms, lead beats, split cues, hues | Tasks 22, 23 |
| FR13 linter: no-input flips, solo sequences, declared leads | Task 15 (rooms satisfy it: 22, 23) |
| FR14 every role needed spec | Tasks 16 (harness), 23, 28 (perception-only bots) |
| FR15 room-1 labels | Task 22 |
| FR16 up to 6 people, sit-out rotation, plays N | Tasks 5, 6, 10 |
| FR17 private lobbies | Tasks 5, 10 |
| FR18 nickname edit, numbered duplicates | Tasks 5, 10 |
| FR19 host starting order | Tasks 5, 10 |
| FR20 per-person setup, not gating; wizard removed | Tasks 7, 10 |
| FR21 effective settings per room | Task 7 |
| FR22 lobby leave warning | Task 10 |
| FR23 reveal contents | Tasks 6, 7, 11 |
| FR24 host swaps reset ready | Tasks 6, 11 |
| FR25 world rises / cross-fade | Task 21 |
| FR26 comms wheel (marking menu) | Task 2 |
| FR27 Enter text, V push or toggle, mic live | Task 3 |
| FR28 number keys, phone quick slot | Task 2 |
| FR29 HUD crew, spectators, live light | Task 12 |
| FR30 8-way arrow captions | Task 4 |
| FR31 movement cues incl. Can't see's own figure | Task 19 |
| FR32 restart votes | Tasks 8, 12 |
| FR33 / A1 leave warning and leave flows | Tasks 9, 12 |
| FR34 spectator chat and voice | Tasks 9, 12 |
| FR35 comms map | Task 24 |
| FR36 versioned records, names | Tasks 6 (names), 24 |
| FR37 ambience and music | Task 26 |
| A1 | Task 9 |
| A2 | Tasks 14, 15 |
| A3 | Task 16 (the record of what a bot perceived), **Task 28** (the planner uses it; the tolerant guide) |
| A4 | Tasks 1 (CLAUDE.md shape), 14 (CLAUDE.md parity), 27 (final check; backlog already sorted) |
| A5 | Task 17 (kept current by Tasks 18–22, 24, 26, 27) |
| A6 / FR20a–b | Tasks 7 (saved setup sent on join), 10 (`/preferences` page, prefilled lobby panel) |

## 8. Risks / open questions

None open. Accepted risks (spec §6): bot rewrite cost under line of sight;
LOS CPU per tick (measured in Task 14); spectator voice load (measured in
Task 9); flick gestures need a playtest (Task 2's human review and playtest 3);
rotation with five people can't be perfectly even (shown as "plays N").
