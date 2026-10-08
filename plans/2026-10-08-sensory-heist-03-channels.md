# Sensory heist — Phase 03: Channels

- **Date:** 2026-10-08
- **Status:** Approved
- **Requirements confirmed by user:** yes — 2026-10-08
- **Part of:** `plans/2026-10-08-sensory-heist-00-overview.md`. Read it first,
  especially §4.2 (`CHANNEL_RULES`), §4.3 (protocol), §4.4.
- **Depends on phases:** 02.

## 1. Summary

The three channel families (Say, Sound, Show) run through one server-side
router that enforces who may send, who receives, and cooldowns. The tray from
spec §4.1 is wired: callout grid, text, soundboard, faces and stamps; text to
Can't see is spoken by speech synthesis; captions are a setting.

## 2. Requirements (this phase)

### 2.1 Functional

FR16, FR17, FR18, FR20, FR21, FR22 fully; FR15 for channel messages. Voice
(FR19, FR23) is phase 08.

### 2.2 Non-functional

A channel message reaches receivers within 1 s; tray usable by keyboard
(1/2/3 open, 1–9 pick, Enter text, Esc close, hold Tab for keys) and touch
(≥ 48 px targets); cooldowns shown with a number, not colour alone.

### 2.3 Out of scope for this phase

Voice (phase 08); bots sending messages (Task 15); logging channel use
(Task 11); real-life presets for captions (Task 19 — this phase adds the
captions toggle in a settings sheet only).

### 2.4 Assumptions

See overview §2.4. Each Pixabay clip and bluemoji face is checked against its
licence page **before** it is committed; an unclear licence means the asset is
dropped, not bundled.

## 3. Existing code context (verified 2026-10-08)

No channel code exists yet. `qrcode-generator` and `preact` are the only
client dependencies.

### Interfaces from earlier phases (exact)

Overview §4.2 types. From Task 2/3: `parseClientMsg`, `spec/ws.ts`
(`connect`, `Socket`), `LobbyError`, `ErrorCode` (add `"cooldown"`,
`"cant-send"`). From Task 4: `GameSocket`, `openSocket`. From Task 7:

```ts
// src/net/game.ts
export interface CrewMember { seat: Seat; nickname: string; role: Role; bot: boolean }
export interface Game {
  lobby: string; roomIndex: number; roles: [Role, Role, Role]; world: World;
  ready: Set<Seat>; inputs: Partial<Record<Seat, PlayerInput>>; startedAt: number;
}
// src/game/perception.ts
export interface RoleView { tick: number; ack: number; room: string; role: Role; full: boolean;
  you: { seat: Seat; pos?: Vec }; tiles?: string[]; entities: EntityView[]; sounds: SoundCue[];
  status: RoomStatus; elapsedMs: number; }
```

From Task 8: `src/components/Game.tsx` renders the tray as three placeholder
tiles; `src/client/audio.ts` plays cues through Web Audio.

## 4. Approach

The router is pure (`src/game/channels.ts`): given the game's roles, a sender
seat, a message and the time, it returns either a refusal or the list of
receiver seats plus the cooldown to set. `src/net/` delivers. Spectators
receive what the seat they follow receives (Task 20).

Callouts: `push`, `up`, `here`, `left`, `stop`, `right`, `wait`, `down`, `go`
(3×3 in that order). Text: ≤ 120 chars, trimmed, control characters
stripped. Faces: ids `f01`–`f12` mapped to files in `public/faces/`. Stamps:
`up`, `down`, `left`, `right`, `x`, `question`, `bang`, `door`, `key`, placed
at the sender's tile, fade 8 s. Sound clips: ids mapped to
`public/sounds/*.mp3`, ≤ 8 clips, ≤ 3 s each.

The client speaks `say` text with `speechSynthesis` only when its role is
`blind`; a `mute` client shows it as a caption-style line (and also hears it
spoken if its sound is on). Captions (setting, off by default for blind)
render `[■ Left]` / `[footsteps, left]` per spec §4.1.

## 5. Task breakdown

### Task 9: Channel router with server-enforced rules and cooldowns

**Description.** Implement the rules table and cooldowns, protocol messages
`say`, `sound`, `show`, `msg`, `cooldown`.

**Files touched.** `src/game/channels.ts` (+ test), `src/net/protocol.ts`,
`src/net/attach.ts`, `src/net/game.ts` (holds cooldown state),
`spec/channels.test.ts` (new).

**Interfaces produced (exact).**

```ts
// src/game/channels.ts
import type { Family, Role, Seat, Vec } from "./types.ts";
export const CALLOUTS = ["push", "up", "here", "left", "stop", "right", "wait", "down", "go"] as const;
export type Callout = (typeof CALLOUTS)[number];
export const STAMPS = ["up", "down", "left", "right", "x", "question", "bang", "door", "key"] as const;
export type Stamp = (typeof STAMPS)[number];
export const COOLDOWN_MS: Record<Family, number> = { say: 0, sound: 3000, show: 1500 };
export const STAMP_COOLDOWN_MS = 1000;
export type Outgoing =
  | { family: "say"; kind: "callout"; callout: Callout }
  | { family: "say"; kind: "text"; text: string }
  | { family: "sound"; clip: string }
  | { family: "show"; kind: "face"; id: string }
  | { family: "show"; kind: "stamp"; id: Stamp; at: Vec };
export type ChannelMessage = Outgoing & { from: { seat: Seat; role: Role; nickname: string }; sentAt: number };
export interface CooldownState { until: Record<string, number> } // key `${seat}:${family}` or `${seat}:stamp`
export type RouteResult =
  | { ok: true; receivers: Seat[]; cooldownKey: string | null; until: number }
  | { ok: false; code: "cant-send" | "cooldown"; until?: number };
export function route(roles: [Role, Role, Role], from: Seat, msg: Outgoing, cd: CooldownState, now: number): RouteResult;
export function cleanText(raw: string): string | null; // null when empty after cleaning
```

**Tests first (red).** For every `(role, family)` pair, `route` agrees with
`CHANNEL_RULES` (send allowed or `cant-send`; receivers = seats whose role is
in `receive`; the sender is included only if their role receives). Mute
`say` → `cant-send`. Blind `show` → ok with receivers deaf + mute (FR22).
Sound twice within 3 s → `cooldown` with `until`; after 3 s ok. Stamps cool
down 1 s independently of faces. `cleanText` strips control chars, trims,
caps 120.
`spec/channels.test.ts` (three sockets in a started game): deaf sends a
callout → blind and mute sockets receive `msg` within 1 s, deaf receives
nothing within 1.5 s; mute sends `say` → `error cant-send`; mute plays a
sound → blind receives, deaf doesn't; sound again at once → `error cooldown`;
deaf drops a stamp → mute receives it with `at`, blind receives nothing.

**Implementation (green).** Route in the pure module; `attach.ts` builds
`ChannelMessage` with the sender's nickname and sends `{ t: "msg", ... }` to
each receiver seat; on success it also sends the sender `{ t: "cooldown" }`.
Stamps are also added to the world as fading entities visible to deaf and
mute (extend `EntityView.kind` with `"stamp"`, with `state` = stamp id and an
`age` field; perception test updated: blind never gets stamps).

**Refactor.** None.

**Acceptance criteria.** Tests green; no code path in `src/net/` sends a
`msg` without going through `route`.

**Depends on:** Task 7.

### Task 10: The comms tray, speech for Can't see, captions, and credited assets

**Description.** Wire the tray per spec §4.1 "Comms sheets", receiver arrows,
hatching for can't-send, faces/stamps/soundboard, speech synthesis, captions
setting, and asset credits.

**Files touched.** `src/components/Tray.tsx`, `src/components/SaySheet.tsx`,
`src/components/SoundSheet.tsx`, `src/components/ShowSheet.tsx`,
`src/components/Captions.tsx`, `src/components/Settings.tsx`,
`src/client/speech.ts` (+ test with a fake `speechSynthesis`),
`src/client/keys.ts` (+ test: the key map), `public/faces/*`,
`public/sounds/*`, `CREDITS.md` (new: each asset, author, source URL,
licence, date checked), `src/pages/credits.astro` (new; renders
`CREDITS.md`), `src/lib/requestLog.ts` (`"GET /credits": "view.credits"`),
`spec/layout/tray.test.ts` (new), `spec/credits.test.ts` (new).

**Tests first (red).** `keys.test.ts`: `1/2/3` open Say/Sound/Show; with Say
open, `1..9` map to `CALLOUTS` in order; `Esc` closes; typing in the text
field suspends movement keys. `speech.test.ts`: speaks only for role `blind`
(and `mute` with sound on); cancels a queued utterance when a newer one
arrives within 300 ms of it starting. `spec/layout/tray.test.ts`: in a
started game, the mute HUD's Say tile is hatched and reads "Can't send";
every tile shows receiver arrows matching `CHANNEL_RULES`; pressing `1` then
`4` in the deaf context makes a caption "[■ Left]" appear in the mute context
within 1 s (captions on); zero axe violations with each sheet open at both
viewports; touch targets ≥ 48 px (bounding boxes). `spec/credits.test.ts`:
every file in `public/faces` and `public/sounds` is named in `CREDITS.md`,
and `/credits` answers 200.

**Implementation (green).** Per spec §4.1. Disabled tile tap → one-line toast
("Can't speak: no voice, text or callouts"). Sending closes the sheet unless
"keep open" is set. Cooldown: radial fill + number.

**Refactor.** Share the 3×3 grid component between Say and Stamps.

**Acceptance criteria.** Specs green; `CREDITS.md` lists a licence and a
check date for every bundled asset.

**Human review:** on a local build with three sessions, the user tries every
channel from every role. Pass = arrows read as "who gets it" without
explanation; hatching makes the missing channel obvious and funny rather
than broken; the soundboard clips are funny and inoffensive; spoken text is
intelligible on the blind device.

**Depends on:** Task 8, Task 9.

## 6. Phase Definition of Done

- [ ] Tasks 9–10 complete, tests passing, Task 10 accepted by the user
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start`, then `pnpm check` and `pnpm check:evidence` pass
- [ ] Deployed (ask first); `spec/channels.test.ts` green against fly.dev
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR15 (channel messages) | Task 9 |
| FR16 | Task 9 |
| FR17 | Task 9, Task 10 |
| FR18 | Task 10 |
| FR20 | Task 9, Task 10 |
| FR21 | Task 9, Task 10 |
| FR22 | Task 9 |
| NFR assets credited | Task 10 |

## 8. Risks / open questions

None.
