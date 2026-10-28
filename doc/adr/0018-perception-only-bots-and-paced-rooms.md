# 18. Perception-only bots and a paced room sequence

## Status

proposed

Relates to 0017 (balance by presence, stations and gear), which is itself proposed.

## Context

Bots have to clear every room in every role rotation (`spec/rooms.test.ts`). For the escape-room
stations (spec `2026-10-28-escape-room-heist.md` FR3) we let bots read station answers straight
from the simulation, on the reasoning that the presence linter would carry "every role is
needed". The first playtest of the stations draft showed the cost: I could not solve a single
station, because most clues never reached a person (a plaque never drawn, switches with no
target, a vault fed by nothing), and the bots cleared the room anyway. The test that was meant
to prove a room can be cleared proved only that the simulation has an answer.

The same playtest showed the room asked me to learn every station type at once, and the
existing first room already teaches about eleven kinds of object in forty tiles.

We weighed keeping sim-reading bots and adding a stronger linter (cheaper, but a linter can only
show a clue is perceivable, not that it is enough), and fewer station types or fewer rooms
(cheaper to build, but each would still have to teach too much).

## Decision

Bots solve stations only from their own role's view and the messages they receive, as a person
would: reading plaques, comparing a target card, telling pitches and counts apart, carrying
symbols between wings. Each station type ships with that bot skill, and a room is not finished
until these bots clear it. A clue-path linter rule sits in front of them, failing a room whose
clue cannot reach a human role or whose implicit link lacks a matching motif at both ends.

The heist becomes nine short rooms, each introducing at most two new kinds of thing, each new
station type taught first in a forgiving version (a wrong answer re-draws only that station).
Rooms 1 to 3 teach the basics; rooms 4 to 9 add two station types or gear each, ending in the
vault.

## Consequences

- "Bots clear it" means again what it says: a person with the same senses could have.
- Every station type costs more to add: its bot has to decode what it perceives. This is the
  largest single cost of the escape-room work.
- The current three rooms are replaced, and the heist runs about thirty minutes. Old leaderboard
  versions stay reachable (ADR 0014).
- Label chips are capped (three on desktop, two on a phone), changing DESIGN.md 4.6.
