# 17. Balance roles by presence: stations and gear replace lead roles

## Status

proposed

## Context

ADR 0012 made sight local so every player knows something the others don't.
The play overhaul then gave each of rooms 2 to 4 a beat one role leads (dark,
alarm, twin cue). Two playtests and the `02-blackout` draft showed that still
leaves one leader and two followers in every beat: Can't see is "deadweight",
taking instructions, Can't speak "does their own thing", and dark beats leave
the others waiting. The task was walking a body through space, which whoever
perceives best does alone.

I weighed:

- **Keeping lead beats, with a gentler ramp** (the 2026-10-21 proposal): it
  rotates who leads, but Can't see still leads nothing.
- **Role abilities** (BOMBANANA's braille): declined in playtest 2, because it
  prescribes what each role does.
- **Deficit by station**, where your missing sense comes from where you stand:
  the boldest option, but it rewrites rotation, the reveal and parts of the
  channel table, which is too much for the time left.
- **Close-up station panels** (Keep Talking): they hide the world and shut
  Can't see out.

## Decision

Rooms 2 to 4 are escape-room puzzles made of **stations** on the floor (safe
dial, wire panel and plaque, keypad, radio, lights-out switches, music box,
vault meta-code). Each station splits its clue, control and feedback so that
no single role, on one tile, with one piece of gear, perceives all three. The
room linter checks this with `viewFor`, and it replaces the overhaul's "bots
without the lead role's sends fail its beat". Bots read answers from the
simulation and only prove a room can be cleared.

Any person can carry one piece of **gear** (earpiece, goggles, stethoscope, UV
torch). Gear changes what that person perceives from the world, never who may
send or receive what (ADR 0011 is unchanged). Answers re-randomise on each
attempt, and a wrong answer sends the whole team to the checkpoint. There is
no recorded speech: every clue is a tone, a count or an instrument.

## Consequences

- Allocation becomes the team's conversation ("who goes where, who carries
  what"), and the game prescribes nothing.
- The narrow channel edges (Can't see to Can't hear is faces only) become
  puzzles in their own right.
- FR12 and FR14 of `specs/2026-10-19-play-overhaul.md` are superseded by
  `specs/2026-10-28-escape-room-heist.md`. The `leads` room metadata goes.
- The sensory-parity invariant gains deliberate exceptions: earpiece and
  stethoscope sounds have no picture, and UV ink and goggles sight have no
  sound.
- Puzzle content costs authoring time per station, and every randomised answer
  must be shown to be solvable.
- The heist version bumps (ADR 0014).
