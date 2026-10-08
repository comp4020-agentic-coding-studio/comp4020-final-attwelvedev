# Notes for the README

**These are notes, not README text.** The README is yours to write (course advice:
the prose is the student's own); nothing here is copied into it. This file is just
where claims worth making, and the evidence behind them, are kept so they don't get
lost between now and the write-up. Delete or reword freely.

## "What good means here": a promise that can be checked

**Sensory parity.** Whatever happens in a room reaches every player through
something that player can perceive. The player who can't see hears it, and it is
captioned; the player who can't hear sees it, in the same moment. That is what a
game built on missing senses has to mean by "fair": nobody is shut out of a fact,
only made to rely on someone else to tell them.

Why it is a good claim for this section: it is not a feeling, it is a test that
can fail.

- Evidence: `src/game/parity.test.ts`. One row per sound the game can make (22 at
  the time of writing), each building a real situation in the simulation and
  checking that Can't see receives the sound, Can't hear receives a visible change
  in the same tick, and the sound has a caption.
- It holds as the game grows: add a sound with no row, or no caption, and the
  build fails (the row table is typed against the list of sounds). The rule is
  written down in `CLAUDE.md`, so a later session of the agent is bound by it too.
- The one deliberate exception is the alarm, which silences the other sounds for
  the players who hear. The test says so; the sighted still see everything.
- Where it came from: in review, the user noticed that plates, crates, the
  checkpoint filling up and the sequence door made no sound at all, and asked for
  parity to be the promise. Logged in `PROCESS_LOG.md` and the phase 05 plan's
  Corrections log.

Honest limits to mention if you use it:

- It proves the information is *sent* to each role; it does not prove a human finds
  the sound distinguishable. That is what playtests are for (not yet run).
- Some sounds are only heard by the player who makes them (your own steps and wall
  bumps); their "sight" is simply watching your own avatar.
- The effects for the sighted are small and calm on purpose (nothing flashes more
  than three times a second; reduced motion fades in place).

## Other claims the repo can back

- **The server sends each role only what it can perceive** (ADR 0007): per-role
  specs read the raw messages on the wire (`spec/perception.test.ts`).
- **Every room is cleared by a recorded script** and the hazards are proven to
  matter (`src/game/rooms/solve.test.ts`).
