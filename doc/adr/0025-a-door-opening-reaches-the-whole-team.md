# 25. A door opening reaches the whole team

## Status

accepted (2026-11-11)

Amends 0012 (`doc/adr/0012-line-of-sight-perception.md`) for ordinary doors only: their sound has no
reach limit, and their state is not local to line of sight. Everything else in 0012 stands. A cache's
secret and vault doors are not covered (0020, 0021). The design is
`specs/2026-11-07-team-wide-doors.md`.

## Context

Doors latch: once one opens it never shuts, not even on a send-back. Every door in rooms 1 to 9 opens
because the team did something, such as pressing plates, solving stations or playing a sequence, so a
door opening is the room telling the team "that part is done". Under 0012 it was local. The click
carried 8 tiles, and a sighted seat that could not see the door was sent it as closed whatever the
truth (a patch added so a door's outline would not flicker at the edge of the light). A teammate
elsewhere in the room learned that their part had worked only by being told, or by walking back. The
user raised this in the phase 03 review: a door opening should be like loot or the alarm, which every
role perceives from anywhere.

We weighed these.

- **Keep the click and let it carry the whole room.** Cheap, but a click from far away sounds like a
  plate and is easy to miss. Rejected.
- **Keep the click near, and add a team chime for everyone else.** That is two sounds for one thing,
  and players would have to learn both. Rejected.
- **Give the sighted the picture only when the door opens, and draw it closed again out of sight.**
  This contradicts the door staying open, and it is the flicker the patch was hiding. Rejected.
- **Make station and sequence doors team-wide, and leave plate doors local.** Every door marks a step
  done, and the rooms that teach plates are the ones that teach doors. Rejected.

## Decision

A plate, station or sequence door opening is a team-wide event.

- **Sound.** Every hearing seat, anywhere in the room, hears a new synthesised "unlock" (a bolt sliding
  and a low thunk). It plays at full volume and is panned toward the door, as `loot` is. Walls and
  glass do not stop it. It replaces the door's click, and the alarm still silences it as it silences
  every cue.
- **State.** Every sighted seat is sent each ordinary door's true state whether or not the door is in
  sight, so an open door is drawn open everywhere and stays open. What is behind it (stations, guards,
  teammates) is still sent only within line of sight.
- **Picture.** The opening ring plays at the door wherever it is. A door off screen also gets a door
  pill at the screen edge, pointing toward it, using the existing edge pills.

A cache's secret and vault doors are unchanged: wall until open, no door event, and their own
`uncover` and `stash` cues.

## Consequences

- A door's state is no longer exclusive to the seat that sees it. A role learns that a door far away
  opened, but nothing about what is behind it.
- The `door` parity row is rewritten: a listener far away and behind a wall hears it, and Can't hear
  sees it in the same tick. CLAUDE.md's list of team-wide events gains "door".
- The patch in `perception.ts` that sends an unseen door as closed is removed. The outline it guarded
  stays still, because the state no longer changes with where you stand.
- Bots perceive every door's state. That can only add to what a bot knows, but the plan checks each
  room's all-bot clear again.
- DESIGN.md gains the door pill and the unlock. The layout spec for the pill names the overlays it
  shares the screen edge with.
- When doors open in a chain (room 7), each gives its own unlock and its own pill.
