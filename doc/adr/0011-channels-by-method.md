# 11. Channels are routed by method, with a new send and receive table

## Status

accepted

## Context

The first design grouped every message into three families, Say, Sound and
Show, each with one sender and receiver set. Both playtests found the family
names confusing at the reveal and in game, and players glossed over the
comms entirely. The table also left Can't speak with nothing only it could do,
and gave Can't see sends (clips and stamps) it couldn't aim or check.

I weighed keeping the families and only renaming them in the UI. That keeps
the rules but not the problem: the UI still needs one sentence per family, and
any finer rule (Can't see sends faces but not marks) can't be expressed.

## Decision

Route by method: callout, text, voice, clip, face, mark. Each has its own
sender and receiver roles:

| Role | Sends | Receives |
|---|---|---|
| Can't see | talk (callouts, text, voice), faces | talk, clips, game sound |
| Can't hear | talk, clips, faces, marks | faces, marks |
| Can't speak | clips, faces, marks | everything |

The table supersedes the 2026-10-08 spec's channel table. Cooldowns are
unchanged. The UI never says "channel" or a family name; every option names
its receivers from the same table, so the words can't drift from the rules.

## Consequences

- Can't speak becomes the only rich audio-to-visual translator. Can't see's
  only path to Can't hear is faces, a thin but real one.
- Bots, `route()`, the protocol and the perception tests change together.
- Captions show only what the viewer receives, so Can't hear has none.
