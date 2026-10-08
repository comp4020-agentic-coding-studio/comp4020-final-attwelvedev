# Sensory heist — Phase 07: Results, real-life mode, spectators

- **Date:** 2026-10-08
- **Status:** Approved
- **Requirements confirmed by user:** yes — 2026-10-08
- **Part of:** `plans/2026-10-08-sensory-heist-00-overview.md`. Read it first,
  especially §3, §4.3, §4.4.
- **Depends on phases:** 06.

## 1. Summary

Heist records persist in SQLite on `/data` and fill a leaderboard; the heist
ends on a results screen with rank. The host's real-life wizard sets presets
(masking noise, captions instead of sound, voice off) with overrides; each
viewer gets captions and high-contrast toggles. Spectators follow a player
with a full-map view.

## 2. Requirements (this phase)

### 2.1 Functional

FR3 (spectator view, 4th joiner "new team"), FR6, FR7, FR30 (heist
complete), FR31, FR32. NFR accessibility: high contrast, captions for anyone.

### 2.2 Non-functional

Leaderboard renders server-side (works without scripts), both viewports, no
axe violations. Nicknames and team names on the public board pass a small
blocklist.

### 2.3 Out of scope for this phase

Voice (phase 08; the wizard's "in-app voice" toggle is stored now and
honoured there).

### 2.4 Assumptions

See overview §2.4.

## 3. Existing code context (verified 2026-10-08)

`src/lib/db.ts`: `openDb(path: string): Db` runs migrations from `./drizzle`;
`export const db: Db`. `src/lib/schema.ts` has no tables after Task 1.
`drizzle.config.ts` points at `./src/lib/schema.ts`, output `./drizzle`;
`pnpm db:generate` generates. `qrcode-generator` is available.

### Interfaces from earlier phases (exact)

Overview §4.2. From Task 3/11 (`src/net/lobbies.ts`): `LobbyState { code;
teamName; host; phase; seats; spectators; createdAt }`, `SeatState`,
`joinLobby(reg, code, who, nickname, as)`, `createLobby(reg, who, nickname)`,
`cleanNickname(raw)`, `setTeamName(reg, who, name)`, `ErrorCode`.
From Task 4: `GameSocket`, `openSocket`; `src/components/Lobby.tsx`. From
Task 7/13: `RoleView`, `viewFor(world, seat, role, full)`. From Task 9:
`ChannelMessage`, `route`. From Task 11: `logGame`, `GameEvent` (widen with
`"run.saved"`). From Task 14: `advanceRoom(game, rooms): "next" | "done"`,
`cleared` message, `RoomCleared.tsx`. From Task 17: `Game.paused`.

## 4. Approach

**Runs table** (`runs`): `id` text pk, `kind` (`room` | `heist`), `roomId`
(null for heist), `roomVersion` (null for heist; heist rows store the
concatenated versions in `heistVersion`), `teamName`, `names` (JSON array of
three `{ nickname, bot }`), `ms`, `loot`, `lootTotal`, `createdAt`.
Rank = 1 + count of rows of the same kind/room/version with smaller `ms`
(ties broken by more loot, then earlier). Saved by the socket module through
its own `db` connection; the Astro page reads through the bundle's `db`.

**Settings.** Host settings live in `LobbyState.settings` and reach every
client. Viewer settings (captions, high contrast, keep sheet open, sound
volume) live in `localStorage` under `heist:settings`, read defensively.
Masking noise is brown noise generated with Web Audio (no asset), played only
on the deaf seat's client when `maskNoise` is on, at a volume slider in the
deaf HUD.

**Spectators** get a `spectator` view: full tiles and entities (no dark
masking), plus the `sounds` and `msg`s of the seat they follow.

## 5. Task breakdown

### Task 18: Heist records, results screen and leaderboard

**Files touched.** `src/lib/schema.ts`, `drizzle/00NN_*.sql` (generated),
`src/lib/runs.ts` (+ test), `src/lib/names.ts` (+ test; blocklist applied in
`cleanNickname` and `setTeamName`), `src/net/game.ts`, `src/net/attach.ts`
(save on clear; send `heist`), `src/components/HeistComplete.tsx`,
`src/pages/leaderboard.astro`, `spec/leaderboard.test.ts`,
`spec/layout/leaderboard.test.ts`.

**Interfaces produced (exact).**

```ts
// src/lib/runs.ts
import type { Db } from "./db.ts";
export interface RunInput {
  kind: "room" | "heist";
  roomId: string | null;
  version: string; // room version, or joined versions for a heist
  teamName: string;
  names: { nickname: string; bot: boolean }[];
  ms: number;
  loot: number;
  lootTotal: number;
}
export interface RunRow extends RunInput { id: string; createdAt: number; rank: number }
export function saveRun(db: Db, run: RunInput, now?: number): RunRow; // returns it with its rank
export function topRuns(db: Db, filter: { kind: "room" | "heist"; roomId?: string }, limit?: number): RunRow[]; // default 20, current versions only

// src/lib/names.ts
export function isAllowedName(name: string): boolean;
```

**Tests first (red).** `runs.test.ts` (temp-file db): saving then reopening
the file keeps the row (persistence across restart); rank counts faster runs
of the same kind/room/version; a different room version doesn't compete;
`topRuns` orders by ms then loot. `names.test.ts`: blocked words rejected
case-insensitively and with spacing tricks; ordinary names pass.
`spec/leaderboard.test.ts`: `/leaderboard` answers 200 with tabs "Full heist",
"Room 1", "Room 2", "Room 3" and the empty state "No runs yet. Be first.";
`?tab=room-2` selects a tab without scripts; the page contains no device
hashes. `spec/layout/leaderboard.test.ts`: no overflow, no axe violations at
both viewports.

**Implementation (green).** Save a `room` run on every `cleared`, a `heist`
run after room 3; send `heist { ms, loot, lootTotal, rank }`; log
`run.saved` (`detail.kind`, `detail.room`). Results screen per spec §4.1.
`ACTIONS["GET /leaderboard"]` already exists (Task 1).

**Refactor.** None.

**Acceptance criteria.** Tests green; a run saved locally survives
`pnpm start` restarts.

**Depends on:** Task 17.

### Task 19: Real-life wizard, host settings, viewer settings, high contrast

**Files touched.** `src/net/lobbies.ts` (`settings`), `src/net/protocol.ts`
(`lobby.settings`), `src/net/attach.ts`, `src/components/RealLifeWizard.tsx`,
`src/components/Settings.tsx`, `src/client/settings.ts` (+ test),
`src/client/audio.ts` (mask noise, sound off), `src/styles/tokens.css`
(high-contrast token set under `[data-contrast="high"]`),
`src/client/tokens.ts` (high-contrast canvas palette),
`spec/settings.test.ts`, `spec/layout/wizard.test.ts`.

**Interfaces produced (exact).**

```ts
// src/net/lobbies.ts (added)
export interface LobbySettings {
  inPerson: boolean;
  maskNoise: boolean; // Can't-hear player's headphones play masking noise
  othersSoundOff: boolean; // Can't see / Can't speak get captions instead of game sound
  voice: boolean; // in-app voice (phase 08)
}
export const DEFAULT_SETTINGS: LobbySettings; // { inPerson: false, maskNoise: false, othersSoundOff: false, voice: true }
export function presetFor(answers: { sameRoom: boolean; deafHasHeadphones: boolean; othersHaveHeadphones: boolean }): LobbySettings;
export function setSettings(reg: Registry, who: string, settings: LobbySettings): LobbyState; // host only
// LobbyState gains: settings: LobbySettings

// src/client/settings.ts
export interface ViewerSettings { captions: boolean; highContrast: boolean; keepSheetOpen: boolean; volume: number }
export function loadViewerSettings(role?: Role): ViewerSettings; // captions default false for blind, false otherwise unless othersSoundOff
export function saveViewerSettings(s: ViewerSettings): void; // try/catch around localStorage
```

**Tests first (red).** `lobbies.test.ts`: `presetFor` truth table (same room
+ deaf headphones → maskNoise on, voice off; others without headphones →
othersSoundOff on; remote → defaults); non-host `setSettings` → `not-host`.
`settings.test.ts`: missing or corrupt storage returns defaults.
`spec/settings.test.ts`: host settings reach all three sockets within 1 s.
`spec/layout/wizard.test.ts`: the wizard is keyboard-operable, each
implication row has a toggle with its sentence, no axe violations, both
viewports; high contrast passes axe contrast in the HUD chrome.

**Implementation (green).** Wizard per spec §4.1, including the honour-system
line: "Can't speak is on your honour: no talking, mouthing or pointing at
words." Captions are forced on for blind/mute clients when `othersSoundOff`.

**Refactor.** None.

**Acceptance criteria.** Tests green.

**Human review:** on a local build, the user runs the wizard as host with
three devices in one room (one with headphones). Pass = the deaf player
can't follow speech over the masking noise at a comfortable volume, the
implications read clearly, and the overrides behave as labelled.

**Depends on:** Task 18.

### Task 20: Spectators and "start a new team"

**Files touched.** `src/game/perception.ts` (`spectatorView`, + test),
`src/net/attach.ts`, `src/net/protocol.ts` (`spectate`),
`src/components/Spectator.tsx`, `src/components/Lobby.tsx` (4th joiner:
Watch / Start a new team), `spec/spectator.test.ts`.

**Interfaces produced (exact).**

```ts
// src/game/perception.ts (added)
export function spectatorView(world: World, follow: Seat, roles: [Role, Role, Role], full: boolean): RoleView; // role = followed seat's role; tiles and entities always present; sounds of the followed seat
```

**Tests first (red).** `perception.test.ts`: a spectator following the blind
seat still gets tiles and entities, and the blind seat's sounds.
`spec/spectator.test.ts`: a spectator socket receives views at ≥ 10/s;
`spectate { seat: 2 }` switches the followed seat; the spectator receives the
`msg`s that seat receives and can't send (`say`/`sound`/`show` → `cant-send`).

**Implementation (green).** Spectator frame per spec §4.1 (grey dashed, no
role shape, no tray). "Start a new team" calls `lobby.create` with the same
nickname.

**Refactor.** None.

**Acceptance criteria.** Tests green.

**Depends on:** Task 19.

## 6. Phase Definition of Done

- [ ] Tasks 18–20 complete, tests passing, Task 19 accepted by the user
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start`, then `pnpm check` and `pnpm check:evidence` pass
- [ ] Deployed (ask first); after a redeploy, a run saved before it is still on `/leaderboard` (persistence on the real volume)
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR3 (spectator view, new team) | Task 20 |
| FR6, FR7 | Task 19 |
| FR30 (heist complete) | Task 18 |
| FR31, FR32 | Task 18 |
| NFR high contrast, captions for anyone | Task 19 |

## 8. Risks / open questions

None.
