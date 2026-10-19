# Play overhaul — Phase 01: Comms by method, the wheel, talk keys, arrow captions

- **Date:** 2026-10-19
- **Status:** Approved
- **Requirements confirmed by user:** yes — 2026-10-19
- **Part of:** `plans/2026-10-19-play-overhaul-00-overview.md`. Read it first,
  especially §4.2 (shared types, verbatim), §4.3 (protocol table) and §3
  (commands, conventions). ADR 0011 is the decision.
- **Depends on phases:** none. Before Task 1, the user accepts ADRs 0011–0016
  (status lines changed by the user, not the agent).

## 1. Summary

The new send/receive table routes every message by method; the tray and its
three sheets are replaced by a comms wheel (a marking menu: a flick sends
without drawing it) with receivers named; Enter writes, V talks (hold or
toggle); captions point with drawn arrows. It all runs on today's three rooms,
so playtest 3 can follow straight after.

## 2. Requirements (this phase)

### 2.1 Functional

FR1, FR2 (in-game wording), FR3 (server-side check; until Task 14 "in sight"
is the existing `lineOfSight`), FR4, FR26, FR27, FR28, FR30; FR8's server half
(`from.pos` on faces); A4's `CLAUDE.md` "Shape of the app" line and backlog
moves.

### 2.2 Non-functional

Wheel targets ≥ 48 px on phone; wheel draws only after a 200 ms still hold;
reduced motion: no wheel open/close animation; never colour alone (hatched
"can't send", cooldown numbers); keyboard complete.

### 2.3 Out of scope for this phase

The reveal's send/receive lines (Task 11); the HUD's crew and spectator list
(Task 12); edge pills drawn (Task 20); mark faintness through mist (Task 20).

### 2.4 Assumptions

See overview §2.4. Text keeps no cooldown (as today).

## 3. Existing code context (verified 2026-10-19)

- `src/game/types.ts`: `Family`, `CHANNEL_RULES` (lines 8–13) as quoted in
  spec §3; deleted here.
- `src/game/channels.ts`: `Outgoing` uses `family` + `kind` (lines 35–40);
  `route(roles, from, msg, cd, now)` lines 57–75 filters receivers by role only
  (the sender gets its own message back if its role receives it);
  `COOLDOWN_MS: Record<Family, number> = { say: 0, sound: 3000, show: 1500 }`,
  `STAMP_COOLDOWN_MS = 1000`; `cleanText`, `FACES` (12), `CLIPS` (12),
  `CALLOUTS` (push, up, here, left, stop, right, wait, down, go), `STAMPS`.
- `src/net/game.ts:259–324`: `ChannelRequest`, `Relayed`
  (`cooldown: { family; until; stamp? } | null`), `relay(game, lobby, from,
  req, now)` places a stamp at the sender's tile and calls `addStamp`.
- `src/net/attach.ts:602–648`: `case "say" | "sound" | "show"` → `relay`,
  logs `channel.send` with `{ family, role, kind }`, sends `msg` to receivers
  and to spectators following a receiver, `cooldown` to the sender.
  `attach.ts:682–711` `relayVoice` uses `voiceReceivers`.
- `src/net/voice.ts:40–48` `voiceReceivers(roles, from, voiceOn)` reads
  `CHANNEL_RULES.say`; excludes the sender.
- `src/net/protocol.ts:50–54, 69, 157–177`: the `say`/`sound`/`show` client
  messages, `cooldown` server message, and their parsing.
- `src/game/bots/crew.ts:15–20` `BotSent.cooldown: { family: "say" | "sound" |
  "show"; until } | null`; `botsAct` at 26–35 routes `turn.send`.
  `src/game/bots/brain.ts`: `thinkBlind` reads only `family === "say" && kind
  === "callout"` (line 186); cleared message (502–505); `guideBlind` returns
  say callouts/text (722, 726, 732); `muteClip` returns `{ family: "sound",
  clip: "airhorn" }` (838). `brain.test.ts` asserts `.family` at lines 17, 143,
  159, 170, 185, 197, 208, 350, 436.
- `src/client/hud.ts`: `captionFor(m)` (60–69) by family; `CUE_WORD` (72–95);
  `EVERYWHERE` (97); `cueCaptions(sounds): string[]` (108–124) writes
  `[word, left|right|ahead]` from `pan` with `SIDE = 0.2`; `TrayTile`,
  `trayFor(role)` (150–180) read `CHANNEL_RULES`. Tests in
  `src/client/hud.test.ts` ("trayFor", "captionFor", "cueCaptions").
- `src/client/keys.ts` (whole file, 36 lines): `Sheet`, `KeyAction`,
  `keyAction(open, key, typing)`: 1/2/3 open sheets, 1–9 pick, 0 page, F/T tabs,
  Enter text in Say, Tab key list, V talk, Esc close.
- `src/components/Tray.tsx` (330 lines), `SaySheet.tsx`, `SoundSheet.tsx`,
  `ShowSheet.tsx`, `SheetGrid.tsx`: the tray and sheets; cooldowns tracked in
  `until` by `Clock = "say" | "sound" | "show" | "stamp"` from the `cooldown`
  message, shown as `.cd` with `.cd-n`; text sent by
  `{ t: "say", kind: "text", text }`; V calls `voice.talk(true/false)` on
  keydown/keyup.
- `src/components/useVoice.ts`: `Voice { status; talking; talk(on); speaking;
  lagging }`, `useVoice(socket, role, voiceOn, frames)`; `sends = role !==
  "mute"`, `hears = role !== "deaf"`.
- `src/client/settings.ts`: `Settings { captions; sound; speech; keepOpen;
  highContrast; maskNoiseOn; volume }`, stored under `heist.settings`;
  `defaultsFor`, `loadSettings`, `saveSettings`.
- `src/components/Captions.tsx`: `Captions({ lines, cues }: { lines:
  CaptionLine[]; cues: string[] })`.
- `src/client/render.ts:143` `drawStamp` draws a stamp `y += s*0.65` (at the
  feet); `drawPops` (173–186) drops a pop whose sender isn't in `entities`.
- `src/components/Game.tsx` mounts `<Tray role socket keepOpen onTyping
  voice />` and, on touch, `<TouchControls disabled />` (joystick + Act).
- Specs touching this: `spec/channels.test.ts` (7 its, by family);
  `spec/layout/tray.test.ts` (18 its, sheets); `spec/layout/voice.test.ts`
  (hold V, mic button); `spec/perception.test.ts` and
  `src/game/parity.test.ts` don't send messages.
- `src/lib/gameLog.ts` events `channel.send`, `channel.refused`; detail keys
  `family`, `role`, `kind`, `reason` are in the `redact` allowlist
  (`src/lib/log.ts`).

### Interfaces from earlier phases (exact)

None.

## 4. Approach

**Routing.** `route` looks up `canSend(roles[from], msg.method)` and
`canReceive(roles[seat], msg.method)` for each seat, excluding the sender
(nobody needs their own message echoed; the UI shows "Sent" locally). Voice
uses the same tables with `method: "voice"`. A mark's `at` must be a floor tile
centre the sender can see (`lineOfSight(world, senderPos, at)` and within the
room); otherwise `relay` returns `{ ok: false, code: "cant-send" }`. A face
message carries `from.pos` (sender's position, rounded to 0.1) so a receiver
can point an edge pill at them.

**The wheel (`src/components/CommsWheel.tsx`).** A marking menu over the game
frame:

- Pages, in this order: Talk (9 callouts at compass positions: up/down/left/
  right on the axes, push NW, here NE, wait SW, go SE, stop in the centre),
  Faces (12), Clips (12), Marks (9). The angle of the pointer from the press
  point picks a slot: Talk has 8 sectors plus the centre (within 18 px);
  rings of 12 have 30° sectors; Marks has 8 sectors plus a centre for `x`
  arranged like Talk (arrows on axes; ? NW, ! NE, door SW, key SE).
- Open: hold Q (centred on the frame) or the right mouse button (centred on the
  pointer); on touch, hold the wheel button (56 px, above-left of Act). Moving
  ≥ 24 px before 200 ms and releasing sends the slot under the flick without
  drawing the wheel. Holding still 200 ms draws it (a see-through ring,
  `--glass` slots on a 70 % transparent field). Release over a slot sends;
  release beyond the rim (desktop) or back on the button (touch) cancels; Esc
  cancels.
- Page switch: digits 1–4 while held, the scroll wheel, or a 300 ms dwell on a
  tab label on the top arc. The page last used is remembered; Talk is the
  default for roles that can send callouts, otherwise Faces.
- Each slot shows its label; a slot the role can't send is hatched and the
  receiver plate says "You can't send clips. Ana ● and Cy ▲ can." The plate
  over the aimed slot says, e.g., "Go — ● Ana hears this · ▲ Cy hears this ·
  ■ Bo can't" using `ReceiverLine`. A cooling slot shows the seconds left.
- Marks: picking one closes the wheel and enters placement: a ghost signpost
  follows the pointer; a click or tap on a tile sends `{ method: "mark", id,
  at }`; Esc or the wheel button cancels; a tile out of sight shows "not in
  sight" and doesn't send.
- Number keys without the wheel (also the masked Can't-see path): 1–9 send the
  callout at that grid index (the old `CALLOUTS` order) when the role sends
  callouts, otherwise faces 1–9. Shift+1–9 send faces 1–9 for callout roles.
- Phone quick slot: one 48 px button beside Act; long-press (500 ms) on any
  wheel slot pins it (stored in `Settings.quick`); defaults: Can't see
  `callout:here`, Can't hear `callout:go`, Can't speak `face:f01`.
- Names come from the reveal's crew (`CrewMember[]`, which has `seat`,
  `nickname`, `role`, `bot`).

**Talk keys.** Enter (when not typing) opens a one-line text field above the
controls; Enter sends, Esc closes; while it has focus movement pauses and the
"Typing" badge shows (as today). V: hold to talk by default; a setting "Voice:
hold to talk / press to toggle" (`Settings.voiceMode`). In toggle mode V or the
mic button flips `talk`; a "Mic live" chip with a pulsing dot (static under
reduced motion) shows while open, and blur or leaving the page turns it off.

**Captions.** `cueCaptions` returns `{ text: string; dir: Dir8 | null }`
objects. `Dir8` comes from a new optional `dir?: Vec` on directional
`SoundCue`s (the unit vector from listener to source, rounded to 0.01, set by
`cue()` in perception); `dirOf(v)` buckets it into eight 45° sectors (screen
up = north). Cues in `EVERYWHERE` and the hum keep `dir: null`. `Captions`
draws the arrow with a new `DirArrow` SVG component (`role="img"`,
`aria-label` "from the upper right"); no arrow glyph text (the font is ASCII
only). Message captions (`captionFor`) switch to methods. Can't hear gets no
sound captions at all (FR4): `Game.tsx` doesn't render `cues` for deaf.

## 5. Task breakdown

### Task 1: Route messages by method under the new table

- **Description:** Replace families with methods end to end on the server and
  in bots: the tables in overview §4.2, `route` excluding the sender,
  per-method cooldowns, marks placed at a sent tile with a line-of-sight check,
  faces carrying `from.pos`, voice receivers from the tables, the `send` and
  `cooldown` messages in overview §4.3, logs carrying `method`.
- **Files touched:** `src/game/types.ts`, `src/game/channels.ts`,
  `src/game/channels.test.ts` (new if absent; else extend),
  `src/net/game.ts` (`ChannelRequest` → `SendRequest`, `Relayed.cooldown:
  { method: Method; until: number } | null`), `src/net/protocol.ts` (+ test),
  `src/net/attach.ts`, `src/net/voice.ts` (+ test), `src/game/bots/crew.ts`,
  `src/game/bots/brain.ts` (+ test), `src/lib/log.ts` (allowlist adds
  `method`; keeps `family` only if still used — it isn't), `spec/channels.test.ts`,
  `src/client/socket.ts` types only, `CLAUDE.md` ("Shape of the app": methods
  table instead of Say/Sound/Show), `specs/backlog.md` (move the 2×4-grid,
  restart-heist, per-seat headphones, tap-to-toggle voice, tolerant bots,
  Can't speak contribution, ambience items to Decided with "→ specs/2026-10-19-play-overhaul.md";
  the two pantry items "dropped (pantry archived)").
- **Tests first (red):**
  - `channels.test.ts`: `route` — Can't see sends callout, text, face; refused
    clip and mark (`cant-send`); Can't hear's face reaches Can't speak only
    (Can't see doesn't receive faces); Can't speak's clip reaches Can't see
    only; Can't hear's callout reaches Can't see and Can't speak; a sender
    never appears in its own receivers;
    clip cooldown 3 s, face 1.5 s, mark 1 s, callouts and text none.
  - `protocol.test.ts`: `parseClientMsg` accepts each `send` shape; drops an
    unknown method, an unknown clip/face/mark id, a mark with non-numeric `at`;
    no longer accepts `say`/`sound`/`show`.
  - `voice.test.ts`: `voiceReceivers` — Can't speak can't send; Can't see's
    voice reaches only Can't speak; Can't hear's reaches Can't see and Can't
    speak.
  - `game.test.ts` (`src/net`): `relay` places a mark at the requested tile and
    adds it to `world.stamps`; refuses a mark on a wall or behind a wall; a
    face message has `from.pos`.
  - `brain.test.ts`: expectations rewritten to `method` (e.g.
    `toMatchObject({ method: "clip" })`); a blind bot still acts on callouts.
  - `spec/channels.test.ts` rewritten: "a callout from Can't hear reaches Can't
    see and Can't speak, not the sender"; "Can't speak sending a callout is
    cant-send"; "Can't see sending a clip is cant-send"; "a clip from Can't
    speak reaches Can't see only; a second at once is a cooldown"; "a mark from
    Can't hear lands where it was placed and reaches Can't speak only"; "a face
    from Can't see reaches Can't speak only, with the sender's position"; "free
    text is cleaned".
- **Implementation (green):** as this file's §4 "Routing". Bot outputs map
  `family: "say", kind: "callout"` → `method: "callout"`, etc. `attach.ts`
  logs `channel.send` with `{ method, role }` and `channel.refused` with
  `{ method, reason }`.
- **Also in this task (test seam used by phases 02, 05):** `roomList()` in
  `src/net/attach.ts` reads `process.env.ROOMS_DIR` (default `./rooms`) and
  passes it to `loadRooms(dir)`; documented in `spec/README.md` with a fixture
  directory `spec/fixtures/rooms/` (one tiny room `01-tiny.room`: three
  spawns, one three-plate door, an exit, hints for the bots; it passes
  `lintRoom` and the bots clear it in a few seconds — a unit test in
  `src/game/rooms/lint.test.ts` loads the fixture dir and expects no issues). Test: `spec/channels.test.ts` is unaffected; a
  unit test in `src/net/game.test.ts` isn't needed — the seam is exercised by
  Task 6's and Task 20's specs.
- **Refactor:** delete `STAMP_COOLDOWN_MS`, `Family`, `CHANNEL_RULES` and every
  import of them; `rg -n "family|CHANNEL_RULES"` in `src/` and `spec/` is empty
  apart from comments explaining history.
- **Acceptance criteria:** `pnpm test:unit` green; `spec/channels.test.ts`
  green against a running app; `spec/rooms.test.ts` still green (bots clear
  all three rooms in every rotation under the new table); the old tray still
  compiles because Task 2 removes it — until then `Tray.tsx` sends via a tiny
  adapter (`send({ method, ... })`) so the app stays playable at this commit.
- **Depends on:** none.

### Task 2: The comms wheel replaces the tray

- **Description:** Build `CommsWheel` (this file's §4 "The wheel"),
  `ReceiverLine`, the phone wheel and quick-slot buttons, and number-key
  sending; remove the tray and sheets.
- **Files touched:** new `src/components/CommsWheel.tsx`,
  `src/components/ReceiverLine.tsx`, `src/client/wheel.ts` (pure: slot layout,
  `slotAt(page, dx, dy): number | null`, flick vs hold decision,
  `receiversOf(method, crew, me)`), `src/client/wheel.test.ts`;
  `src/client/keys.ts` (+ test) rewritten for Q, 1–9, Shift+1–9, Enter, V, Esc,
  Tab; `src/components/TouchControls.tsx` (wheel button, quick slot);
  `src/client/settings.ts` (+ test: `quick: string | null`, `voiceMode`);
  `src/components/Game.tsx` (mount the wheel instead of the tray);
  `src/styles/game.css` (wheel, quick slot; delete `.tray`, `.sheet`, `.cells`,
  `.tabs`, `.tile` rules); delete `Tray.tsx`, `SaySheet.tsx`, `SoundSheet.tsx`,
  `ShowSheet.tsx`, `SheetGrid.tsx`, `hud.ts`'s `TrayTile`/`trayFor` (+ their
  tests); `spec/layout/tray.test.ts` → delete, replaced by new
  `spec/layout/wheel.test.ts`.
- **Tests first (red):**
  - `wheel.test.ts`: `slotAt` maps each compass direction to the right callout,
    the centre to stop, 12-ring angles to 0–11; a 30 px flick released at
    120 ms sends; a still 250 ms hold opens; release beyond the rim cancels;
    `receiversOf("clip", crew, me)` names Can't see and Can't speak by
    nickname and lists Can't hear under "can't".
  - `keys.test.ts`: Q opens the wheel; 4 with no wheel open sends `left` for a
    callout role and face 4 for Can't speak; Shift+2 sends face 2; Enter opens
    text; Esc closes; keys ignored while typing.
  - `spec/layout/wheel.test.ts` (browser, three-player `playRoom`):
    "a Q flick up-right from Can't hear reaches Can't speak as 'Here' within a
    second, and the wheel never drew"; "holding Q draws the wheel with
    receivers named, and Can't speak's Talk slots are hatched with who can";
    "a face picked from the wheel shows a cooldown number on its slot";
    "placing a mark on a visible tile shows it to Can't speak there; a wall tile
    says not in sight and sends nothing"; "on a phone, holding the wheel button
    and dragging sends; every wheel and control target is at least 48 px; the
    wheel button, quick slot, joystick and Act don't overlap"; "no axe
    violations with the wheel open at both viewports"; "no horizontal overflow
    on the phone with the wheel open".
- **Exports (consumed by Task 11):**
  ```ts
  // src/client/wheel.ts
  export function receiversOf(method: Method, crew: CrewMember[], me: Seat): { hear: CrewMember[]; cant: CrewMember[] };
  // src/components/ReceiverLine.tsx
  export function ReceiverLine({ method, crew, me }: { method: Method; crew: CrewMember[]; me: Seat }): JSX.Element;
  ```
  `hear` = crew members other than `me` whose role receives `method`; `cant` =
  the rest other than `me`. `ReceiverLine` renders "● Ana hears this · ■ Bo
  can't" with `RoleShape` glyphs (never typed shape characters).
- **Implementation (green):** per §4. The wheel is DOM (SVG ring + buttons) in
  the frame, `position: absolute`, `pointer-events` only while open; it never
  covers the joystick/Act zone. The receiver plate is an `aria-live="polite"`
  region. Reduced motion: no scale/fade animation.
- **Refactor:** `CALLOUT_FACE`, `STAMP_FACE` move with the wheel if only it
  uses them (render still needs `STAMP_FACE` — keep it in `hud.ts`).
- **Acceptance criteria:** new specs green; `rg -n "Tray|SaySheet|ShowSheet|SoundSheet|SheetGrid" src spec` empty;
  no "Say", "Sound", "Show", "channel" text in the game UI
  (`spec/layout/wheel.test.ts` asserts the frame's text content has none of
  them as whole words).
- **Human review:** on a local build (`pnpm build && pnpm start`), the user
  plays room 1 at desktop and phone width with three tabs and judges: flicks
  feel fast and land on the intended slot; the drawn wheel doesn't hide where
  they are walking; receiver lines read clearly. Pass = the user says so.
- **Depends on:** Task 1.

### Task 3: Enter to write, V to talk (hold or toggle), mic live

- **Description:** Text entry and voice controls outside the wheel (this
  file's §4 "Talk keys").
- **Files touched:** new `src/components/TalkBar.tsx` (text field + mic button
  + "Mic live" chip), `src/components/useVoice.ts` (a `mode` argument;
  `talk(on)` unchanged; new `toggle()`), `src/client/settings.ts` (+ test),
  `src/components/Settings.tsx` (the voice-mode choice),
  `src/components/Game.tsx`, `src/styles/game.css`,
  `spec/layout/voice.test.ts` (updated: the hold-to-talk button lives in the
  TalkBar; new toggle cases).
- **Tests first (red):** `settings.test.ts`: `voiceMode` defaults to `"hold"`
  and persists. `spec/layout/voice.test.ts`: "Enter opens the text field,
  Enter sends to Can't speak, Esc closes, and movement keys don't move the
  avatar while typing"; "in toggle mode, V turns the mic on, Mic live shows, a
  second V turns it off"; "leaving the tab turns a toggled mic off"; keep
  "Can't speak has no push to talk at all" (mic button hatched with "Can't
  talk") and the blocked/no-encoder cases.
- **Implementation (green):** per §4.
- **Acceptance criteria:** specs green; text sent by a Can't-see player still
  reaches Can't speak and is spoken for Can't see's receivers as today.
- **Depends on:** Task 2.

### Task 4: Captions point with drawn arrows; only what you receive

- **Description:** Directional sound captions as `DirArrow` + word; message
  captions by method; Can't hear has no sound captions.
- **Files touched:** `src/game/perception.ts` (`SoundCue` gains `dir?: Vec`;
  `cue()` sets it), `src/game/perception.test.ts`, `src/client/hud.ts`
  (`Dir8`, `dirOf(v): Dir8`, `cueCaptions(sounds): CueCaption[]` with
  `interface CueCaption { text: string; dir: Dir8 | null }`, `captionFor` by
  method; held-cue helpers keyed by `text + dir`), `src/client/hud.test.ts`,
  new `src/components/DirArrow.tsx`, `src/components/Captions.tsx`,
  `src/components/Game.tsx`, `src/components/Spectator.tsx`,
  `src/components/Feeds.tsx` (if it renders cue captions),
  `src/game/parity.test.ts` (its caption check uses the new return type).
- **Tests first (red):** `perception.test.ts`: a door to the north-east gives
  a `door` cue whose `dir` points there. `hud.test.ts`: `dirOf` buckets the 8
  directions and the boundaries; `cueCaptions` gives `{ text: "footsteps", dir:
  "E" }` for a cue to the east and `dir: null` for checkpoint/caught/alarm/
  cleared/bump/hum; never contains "left", "right" or "ahead"; `captionFor` of
  a clip is `[Air horn]`, of a face/mark is null. A browser check in
  `spec/layout/wheel.test.ts`: "Can't speak's captions show an arrow image with
  an accessible direction, and Can't hear's frame has no sound captions".
- **Implementation (green):** per §4. `Dir8 = "N" | "NE" | "E" | "SE" | "S" |
  "SW" | "W" | "NW"`.
- **Acceptance criteria:** tests green; parity test still green.
- **Depends on:** Task 1 (Task 2 for the browser check file).

## 6. Phase Definition of Done

- [ ] Every task in §5 is complete and its tests pass
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start` then `pnpm check` passes
- [ ] Task 2's human review accepted by the user
- [ ] Bots still clear rooms 01–03 in every rotation (`spec/rooms.test.ts`)
- [ ] Playtest 3 offered to the user (comms only; its write-up goes in
      `playtests/` and `PROCESS_LOG.md`)
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR1 | Task 1 |
| FR2 (in game) | Task 2 |
| FR3 | Tasks 1, 2 |
| FR4 | Task 4 |
| FR8 (server: `from.pos`) | Task 1 |
| FR26 | Task 2 |
| FR27 | Task 3 |
| FR28 | Task 2 |
| FR30 | Task 4 |
| A4 (CLAUDE.md shape, backlog) | Task 1 |

## 8. Risks / open questions

None.
