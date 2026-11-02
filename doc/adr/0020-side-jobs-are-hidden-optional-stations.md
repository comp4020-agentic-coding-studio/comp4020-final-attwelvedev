# 20. Side jobs are hidden optional stations

## Status

proposed

Changes spec FR28 (`specs/2026-10-28-escape-room-heist.md`, a private bonus item on the floor). The
design is `specs/2026-11-02-escape-room-caches.md`. It builds on 0017 and 0018, which are also
proposed.

## Context

The first side jobs were a bonus item on the floor behind a door, owned by one seat, taken by
walking onto it. The user played them and found that anyone fast enough could take every item at
the end of a room for everyone else, that there was nothing to work out, and that a diamond did not
look like "a gold watch". The wish was an escape-room puzzle: players solve clues to find where an
item is, together, even though the job is optional.

We weighed these.

- **Keep floor items, hide them better.** Cheap, but still a pickup anyone can race to. Rejected.
- **A hidden-spot search.** The riddle describes a place and you walk there. Nothing can check that
  a teammate could ever perceive the answer, so the linter cannot guard it, and it is still a
  treasure hunt. Rejected.
- **Carry the item back to its owner.** The best collaborative rule, but a new mechanic with HUD and
  bot cost. Superseded by making the cache itself take two senses.
- **A new "cache" station type.** Ambitious and defensible, but it needs its own bot decoder,
  sounds, drawing and linter rules, for a bonus feature. Rejected.
- **A cache is an existing station that starts hidden** and is uncovered by pressing the motif tile
  that matches the owner's private riddle. This reuses the eight station types and everything they
  carry: bots, sounds, drawing, the clue-path linter and the presence rule.

## Decision

A side job is a **cache**: a `Q` station of a type the heist has already taught, hidden until
uncovered, one per room in rooms 4 to 9, with an owner seat that rotates. The owner alone holds a
riddle (a motif and a sentence); teammates convey it with their own channels. An Act on the matching
motif tile uncovers the cache; working it is the station's own puzzle. A wrong answer re-draws only
the cache. Solving it reveals a drawn picture item worth 1 loot. Bots never work a cache, so a room
clears without one and a crew with a bot in the needed role may not finish it.

The riddle is an own-only field gated in `viewFor`. Uncovering and solving are team-wide events that
reach every role in the same tick. The credits name the solver, not the clue's giver, because the
server knows only who worked the station. The heist record keeps, per room, whether the cache was
found and which item it held.

## Consequences

- No pickup race: there is nothing on the floor, so a fast player cannot take another's job.
- Each cache costs authoring: a station type already met, an uncover tile with a decoy, a riddle, and
  a clue only some role perceives, each linted and played in three tabs.
- The clue-path linter grows a rule for caches (motif has a tile, clue and tile are perceivable, no
  one role has both) and the pacing rule says a cache is never a first appearance.
- Two new sounds (`uncover`, `stash`) with parity rows; the wire format of `cleared` gains a cache
  result and `heist` gains the shelf's data.
- Task 28's floor-item work is replaced. Its owner fields, owner-only view, credits and log event
  are kept; the pickup, `lintSideJobs` and the 18 placed items are removed.
- A crew with a bot in the clue's role cannot finish a cache. That costs one loot and is accepted;
  a relay skill for bots would lift it.
