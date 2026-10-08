# 10. In-app voice is relayed through the game server

## Status

accepted

## Context

Voice is part of the Say channel: Can't see and Can't hear can speak, and only
Can't see and Can't speak can hear. In person, people just talk, but remote
teams and players who'd rather not talk to strangers need an in-app channel.

I weighed:

- **Peer-to-peer WebRTC:** the lowest latency (about 50–150 ms), but campus
  and showcase Wi-Fi often need a TURN relay. Fly's fixed setup can't
  reasonably host one, so I'd depend on a third-party service. And the Can't
  hear rule would only be enforced by the client choosing not to play audio.
- **Recording chunks with MediaRecorder:** simple, but chunk sizes push
  latency to 300–500 ms.

The latency question mattered most. A spoken cue's round trip is mostly
human: seeing the camera turn, saying "go", and the other player reacting
takes about 1–1.5 s. The gap between P2P and a well-built relay is under 10%
of that.

## Decision

- Push-to-talk captures the microphone and encodes small Opus frames (about
  60 ms) with WebCodecs. They're sent on the game WebSocket (ADR 0007).
- The server forwards each frame only to roles that can hear the speaker, the
  same filter as every other channel.
- Receivers drop frames that arrive late instead of queueing them. The server
  timestamps frames and logs latency; the HUD shows "voice lagging" when it
  degrades.
- Room design rule: any safe window that relies on a spoken cue lasts at
  least 2 s.
- Voice is built last, after the game works with text, callouts and the
  soundboard.

## Consequences

- The deaf rule is enforced by the server and testable in `spec/`.
- Voice works on any network that allows a WebSocket.
- Bandwidth passes through the 256 MB machine: about 32 kbps per speaker,
  around 1 Mbps for ten teams. That's fine, but it should be measured at
  showcase load.
- WebSockets resend lost packets, so lossy Wi-Fi causes short freezes rather
  than dropped syllables. Dropping late frames limits the damage.
- Browsers without WebCodecs audio encoding get callouts and text only.
