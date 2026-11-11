# 20. Side jobs are stations in a hidden chamber, and a keepsake the owner takes

## Status

accepted; its uncover half superseded by 0021, its bots clause by 0024

Changes spec FR28 (`specs/2026-10-28-escape-room-heist.md`, a private bonus item on the floor). The
design is `specs/2026-11-02-escape-room-caches.md`. It builds on 0017 and 0018, which are also
proposed. Amended in place on 2026-11-02, while still proposed, after the user rejected the first
build on a local playtest (see Context).

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
- **A station that appears in place behind a sliding panel, its item a picture on a plate** (the first
  build). Played on 2026-11-02 and rejected: the panel "hides a whole safe", and a picture is not
  something a heist takes. Replaced by the decision below.

## Decision

A side job is a **cache**: a `Q` station of a type the heist has already taught, standing in a
**side chamber** of the room's own grid, one per room in rooms 4 to 9, with an owner seat that
rotates. The owner alone holds a riddle (a motif and a sentence); teammates convey it with their own
channels. The chamber hangs off the room behind a **secret door** that reads as solid wall in every
sighted map until it opens. An Act on the matching motif tile opens it, with an animation and no
ordinary door click; anyone of any role may then walk in. Working the station is its own puzzle, and
a wrong answer re-draws only the cache. Solving it opens a **second secret door** on a vault where one
drawn item stands as a real object. **Only the owner can take it**, into a keepsake slot separate from
gear, and loot counts at the take and not before. A send-back shuts both doors, stands the item back
and takes the loot back. Bots never open, enter, work or take from a chamber, so a room clears
without one and a crew with a bot in the needed role may not finish it.

The riddle and the keepsake slot are own-only fields gated in `viewFor`; the hidden chamber is masked
in the map the view sends, as dark zones are. Opening a door, solving and taking are team-wide events
that reach every role in the same tick; the take reuses the `loot` cue. The credits name who opened
the way and who took the item, not the clue's giver, because the server knows only who worked the
station and who took the item. The heist record keeps, per room, whether the item was taken (found)
and which item it held; the cleared message also says whether the vault was opened.

## Consequences

- No pickup race: only the owner can take the item, and nothing lies on the floor until the team has
  worked the station, so a fast player cannot take another's job. The owner is never skipped: they
  must get to the vault.
- Each cache costs authoring: a chamber of rows appended to the room, two secret doors, a station
  type already met, an uncover tile with a decoy, a riddle, and a clue only some role perceives, each
  linted (the chamber must be sealed) and played in three tabs.
- The view masks the map for the sighted, so the server re-sends tiles on the tick a door opens, and
  the client rebuilds its movement predictor from the new map.
- The clue-path linter grows a rule for caches (motif has a tile, clue and tile are perceivable, no
  one role has both) and the pacing rule says a cache is never a first appearance.
- Two new sounds (`uncover`, `stash`) with parity rows and a take that reuses `loot`; the wire
  format of `cleared` gains a cache result (taken, opened) and `heist` gains the shelf's data.
- Task 28's floor-item work is replaced. Its owner fields, owner-only view, credits and log event
  are kept; the pickup, `lintSideJobs` and the 18 placed items are removed.
- A crew with a bot in the clue's role cannot finish a cache. That costs one loot and is accepted;
  a relay skill for bots would lift it.
