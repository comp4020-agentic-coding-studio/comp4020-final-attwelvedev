# 8. A person is an anonymous device with a nickname

## Status

accepted. Supersedes 0002 and 0005.

## Context

The game is played in bursts, mostly by people who've just been handed a
lobby code at a showcase or by friends in the same room. Signing up would
kill that. But the server still has to tell players apart, hold a seat for
someone whose Wi-Fi drops mid-room (the 45 s disconnect pause), and put
names on the leaderboard.

The pantry used household members with device tokens (ADR 0002) and optional
passkeys (ADR 0005). Households and long-lived identity no longer exist here.

I weighed:

- **Accounts or passkeys:** durable identity nobody needs for a ten-minute
  heist, and friction at exactly the wrong moment.
- **No identity at all (socket only):** a dropped connection loses the seat,
  and a refresh kicks you out of your own game.

## Decision

- The first visit sets a random device token in an HTTP-only cookie. The
  server stores and logs only its hash.
- A player picks a nickname when joining a lobby. Nicknames are per lobby,
  not per device, and aren't unique.
- A seat belongs to a device token for the life of the lobby, so
  reconnecting from the same browser takes the seat back.
- The leaderboard shows the team name and the three nicknames from that run,
  with bots badged. It never shows device identifiers.

## Consequences

- Rejoining works across refreshes and drops, but not across devices or
  cleared cookies. That's acceptable for a session game.
- No passkey code or device-link flow carries over.
- Nicknames are free text shown on a public leaderboard, so they need a length
  limit and basic filtering. Logs must not record them beyond what the
  leaderboard already shows.
