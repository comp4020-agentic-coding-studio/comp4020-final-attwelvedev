# 7. A WebSocket game server that sends each player only what their role perceives

## Status

accepted. Supersedes 0004 and 0006.

## Context

I've pivoted from the pantry to a three-player co-op game where each player
is missing a channel: Can't see, Can't hear, Can't speak
(`specs/2026-10-08-sensory-heist.md`). Players move continuously, so the
browser streams input to the server many times a second, and the server
streams world state back at about 20 Hz. The brief still asks for changes in
every open session within about a second, and I'm still on one 256 MB machine
running one Node process (ADR 0001).

The whole game rests on the roles being real. If a Can't-see player's browser
receives the map and just doesn't draw it, anyone with dev tools can cheat,
and "Can't see" is a costume rather than a rule. The same goes for chat: a
Can't-hear player must never receive voice or soundboard clips.

I weighed:

- **SSE + POST (ADR 0004):** fine for the pantry's occasional writes, but a
  POST per input at 20 Hz is wasteful and laggy.
- **Peer-to-peer state sync:** no referee, so no way to enforce perception.
- **A game framework (Colyseus and similar):** solves rooms and state sync,
  but it's a big dependency on a 256 MB machine, and its state-diffing
  assumes everyone sees the same state.

## Decision

- The Astro/Node process also serves a WebSocket endpoint using the `ws`
  package. Lobbies and games run over it.
- The server is authoritative. Each active room runs a headless,
  deterministic simulation at about 20 ticks per second. Clients send inputs;
  they predict their own avatar and reconcile with the server.
- Every tick, the server builds a **per-role view** from the full state,
  using each object's `visible_to` / `audible_to` and the role rules. Channel
  messages (Say, Sound, Show) go through the same filter. A client never
  receives anything its role can't perceive.
- Lobby and seat changes go out on the same socket. Pages that only show
  lobbies (home's open-lobby list) also subscribe over it.
- On reconnect, the client gets a fresh snapshot, not a replay.

## Consequences

- Perception is a promise `spec/` can check: "a Can't-see client never
  receives tiles" is a test on the server's output, not on rendering.
- The simulation must stay free of rendering and networking so tests, bots
  and the room linter can run it directly.
- Per-role views cost three serialisations per tick per room instead of one.
  At showcase scale (~10 rooms) that's small, but it should be measured.
- `ws` is a new dependency (small, no native code). Astro's dev server and the
  production entry both need the upgrade handler wired in.
- Live games are in memory; a redeploy ends them (see ADR 0009).
