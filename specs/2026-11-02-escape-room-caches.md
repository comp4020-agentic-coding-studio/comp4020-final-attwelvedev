# Escape-room heist: side jobs as hidden caches

- **Date:** 2026-11-02
- **Status:** Draft
- **Approved by user:** yes, 2026-11-02 (design agreed in the brainstorm; the UI proposal approved
  after a full `frontend-design` pass)
- **Supersedes, in `specs/2026-10-28-escape-room-heist.md`:** FR28 (side jobs: a private bonus
  item on the floor, rooms 2 to 4) and the side-job part of FR30. The clues spec's FR11 ("side
  jobs from room 4") stands and is met by this design. ADR 0020 (proposed) records the decision.

## 1. Problem / intent

Phase 11's first side jobs were a bonus item lying on the floor behind a door, owned by one seat.
The user played them and found three faults: the item was plain loot that anyone fast enough could
take at the end of a room on everyone's behalf; it was a treasure hunt with nothing to work out;
and it was a diamond, not the thing its description named. The user wants side jobs that are
**escape-room puzzles**: players must solve clues to find where the item is, and they must do it
together. Optional, but important: "despite being optional" the cleared screen should treat them
as part of the result.

## 2. Requirements

### 2.1 Functional requirements

**The cache**

1. Rooms 4 to 9 each have exactly one **cache**: an optional station of a type the heist has
   already taught (a room's cache is never the first appearance of its type), hidden until
   uncovered. Until then it is not drawn, labelled, heard or listed in any view.
2. Each cache has an **owner**, a spawn seat. The owner rotates by room (room 4 seat 1, room 5
   seat 2, room 6 seat 3, then again), so every player owns two.
3. The owner has a private **riddle**: a motif (moon, star, wave, key, eye or leaf) and one
   sentence ("Where the moon watches, listen twice."). It is in the owner's view and reveal card
   only. No other seat's view, message or log carries it.
4. **Uncovering.** The room holds motif tiles, drawn for the sighted. An Act on the motif tile
   that matches the riddle's motif uncovers the cache (a decoy motif tile of another motif may
   stand beside it, so the riddle must be matched, not just any tile pressed). Once uncovered the
   cache appears for everyone who can perceive it, with the controls and clue of its station type.
5. **Solving.** The cache is worked like any station of its type. A wrong answer re-draws only the
   cache (no dye pack, no send-back, no wrong-answer event beyond the station's own), the rule
   teaching stations already follow.
6. **Presence.** No single role can both uncover and solve a cache alone: the existing presence
   rule (lint) holds for the cache's own controls and clue, and the uncover tile must be
   perceivable by a role other than the one that perceives the cache's clue.
7. **Reward.** Solving a cache opens a stash revealing one drawn **picture item** worth 1 loot,
   counted in `loot` and `lootTotal` (so a room's loot of 5 includes it). Rooms 4 to 9 carry these
   six: gold watch, ledger, signet ring, silver goblet, fountain pen, pearl necklace. On a send-back
   to a checkpoint taken before the cache was solved, the cache closes and the loot is taken back,
   as loot is. There is nothing on the floor to pick up.
8. **Bots** never uncover or work a cache. A crew can therefore be unable to finish one when the
   only role that perceives a needed clue is a bot's; that costs the crew one loot and is accepted.
   Rooms still clear with perception-only bots (ADR 0018), whether or not a cache is solved.

**Feedback: the team moment (same tick for every role)**

9. **Uncovering** a cache plays a team moment: sighted see a panel slide aside and the cache
   appear; hearing seats hear a short `uncover` cue; Can't see also gets a caption ("A side job
   opened up near the moon"). Can't hear gets the picture and the caption, no sound.
10. **Solving** plays the stash opening: a steel panel slides into the floor, the item rises on
    its keepsake plate, one spark burst and a goal ring; hearing seats hear a new `stash` chime
    (global, like the goal cue, with a row in `parity.test.ts`); a glass chip at the top of the map
    reads "Ana's side job found: the gold watch" for 4 seconds; Can't see gets the chime and the
    same line as a caption; Can't hear gets the picture and the caption. The item then stays
    drawn, still (it never bobs, so it never reads as the loot diamond).
11. Under **reduced motion** the panel does not slide (the stash is open in one frame), the item
    cross-fades in over 300 ms, and the spark is a static four-ray star for 1 second. Under
    **high contrast** every fill and outline comes from the remapped tokens.

**The owner's surfaces**

12. **Reveal card:** a row "Your side job" with the motif at 48 px, the riddle, and a muted "Only
    you can read this". Seats that do not own a cache get no row and no placeholder.
13. **HUD chip, unsolved:** the motif, "Side job" and the riddle (short on a phone, tap expands).
    **Solved:** the keepsake plate, the item's name, a drawn tick and "Found by Bo" (or "Found by
    you"); it pulses once (skipped under reduced motion) and stays for the room. The solved chip
    does not expand.

**Results**

14. **Room cleared** gets a **side-job tile** after the credits and before the buttons, at the
    same width and weight as a player's credit. *Found:* the item on its plate at 48 px, its name,
    a drawn tick and "Ana's side job, found by Bo. Worth 1 loot.", in a solid `--goal` outline.
    *Missed:* an empty plate with the motif outline and "Side job not found: where the moon
    watches, listen twice." in a dashed `--ui-muted` outline; the riddle is shown, the answer
    never. Rooms 1 to 3 show no tile.
15. **Credits** name the solver honestly: the server knows who worked the station, not who gave
    the clue, so a line reads "found by Bo", or "found by you" when the owner worked it. A
    teammate is a `{seat}` token the page fills in, never a name in the server's data or log.
16. **Heist complete** shows a **keepsake shelf** above the rank line: six plates in room order,
    found ones with the item and its name, missed ones empty and dashed with "Room 7, not found".
    It shows even at 0 of 6. This needs the server to keep, per room, whether the cache was found
    and which item it held, across the heist.

**Pictures**

17. Items are drawn in code, not raster: one path table (`Path2D` for the canvas and `<path>` for
    the HUD, from the same strings, as gear's glyphs are drawn) on a 64 px grid, one `--w-line`
    outline, at most three token fills each, a front shade, and a detail layer dropped below 32 px.
    The six silhouettes are distinct without colour and do not reuse a motif.

**Logging**

18. Caches go through `logGame` as kinds only: `cache` with `kind` `uncover` or `solved`. Never the
    item, the riddle, the motif, whose it is or who solved it.

### 2.2 Non-functional requirements

- **Perception and parity:** the riddle is an own-only view field, gated in `viewFor` and checked
  against the role tables. Team-wide events (uncover, solve) reach every role in the same tick,
  each in its own channel. `uncover` and `stash` have rows in `parity.test.ts`.
- **Linting:** the clue-path linter proves, per cache, that its motif has an uncover tile, that the
  tile and the cache's clue are each perceivable by some role, and that no one role has both.
  A cache whose station type is a first appearance fails the pacing rule.
- **Accessibility:** never colour alone (found is a picture and a tick, missed is dashed outline
  and words); phone targets at least 48 px; reduced motion and high contrast as above; names and
  item names wrap, never clip.
- **Layout:** the cleared card stays one centred column; its title, stats, credits, side-job tile
  and buttons stay in view without scrolling on a 1280 desktop, and the board below may scroll.

### 2.3 Out of scope

- A relay skill for bots, so a crew of one person and two bots can finish a cache (considered,
  dropped: optional bonus, large build).
- Caches that give anything but loot (a hint, a spare charge): rejected, it would make skipping
  one cost the team later.
- Side jobs in rooms 1 to 3, and more than one cache a room.
- A stuck-for-N-minutes hint for caches.
- Ambience and music (overhaul phase 07).

### 2.4 Assumptions (confirmed)

- The cache is an optional station of an existing type, not a new station type (user, 2026-11-02).
- One cache per room, rooms 4 to 9, owner rotating by seat (user).
- A wrong answer re-draws only the cache (user).
- The riddle is a motif plus a sentence, and teammates convey it by their own channels (user).
- A missed cache shows its riddle on the cleared card (user).
- The six items and the keepsake-plate design (user approved the design pass, 2026-11-02).
- The item counts toward loot and `lootTotal` (my recommendation, approved with the proposal).

## 3. Existing context

Verified in the repo on 2026-11-02.

- **What exists from phase 11 Task 28 (uncommitted):** the `j` tile and its parser, `World.sideJobsDone`
  and `sideJobBy`, `WorldEvent "sidejob"`, `RoleView.sideJob` via `sideJobFor`, the reveal row,
  `lintSideJobs`, `creditsOf` (`src/game/sim/credits.ts`, `lines[]` per seat) and `solvedBy`
  (recorded in `src/game/sim/stations.ts`), the `sidejob` log event, `credits` on `cleared`, and the
  redesigned `RoomCleared` (one column, a card per player). 18 floor items sit in rooms 4 to 9.
- **Stations:** eight types in `src/game/sim/stations.ts`; `drawStations` re-draws unsolved answers
  per attempt; a `teach` station re-draws only itself on a wrong answer (`redrawOne`), the rule a
  cache reuses. `revealOn` shows a solved wing's symbol.
- **Clue paths:** `lintClues` and `lintPresence` in `src/game/rooms/lint.ts`; motifs
  (`MOTIFS`, `isMotif`) and `motifGlyph`/`symbolGlyph` for drawing them.
- **Pacing:** `src/game/rooms/pacing.test.ts` counts new object kinds per room; `sidejob` was added
  to its `EVERYWHERE` set by the user's ruling on 2026-11-02 and is removed again by this design.
- **Rendering and effects:** `src/client/render/stations.ts`, `gear.ts`, `signals.ts`,
  `src/client/fx.ts` (sparks, clouds), `Captions`, `VotePrompt` (a card at the top of the map that
  does not block play).
- **Sound parity:** every sound has a row in `src/game/parity.test.ts`; typecheck fails without one.
- **ADRs:** 0017 (balance by presence) and 0018 (perception-only bots, paced rooms) are proposed;
  this builds on both. The ADR is 0020.

## 4. Design

**A cache is a station that starts hidden.** A `Q` object takes `cache: { owner, motif, riddle,
item }`. A hidden station is not in any role's entities, sounds or `act` hint, and an Act on its
tiles does nothing, until a motif tile marked for it is pressed. Everything after that is the
existing station: controls, clue, presence, feedback sounds, `solvedBy`. The only new rules are
hidden/uncovered state, the stash reward and re-drawing only itself on a wrong answer.

**Uncovering is a puzzle in itself.** The riddle names a motif; the room has two or three motif
tiles. Pressing Act on the right one uncovers the cache. A decoy makes "which moon?" matter, and
the riddle's sentence points at the clue the cache will want ("listen twice" for a dial heard
through a stethoscope). The owner has to say the motif; someone who can see the walls has to
find it; someone with the right sense solves what appears.

**Alternatives weighed.**

- **Visible but locked strongbox.** Easier to build and to read, but it is "a thing sitting
  there", which the user rejected.
- **A hidden-spot search (no station).** Cheap, but nothing can lint that a teammate could ever
  perceive the answer, and it is the treasure hunt the user rejected.
- **A new "cache" station type with its own mechanic.** The ambitious option. Not raised for
  adoption: the eight types already carry bots, sounds, drawing and linters, and a new type would
  need all of that again for a bonus feature.
- **Reframe: drop discovery and make the riddle the puzzle.** Leaves nothing to do in the room.
- **Carry-back** (the picker brings the item to the owner, like gear). The strongest collaborative
  rule, but a new mechanic with HUD and bot cost; superseded by making the cache itself require
  two senses.

**Data kept across rooms.** The heist record gains `caches: { room; found; item }[]`, written by
`attach.ts` at each clear and read by `HeistComplete` for the shelf.

**What stays of Task 28, and what goes.** Kept: the `j` owner/text fields (now carried on the cache),
owner-only view, `creditsOf` and its lines, the `sidejob` log event (renamed `cache`), the reveal
row, the cleared-card redesign. Removed: the floor-item pickup, `lintSideJobs` as written, the 18
placed items, and `sidejob` in the pacing exception.

### 4.1 UI design

Design pass run (frontend-design, read-only), reviewed with the user and approved 2026-11-02. The
design plan is one recurring object, the **keepsake plate**: a cream card (`--w-card`) with a brass
rim (`--w-brass`) and a `--w-line` outline, the item drawn on it. It appears in five places so a
side job always looks like itself. No new colour, type or spacing tokens.

New (each flagged): `ItemGlyph` (HUD component) and canvas `drawItem` from one path table; a CSS-only
keepsake plate; `SideJobTile` (found and missed); `KeepsakeShelf`; a canvas stash panel with a
one-shot spark; sounds `uncover` and `stash`; the copy strings. Reused: `RoomCleared`,
`HeistComplete`, `SideJob`, `RoleReveal`, `RoleShape`, `Captions`, `VotePrompt` (placement of the
glass chip), `motifGlyph`, the door slide, and fx sparks.

```
Reveal (owner only)        | (moon 48) Your side job
                           |          Where the moon watches, listen twice.
                           |          Only you can read this.

Chip, unsolved             | (moon 24) Side job  Where the moon watches, li/      (phone: tap expands)
Chip, solved               | [watch plate] Gold watch (tick)   Found by Bo        (pulses once)

Cleared, found             | [plate 48] Gold watch                              (tick)
                           |            Ana's side job, found by Bo. Worth 1 loot.   solid --goal
Cleared, missed            | [empty plate] Side job not found: where the moon
                           |               watches, listen twice.                    dashed muted

Heist shelf                | [P] [P] [P] [ ] [P] [ ]    names under; "Room 7, not found"; room order
```

Motion: panel slides 400 ms; item plate rises 6 px and scales 0.8 to 1 at 300 to 600 ms; one spark
burst at 400 ms; goal ring at 600 ms; top-centre chip fades after 4 s. Never flashes more than
three times a second. Items: gold watch, ledger, signet ring, silver goblet, fountain pen, pearl
necklace; the watch and the necklace are the least legible at 24 px and must be checked at that
size. The proposal's open questions are settled in §5.

## 5. Probes raised and resolved

| # | Type | What was raised | Resolution |
| --- | --- | --- | --- |
| 1 | contradiction | "Only the owner can see it, yet teammates see it next to it" (my first idea) | Dropped. The riddle is owner-only; teammates act on what the owner tells them. |
| 2 | gap | A treasure hunt has no problem solving | The cache is a station: a clue to uncover it, then its own clue to solve it. |
| 3 | gap | The item was anyone's to grab at the end of a room | There is nothing on the floor; the reward appears when a station is solved. |
| 4 | ambiguity | One cache per seat per room, or per room | One per room, rooms 4 to 9, owner rotating (user). |
| 5 | gap | A wrong answer at an optional puzzle | Re-draw only the cache; no penalty (user). |
| 6 | gap | Can't see cannot read a chip | Teammates convey the riddle (user); the chip stays for those with a screen. |
| 7 | gap | Bots and a cache that a bot holds the clue for | Bots ignore caches; a crew may be unable to finish one; no relay skill (user). |
| 8 | ambiguity | A missed cache on the credits | Show the unsolved riddle, no answer (user). |
| 9 | gap | Pacing: is a cache a new thing? | No: its type must already have been met; a linter rule (user, "ok"). |
| 10 | gap | The solved moment and the owner's chip were a bare "done" | Team moment per role plus a keepsake chip (user). |
| 11 | gap | The cleared screen should treat the side job as important | A side-job tile at credit weight and a heist keepsake shelf (user, design pass). |
| 12 | gap | The uncover step had no look in the design pass | Its own team moment: a panel slides aside, an `uncover` cue, a caption (FR9). |
| 13 | contradiction | "Found with Bo": the server cannot know who gave a clue | Credit the solver: "found by Bo" or "found by you". |
| 14 | gap | The heist shelf needs per-room data | The heist record keeps `caches` across rooms (FR16). |
| 15 | ambiguity | Does the item count in "Loot 3 of 5" | Yes, +1 to `lootTotal` in rooms 4 to 9. |
| 16 | gap | Stash chime global or perceived through walls | Global, like the goal cue; a parity row (rule: team-wide events reach every role). |
| 17 | gap | Desktop essentials above the fold with a new tile | A layout spec measures the buttons' bottom edge against the frame; shrink tile padding first. |
| 18 | assumption | Legibility of the watch and necklace at 24 px | To check at real size when drawn; recorded as a risk. |

## 6. Handoff notes for planning

- **Tier: Architecture.** It changes the room format, the sim, `viewFor`, both linters, rendering,
  sound, the heist record and the wire format of `cleared` and `heist`.
- **Phase 11 is not closed.** Task 28's floor-item work is uncommitted and half of it is replaced.
  Plan the replacement as amended tasks in `plans/2026-10-28-escape-room-heist-11-wrap-up.md`
  (Task 28 split or redefined), keeping what §4 says stays, and say what to remove. Tasks 29
  (comms map), 30 (edition) and 31 (docs, ADRs) stand; Task 31 also takes ADR 0020.
- **Must not be re-litigated:** the cache is a station, not a new type; hidden until uncovered;
  one per room, rooms 4 to 9; bots ignore caches; wrong answer re-draws only the cache; item
  counts as loot; missed shows the riddle; the keepsake plate design; the six items.
- **Rooms to author:** six caches, each with a station type already met, an uncover tile and a
  decoy, a riddle, and a clue only some role perceives. Each is checked with the mockup tool, the
  clue-path linter and `spec/rooms.test.ts`, and played by the user in three tabs.
- **Tests that must be shown to fail first:** the owner-only riddle, the hidden station absent
  from every view, uncover and solve events reaching every role in one tick, a send-back closing
  the cache, the credits and shelf layouts, and the lint rules for motif, perception and pacing.
- **Risks knowingly accepted:** a crew with a bot in the clue's role cannot finish a cache; the
  watch and necklace may need redrawing after a real-size look.
