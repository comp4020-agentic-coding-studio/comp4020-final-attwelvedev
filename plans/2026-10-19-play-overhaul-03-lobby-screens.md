# Play overhaul — Phase 03: Lobby, reveal and HUD screens

- **Date:** 2026-10-19
- **Status:** Approved
- **Requirements confirmed by user:** yes — 2026-10-19
- **Part of:** `plans/2026-10-19-play-overhaul-00-overview.md`. Read it first,
  especially §4.3 and §4.4. The wireframes are in
  `specs/2026-10-19-play-overhaul.md` §4.1 ("Lobby", "Role reveal", "In game",
  "Vote", "Leave warning", "Spectator"); build to them.
- **Depends on phases:** 02.

## 1. Summary

The designed screens on top of phase 02's server: the lobby with people, setup,
private toggle, ordering and rotation table; the reveal with who-hears-what by
name, real-life lines, sound briefing, ready states and host swaps; the HUD
with crew roles, spectators, the live light, the vote card, leave warnings and
the spectator panel. The world is still the flat renderer (phase 05 tilts it).

## 2. Requirements (this phase)

### 2.1 Functional

FR2 (reveal wording), FR16 (lobby list, rotation table, plays N), FR17–FR20
(UI), FR20a (prefilled panel), FR20b (the /preferences page), FR22, FR23, FR24 (UI), FR29, FR32 (UI), FR33/A1 (UI), FR34 (UI), FR10
(follow toggle UI).

### 2.2 Non-functional

Both viewports, no horizontal overflow, axe clean, touch targets ≥ 48 px,
reduced motion respected, all text over the canvas on `--glass`; new tokens
`--glass`, `--scrim`, `--hatch` (overview §4.4).

### 2.3 Out of scope for this phase

The world-rises transition (Task 21); edge pills (Task 20); the comms map
(Task 24).

### 2.4 Assumptions

See overview §2.4. The browser's own beforeunload prompt can't be styled; only
in-app navigation gets the designed modal.

## 3. Existing code context (verified 2026-10-19)

- `src/components/Lobby.tsx` (428 lines, after Tasks 5–7 edits): props
  `{ code }`; state includes `lobby`, `host`, `mySeat`, `reveal`; renders
  `Spectator` when `reveal && mySeat === null`, else `Game`, else the lobby;
  `leave()` sends `lobby.leave`, falls back to `location.assign("/")` after
  1500 ms. Code display, Copy, QR, team name input (host, max 24) stay.
- `src/components/RoleReveal.tsx` (97 lines): props `{ name; index; role; crew;
  from?; ready; onReady; lobbySettings }` (Task 7 replaced `lobbySettings` with
  `real: RealLife`); keeps the shape morph (`.reveal-shape.morphing`,
  `.reveal-from`, `.reveal-to`) and the `YOU` titles.
- `src/components/Game.tsx` (675 lines): `Game` renders `RoleReveal` until the
  first `view`, then `Hud`; `Hud` header `.hud-top` (role, room, clock,
  `<Connection state rttMs/>`, `<Settings …/>`), crew `ul.hud-crew`, alerts,
  `.frame` with canvas, `Captions`, overlays (`RoomCleared`, `HeistComplete`,
  `Disconnect`, caught banner, offline overlay), then the wheel (Task 2) and
  `TouchControls`.
- `src/components/Connection.tsx`: `Connection({ state, rttMs })` → `p.conn
  conn-${state}` with "● Live" / "◐ Weak N ms" / "○ Offline. Retrying…" /
  "◌ Connecting…".
- `src/components/RoleShape.tsx`: `RoleShape({ role, size = 28, mono = false })`.
- `src/components/ConfirmButton.tsx` (47 lines): the ask-twice button.
- `src/components/Spectator.tsx` (after Task 9): follow buttons per seat +
  "Whole room", chat list + input, `Start a new team`.
- `src/client/socket.ts`: sends `bye` on `pagehide` (lines 125–134).
- `src/styles/game.css` (898 lines): `.reveal*`, `.game`, `.hud-top`,
  `.hud-crew`, `.frame`, `.overlay`, `.touch-zone`, `.settings`, `.is-off`.
  `src/styles/pages.css`: lobby styles. `src/styles/tokens.css`: tokens.
- Specs: `spec/layout/lobby.test.ts` (phone/desktop overflow+axe; not-found;
  over the socket), `spec/layout/game.test.ts` (10 its), helpers
  `spec/lobbyUi.ts` (`createLobbyAs`, `joinWithCode`, `leaveAndClose`,
  `leaveGameAndClose`), `spec/playUi.ts` (`playRoom`, `canvasHash`),
  `spec/browser.ts` (`PHONE`, `DESKTOP`, `launch`, `openPage`,
  `horizontalOverflow`, `axeViolations`).

### Interfaces from earlier phases (exact)

From Task 5 (`src/net/lobbies.ts`, re-exported by `src/net/protocol.ts`):

```ts
export interface Setup { headphones: boolean; inRoom: boolean; captions: boolean; earplugs: boolean; mask: boolean; done: boolean }
export interface Person { who: string; nickname: string; connected: boolean; setup: Setup; played: Role[] }
export const MAX_PEOPLE = 6;
export interface LobbyState { code: string; teamName: string; host: string; phase: LobbyPhase; private: boolean;
  people: Person[]; seats: [SeatState, SeatState, SeatState]; sittingOut: string[];
  spectators: { who: string; nickname: string }[]; createdAt: number }
```

Client messages (overview §4.3): `lobby.nickname`, `lobby.private`,
`lobby.order { order: number[] }`, `lobby.setup { setup: Setup }` (Tasks 5, 7),
`crew.swap { a: number; b: number }` (Task 6), `vote.propose { kind }`,
`vote.cast { yes }` (Task 8), `host.choice { choice: "bot" | "lobby" | "pull";
person?: number }`, `spec.say { text }`, `spectate { seat: Seat | null }`
(Task 9). Server messages: `reveal { room; name; index; role; crew; rooms;
sittingOut; played; real: RealLife }` (Tasks 6–7), `vote`, `vote.end`
(Task 8), `spec.msg` (Task 9).

From Task 7 (`src/client/preferences.ts`): `loadSetup(): Setup`,
`saveSetup(setup: Setup): void` (key `heist.setup`).

From Task 7 (`src/net/realLife.ts`): `interface RealLife { maskNoise; soundOff;
captions; voice; lines: string[] }`.

From Task 6 (`src/game/crew.ts`): `interface CrewPick { people: (number |
null)[]; roles: [Role, Role, Role] }`, `pickCrew(people: readonly { played:
readonly Role[] }[], roomIndex: number): CrewPick` — the lobby's rotation
table calls it for each room index. It is pure and imports only
`src/game/types.ts`; add `src/game/crew.ts` to the client-import list in
`CLAUDE.md`'s layering line in Task 10.

From Task 2:

```ts
// src/client/wheel.ts
export function receiversOf(method: Method, crew: CrewMember[], me: Seat): { hear: CrewMember[]; cant: CrewMember[] };
// src/components/ReceiverLine.tsx
export function ReceiverLine({ method, crew, me }: { method: Method; crew: CrewMember[]; me: Seat }): JSX.Element;
```

## 4. Approach

Build to the spec §4.1 wireframes. Specifics the wireframes leave open:

- **Lobby rows (`PlayerRow`)**: drag handle (host only; also Move up / Move
  down buttons for keyboard and touch), nickname (your own row has an Edit
  button → inline input, Enter saves), setup summary chips ("headphones · in
  room · mask"), "plays N" when people > 3, and "Set up" / "Setting up". The
  rotation table rows come from `pickCrew` over the room count with each
  person's `played` empty (a forecast; the reveal is the truth).
- **Your setup (`YourSetup`)**: two segmented choices (Where: In the
  room/Remote first, since it is the answer most likely to be stale; then
  Headphones Yes/No) and three checkboxes (Always show captions; Earplugs or
  earmuffs; Sleep mask or blindfold), prefilled from `loadSetup()`. Each change
  sends `lobby.setup` and calls `saveSetup`. A "Preferences" button opens
  `PreferencesSheet` (a modal over the lobby with the same form as /preferences:
  real life and Playing, no nickname). Every change saves and sends at once, so
  a host starting while it is open loses nothing. /preferences stays for outside a
  lobby, linked from the home page only (user decision 2026-10-19, amends FR20b).
- **/preferences (`src/pages/preferences.astro` + a `Preferences.tsx`
  island)**: one page, no socket, editing the browser's saved preferences in
  three groups: You (nickname, via `src/client/nickname.ts`), Real life
  (`YourSetup` in a no-lobby mode that only saves), and Playing (captions,
  sound and volume, voice hold/toggle, high contrast, labels, via
  `src/client/settings.ts`). Saves on change with a quiet "Saved" status line.
  Linked from the home page header and the lobby panel. The in-game Settings
  menu keeps editing the Playing group.
- **Leave guard (`LeaveGuard`)**: intercepts in-app link clicks and the Leave
  buttons while in a lobby or game with a glass modal (`ConfirmButton`-style
  Stay / Leave); adds a `beforeunload` handler (browser prompt) while in a
  lobby or game; confirming sends `lobby.leave`.
- **Reveal**: the card over a `--scrim` on the frame (the canvas draws the
  flat room behind it, blurred with CSS `filter: blur(6px)`, none under reduced
  motion's static frame — blur is not motion, keep it). Send/get lines use
  verbs and `ReceiverLine` per method for this crew; Can't see's card adds
  "Your screen goes dark. That's on purpose." and `SoundBriefing`: one ▶ button
  per cue kind present in this room (from the room's objects: camera, laser,
  guard, plate hum, door) plus "Play all", using `createAudio().play([...])`
  with synthetic cues; the crew column shows each person's ready state (from a
  new `ready` server message — see Task 11), role pips from `played`, "Left the
  game" rows, sitting-out people; the host gets "Swap roles" (select two rows →
  `crew.swap`).
- **HUD**: top bar on `--glass`: crew chips (`RoleShape` + name + "you" /
  "bot" / "talking"), clock, loot, the live light (`Connection` with a 1 Hz
  pulsing dot, static under reduced motion), "N watching" (button → popover
  list), `[≡]` menu (Settings, Restart room…, Restart heist…, Leave). The vote
  card per wireframe (top centre, movement continues; Yes/No buttons; a bar and
  number counting down; outcomes as one line for 3 s). The spectator panel per
  wireframe (side panel at ≥ 720 px; bottom sheet with Chat/Players tabs on
  phone; hold-to-talk button and V).

## 5. Task breakdown

### Task 10: The lobby screen [x]

- **Description:** `PlayerRow`, `YourSetup`, private toggle, ordering,
  rotation table, nickname edit, `LeaveGuard` for the lobby, per the spec's
  lobby wireframe; replaces the temporary forms from Tasks 5 and 7.
- **Files touched:** `src/components/Lobby.tsx`, new
  `src/components/PlayerRow.tsx`, `src/components/YourSetup.tsx`,
  `src/components/LeaveGuard.tsx`, new `src/pages/preferences.astro`, new
  `src/components/Preferences.tsx`, `src/components/Home.tsx` (header link),
  `src/lib/requestLog.ts` (`"GET /preferences": "view.preferences"` in
  `ACTIONS`, like the other pages),
  `src/styles/pages.css`,
  `src/styles/tokens.css` (+ `--glass`, `--scrim`, `--hatch`), `CLAUDE.md`
  (layering: the client may import `src/game/crew.ts`),
  `spec/layout/lobby.test.ts` (extend; new file
  `spec/layout/lobby-people.test.ts` if it would pass 1000 lines).
- **Tests first (red):** browser: "a guest edits their nickname and the host
  sees it within 1 s"; "the host's private toggle hides the lobby from a
  watcher's open list"; "the host reorders people by keyboard (Move up) and
  the rotation table follows"; "a person's setup choices show as chips in
  everyone's lobby and their row says Set up"; "with five people the rotation
  table shows who sits out each room and plays N"; "clicking Home in a lobby
  asks before leaving; Stay keeps you in, Leave takes you home and out of the
  lobby"; overflow + axe at both viewports with six people, long nicknames and
  the setup form; every control ≥ 48 px on phone; "answers saved on
  /preferences prefill Your setup in the next lobby, and a change in the lobby
  shows on /preferences"; "/preferences has no overflow or axe violations at
  both viewports and works by keyboard alone"; "the home page links to
  /preferences".
- **Implementation (green):** §4.
- **Acceptance criteria:** tests green.
- **Human review:** on a local build at 375 px and 1280 px with five browser
  windows, the user judges the lobby against the spec wireframe: clear who is
  set up, who plays which room, and what "private" means; and that
  /preferences reads as the one place to set yourself up. Pass = user says so.
- **Depends on:** Tasks 5–7.

### Task 11: The role reveal [x]

- **Description:** The reveal card and crew column per the spec wireframe,
  with send/get lines by name, real-life lines, Can't see's briefing, ready
  states, pips, sitting out, left rows and host swaps; a server `ready` message
  so everyone sees who is ready.
- **Files touched:** `src/components/RoleReveal.tsx`, new
  `src/components/SoundBriefing.tsx`, `src/components/Game.tsx` (frame + scrim
  behind the reveal; the canvas draws the flat room for the reveal using the
  first `view`, so the server sends one view to each seat when the reveal is
  sent: `attach.ts` sends `view` with `full` tiles on reveal), `src/net/attach.ts`
  (`{ t: "ready"; seats: Seat[] }` S→C broadcast on every ready change),
  `src/net/protocol.ts` (+ test), `src/styles/game.css`,
  `spec/layout/reveal.test.ts` (new).
- **Tests first (red):** `protocol.test.ts` for the new server message type
  (shape only). Browser: "each role's card names who hears what they send, by
  name, and never says Say, Sound or Show"; "Can't see's card says the screen
  goes dark on purpose and its Play buttons play (an AudioContext node is
  started — checked through a test hook `window.__cuesPlayed`)"; "the crew
  column shows Ready for those who pressed it"; "the host swaps two people:
  both cards change role and every Ready resets"; "a person who leaves during
  the reveal shows as Left the game"; "the room is visible but blurred behind
  the card"; overflow + axe at both viewports for each role.
- **Implementation (green):** §4.
- **Acceptance criteria:** tests green; `spec/heist.test.ts` and `playRoom`
  still work (Ready button keeps its accessible name "Ready" → renamed "I'm
  ready": update `spec/playUi.ts` and `spec/play.ts` selectors).
- **Human review:** the user reads each role's card on a local build at both
  widths and judges that a newcomer would know what their role sends and gets
  and what to do in real life. Pass = user says so.
- **Depends on:** Task 10.

### Task 12: The HUD: crew, watchers, live light, votes, leaving, spectator panel [x]

- **Description:** The glass top bar, crew chips with roles, "N watching", the
  pulsing live light, the `[≡]` menu with vote proposals and Leave, the vote
  card, the leave modal mid-game, the restyled `Disconnect` with Pull in, and
  the spectator panel.
- **Files touched:** `src/components/Game.tsx`, `src/components/Connection.tsx`,
  new `src/components/VotePrompt.tsx`, `src/components/HudMenu.tsx`,
  `src/components/Disconnect.tsx`, `src/components/Spectator.tsx`, new
  `src/components/SpectatorChat.tsx`, `src/components/useVoice.ts` (a
  watcher mode: capture and send for watchers, play `0x02` frames),
  `src/client/voice/playback.ts` (accept the `0x02` header),
  `src/styles/game.css`, `spec/layout/game.test.ts` (update),
  new `spec/layout/hud.test.ts`, new `spec/layout/spectator.test.ts`;
  also (added during execution, 2026-10-20, user ruling): `src/game/perception.ts`
  (+ test) — `RoleView.loot`, the room's picked-up count for the HUD's ◆N, sent
  to every seat and to spectators since the team hears every chime;
  `src/components/Lobby.tsx` (one `LeaveGuard` over the game and the spectator
  screen, so the menu's Leave and any link ask first), `src/components/Settings.tsx`
  (Leave moves to the menu), `src/client/rotation.ts` (`nextRoomFor`, for "you
  play room N"), `spec/lobbyUi.ts` (`joinAsWatcher`).
- **Tests first (red):** browser: "the top bar lists every crew member with
  their role shape and name, and how many are watching"; "the live light says
  Live, and is still under reduced motion"; "any player proposes Restart room
  from the menu; the others see the vote card with a countdown and can still
  move; all Yes restarts"; "one No shows 'Not restarted: <name> kept playing.'";
  "leaving from the menu asks first; confirming hands the seat on as A1 says";
  "the spectator panel's chat reaches another spectator and never a player's
  page"; "a spectator follows Ana and hears what Ana hears (captions shown),
  then Whole room"; overflow + axe for the HUD with the vote card and the
  spectator panel at both viewports; phone controls don't overlap.
- **Implementation (green):** §4.
- **Acceptance criteria:** tests green; the old host-only restart button is
  gone from the HUD (`rg -n "Restart room" src/components` finds it only in the
  menu, the vote copy and `RoomCleared`, whose own buttons stay until Task 24
  rebuilds that card — user ruling 2026-10-20, amended from "only in the menu
  and vote copy").
- **Human review:** on a local build the user plays a room with three players
  and two spectators at both widths and judges the HUD, vote and spectator
  panel against the wireframes. Pass = user says so.
- **Depends on:** Tasks 8, 9, 11.

## 6. Phase Definition of Done

- [x] Every task in §5 is complete and its tests pass
- [x] `pnpm test:unit` passes
- [x] `pnpm build && pnpm start` then `pnpm check` passes (user ticked 2026-10-20 with known timing flakes, §11)
- [x] Tasks 10–12 human reviews accepted
- [x] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR2 (reveal) | Task 11 |
| FR10 (UI) | Task 12 |
| FR16 (UI) | Task 10 |
| FR17–FR20 (UI) | Task 10 |
| FR20a (prefill), FR20b | Task 10 |
| FR22 | Task 10 |
| FR23 | Task 11 |
| FR24 (UI) | Task 11 |
| FR29 | Task 12 |
| FR32 (UI) | Task 12 |
| FR33 / A1 (UI) | Task 12 |
| FR34 (UI) | Task 12 |

## 8. Risks / open questions

None.

## 9. Corrections log

- 2026-10-19, Task 10: expected "In the room" to mean something only with company.
  A lone "in room" chip and the reveal's real-life lines made no sense with
  everyone else remote. Fix: `sharesRoom` (two or more in the room) gates both
  (`src/game/setup.ts`, `realLifeFor`, `chipsOf`). First pass treated one
  person's answer as enough.
- 2026-10-19, Task 10: wanted preferences editable inside the lobby, not on a
  separate page. Fix: `PreferencesSheet` modal; the page stays for the home
  screen. First pass followed FR20b literally (link to a page).
- 2026-10-19, Task 10: rotation table shows no roles. Considered a forecast, user
  preferred a line: "Your roles are revealed before each room."

- 2026-10-19, Task 10: expected breathing room between neighbours in the lobby
  (Copy/QR row vs Team name; Private switch vs the ordering hint). First pass
  gave each child its own margin and missed pairs. Fix: the column container
  owns the gap (`.lobby-code`/`.lobby-side` grid + gap), so a new child can't
  touch its neighbour.

- 2026-10-19, Task 11: expected each crew row to name its role in words and to show
  readiness in words, and the waiting text to be alive. First pass drew only the
  role's shape, put "…" for not-ready and a "—" placeholder for "no roles played yet"
  (which read as a stray mark), and held the waiting button still. Fix: a role
  subtitle under each name, "Not ready", pips drawn only when there is something to
  show, and a 1.6 s breath on the waiting button (still under reduced motion).
  Two bugs of my own on the way, both caught by the spec: the pointer still over the
  button after the click turned it light grey through `.btn.primary:hover`, and my
  `:hover` fix raised the specificity above the reduced-motion rule, so the pulse
  ignored reduced motion while hovered.

- 2026-10-19, Task 11: asked whether people should be able to unready; agreed yes, since
  the reveal asks for real-life steps (mask, earplugs) that someone may realise they
  skipped after pressing I'm ready. Built into Task 11 rather than the backlog, as the
  other reveal corrections were. `ready` takes an optional `on` (absent = ready, so every
  existing sender is unchanged); `unready()` in `game.ts` only works while the reveal is
  up, never for a bot, and never once the room has started. A "Not ready yet" button sits
  beside the pulsing wait text.

- 2026-10-19, Task 11: expected the "Waiting for the others…" state not to be a button
  (a disabled button invites a click) and to be part of the "N of 3 ready" line. First
  pass kept the big button, disabled, with the count beside it. Fix: after I'm ready the
  big button goes, one status line reads "You're ready. Waiting for the others · 1 of 3"
  (pulsing, still under reduced motion), and "Not ready yet" is the only button. The
  button disappearing is itself the confirmation. `readyStatus()` in `client/reveal.ts`.

- 2026-10-20, Task 11: expected the host to swap with a bot like anyone else. First pass
  offered Select only on people (`!r.bot`), following the spec's "swap any two people". Fix: a bot
  is named by its seat in `crew.swap` (`botRef(seat) = -1 - seat`, `swapCrew` in `src/game/crew.ts`),
  trades roles with a player, or is replaced by someone sitting out.

- 2026-10-20, Task 11: a watcher saw a black map at the reveal while the person they swapped with
  did not. The view sent with the reveal reached `Lobby` before `Spectator` mounted and was dropped;
  only `Game` read `early`. First fix (reading it in `useRef`'s initial value) was not enough, because
  a view can land between render and the effect; the effect reads it too. The spec fails 4 of 4
  without the fix and passes 6 of 6 with it.

- 2026-10-20, Task 11: when every player left during the reveal, the watcher was stuck. The
  pause and its "who takes the seat" choice were only handled by the in-game HUD, so the reveal and
  the watchers' screen never showed it, and a host who only watches was not sent it. Fix: `usePause`
  shared by the reveal, the HUD and `Spectator`; `announcePause` also goes to the host; a `gone`
  message tells everyone who left and what became of their seat; each empty seat is asked about in turn.

- 2026-10-20, Task 11: Can't hear's line "Sit where you can't see the others' faces." was wrong
  for them: they see faces and marks, so hiding the others' faces takes away their only channel.
  The line is about lip-reading: "Sit where you can't see the others' mouths, so you can't lip-read."
  (the spec's seating hint said "shouldn't see the speakers' faces", which I took literally in plan 02).

- 2026-10-20, Task 11: "Press V to turn the mic on and off" stayed live when voice was off for the
  room. Fix: `Settings` takes `voiceOn` (`real.voice`), disables the switch and says why.

- 2026-10-20, Task 11: the "Waiting for X" popup covered the button of the very person being
  waited for, and interrupted everyone else for one person's Ready. First pass showed the shared
  pause dialog on the reveal. Fix: at a reveal a pulled-in person gets a one-line note and others
  carry on (the server accepts their Ready/unready meanwhile); the dialog is only for the host's choice.

- 2026-10-20, Task 11: watchers were missing from the crew list, could not be selected to swap in,
  saw a black map on joining, and their outlines did not follow what they clicked. Fix: watchers
  listed ("Watching", the same label as sitting out, since both mean not in this room), swappable
  (`-4 - n`), sent a view on join/reload/spectate at tick 0, `noSelf` so "Whole room" outlines nobody.

- 2026-10-20, Task 11: a bot that replaced a dropped player could not be swapped, and swapping a real
  player into its seat brought the old player back, because `takeOverWithBot` left their index in
  `crew.people`. Fix: it clears it. A person who then chooses to watch gives up any claim on the seat.

- 2026-10-20, Task 11: the host choosing a bot is rarely what a team of more than three wants.
  The choice now asks "Who takes the seat?" with sitting-out people and watchers first and the bot
  last and quieter; a watcher can be pulled in (`host.choice` pull with `-4 - n`).

- 2026-10-20, Task 11: process: my own rebuilds of `dist/` under the user's running server gave a
  private window no CSS or JS (the old hashed files were gone), and `check:flaky`'s busy loops, left
  running, made a later full run time out. Check for stray loops before a full run; do not rebuild
  under a server the user is running without saying so.

- 2026-10-20, Task 12: expected a loot count (◆N) in the top bar, which the spec's wireframe
  shows, but `RoleView` carried none, so the plan's file list could not deliver it. Asked
  rather than drop it; the user chose to add `loot` to the view. First pass of this task
  named no field for it.
- 2026-10-20, Task 12: the plan's acceptance line said "Restart room" only in the menu and
  vote copy, but `RoomCleared` has its own vote-asking buttons. Asked; the user kept them
  until Task 24 and the criterion was amended to say so.

## 10. Task 11 execution notes (deviations from the plan as written)

- The reveal message also carries `cues: BriefingCue[]` (Can't see only), from the
  new pure `src/game/cues.ts` (`cuesIn(room)`), so the client needs no room data.
- `CrewMember` gained `left?: true` (a seat whose person pressed Leave and the host
  has not filled yet), which the crew column shows as "Left the game".
- Views at reveal time are tick 0 and arrive straight after `reveal`, before `Game` has
  mounted. `Lobby` buffers the latest `view` and `ready` and hands them to `Game`; the
  game starts on the first view with `tick > 0`, not on the first view.
- `spec/play.ts` gained `nextTick`/`noTick` ("the game is running"): five older specs
  asserted "no view until ready", which the tick-0 view changes; they now say
  "no tick" (`crew`, `game`, `leave`, `vote`), keeping what they protect.
- `GameAudio.resume()` now returns a promise, and `play()` records kinds into
  `window.__cuesPlayed` when a spec sets it (the plan's test hook).
- The reveal is full-bleed (`body.playing`), panels on `--glass`; the canvas draw loop is
  now a shared `useDraw` hook used by the reveal and the HUD.
- Measured: the server holds 19.7 ticks/s under CPU load; `game.test.ts` "15 per second"
  failed once in four `check:flaky` runs (13/s) because the spec's own receiver is
  starved, not the server. Pre-existing shape; left alone, noted.
- Flake hunt after the status-line change (`check:flaky`, then repeated full runs on fresh servers):
  - Fixed, mine: the private-toggle spec waited for "some Join button" then asserted a count
    read earlier (the open list also cuts off at four teams); it now waits for its own
    lobby's row, expanding the list. `leaveAndClose` could hang 30 s on a modal that never
    opened; each click is now bounded.
  - Fixed, leaks: `setup.test.ts` and one `lobby-people` test ended with `context.close()`,
    which only holds a seat, so they left lobbies on the server (about 13 per full run, 38 of
    40 after three runs back to back, which looked like failures in unrelated files). They end
    with `leaveAndClose` now: about 10 to 11 left per full run, from specs I did not touch.
  - Not reproduced: four `wheel.test.ts` specs failed together in 2 of 7 early full runs (one
    axe violation with the wheel open, three waiting for wheel elements). They pass alone
    (6 of 6) and in 10 later full runs on fresh servers. Cause unknown; the spec is unchanged.
  - A control run on the committed tree was invalid (my `git stash` left the untracked Task 11
    specs behind, so 23 tests failed every run). `git stash -u` or a worktree is needed.


## 11. Task 12 execution notes (deviations from the plan as written)

Built and verified on a local build; human review accepted by the user 2026-10-20.

- `Settings` no longer holds Leave: it moved to `HudMenu`, whose Leave is one press because the
  page's own modal (`LeaveGuard` in `Lobby.tsx`, now over the game and the spectator screen too)
  asks first. The in-menu `ConfirmButton` for restarts stays, since a restart asks everyone else.
- `Spectator` had no audio at all, so "a spectator hears what Ana hears" was untrue; it now plays
  the followed seat's sounds through `createAudio` and shows them as captions with arrows. The
  server already sent them.
- `useVoice` takes `role: Role | "watcher"` (a watcher sends and hears); `playback.ts` gained
  `parseFrame` and `WATCHER_LANE`, so a `0x02` frame gets a decoder lane of its own.
- The spectator chat shows only the newest six lines and does not scroll. A scrolling region must
  take the keyboard (axe `scrollable-region-focusable`) and biome forbids `tabIndex` on a
  non-interactive element, so the two rules cannot both be met by a scroller; not scrolling meets both.
- The phone map is `calc(60dvh - var(--target))` (about 54%), not a flat 60% of what is left
  under the bar; `.frame.spectator-frame` is compounded because `.frame` sits later in the
  file with the same weight and was winning.
- Disconnect specs (`leave.test.ts`, `disconnect.test.ts`) need the server started with
  `PAUSE_MS=3000`, as the overview says; without it they fail on `no "pause" message`.

### Found, out of scope, not fixed

- **`spec/layout/reveal.test.ts` "the person the host pulls in can still press I'm ready" is
  flaky, and not because of Task 12.** It failed 3 of 3 alone on clean builds of `3c6e8aa` and
  `635fd25` (no Task 12 code), yet passed in one later full run and failed in another, so it
  depends on timing (line 459 expects no `alertdialog` for Ana right after she pulls Di in).
  Needs a wait-for-the-thing fix in its own change.
- Full `pnpm check` runs on this machine fail 2 to 7 timing-sensitive specs that differ each run
  (`lobby-people`, `home`, `lobby`, `wheel`, `voice` hooks, `attract`) and pass alone 3 of 3; the
  server also reached its 40-lobby cap (21 `lobby-full`). The last run: 1269 of 1274 passed.
- `src/game/sim/events.test.ts:3` has an unused `tap` import (a biome warning), from phase 04.
- A stash `task12-spectatorchat-wip` exists that this session did not make; left alone.
