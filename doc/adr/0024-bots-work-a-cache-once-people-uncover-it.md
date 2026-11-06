# 24. Bots work a cache once people uncover it

## Status

proposed

Supersedes the bots clause of 0020 (`doc/adr/0020-side-jobs-are-hidden-optional-stations.md`):
"Bots never open, enter, work or take from a chamber". Everything else in 0020, and 0021's way of
uncovering a chamber, stands. Builds on 0018 (perception-only bots). The design is
`specs/2026-11-07-bots-help-caches.md`.

## Context

0020 kept bots out of caches so that a cache stayed a job for the people, and accepted that "a crew
with a bot in the clue's role cannot finish a cache". In play that cost turned out bigger than one
loot. Most caches take two senses at once: room 4's dial needs one person listening at the back with
the stethoscope and another turning the dial. With one person and two bots, the person cannot be in
both places, so the cache cannot be done at all, whichever role the person plays. The user found this
while reviewing the phase 14 demo (backlog 2026-11-05). 0020 itself named the way out: "a relay skill
for bots would lift it".

We weighed these.

- **Keep bots out, and give a person playing with bots a cue they can use alone** (a lamp that
  flickers on the number, for example). This needs a second, easier version of every cache, and it
  removes the two-senses puzzle that makes a cache worth doing. Rejected.
- **Bots help only when a person asks** (a callout or mark at the cache). This needs a new message
  for bots to decode and a new thing for people to learn. Rejected: once a person has uncovered a
  cache, they want it worked, so the asking adds nothing.
- **Bots help on dial caches only** (rooms 4 and 9). This fixes the reported case, but any cache
  breaks the same way when a bot holds the needed role, and every cache's station type already has a
  bot decoder. Rejected.
- **Bots also uncover caches.** The bots could do it, but then a crew of only bots would find
  caches too, and the hidden room would stop being something the people work out. Rejected.

## Decision

Uncovering a cache stays a job for people: no bot job ever leads a bot to uncover one. Once the
chamber is open, the bots treat its station like any other. They drop the beat they are in, walk
into the chamber, work the cache, then go back to the beat. What each bot does comes from the room's
hint jobs, which can now name a cache, its chamber's tiles and its keepsake, but only on jobs marked
as active after that cache is uncovered. A bot learns that a cache is open the way a person does,
from the `uncover` event and the map sent again; it solves the cache from what it perceives and what
teammates send (0018). This holds for all six caches. If the keepsake's owner is a bot, that bot goes
into the vault and takes it, and the loot counts as for a person.

## Consequences

- A crew with bots can finish every cache it uncovers, whichever seats are people.
- A crew of only bots still never finds a cache, so the all-bot clear of every room is as it was.
- A cache whose uncover clue only a bot's role perceives still cannot be opened. That is accepted:
  finding the chamber is the people's part.
- Room files gain cache jobs (one set per room, rooms 4 to 9). The linter's "bots never go in" rule
  becomes "bots go in only on a cache job". Each set of jobs is checked by a test in which one person,
  scripted to uncover the cache and nothing else, plays with two perception-only bots.
- Bots gain a job kind for taking a keepsake, and a way to stop their beat on an uncover and pick it
  up again afterwards, including after a send-back shuts the chamber.
- No new sound, view field or message, so perception and parity are unchanged.
- Bots in a chamber cost time on the room's clock. That is the crew's trade, as it is for people.
- When this is accepted, 0020's status gains "its bots clause superseded by 0024" (a status-only edit).
