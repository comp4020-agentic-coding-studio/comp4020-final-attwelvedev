# Escape-room heist: side jobs as hidden caches

- **Date:** 2026-11-02
- **Status:** Draft (amended 2026-11-02 after Task 56's first build was rejected on human review: a cache is now a secret chamber and a keepsake; see §7)
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
   already taught (a room's cache is never the first appearance of its type) inside a **side
   chamber** in the room's own grid, branching up or down off the room behind a **secret door**.
   Until the door opens the chamber and its door read as solid wall in every sighted or watcher map,
   and the station is not drawn, labelled, heard or listed in any view.
2. Each cache has an **owner**, a spawn seat. The owner rotates by room (room 4 seat 1, room 5
   seat 2, room 6 seat 3, then again), so every player owns two.
3. The owner has a private **riddle**: a motif (moon, star, wave, key, eye or leaf) and one
   sentence ("Where the moon watches, listen twice."). It is in the owner's view and reveal card
   only. No other seat's view, message or log carries it.
4. **Uncovering.** The room holds motif tiles, drawn for the sighted. An Act on the motif tile
   that matches the riddle's motif opens the secret door (a decoy motif tile of another motif may
   stand beside it, so the riddle must be matched, not just any tile pressed). Once open, **anyone
   of any role may walk in**, and the station appears for everyone who can perceive it, with the
   controls and clue of its station type. The door is not a plate-door: it opens by cache state
   and makes no ordinary door click.
5. **Solving.** The cache is worked like any station of its type. A wrong answer re-draws only the
   cache (no dye pack, no send-back, no wrong-answer event beyond the station's own), the rule
   teaching stations already follow.
6. **Presence.** No single role can both uncover and solve a cache alone: the existing presence
   rule (lint) holds for the cache's own controls and clue, and the uncover tile must be
   perceivable by a role other than the one that perceives the cache's clue.
7. **Reward.** Solving the station opens a **second secret door** inside the chamber, on a vault
   alcove where one drawn **item** stands as a real object, worth 1 loot, counted in `lootTotal`
   (so a room's loot of 5 includes it) but in `loot` **only when it is taken**. Rooms 4 to 9 carry
   these six: gold watch, ledger, signet ring, silver goblet, fountain pen, pearl necklace. **Only
   the owner can take it**: an Act on its tile by the owner puts it in a **keepsake slot** separate
   from the gear slot (gear is untouched), adds the loot and counts it as taken for good; an Act by
   anyone else does nothing, and their Act hint says only the owner can take it. On a send-back to
   a checkpoint taken before any step, both doors shut again, the item stands in the vault again
   and the loot is taken back, as loot is; a checkpoint taken after the take keeps it. A cache is
   **found** when its item is taken; **opened** when its vault door opened.
8. **Bots** never uncover, enter, work or take a cache or its chamber. A crew can therefore be unable to finish one when the
   only role that perceives a needed clue is a bot's; that costs the crew one loot and is accepted.
   Rooms still clear with perception-only bots (ADR 0018), whether or not a cache is solved.
   Superseded for working a cache by `specs/2026-11-07-bots-help-caches.md`.

**Feedback: the team moment (same tick for every role)**

9. **Uncovering** plays a team moment: the sighted see the secret door slide into the floor and
   the re-sent map show the chamber; hearing seats hear the `uncover` cue (a soft low thunk, **not**
   the ordinary door click); Can't see also gets the caption "Something opened". Can't hear gets the
   picture and the caption, no sound. The owner is not named.
10. **Solving** opens the vault door the same way and plays the `stash` chime (global, like the goal
    cue, with a row in `parity.test.ts`); a glass chip at the top of the map reads "Ana's side job
    open: the gold watch" for 4 seconds; Can't see gets the chime and the line as a caption; Can't
    hear gets the picture and the caption. The item then **stands in the vault**, still on a plinth
    (it never bobs, so it never reads as the loot diamond). **Taking** it plays the existing `loot`
    chime (a take is loot) with the caption "Ana took the gold watch", the item lifts away and the
    owner's chip takes it.
11. Under **reduced motion** a door does not slide: the wall cross-fades to the open slot over
    300 ms; the take is a cross-fade. Under **high contrast** every fill and outline comes from the
    remapped tokens.

**The owner's surfaces**

12. **Reveal card:** a row "Your side job" with the motif at 48 px, the riddle, and a muted "Only
    you can read this". Seats that do not own a cache get no row and no placeholder.
13. **HUD chip, unsolved:** the motif, "Side job" and the riddle (short on a phone, tap expands).
    **Vault open:** the keepsake plate, the item's name and "Waiting in the vault" (no tick yet).
    **Taken:** the plate, the name, a drawn tick and "Taken by you"; it pulses once (skipped under
    reduced motion) and stays for the room. Neither later state expands.

**Results**

14. **Room cleared** gets a **side-job tile** after the credits and before the buttons, at the
    same width and weight as a player's credit. *Taken:* the item on its plate at 48 px, its name,
    a drawn tick and "Ana took the gold watch. Bo opened the way. Worth 1 loot." (when the owner
    also opened it: "Ana opened the vault and took the gold watch. Worth 1 loot."), in a solid
    `--goal` outline. *Opened but left:* an empty plate and "Side job opened, but the gold watch was
    left behind." in a dashed `--ui-muted` outline (the item was seen, so it is named). *Not found:*
    an empty plate with the motif outline and "Side job not found: where the moon watches, listen
    twice." in a dashed `--ui-muted` outline; the riddle is shown, the answer never. Rooms 1 to 3
    show no tile.
15. **Credits** name who opened the way and who took the item honestly: the server knows who worked
    the station and who took the item, not who gave the clue. The solver's line reads "opened the
    vault: the gold watch" (or "opened {owner}'s vault: the gold watch"); the owner, after a take,
    "took the gold watch". A teammate is a `{seat}` token the page fills in, never a name in the
    server's data or log.
16. **Heist complete** shows a **keepsake shelf** above the rank line: six plates in room order,
    taken ones with the item and its name, the rest empty and dashed with "Room 7, not found" (an
    item left in the vault is not found). It shows even at 0 of 6. This needs the server to keep,
    per room, whether the item was taken and which item it held, across the heist.

**Pictures**

17. Items are drawn in code, not raster: one path table (`Path2D` for the canvas and `<path>` for
    the HUD, from the same strings, as gear's glyphs are drawn) on a 64 px grid, one `--w-line`
    outline, at most three token fills each, a front shade, and a detail layer dropped below 32 px.
    The six silhouettes are distinct without colour and do not reuse a motif.

**Logging**

18. Caches go through `logGame` as kinds only: `cache` with `kind` `uncover`, `solved` or `taken`.
    Never the item, the riddle, the motif, whose it is or who opened or took it.

### 2.2 Non-functional requirements

- **Perception and parity:** the riddle is an own-only view field, gated in `viewFor` and checked
  against the role tables, as is the keepsake slot. The chamber is masked in the map until its door opens. Team-wide events (uncover, solve, take) reach every role in the same tick,
  each in its own channel. `uncover` and `stash` have rows in `parity.test.ts`; the take reuses `loot`.
- **Linting:** the clue-path linter proves, per cache, that its motif has an uncover tile, that the
  tile and the cache's clue are each perceivable by some role, and that no one role has both.
  It also proves the chamber is sealed (unreachable from a spawn with both secret doors shut),
  holds only its own station, borders correctly at both doors and keeps the station's controls
  inside. A cache whose station type is a first appearance fails the pacing rule.
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
- Side jobs in rooms 1 to 3, and more than one cache (or chamber) a room.
- Bots opening a chamber or taking the item; dropping or handing on the keepsake once taken.
- A stuck-for-N-minutes hint for caches.
- Ambience and music (overhaul phase 07).

### 2.4 Assumptions (confirmed)

- The cache is an optional station of an existing type, not a new station type (user, 2026-11-02).
- One cache per room, rooms 4 to 9, owner rotating by seat (user).
- A wrong answer re-draws only the cache (user).
- The riddle is a motif plus a sentence, and teammates convey it by their own channels (user).
- A missed cache shows its riddle on the cleared card (user).
- The six items and the keepsake-plate design (user approved the design pass, 2026-11-02).
- The item counts toward `lootTotal` from the start, and toward loot when taken (my recommendation, approved with the proposal; the take timing is the 2026-11-02 amendment).
- A chamber hangs off the room in its own grid; the secret doors are hidden by the map, not by a new tile (user, 2026-11-02).
- Anyone may enter the chamber; only the owner may take the item, into a slot separate from gear (user, 2026-11-02).

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

**A cache is a station in a hidden chamber.** A `Q` object takes `cache: { owner, motif, riddle, item, tiles, chamber }`. The
`chamber` names a rectangle of the room's own grid (a side room hung off the room, up or down), the secret `D` tile that is its door, and
inside it a vault alcove with its own secret `D` tile and the floor tile the item stands on. The station's parts lie inside the chamber. Until
the motif tile is pressed the chamber, the vault and both doors are sent to sighted seats and watchers as `#` (the view masks them, as it masks
dark zones), the station is in no role's entities, sounds or `act` hint, and an Act on its tiles does nothing. A secret door opens by cache state
(`cacheUncovered`, `cacheBy`), not by plates, and is opened without a `door` event, so it makes no ordinary door click. Everything inside is the
existing station: controls, clue, presence, feedback sounds, `solvedBy`. The new rules are the sealed chamber, the two doors, the standing item,
the owner-only take into a separate slot, loot at the take, and re-drawing only itself on a wrong answer.

**Uncovering is a puzzle in itself.** The riddle names a motif; the room has two or three motif
tiles. Pressing Act on the right one opens the secret door. A decoy makes "which moon?" matter, and
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
  two senses. The owner-only take (2026-11-02) is a lighter form of the same idea: the owner must
  get to the item, so the owner is never skipped, and no carry-back state is needed.
- **A station that appears in place behind a sliding panel, the item a picture on a plate** (the
  first design, built as Task 56 and rejected on 2026-11-02): a panel "hides a whole safe" and a
  picture is not something a heist takes. Replaced by the chamber and the standing item.
- **A visible closed secret door.** Simpler (no masked map, no re-send), but it gives the room
  away and weakens the motif hunt. Rejected by the user, who chose invisible until opened.
- **Anyone takes the item.** Simplest, but the owner could be skipped entirely. Rejected: only the
  owner takes it.

**Data kept across rooms.** The heist record gains `caches: { room; found; item }[]` (`found` = taken), written by
`attach.ts` at each clear and read by `HeistComplete` for the shelf; the cleared message adds `opened` so the tile can say "left behind".

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

The wireframes below are the cleared-card and chip states as amended on 2026-11-02 (three states; "taken" replaces "found").

```
Reveal (owner only)        | (moon 48) Your side job
                           |          Where the moon watches, listen twice.
                           |          Only you can read this.

Chip, unsolved             | (moon 24) Side job  Where the moon watches, li/      (phone: tap expands)
Chip, vault open          | [watch plate] Gold watch   Waiting in the vault      (no tick yet)
Chip, taken                | [watch plate] Gold watch (tick)   Taken by you       (pulses once)

Cleared, taken             | [plate 48] Gold watch                              (tick)
                           |            Ana took the gold watch. Bo opened the way. Worth 1 loot.   solid --goal
Cleared, left behind       | [empty plate] Side job opened, but the gold watch was left behind.     dashed muted
Cleared, not found         | [empty plate] Side job not found: where the moon
                           |               watches, listen twice.                    dashed muted

Heist shelf                | [P] [P] [P] [ ] [P] [ ]    names under; "Room 7, not found"; room order
```

Motion: a secret door slides into the floor over 600 ms with a dust puff (cross-fade over 300 ms under reduced motion); the item stands still on a plinth in the vault; on a take it lifts away with one spark burst and a goal ring at the plinth; top-centre chip fades after 4 s. Never flashes more than
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

## 6. Handoff notes for planning (first planning pass, 2026-11-02; superseded where §7 says so)

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

## 7. Amendment of 2026-11-02: a place and an object

The user played Task 56's first build (a steel panel sliding off a station in place, the item a picture on a plate) and rejected it. The
panel "is hiding a whole safe", and a picture "feels weird as a picture". Their rulings:

- The cache is a **side chamber** in the room's own grid, off the room up or down, behind a **secret door** that animates; anyone of any role may enter.
- Can't see hears a door-opening sound unlike the ordinary door (the accepted `uncover` thunk, with no `door` event); the existing sounds are ok.
- Solving the station opens a **second secret door** on a vault; the item stands there as a real object (the six drawings stay).
- It is **picked up like gear but in a separate slot**; loot counts only at the pickup; **only the owner takes it**.
- Settled in the planning restatement: both secret doors are invisible (solid wall in the map) until they open; a send-back shuts them and puts the item back;
  "found" means taken, and the results show a third state, "opened but left behind"; bots never use a chamber.

Requirements 1, 4, 7 to 11, 13 to 16 and 18 and the assumptions above are amended in place. What stays as built: the six item drawings, `MotifGlyph`, the sounds,
`revealOf`, the cue payload (`n` owner, `item` on the stash), the chip, the reveal row and the moment card. What is replaced: the panel, plate and stash drawing,
and the rule that solving gives loot at once. Handed to `plan-feature`; the plan is `plans/2026-11-02-escape-room-heist-14-0*-*.md` (new Tasks 61 to 65, Tasks 56, 57, 58 and 59 rewritten).
