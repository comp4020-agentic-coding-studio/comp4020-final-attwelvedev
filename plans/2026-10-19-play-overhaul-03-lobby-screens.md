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
(UI), FR22, FR23, FR24 (UI), FR29, FR32 (UI), FR33/A1 (UI), FR34 (UI), FR10
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
- **Your setup (`YourSetup`)**: two segmented choices (Headphones Yes/No;
  Where In the room/Remote) and three checkboxes (Always show captions;
  Earplugs or earmuffs; Sleep mask or blindfold), sending `lobby.setup` on each
  change.
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

### Task 10: The lobby screen

- **Description:** `PlayerRow`, `YourSetup`, private toggle, ordering,
  rotation table, nickname edit, `LeaveGuard` for the lobby, per the spec's
  lobby wireframe; replaces the temporary forms from Tasks 5 and 7.
- **Files touched:** `src/components/Lobby.tsx`, new
  `src/components/PlayerRow.tsx`, `src/components/YourSetup.tsx`,
  `src/components/LeaveGuard.tsx`, `src/styles/pages.css`,
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
  the setup form; every control ≥ 48 px on phone.
- **Implementation (green):** §4.
- **Acceptance criteria:** tests green.
- **Human review:** on a local build at 375 px and 1280 px with five browser
  windows, the user judges the lobby against the spec wireframe: clear who is
  set up, who plays which room, and what "private" means. Pass = user says so.
- **Depends on:** Tasks 5–7.

### Task 11: The role reveal

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

### Task 12: The HUD: crew, watchers, live light, votes, leaving, spectator panel

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
  new `spec/layout/hud.test.ts`, new `spec/layout/spectator.test.ts`.
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
  gone (`rg -n "Restart room" src/components` only in the menu and vote copy).
- **Human review:** on a local build the user plays a room with three players
  and two spectators at both widths and judges the HUD, vote and spectator
  panel against the wireframes. Pass = user says so.
- **Depends on:** Tasks 8, 9, 11.

## 6. Phase Definition of Done

- [ ] Every task in §5 is complete and its tests pass
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start` then `pnpm check` passes
- [ ] Tasks 10–12 human reviews accepted
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR2 (reveal) | Task 11 |
| FR10 (UI) | Task 12 |
| FR16 (UI) | Task 10 |
| FR17–FR20 (UI) | Task 10 |
| FR22 | Task 10 |
| FR23 | Task 11 |
| FR24 (UI) | Task 11 |
| FR29 | Task 12 |
| FR32 (UI) | Task 12 |
| FR33 / A1 (UI) | Task 12 |
| FR34 (UI) | Task 12 |

## 8. Risks / open questions

None.
