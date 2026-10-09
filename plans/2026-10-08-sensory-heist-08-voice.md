# Sensory heist — Phase 08: Voice

- **Date:** 2026-10-08
- **Status:** Approved
- **Requirements confirmed by user:** yes — 2026-10-08
- **Part of:** `plans/2026-10-08-sensory-heist-00-overview.md`. Read it first,
  especially §4.3 (binary frames are voice only). ADR 0010 is the decision.
- **Depends on phases:** 07.

## 1. Summary

Push-to-talk voice for Can't see and Can't hear, heard only by Can't see and
Can't speak, relayed through the server as small Opus frames on the game
socket. Late frames are dropped; latency is measured, shown and logged.
Browsers without WebCodecs audio keep callouts and text.

## 2. Requirements (this phase)

### 2.1 Functional

FR19, FR23. FR15 for voice (the deaf client never receives a voice frame).

### 2.2 Non-functional

End-to-end latency target < 250 ms on campus Wi-Fi (measured p50 logged);
≤ 25 frames/s and ≤ 400 bytes per frame per sender; voice off when the host
setting `voice` is false.

### 2.3 Out of scope for this phase

P2P/WebRTC; voice for spectators sending; recording.

### 2.4 Assumptions

See overview §2.4. WebCodecs `AudioEncoder` with Opus is available in current
Chrome/Edge and Firefox; Safari support is feature-detected, not assumed.

## 3. Existing code context (verified 2026-10-08)

Code from phases 01–07 only.

### Interfaces from earlier phases (exact)

Overview §4.2 (`CHANNEL_RULES.say` gives voice's send/receive roles). From
Task 2: `handleUpgrade`, `parseClientMsg` (text frames only; binary frames
currently ignored), `spec/ws.ts` `connect`/`Socket` (extend with
`sendBinary(buf: Uint8Array)` and `nextBinary(timeoutMs?)`). From Task 4:
`GameSocket` (`openSocket` pings every 2 s and knows RTT). From Task 9:
`route(roles, from, msg, cd, now)`, `ErrorCode` (`"cant-send"`). From
Task 11: `logGame`, `GameEvent` (widen with `"voice.latency"`), allowlist
(add `p50`, `p95`, `dropped`). From Task 19: `LobbySettings { inPerson;
maskNoise; othersSoundOff; voice }`, `LobbyState.settings`. From Task 20:
spectators follow a seat.

## 4. Approach

**Frames.** C→S: `[0x01][u32 seq][f64 captureServerMs][opus…]`. S→C:
`[0x01][u8 seat][u32 seq][f64 captureServerMs][opus…]`. `captureServerMs` is
the client's clock plus its offset to the server, estimated from pings
(`offset = serverAt − (sent + received) / 2`, median of the last 5). The
server forwards a frame only when the game is playing, voice is on, the
sender's role may Say, and the sender is within its rate limit, to seats
whose role may hear Say and to spectators following those seats.

**Client.** `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })`;
an AudioWorklet hands 48 kHz mono PCM to an `AudioEncoder` (`opus`,
24 kbps, `frameDuration: 60000`). Receivers decode with `AudioDecoder` and
schedule playback with a 60 ms jitter buffer; frames whose latency exceeds
300 ms on arrival are dropped. Each receiver reports `{ t: "voice.stats",
p50, p95, dropped }` every 5 s while frames arrive; the HUD shows "Voice
lagging" when p95 > 400 ms.

## 5. Task breakdown

### Task 21: Server voice relay with routing, limits and latency logging

**Files touched.** `src/net/voice.ts` (+ test), `src/net/attach.ts`,
`src/net/protocol.ts` (`voice.stats`; `pong` gains `serverAt: number`), `src/lib/log.ts`
(allowlist), `src/lib/gameLog.ts`, `spec/ws.ts` (binary helpers),
`spec/voice.test.ts`.

**Interfaces produced (exact).**

```ts
// src/net/voice.ts
import type { Role, Seat } from "../game/types.ts";
export const MAX_FRAME_BYTES = 400;
export const MAX_FRAMES_PER_S = 25;
export interface VoiceFrameIn { seq: number; captureServerMs: number; opus: Uint8Array }
export function parseVoiceFrame(buf: Uint8Array): VoiceFrameIn | null;
export function encodeVoiceOut(seat: Seat, frame: VoiceFrameIn): Uint8Array;
export function voiceReceivers(roles: [Role, Role, Role], from: Seat, voiceOn: boolean): Seat[] | null; // null = sender may not speak
export interface RateLimiter { allow(seat: Seat, now: number): boolean }
export function createRateLimiter(): RateLimiter;
```

**Tests first (red).** `voice.test.ts`: parse/encode round trip; frames over
400 bytes or with the wrong type byte → null; `voiceReceivers` is null for
mute and for `voiceOn: false`; for deaf it is the blind and mute seats; for
blind it is the mute seat only (a sender never hears itself); the limiter
refuses the 26th frame within a second. `spec/voice.test.ts` (three sockets,
started game): the deaf socket sends a frame → blind and mute sockets receive
it within 500 ms with the deaf seat in the header, and the deaf socket
receives nothing; the mute socket's frame is dropped and answered with
`error cant-send`; a `voice.stats` message produces a `voice.latency` event
in `/stats.json` (`game.events`).

**Implementation (green).** Per §4. Binary frames never reach
`parseClientMsg`. `pong` becomes `{ t: "pong", at, serverAt }` (`serverAt` =
server `Date.now()` when answered); a unit test in `protocol.test.ts` or the
ws spec checks it. A rate-limited frame is dropped silently (no `error`).

**Refactor.** None.

**Acceptance criteria.** Tests green; no voice bytes are logged.

**Depends on:** Task 20.

### Task 22: Push-to-talk client with encode, playback, lag and mic-denied states

**Files touched.** `src/client/voice/capture.ts`, `public/voice-worklet.js`
(plain-JS AudioWorklet module, loaded with `audioWorklet.addModule("/voice-worklet.js")`),
`src/client/socket.ts` (record `{ sent, serverAt, received }` ping samples for `clock.ts`), `src/client/voice/playback.ts`
(+ test: jitter buffer and late-drop logic as a pure function),
`src/client/clock.ts` (+ test: offset median), `src/components/SaySheet.tsx`
(hold-to-talk button), `src/client/keys.ts` (`V` hold), `src/components/Game.tsx`
("Voice lagging", "talking" badge over the speaker's avatar for receivers who
see), `spec/layout/voice.test.ts`.

**Interfaces produced (exact).**

```ts
// src/client/voice/playback.ts
export interface JitterDecision { play: boolean; at: number } // at = AudioContext time
export function schedule(frameLatencyMs: number, nowCtx: number, lastEndCtx: number, frameMs?: number): JitterDecision; // drops when latency > 300 ms
// src/client/clock.ts
export function offsetFromPings(samples: { sent: number; serverAt: number; received: number }[]): number; // median of the last 5
```

**Tests first (red).** `playback.test.ts`: frames within budget are scheduled
back to back after a 60 ms buffer; a frame at 301 ms is dropped; a gap resets
the buffer. `clock.test.ts`: the median ignores an outlier. `spec/layout/voice.test.ts`
(Chrome with `--use-fake-device-for-media-stream
--use-fake-ui-for-media-stream`): holding V in the deaf context makes the mute
context report received frames (expose a `data-voice-frames` counter on the
HUD) within 2 s; with permission denied (launch without the fake-UI flag and
deny), the Say sheet shows callouts and text plus "Microphone blocked: voice
is off. Callouts and text still work." and no mic button; on a browser
without `AudioEncoder` (stub it away via `page.addInitScript`), the same
fallback text names the browser limitation.

**Implementation (green).** Per §4. Mute HUD hides PTT entirely (Say is
hatched). Voice disabled by host shows "Voice is off for this lobby".

**Refactor.** None.

**Acceptance criteria.** Tests green; `spec/browser.ts` `launch()` gains an
optional args parameter for the fake-media flags without changing existing
callers.

**Human review:** on a local build served over HTTPS on the LAN (`mkcert`
local CA trusted on each device; `getUserMedia` and WebCodecs need a secure
context, so plain `http://<lan-ip>` cannot work; two laptops and a phone —
an iOS phone will show the no-`AudioEncoder` fallback, so use Android Chrome
to test voice on a phone; a deployed copy is not needed), the user and two others talk for one
room. Pass = speech is intelligible, delay doesn't break a 2 s cue window,
the deaf device never plays voice, and "Voice lagging" appears when one
device is throttled in devtools. The real Wi-Fi latency claim is checked
after deploy in the phase DoD.

**Depends on:** Task 21.

## 6. Phase Definition of Done

- [x] Tasks 21–22 complete, tests passing, Task 22 accepted by the user (2026-10-10; reviewed on localhost with two Chrome windows and an iPad/iPhone for the fallback, not the plan's LAN/HTTPS setup; "Voice lagging" checked by a spec that delays frames, not by devtools throttling)
- [x] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start`, then `pnpm check` and `pnpm check:evidence` pass
- [ ] Deployed (ask first); one room played on campus Wi-Fi with voice; `/stats` and `flyctl logs` show `voice.latency` p50; record the measured figure for the README's latency claim
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR15 (voice) | Task 21 |
| FR19 | Task 21, Task 22 |
| FR23 | Task 22 |
| NFR voice latency, bandwidth | Task 21, Task 22 |

## 8. Risks / open questions

None.
