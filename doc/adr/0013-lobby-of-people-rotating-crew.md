# 13. A lobby is a list of up to six people, and each room picks a crew of three

## Status

proposed

## Context

A lobby had three seats, and roles rotated by seat each room. A fourth joiner
could only watch or start another team. The real-life wizard asked team-wide
questions before anyone had a role, but headphones belong to a person, and
roles change every room (backlog, 2026-10-09). Playtest 2 had six people and
had to split into two lobbies.

I weighed keeping three seats with separate teams (no change), and letting
spectators swap in at checkpoints mid-room (chaotic and hard to build).

## Decision

- A lobby holds up to six players, ordered by the host, plus any number of
  spectators. It can be private (hidden from Open lobbies; the code still
  works). Nicknames can be edited there; duplicates get a number.
- Each room, a fair rotation picks three active players and their roles. The
  others sit out and spectate. At each reveal, the host can swap any two
  people's roles or swap someone in, which resets ready.
- Each person answers their own setup (headphones, in the room or remote,
  captions, gear). Effective settings are recomputed each room from the roles
  and those answers.
- A person's setup is saved in their browser with their nickname and in-game
  settings, sent when they join a lobby, and editable on a /preferences page
  outside any lobby. The server keeps it only for the lobby's lifetime, so
  ADRs 0008 and 0009 stand: no accounts, and nothing but heist records persists
  on the server.
- Restarting the room or the heist needs every active human to accept within
  15 s; bots accept automatically. Back to lobby stays with the host.
- A deliberate leave skips the 45 s disconnect wait; the host picks a bot, a
  sitting-out player (who takes the leaver's role), or the lobby.

## Consequences

- `rolesFor(roomIndex)` becomes a function of the crew and the overrides.
- Records name everyone for the full heist and the three per room (ADR 0014).
- Rotation with five players can't be perfectly even; the lobby shows
  "plays N" so it's visible.
- Preferences don't follow a person to another device or browser, and clearing
  site data forgets them; "in the room or remote" can be stale, so the lobby
  shows it first.
