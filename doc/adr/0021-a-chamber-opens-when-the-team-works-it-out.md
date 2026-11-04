# 21. A chamber opens when the team works it out, not when a tile is pressed

## Status

accepted

Supersedes the uncover half of 0020 (`doc/adr/0020-side-jobs-are-hidden-optional-stations.md`): its motif tile, its decoy tile, and the rule that a cache is uncovered by an Act on the tile whose motif matches the riddle. Everything else in 0020 stands (a cache is a station in a hidden chamber, the vault and the owner-only take, the keepsake, the credits and the shelf). The design is `specs/2026-11-03-escape-room-cache-reveals.md`.

## Context

0020's caches open when the owner's riddle names a motif (moon, star, wave...) and someone presses the one drawn tile that matches. The user played all six and found it easy and predictable: "always the moon motif", and the star decoy "serves no point". They asked for finding the hidden room to be a real challenge, chose that the riddle should point at a place and not a symbol, chose that the player should do something to the room first, and chose that a sighted or a hearing role may find it, per room.

We weighed these.

- **Keep the motif tile, vary the motif per room.** The cheapest fix. It removes "always the moon", but the hunt is still "find the drawn picture" and the decoy still has no purpose. Rejected.
- **Press a hidden tile with nothing drawn.** A riddle that describes a place. With free wrong tries a player finds it by pressing everywhere, so it is a chore and not a thought. Rejected.
- **Make the chamber always open and the station the puzzle.** Dissolves the problem and loses the secret-door moment. Dropped: the user asked for a harder hunt, not none.
- **An order of presses.** A familiar trick, the only option needing new state (the order so far and a reset rule), and the easiest to brute-force in a small room. Dropped by the user.
- **Do something with a crate, a lever or a lamp.** The most natural reading of "do something to the room". Rejected on the pacing rule: only rooms 1, 2 and 8 hold any of them, so it would teach a new kind of thing in rooms 4 to 9.
- **A reveal built from what the rooms already hold: a gear item on a tile, or a role standing on a tile, with one room marked by sound.** Needs no new kind of object, can be checked by the linter, and cannot be done by walking over tiles at random because the item or the person has to be chosen first. Chosen.

## Decision

A cache has a **reveal** in place of a motif tile. It is one of three kinds, chosen per room:

- **carry**: a named gear item rests on a named floor tile (dropped there or handed over), used in rooms that hold gear;
- **stand**: a named role stands on a named floor tile, used in rooms with no gear;
- **echo**: the named tile sounds `hollow` underfoot to every hearing seat (with a picture twin for Can't hear), so a hearing role can find it by listening; it is then met by carry or stand. One room uses it.

A reveal is a state the simulation checks every tick, not a press: when it is met the chamber's secret door opens and the existing team moment plays, and it **latches open for good**. A wrong try does nothing and costs nothing. A send-back to an earlier checkpoint shuts the chamber again. No tile is drawn for any role, and there is no decoy. The riddle is a sentence only, still private to the owner, and describes the place and the action. Bots never carry, stand or listen for a reveal, so a bot in a stand's role blocks that cache, which costs the crew one loot as before.

The linter proves each reveal is performable (the tile is reachable and not in the chamber or on a spawn, flag, exit or plate; a carry's gear exists in the room and can reach the tile; a stand's role is not the clue's only perceiver; an echo tile is heard by a hearing role) in place of the matching-tile rules.

## Consequences

- The `motiftile` entity, `drawMotifTile`, the motif on `CacheSpec` and `RoleView.cache`, the motif glyph on the reveal row and chip, `seeTile`, and the star decoys all go. Six rooms' `cache.tiles` become `reveal` and their riddles are redrafted.
- `uncover` (a press) becomes `updateReveals` (a state read each tick); the `cache` event and its `uncover` result, the team moment and `syncCacheDoors` are unchanged.
- The `hollow` cue, built for a dial's inspection plate, is generalised to a reveal tile in one room. That touches a parity row, a caption and a synth that were just built, and its picture twin must work with the tile bare until the chamber is open.
- A carry depends on a gear item the room holds. Room 9's stethoscope exists only for its dial cache, so its reveal rests on an item added for this feature.
- A reveal does not stop a determined player from trying every item on every tile, so rooms must offer enough floor to make that slower than reading the riddle; the linter checks the candidate area but cannot judge the feel, which the playtest does.
- Phase 14's caches are built and uncommitted. This replaces the uncover step of its room authoring and tests (Tasks 58 and 59), so it is planned as a new phase and not an edit of the old one.
