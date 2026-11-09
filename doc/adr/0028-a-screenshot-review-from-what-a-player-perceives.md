# 28. A screenshot review from what a player perceives

## Status

proposed

The design is `specs/2026-11-07-playtests.md`. Reads the evidence of 0027's regression run.

## Context

The backlog asked for "an agent that plays a heist in a real browser". In the brainstorm I first
proposed bots driving the seats (0027). The user asked how that could be authentic, like real people
playtesting. It cannot be:

- bots read the server's view data, not the screen
- each puzzle has a hand-written decoder
- they coordinate perfectly

A clue sent correctly but drawn unreadably would still be solved. Only the "did we break something"
half of a playtest is covered; the "can people play it" half is not.

We weighed these.

- **Bots only, called a playtest.** Misleading. Rejected, and kept only as a regression run under that
  name.
- **A scripted player.** It also knows the puzzles in advance. Rejected.
- **Three agents playing the heist from screenshots and page text, talking only through the game.** The
  closest automated stand-in for first-time players, and the only automated way to find comms gaps. It
  was the first decision here. Planning put one heist at about $55 on Sonnet and six tasks to build. The
  user judged that budget better spent on new ideas. Parked in the backlog.
- **A model reviewing what each role perceived at each beat of the regression run.** One call per role
  per beat, about 130 for a heist: about $2. It reads what a first-time player would have in front of
  them, and says what it cannot read, what misleads it and what it would do next. It cannot find what
  only playing finds (comms gaps, a plan two players need to share).

## Decision

`pnpm playtest:review <run>` reads a finished regression run's evidence, offline, and asks the model one
question per role per beat.

- **What it is given.** Only what that role perceives:
  - the sighted: the beat's screenshot plus the page's accessible text and captions
  - Can't see: the page's accessible text and the captions (with direction), with no screenshot
  - every seat: what a first-time player saw before (the home page, the role reveal, Can't see's sound
    briefing)
  - never the view data, the room's design (beats' intents, hints, answers), decoders or source
- **What it answers.** A structured list of findings (unreadable, misleading, missing, unclear next
  step) and what it would do next. The report sets that "next" beside the beat's designed intent for
  that role, for the reader only.

The Anthropic SDK is added as a **dev dependency**, used only by the review script and never shipped.
Calls go through the environment's configured `ANTHROPIC_BASE_URL` (the course proxy), so they spend
the user's budget. The command prints its call count and estimate first, and needs `--yes`.

## Consequences

- Finds unreadable clues and misleading labels, which no invariant reaches, cheaply enough to run per
  release.
- Does not find comms gaps or anything that needs play. Human playtests keep that, and fun.
- Its findings are leads, not verdicts: a model reads screenshots differently from people, and it sees
  a bot-played moment rather than one it chose. A finding is checked by a person before anything
  changes.
- On demand only, never in `pnpm check`, never a release gate.
- A dev dependency with a cost: it adds nothing to the 256 MB production image.
- The agent loop stays possible later: it would reuse 0027's seam and the regression run's drivers.
