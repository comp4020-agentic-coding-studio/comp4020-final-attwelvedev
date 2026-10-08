# 9. Only heist records persist

## Status

accepted. Supersedes 0003.

## Context

The brief requires that what someone does is still there when they or anyone
else come back, across restarts and redeploys. `/data` is the only storage
that survives (`fly.toml`). A game session is inherently temporary: a lobby
of three people for ten minutes.

ADR 0003 put the pantry's SQLite database and photos on `/data`. There are no
photos now.

I weighed what to keep:

- **Campaign progress** (rooms unlocked per device): persistent, but nobody
  sees anyone else's, so it adds nothing for co-presence.
- **Player-made rooms:** the most ambitious answer, but a level editor is a
  second product.
- **Persisting live lobbies and games:** a redeploy mid-game is rare, and
  resuming a real-time simulation from disk is a lot of work for little gain.

## Decision

- SQLite (better-sqlite3 + Drizzle, ADR 0001) on `/data` holds **heist
  records** only: per-room and full-heist runs with team name, nicknames
  (bots marked), time, loot and date.
- The leaderboard ranks them by time, per room and for the full heist.
- Lobbies, seats and live games live in memory and are lost on restart.

## Consequences

- At the showcase, teams race each other's records, which gives competition
  between teams without building a versus mode.
- A redeploy ends games in progress. Deploys should avoid live sessions, and
  the README says so.
- Records outlive the room files they were set on. A changed room needs a new
  room version so old times aren't compared against a different layout.
