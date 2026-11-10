# 0031. Bots play at a person's pace and teach what they need

## Status

accepted (2026-11-10)

## Context

ADR 0018 made bots perception-only: a bot solves only from what it perceives and what teammates send. That kept bots honest, but they were written and tested against other bots.

When I played room 4 as Can't see with two bots, the safe was unplayable:
- The turner moved a notch every ~450 ms, far faster than I could hear a click and send Stop.
- Nothing told me Stop was wanted, or how to send it.

A survey of every room and seat found the same shape everywhere:
- bot-speed timing windows
- conventions no one explains (which digit first, what an `x` means)
- stray or stale digits taken as answers
- jobs handed to a person who can't receive the signal the job needs (Can't hear owning the safe)
- no bot ever taking over a job a person isn't doing

I weighed several options:
- **Turn-taking** (a bot asks, then waits for Yes/No each step): fair, but slow and unlike the human game. I kept it as a fallback.
- **Swapping roles** so the person turns: impossible, since only the stethoscope holder hears the tumbler.
- **Room labels that teach everyone:** they miss the moment and aren't about the bot.
- **Softer penalties in bot games:** these would make bot games a different game. I rejected it.

## Decision

Bots treat each teammate according to whether it's a person:

- **Pace.** Where a bot's step waits on a person, it uses person timings (about 2 s a notch on the safe), and credits a signal up to about 1 s late. It does this from its own record of what it did, never from the simulation.
- **Teach the ask.** A bot tells the person what it needs and how to send it, in a channel that person receives. A sighted person also gets a chip on the bot. **A chip says what to do and how, never game information**, so the perception rules (ADR 0007, 0011) hold. Unanswered asks repeat at 8 s, 16 s, then every 30 s, held while the person is at the spot, reset on progress, and never within 2 s of another message.
- **Accept signals strictly.** Only from the asked seat, after the ask and since the last send-back, entered 2 s after the last one.
- **Jobs a person can do.** A person is assigned only jobs whose signals they can receive. A bot takes over a person's job after about 60 s with no progress, if one can.
- **A standing guard.** A scripted stand-in person (slow, knowing no conventions, sending only wheel options) must clear every room in `spec/rooms.test.ts`, alongside the all-bot runs.

## Consequences

- One person with two bots, and two people with one bot, can clear every room without knowing how bots work.
- All-bot play keeps its speed; only waits on a person slow down.
- Bot code grows a per-teammate notion of "person" in station work, not just in the guide. Station beliefs carry who sent each digit and when.
- Every new station type or room must say what a person must send and how a bot asks for it, or the stand-in test fails. This adds friction for new rooms, on purpose.
- `spec/rooms.test.ts` gets slower (roughly 3–4×). It may need its own file.
- Bots still don't understand voice. Every ask names a wheel option, and that's a promise the copy must keep.

## Amendment, 2026-11-11 (the ask chip is reversed)

The decision "a sighted person also gets a chip on the bot" is withdrawn. In the owner's playtest the chip floated above the Can't see bot, moved jerkily, showed even with Labels off, and no human has such a thing. The owner ruled that a bot asks exactly as a person would, with no exceptions and no bot-only UI: Can't see and Can't speak get a spoken line and a caption; Can't hear sees a Desperate face (`f06`) pop over the asking bot, sent like any player's face and repeated on the ask clock. It may be mistaken for a teammate's panic, which is accepted. The stand-in as Can't hear is told no ask kind and infers from the face and its own view. Some Can't hear combinations may stop clearing: that is a finding, kept in `NOT_YET` with its cause. The rest of this record stands.
