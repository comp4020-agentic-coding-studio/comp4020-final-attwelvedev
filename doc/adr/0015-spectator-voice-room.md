# 15. Spectators share a chat and a voice room that never reaches players

## Status

proposed

## Context

With lobbies of up to six (ADR 0013), two or three people are spectating at
any time. They had nothing to do together. In app, spectators must never
reach players, or they would be a free channel around every role's limits.

I weighed text only (cheaper, and people in one room talk aloud anyway)
against chat and voice; I chose both, for remote spectators.

## Decision

- Spectators in a lobby share a text chat and a push-to-talk voice room.
- Voice uses the ADR 0010 relay with spectators as the only senders and
  receivers. The server never forwards either to a player who is playing the
  current room.
- Chat text is never logged; only that a message was sent.

## Consequences

- More relay load on the 256 MB machine, to be measured with player voice.
- A spec check: an active player never receives spectator chat or voice.
