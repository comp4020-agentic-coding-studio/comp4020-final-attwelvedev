# Play overhaul — Phase 02: Lobby of people, crews, votes, leaving, spectators (server)

- **Date:** 2026-10-19
- **Status:** Approved
- **Requirements confirmed by user:** yes — 2026-10-19
- **Part of:** `plans/2026-10-19-play-overhaul-00-overview.md`. Read it first,
  especially §4.3 (protocol table), §2.1 A1 and §3. ADRs 0013, 0014 (names),
  0015 are the decisions.
- **Depends on phases:** 01.

## 1. Summary

The server side of the new lobby and game flow: a lobby is an ordered list of
up to six people with nicknames, a private flag and per-person setup; each room
seats a crew of three from them by a fair rotation the host can override at the
reveal; the reveal carries who sits out, roles played and per-person real-life
settings; restarts go to a unanimous vote; leaving follows A1; spectators and
sitting-out people share a chat and a voice room. The existing screens are
adjusted only enough to keep the game playable; the new screens are phase 03.

## 2. Requirements (this phase)

### 2.1 Functional

FR16, FR17, FR18, FR19, FR20 (server: setup stored; wizard removed), FR21,
FR23 (server payload), FR24 (server), FR32 (server), A1, FR34 (server), FR36
(names part: everyone who played any room), FR10 (spectators default to the
whole room).

### 2.2 Non-functional

Lobby changes reach every member within 1 s (existing spec pattern); vote
timeout 15 s; spectator voice measured: log `voice.latency` for spectator
receivers too; no nickname, chat text or code in any log line.

### 2.3 Out of scope for this phase

All new UI (phase 03): the lobby screen, reveal screen, vote card, leave
modal, spectator panel. Line of sight (phase 04).

### 2.4 Assumptions

See overview §2.4. In-game seats stay three; "person index" means the index in
`LobbyState.people`.

## 3. Existing code context (verified 2026-10-19)

- `src/net/lobbies.ts` (272 lines):
  `SeatState { who: string | null; nickname: string | null; connected:
  boolean; bot: boolean }`; `LobbySettings { inPerson; maskNoise;
  othersSoundOff; voice }`, `DEFAULT_SETTINGS`;
  `LobbyState { code; teamName; host; phase: LobbyPhase; seats: [SeatState,
  SeatState, SeatState]; spectators: { who; nickname }[]; createdAt; settings }`;
  `LobbySummary { code; teamName; filled; phase }`; `ErrorCode` union
  (lobby-not-found, lobby-full, server-full, bad-nickname, bad-team-name,
  not-host, need-three, throttled, cooldown, cant-send); `MAX_LOBBIES = 40`,
  `MAX_NICKNAME = 16`. Exports: `createRegistry`, `cleanNickname(raw)`,
  `createLobby(reg, who, nickname)`, `joinLobby(reg, code, who, nickname, as)`
  (a rejoin by the same device keeps what it had; full → `lobby-full`),
  `leaveLobby(reg, who)` (host passes to the next seated seat, line 162),
  `setTeamName`, `presetFor(answers)`, `setSettings`, `SEAT_SHAPE`,
  `startLobby(reg, who)` (bots fill empty seats as `Bot circle|square|triangle`),
  `setConnected`, `openLobbies(reg)` (`phase === "open" && seatedCount < 3`),
  `expireIdle`, `reopenLobby`.
- `src/net/game.ts` (324 lines): `CrewMember { seat; nickname; role; bot }`;
  `PAUSE_MS = 45_000`; `Paused { seat; deadline; choosing }`; `Game { lobby;
  roomIndex; roles; world; ready: Set<Seat>; inputs; startedAt; cooldowns;
  bots; paused; vacated }`; `rolesFor(roomIndex)` = `ROLES[(seat + roomIndex)
  % 3]`; `seatBots`; `startGame(lobby, rooms)`; `advanceRoom(game, rooms)`;
  `restartGame(game)` (same room, keeps `ready`); `crewOf(lobby, game)`;
  `pauseFor`, `resumeIfBack`, `chooserFor`, `takeOverWithBot(game, lobby, seat,
  former)`, `giveSeatBack(game, lobby, who, nickname)`, `tickGame`, `relay`.
- `src/net/attach.ts` (826 lines): `Running { game; full; timer; pauseTimer;
  heist: { ms; loot; lootTotal; versions } }`; `games`, `spectating: Map<string,
  Seat>`; `sendReveal(code, seat)` (lines 117–130) sends `{ t: "reveal", room,
  name, index, role, crew }`; `sendSpectatorReveal`; `runIfReady` starts the
  interval once `ready.size === 3`; `tick(code)` sends views (spectators get
  `spectatorView(world, followSeat, roles, true)`) and on clear saves runs with
  `names = lobby.seats.map(...)` at that moment (lines 214–244); `departs(who)`
  (405–414) → `botTakesSeat` immediately; `pageGone` → `beginPause` (45 s);
  `handle` switch cases listed in the overview investigation: `lobby.settings`
  (523), `lobby.start` (526), `ready` (544), `room.restart` (553, host only),
  `next` (566), `host.choice` (580), `spectate` (594), sending (602),
  `voice.stats` (649); `relayVoice` (682–711) with one global
  `createRateLimiter()` keyed by `Seat` (so seat 0 of every lobby shares a
  budget — a latent bug this phase fixes by keying on device).
- `src/net/broadcast.ts`: `createHub(registry)` → `{ socketsOf, watchers, send,
  sendTo, broadcast, broadcastList, change }`; `membersOf` = seated humans +
  spectators; `closed(code)` builds a 3-seat placeholder.
- `src/net/voice.ts`: `MAX_FRAME_BYTES = 400`, `MAX_FRAMES_PER_S = 25`,
  `parseVoiceFrame`, `encodeVoiceOut(seat, frame)` (`[0x01][u8 seat][u32
  seq][f64 captureServerMs][opus]`), `voiceReceivers` (after Task 1: from
  `SENDS`/`RECEIVES`), `RateLimiter { allow(seat: Seat, now) }`,
  `createRateLimiter()`.
- `src/client/realLifePreset.ts` (copy of `presetFor`, with a test),
  `src/client/honourLines.ts` (`honourLines(settings)`),
  `src/components/RealLifeWizard.tsx`, `spec/layout/wizard.test.ts`,
  `spec/settings.test.ts`: all built on `LobbySettings`; removed here.
- `src/components/Lobby.tsx` sends `lobby.settings` from the wizard and shows
  `Start (${bots} bots fill)` from `3 - seated`; `Game.tsx` reads
  `lobbySettings.voice`, `.othersSoundOff`, `.maskNoise` and `LAST_ROOM = 2`.
- `src/lib/runs.ts`: `RunInput { kind; roomId; version; teamName; names:
  { nickname; bot }[]; ms; loot; lootTotal }`, `saveRun(db, run, now)`.
- `src/lib/gameLog.ts`: `GameEvent` union (socket.open … voice.latency);
  `logGame`.
- Specs: `spec/lobby.test.ts`, `spec/leave.test.ts` (18 its),
  `spec/disconnect.test.ts` (8 its; `PAUSE_MS=3000` cases),
  `spec/spectator.test.ts` (3 its), `spec/heist.test.ts` (3 its, asserts each
  role rotates), `spec/settings.test.ts` (2 its), helpers `spec/play.ts`
  (`startedGame`, `ready`, `byRole`, `nextView`, `closeAll`), `spec/ws.ts`
  (`connect`, `Socket { send; sendBinary; nextBinary; next; close; drop;
  unload }`). Unit: `src/net/lobbies.test.ts` (376 lines),
  `src/net/game.test.ts` (438), `src/net/protocol.test.ts`.

### Interfaces from earlier phases (exact)

From Task 1 (`src/game/types.ts`): `Method`, `SENDS`, `RECEIVES`,
`canSend(role, method)`, `canReceive(role, method)`. From Task 1
(`src/net/voice.ts`): `voiceReceivers(roles: [Role, Role, Role], from: Seat,
voiceOn: boolean): Seat[] | null`. From Task 1 (`src/net/protocol.ts`): the
`send` client message and `cooldown { method; until }` server message.
From Task 3 (`src/client/settings.ts`): `Settings` gains `quick: string | null`
and `voiceMode: "hold" | "toggle"`. From Task 1: `roomList()` in
`src/net/attach.ts` honours `process.env.ROOMS_DIR`; fixture rooms live in
`spec/fixtures/rooms/`.

## 4. Approach

**People (`src/net/lobbies.ts`).**

```ts
export interface Setup {
  headphones: boolean;
  inRoom: boolean; // in the same room as the others
  captions: boolean; // always show captions
  earplugs: boolean;
  mask: boolean; // sleep mask or blindfold
  done: boolean; // answered at least once ("Set up" in the lobby)
}
export const DEFAULT_SETUP: Setup = {
  headphones: true, inRoom: false, captions: false, earplugs: false, mask: false, done: false,
};
export interface Person {
  who: string; // device hash
  nickname: string;
  connected: boolean;
  setup: Setup;
  played: Role[]; // roles played this heist, in order
}
export const MAX_PEOPLE = 6;
export interface LobbyState {
  code: string;
  teamName: string;
  host: string;
  phase: LobbyPhase;
  private: boolean;
  people: Person[]; // in the host's starting order
  seats: [SeatState, SeatState, SeatState]; // this room's crew; empty seats until start
  sittingOut: string[]; // device hashes of people not in this room's crew
  spectators: { who: string; nickname: string }[]; // watch-only joiners
  createdAt: number;
}
```

`SeatState` gains `person: number | null` (index into `people`, null for a
bot). `LobbySettings`, `DEFAULT_SETTINGS`, `presetFor`, `setSettings` and the
`lobby.settings` message are deleted. `LobbySummary.filled` counts people;
`openLobbies` lists `phase === "open" && !private && people.length <
MAX_PEOPLE`. A 7th `as: "player"` join is `lobby-full`. Nicknames are unique
per lobby: `uniqueNickname(people, nick)` appends " 2", " 3"… (cut to 16).
Host handover on leave goes to `people[0]` after removal.

**Crew per room (`src/game/crew.ts`, pure: it imports only `./types.ts`, so the
lobby screen can use it too; `Person` is passed structurally as
`{ played: Role[] }[]`).**

```ts
export interface CrewPick { people: (number | null)[]; roles: [Role, Role, Role] } // people[seat]: person index or null (bot)
export function pickCrew(people: readonly { played: readonly Role[] }[], roomIndex: number): CrewPick;
export function swapCrew(pick: CrewPick, a: number, b: number): CrewPick; // person indexes
```

`pickCrew`: with ≤ 3 people, seat i = person i (bots fill), roles
`rolesFor(roomIndex)` exactly as today (so 3-person heists don't change). With
4–6: the three with the fewest `played.length` play (ties by distance after the
previous room's crew in the starting order, so play rotates through the list);
roles then assigned to minimise roles a person has already played (exhaustive
over the 6 permutations, ties by `rolesFor(roomIndex)`). `swapCrew` with both
in the crew swaps their roles; with one sitting out, the sitting-out person
takes the other's seat and role.

`Game` gains `crew: CrewPick` and `heistPeople: Map<string, { nickname: string;
bot: boolean }>` (everyone who played a room, for the heist record). Starting a
room (start, next, restart-heist) runs `pickCrew` and writes `lobby.seats` and
`lobby.sittingOut` from it, recording `played` when the room starts ticking.
`crew.swap` (host, only while a reveal is up: game not ticking) applies
`swapCrew`, clears every human's ready, and resends reveals.

**Reveal payload.** `{ t: "reveal"; room; name; index; role; crew:
CrewMember[]; rooms: number; sittingOut: string[]; played: Record<string,
Role[]>; real: RealLife }`. Sitting-out people and spectators get the reveal
with `role` of the seat they follow and `real` for a watcher.

**Real life per person (`src/net/realLife.ts`, pure).**

```ts
export interface RealLife {
  maskNoise: boolean; // Can't hear with headphones: play masking noise
  soundOff: boolean; // hearing role without headphones: captions instead of game sound
  captions: boolean; // the person's own "always show captions" (not for Can't hear)
  voice: boolean; // in-app voice on for this person
  lines: string[]; // the reveal's real-life lines for this role and setup
}
export function realLifeFor(role: Role, me: Setup, crew: Setup[]): RealLife;
```

Rules: `maskNoise = role === "deaf" && me.headphones`; `soundOff = role !==
"deaf" && !me.headphones`; `captions = role !== "deaf" && (me.captions ||
soundOff)`; `voice = !(me.inRoom && crew.every(s => s.inRoom))` (in-app voice
off only when the whole crew is in one room). Lines, in order, only when
`me.inRoom`: deaf → "Earplugs in now." if `earplugs`, else "No earplugs?
Headphones on with the noise playing." if `headphones`, else "No earplugs or
headphones: ask the others to keep the table quiet near you."; plus "Sit where
you can't see the others' faces."; blind → "Mask on. Find WASD and Space
first." if `mask`, else "Keep your eyes on your own screen."; mute → "Don't
mouth words or point at screens. Waving and miming are fine." Voice relay
skips a receiver whose `real.voice` is false and the sender's too.

**Votes (`Game.vote`).**

```ts
export type VoteKind = "room" | "heist";
export interface Vote { kind: VoteKind; by: Seat; until: number; yes: Set<Seat>; no: Set<Seat> }
export const VOTE_MS = 15_000;
export function voters(lobby: LobbyState): Seat[]; // seats with a connected human
export function castVote(game: Game, lobby: LobbyState, seat: Seat, yes: boolean, now: number): "passed" | "declined" | "open";
```

Only one vote at a time; proposing counts as a yes; bots never vote; passed
"room" → `restartGame`; passed "heist" → back to room 0: clear every person's
`played`, `pickCrew(…, 0)`, reveals. A timer in `attach.ts` ends it as
"timeout". Movement continues. Not while paused or cleared.

**Leaving (A1) and host choices.** `departs(who)` mid-game: if
`lobby.sittingOut` is empty → `botTakesSeat` (today). Otherwise →
`game.paused = { seat, deadline: now, choosing: true }` and announce; the host
chooses `bot`, `lobby` or `pull` + `person` (a sitting-out index): the pulled
person takes the seat and role (`takeOverWithPerson`), gets a reveal, and must
press Ready before play resumes (the others' ready is kept). The same `pull`
option is offered after a dropped connection's 45 s when someone sits out.

**Watchers' room.** Watchers = `spectators` + sitting-out people.
`spec.say` (cleaned with `cleanText`, cooldown 1 s per device) → `spec.msg` to
every watcher, never to a seated person. Voice binary from a watcher → every
other watcher with header `0x02` and the watcher's index in
`[...spectators, ...sittingOut]`. The voice rate limiter is keyed by device
hash (fixes the cross-lobby seat key). Watchers default to the whole room:
`spectatorView` gets `follow: Seat | null` (null = no audio, full map);
`spectate` accepts `seat: 0 | 1 | 2 | null`.

## 5. Task breakdown

### Task 5: A lobby is a list of up to six people (nicknames, private, order)

- **Description:** `Person`, `MAX_PEOPLE`, `private`, `people`, unique
  nicknames, nickname edits, host order, private filtering; seats filled only
  at start (from `people[0..2]` for now — Task 6 generalises).
- **Files touched:** `src/net/lobbies.ts` (+ test), `src/net/protocol.ts`
  (+ test: `lobby.nickname`, `lobby.private`, `lobby.order`), `src/net/attach.ts`,
  `src/net/broadcast.ts` (`membersOf` includes people; `closed()` with
  `people: []`), `src/net/game.ts` (`crewOf` reads seats), `src/lib/gameLog.ts`
  (events `lobby.nickname`, `lobby.private`, `lobby.order`),
  `src/components/Lobby.tsx` (minimal: list `people` instead of seats; Start
  label from `Math.max(0, 3 - people.length)` bots), `spec/lobby.test.ts`,
  `spec/layout/lobby.test.ts` (updated for the people list).
- **Tests first (red):** `lobbies.test.ts`: six people can join, the seventh
  is `lobby-full` and may watch; a duplicate "Ana" becomes "Ana 2"; nickname
  edit reaches `people` and is unique; only the host sets private and order;
  order must be a permutation; a private lobby is not in `openLobbies`; a full
  lobby is not in `openLobbies`; host leaving passes to the first remaining
  person. `spec/lobby.test.ts`: "shows a sixth person in the others' lobby
  within 1 s, and the seventh is told it is full"; "a private lobby never
  appears in the open list but its code still joins"; "a nickname change
  reaches everyone within 1 s".
- **Implementation (green):** this file's §4 "People" (without setup, which is
  Task 7: `setup` is `DEFAULT_SETUP` for now).
- **Acceptance criteria:** tests green; a 3-person heist plays exactly as
  before (`spec/heist.test.ts` green).
- **Depends on:** Task 1.

### Task 6: Each room seats a fair crew; the reveal says who sits out; host swaps

- **Description:** `pickCrew`, `swapCrew`, `crew.swap`, the widened reveal
  payload (without `real`, which Task 7 adds), `played` history, `rooms` count
  replacing `LAST_ROOM`, heist record names = everyone who played.
- **Files touched:** new `src/game/crew.ts` (+ `crew.test.ts`),
  `src/net/game.ts` (+ test), `src/net/attach.ts`, `src/net/protocol.ts`
  (+ test), `src/lib/gameLog.ts` (`crew.swap`), `src/components/Game.tsx`
  (`reveal.rooms` instead of `LAST_ROOM`), `src/components/Lobby.tsx`
  (sitting-out people render `Spectator`), `spec/heist.test.ts`, new
  `spec/crew.test.ts`.
- **Tests first (red):** `crew.test.ts`: with 3 people `pickCrew` equals
  today's `rolesFor` rotation for rooms 0–2; with 5 people over 4 rooms nobody
  plays more than one room more than anyone else, and nobody repeats a role
  while another is unplayed by them; `swapCrew` swaps roles of two players;
  swapping a player with a sitting-out person moves the seat and role.
  `spec/crew.test.ts` (socket): "with five people, the first reveal names two
  sitting out and they get spectator views"; "the host's swap during the
  reveal changes both roles and clears everyone's ready"; "a swap after Ready
  has started the room is refused"; "a non-host swap is not-host"; "the heist
  record names everyone who played any room" (uses Task 1's `ROOMS_DIR` seam
  with `spec/fixtures/rooms/`, a one-room heist).
- **Implementation (green):** §4 "Crew per room" and "Reveal payload".
- **Acceptance criteria:** tests green; `spec/heist.test.ts` still asserts
  every role rotates for a 3-person team.
- **Depends on:** Task 5.

### Task 7: Per-person setup and real-life settings per room; the wizard goes

- **Description:** `Setup`, `lobby.setup`, `realLifeFor`, `reveal.real`, voice
  relay honouring `real.voice`, `Game.tsx` reading `reveal.real` (mask noise,
  forced captions, honour lines); delete the team-wide settings and wizard.
- **Files touched:** `src/net/lobbies.ts` (+ test), new `src/net/realLife.ts`
  (+ test), `src/net/attach.ts`, `src/net/protocol.ts` (+ test),
  `src/components/Game.tsx`, `src/components/RoleReveal.tsx` (show
  `real.lines` instead of `honourLines`), `src/components/Lobby.tsx` (a
  plain temporary "Your setup" form: two radio pairs and three checkboxes,
  replaced by the designed one in Task 10); delete
  `src/client/realLifePreset.ts` (+ test), `src/client/honourLines.ts`
  (+ test), `src/components/RealLifeWizard.tsx`, `spec/layout/wizard.test.ts`
  (its high-contrast HUD case moves to `spec/layout/game.test.ts`),
  `spec/settings.test.ts` → replaced by `spec/setup.test.ts`.
- **Tests first (red):** `realLife.test.ts`: the rules in §4 as a table (deaf
  with/without headphones and earplugs; blind/mute without headphones get
  `soundOff` and captions; voice off only when the whole crew is in one room;
  no lines when remote); `spec/setup.test.ts`: "a person's setup reaches
  everyone within 1 s and marks them set up"; "each reveal carries real-life
  settings for that person's role this room, recomputed when roles rotate";
  "voice between two people who are both in the room is not relayed when the
  whole crew is in the room".
- **Implementation (green):** §4 "Real life per person".
- **Acceptance criteria:** tests green; `rg -n "LobbySettings|presetFor|honourLines|RealLifeWizard" src spec` empty.
- **Depends on:** Task 6.

### Task 8: Restart the room or the heist by unanimous vote

- **Description:** `Vote`, `voters`, `castVote`, `vote.propose`/`vote.cast`,
  `vote`/`vote.end` messages, 15 s timeout; remove `room.restart` and the host
  restart buttons (`Game.tsx` header ConfirmButton and `RoomCleared`'s restart
  now propose a vote).
- **Files touched:** `src/net/game.ts` (+ test), `src/net/attach.ts`,
  `src/net/protocol.ts` (+ test), `src/lib/gameLog.ts` (`vote.propose`,
  `vote.end` with detail `{ kind, result }`; add `result` to the allowlist),
  `src/components/Game.tsx`, `src/components/RoomCleared.tsx`, new
  `spec/vote.test.ts`; update `spec/layout/game.test.ts`'s restart cases.
- **Tests first (red):** `game.test.ts`: a vote passes when every connected
  human says yes, bots don't count; one no declines; a second proposal while
  one is open is ignored; a restart-heist vote clears `played` and returns to
  room 0. `spec/vote.test.ts`: "a restart-room vote passes when all three
  accept and everyone is back at spawn"; "one decline ends it, saying who";
  "no answer in 15 s ends it as timeout" (uses `VOTE_MS` env override
  `VOTE_MS=2000` like `PAUSE_MS`); "a spectator can't propose or vote";
  "players keep moving during a vote"; "restart heist goes back to room 1's
  reveal".
- **Implementation (green):** §4 "Votes". The temporary UI: a proposal button
  in the HUD for any player and a plain `role="alertdialog"` with Yes/No
  (restyled in Task 12).
- **Acceptance criteria:** tests green; `room.restart` no longer parses.
- **Depends on:** Task 6.

### Task 9: Leaving with people sitting out; the watchers' chat and voice

- **Description:** A1 leave flow with `pull`; `pull` also after a dropped
  connection's 45 s; `spec.say`/`spec.msg`; watcher voice; device-keyed voice
  rate limit; watchers default to the whole room.
- **Files touched:** `src/net/game.ts` (+ test: `takeOverWithPerson`),
  `src/net/attach.ts`, `src/net/voice.ts` (+ test: `encodeWatcherVoice`,
  `RateLimiter.allow(key: string, now)`), `src/net/protocol.ts` (+ test),
  `src/game/perception.ts` (`spectatorView(world, follow: Seat | null, roles,
  full)`; null = no sounds) + test, `src/lib/gameLog.ts` (`spec.say`,
  `host.pull`), `src/components/Disconnect.tsx` (a "Pull in <name>" button per
  sitting-out person), `src/components/Spectator.tsx` (minimal chat list +
  input, "Whole room" follow button; restyled in Task 12),
  `spec/leave.test.ts`, `spec/disconnect.test.ts`, `spec/spectator.test.ts`.
- **Tests first (red):** `spec/leave.test.ts` adds: "with nobody sitting out,
  a leaving person's seat goes to a bot at once (unchanged)"; "with someone
  sitting out, a leaving person pauses the game and the host is asked at once";
  "the host pulls in a sitting-out person, who gets the leaver's role and a
  reveal, and play resumes when they are ready". `spec/disconnect.test.ts`
  adds: "after 45 s with someone sitting out, the host can pull them in".
  `spec/spectator.test.ts` adds: "a spectator's chat reaches the other
  watchers and a sitting-out person, never a player"; "a watcher's voice frame
  reaches the other watchers only"; "a new spectator sees the whole room with
  no sounds until they follow someone". `voice.test.ts`: the limiter allows 25
  frames/s per device independently of seat numbers.
- **Implementation (green):** §4 "Leaving" and "Watchers' room".
- **Acceptance criteria:** tests green; all existing `leave` and `disconnect`
  cases still pass.
- **Depends on:** Task 6.

## 6. Phase Definition of Done

- [ ] Every task in §5 is complete and its tests pass
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start` (and `PAUSE_MS=3000 VOTE_MS=2000 pnpm start`
      for the waiting cases) then `pnpm check` passes
- [ ] A five-person lobby can play rooms 1–3 end to end on a local build with
      the temporary UI (checked by the agent with five browser contexts and
      reported)
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR10 | Task 9 |
| FR16 | Tasks 5, 6 |
| FR17 | Task 5 |
| FR18 | Task 5 |
| FR19 | Task 5 |
| FR20 (server) | Task 7 |
| FR21 | Task 7 |
| FR23 (payload) | Tasks 6, 7 |
| FR24 (server) | Task 6 |
| FR32 (server) | Task 8 |
| FR34 (server) | Task 9 |
| FR36 (names) | Task 6 |
| A1 | Task 9 |

## 8. Risks / open questions

None.
