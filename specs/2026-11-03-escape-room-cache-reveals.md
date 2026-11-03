# Escape-room heist: finding a cache's chamber by working it out

- **Date:** 2026-11-03
- **Status:** Draft
- **Approved by user:** yes, 2026-11-03 (design agreed in the brainstorm; option C, "order of presses", was left out on the user's ruling)
- **Supersedes, in `specs/2026-11-02-escape-room-caches.md`:** FR4 (uncovering by pressing the motif tile that matches the riddle), the uncover half of FR6 (the uncover tile must be perceivable by a role other than the clue's), FR9's "motif tiles" wording, and §4's "Uncovering is a puzzle in itself". The chamber, the station, the vault, the take, the credits and the shelf are unchanged. ADR 0021 records the decision and supersedes ADR 0020's uncover half.

## 1. Problem / intent

Phase 14's caches open when the owner's riddle names a motif (moon, star, wave...) and a player presses the one drawn tile that matches. The user played all six and found it **easy, always the moon, boring and predictable**, and the decoy tile (a star) "serves no point". They want finding the hidden room to be a real challenge. They chose that the riddle should **point at a place, not a symbol**, and, asked what the player should do there, chose to **do something to the room first** rather than only press a tile. Asked who finds it, they chose **either a sighted or a hearing role, chosen per room**. They ruled out an order-of-presses puzzle ("slightly more cliché").

## 2. Requirements

### 2.1 Functional requirements

1. **No motif tiles.** A cache has no motif, no motif tile and no decoy. Nothing is drawn on any tile to mark where a chamber opens, for any role. The `motiftile` entity and the riddle's motif glyph go away; a riddle is a sentence only.
2. **A reveal.** Each cache has one **reveal**, a condition the team makes true to open the chamber's secret door. It is one of three kinds, chosen per room (FR3 to FR5). Once met it **latches open for good**, as an uncover does today, and plays the same team moment (the `uncover` cue, the slid door, the caption). A send-back to a checkpoint taken before it shuts the chamber again, as today.
3. **Carry (a gear item on a tile).** The riddle names a place; the reveal is met when a named gear item **rests on** a named floor tile (dropped there with G, or put down by a hand-over). Anyone of any role may do it. Used in rooms that hold gear (4, 7, 8, 9).
4. **Stand (a role on a tile).** The reveal is met when a named **role** (Can't see, Can't hear, Can't speak) is standing on a named floor tile at the moment it is checked. Used in rooms with no gear (5, 6).
5. **Echo (heard).** In one room (8, the music room) the reveal tile is marked **only by sound**: a seat standing on it makes the `hollow` step cue, so a hearing teammate (and Can't see in particular) can find it by listening to someone walk. The reveal is then met by the carry or stand rule on that tile. Every sound has its sight twin (the parity rule): Can't hear sees the walker's own figure standing on the tile, which is the picture the existing `hollow` parity row already uses, so no role is left out. The flush plate drawing is shown on the tile only once the chamber is open; until then the tile is bare floor to the eye.
6. **A wrong try is free.** Dropping the item on, or standing the role on, a wrong tile does nothing and says nothing: no penalty, no sound, no caption.
7. **The place is checkable.** The linter proves, per cache, that its reveal is **performable**: the named floor tile is reachable by walking from a spawn with every door open; for a carry, the named gear can be carried to it without leaving the room; for a stand, a body can stand on it; the tile is not inside the chamber or the vault; and the tile is not one a team stands or drops things on by accident on the way (not a spawn, checkpoint, exit or plate, and for a carry not within 2 tiles of the named item's starting tile or of any part of a station in the room, so the item is not dropped there while it is being used for something else).
8. **The split stays.** The existing presence rule holds: the cache's own clue (the one that solves its station) must be perceivable by a role other than the one the reveal depends on. A stand reveal names a role, and the clue must not be that role's alone.
9. **Bots.** Bots never carry, stand or listen for a reveal, and a bot in the role a stand names can never open that chamber. That costs the crew one loot and is accepted, as the caches spec already accepts it. A room still clears with perception-only bots whether or not any chamber is opened.
10. **The riddle.** Still a private sentence on the owner's reveal row and chip, never in any other seat's view. It now describes the place and the action ("The stethoscope belongs where the wall sounds hollow"), never a symbol. The agent drafts the six sentences; the user revises them after the playtest.
11. **Nothing in the hidden state leaks.** Until the reveal is met no view, sound, caption or label carries any sign of the chamber, the reveal tile or the condition's progress. A gear item resting on the wrong tile, or on the right tile before the chamber is revealed, looks like any gear on the floor.

### 2.2 Non-functional requirements

- **Perception and parity:** the riddle stays an own-only view field gated in `viewFor`. The echo cue is a sound with a picture twin for Can't hear (parity row). The reveal check runs in the simulation, never trusts the client, and sends no new entity.
- **Layout and accessibility:** removing the motif tile removes a drawn object, so no new visual language is needed; the chip and reveal row lose the motif glyph and must not leave a gap (phone and desktop, high contrast and reduced motion unchanged).
- **Logging:** the existing `cache` event keeps kinds only (`uncover`, `solved`, `taken`). No tile, item, role or riddle text in any log line.
- **Linting and pacing:** a reveal adds no new kind of object, so the pacing rule is untouched; the linter gains the performability rule (FR7) and loses `seeTile` and the matching-tile rules.

### 2.3 Out of scope

- An order-of-presses reveal (considered, dropped by the user as more cliché and the only kind needing new sim state).
- An open-only-while-held reveal (it could lock someone in a chamber, which the heist's doors are built never to do).
- A penalty, cooldown or hint for a wrong try.
- A new kind of object, or new objects added to rooms to make a reveal possible (the pacing rule: rooms 4 to 9 already hold what each reveal needs).
- Changing the chamber, the vault, the take, the keepsake, the credits or the shelf.
- Bots working a reveal.

### 2.4 Assumptions (confirmed)

- The reveal replaces the motif tile outright; there is no mode that keeps both (user, "leave C out, approved").
- Rooms with gear use carry; rooms without use stand; one room uses echo (the agent's proposal, approved with the summary on 2026-11-03).
- A reveal latches, like every other door in the heist (user, "latch open for good").
- A wrong try is free, and the search area is made large enough by authoring and checked by the linter (user, "free, with a sweep that takes real time").
- Room 9's stethoscope was added for its dial cache, so room 9's carry rests on a gear item that exists only for this feature (the agent; to be confirmed when the room is authored).

## 3. Existing context

Verified by reading the repo on 2026-11-03.

- **Uncover is one function.** `uncover(world, tile, seat)` in `src/game/sim/stations.ts` runs from `updateStations` on an Act edge: a cache whose matching motif tile equals the tile pressed is pushed onto `world.cacheUncovered`, `syncCacheDoors` opens the chamber's door, and a `cache` event `uncover` carries the team moment. `cacheUncovered` is the state a send-back restores from `Snapshot.cacheUncovered`.
- **The tiles are carried in four places:** the parser and `CacheSpec` in `src/game/rooms/format.ts` (`tiles`, `motif`, "exactly one tile matches its motif"), the view (`motiftile` entities in `entitiesFor`, and `cache.motif` in `RoleView.cache`), the renderer (`drawMotifTile`, `src/client/render/chamber.ts`) and the linter (`seeTile`, `lintCaches` in `src/game/rooms/lint.ts`, plus the "tile and clue not one role's alone" rule via `uncoverSplitFault`). The reveal row, chip and `SideJob.tsx` show the motif glyph.
- **Gear is resting state.** `World.gear` holds each item with `at` (a tile, when lying), `heldBy` or `sill`. G drops at the holder's tile (`gearPress`, `src/game/sim/gear.ts`) and a hand-over passes it; a carry reveal reads `at` and the item. A send-back restores `gear` from the snapshot, so the carry reset comes free.
- **The echo cue exists but is narrow.** `hollow` (Task 66) replaces `step` and `footsteps` only on a cache **dial's** `back` tile (`onInspectionPlate`, `src/game/perception.ts`), keyed on `cacheOf(o)` and `type === "dial"`, with `RANGE.hollow = 6`, a parity row, a caption, a synth (`hollowSound.ts`) and a picture twin only via the plate's drawing. Echo in room 8 means generalising it to a reveal tile.
- **Gear per room:** room 4 stethoscope; room 5 none; room 6 none; room 7 goggles and UV torch; room 8 earpiece and goggles; room 9 stethoscope (added with its dial cache). Crates exist only in rooms 1 and 2, lamp switches nowhere, levers only in room 8 (practice levers), so no reveal may depend on them (`pacing.test.ts`).
- **What the user found.** Playtest, 2026-11-03: "discovering the hidden rooms is easy, it's always the moon motif; which is boring and predictable"; "the star also serves no point". Recorded in `plans/2026-11-02-escape-room-heist-14-04-rooms-wrap.md` §9.
- **Tests that name the tiles and will change:** `spec/caches.test.ts`, `src/game/sim/cache.test.ts`, `src/client/render/sight.test.ts`, `src/client/fx.test.ts`, the lint and format tests, the `rooms-cache` fixtures, and each room's `cache.tiles`.

## 4. Design

**A cache's `cache` object loses `motif` and `tiles` and gains `reveal`.** Three shapes, one per kind:

```json
"reveal": {"kind": "carry", "item": "stethoscope", "at": [14, 3]}
"reveal": {"kind": "stand", "role": "mute",        "at": [9, 5]}
"reveal": {"kind": "carry", "item": "earpiece",    "at": [20, 5], "echo": true}
```

`echo: true` marks the tile as one that sounds `hollow` underfoot for every seat, for the hearing and, by its twin, the seeing.

**The check.** Each tick, after movement and gear, `updateReveals(world)` looks at every unrevealed cache: a carry is met when `world.gear` holds that item lying (`at`, not held, not on a sill) on the tile; a stand is met when the seat of that role stands on the tile (the same `tileOf` the plates use). When met it does what `uncover` did: pushes the cache id to `cacheUncovered`, calls `syncCacheDoors`, and pushes the `cache` `uncover` event. The seat on the event is the seat that dropped the item or stood on the tile, or the nearest seat for a carry. The Act edge is no longer involved; a reveal is a state, not a press.

**Why a state and not a press.** A press reveal ("Act on the right tile") is what the user found guessable and dull. A carry or a stand cannot be performed by walking over tiles at random, because the thing carried or the role standing has to be chosen first, and the riddle names it. Wrong tries are free, as the user asked, but the work of choosing the item or the person is the puzzle.

**Echo.** `onInspectionPlate` becomes `onEchoTile`: true on a dial cache's `back` tile (as built) or on any cache's `reveal.at` when `echo: true`. The cue, range, caption, parity row and synth are reused. Its picture twin for Can't hear is the walker's own figure standing on the tile (the parity row's scenario); the flush plate drawing the dial's `back` tile already has is added **only once the chamber is open**, so an unrevealed echo tile is bare floor to the eye.

**What goes.** The `motiftile` entity and `drawMotifTile`; `RoleView.cache.motif` and `CacheSpec.motif` and `tiles`; the motif glyph on the reveal row and chip (they keep the label "Side job" and the riddle); `seeTile`; `uncoverSplitFault`'s tile half; the star decoys. The riddle's `n` and `item` payloads and the whole stash path are untouched.

**The linter.** `lintReveal` replaces the tile checks: the tile is floor, reachable from a spawn with doors open, outside the chamber and vault, not a spawn, checkpoint, exit or plate tile; a carry names a gear item the room holds and that item can be walked to the tile; a stand names a role other than the one that alone perceives the clue (FR8); an echo reveal's tile must be heard by some hearing role from a tile it could stand on. A cache with no reveal is an error.

**Alternatives weighed**

- **Keep the motif and vary it per room** (the cheapest fix: wave in one room, key in another). Considered: it removes "always the moon" but the hunt is still "find the drawn picture", the decoy still has no purpose, and the user chose "a place, not a symbol". Rejected.
- **Press a hidden tile (nothing drawn).** The riddle describes a place and the player presses Act there. It dissolves the symbol but a sweep of the room finds it by pressing everywhere, with free wrong tries. Rejected for the search being a chore, not a thought.
- **Reframe: always open, the station is the puzzle.** Dissolves the hunt, and loses the secret-door moment the user liked. Dropped: the user asked for a harder hunt, not no hunt.
- **Order of presses (option C).** A familiar escape-room trick; the only reveal needing new state (the order so far, a reset rule) and the easiest to brute-force in a small room. Dropped by the user as more cliché.
- **Do something with a crate, lever or lamp.** The most natural "do something to the room". Rejected on the pacing rule: only rooms 1, 2 and 8 hold any of them, so it would teach a new thing in rooms 4 to 9. Gear and roles are already in the rooms.
- **A hearing-only reveal in every room.** Gives Can't see the lead everywhere, but needs a sound and a picture twin in six rooms. Kept to one room (8), as the proposal.

### 4.1 UI design

Design pass skipped: the feature removes a drawn object (the motif tile) and the motif glyph from two existing components, and adds nothing visible beyond a sound that already has its picture. The one visible change is the reveal row and chip **without** the 48 px and 24 px motif glyph; the label, riddle and chevron stay, and the layout specs for the chip (`cache-chip.test.ts`) and the reveal (`reveal.test.ts`) must be re-run at 1280 and 375 to prove no gap is left.

## 5. Probes raised and resolved

| # | Type | What was raised | Resolution |
| --- | --- | --- | --- |
| 1 | assumption | "Place, not a symbol" could mean press-a-hidden-tile or do-something-first | The user chose "do something to the room first". |
| 2 | contradiction | "Do something first" wants crates, levers and lamps, which only rooms 1, 2 and 8 hold; the pacing rule forbids new kinds | Reveals use gear and roles, which every room already has (a survey of the rooms). |
| 3 | contradiction | "Free wrong try, a sweep that takes real time" fits press-a-spot, not do-something-first | A carry or stand cannot be done by sweeping tiles: the item or the person must be chosen first. Free tries stay. |
| 4 | gap | Rooms 5 and 6 hold no gear | They use the stand reveal. |
| 5 | gap | Can't see cannot find a drawn tile (it was drawn only for the sighted) | One room uses an echo reveal, found by listening (user: "either, chosen per room"). |
| 6 | gap | The echo cue is tied to a dial's back tile | Generalised to a reveal tile; its parity row and picture twin carry over. |
| 7 | gap | A reveal that holds only while the item stays could lock someone in | Latches open for good (user). |
| 8 | ambiguity | One reveal rule or several | Carry and stand both, chosen per room (user, "both"). |
| 9 | gap | A stand names a role, and a bot in that role can never open the chamber | Accepted: costs one loot, as the caches spec already accepts (FR9 here). |
| 10 | gap | The presence rule needs a replacement for "tile and clue not one role's alone" | The reveal's role and the clue's role must differ for a stand; for a carry anyone may do it (FR8). |
| 11 | contradiction | Room 9's stethoscope exists only for its dial cache, so its carry depends on my own edit | Recorded as an assumption to confirm when room 9 is authored. |
| 12 | gap | Order of presses (C) | Left out (user). |
| 13 | gap | The motif glyph on the reveal row and chip | Removed; label and riddle stay; layout specs re-run. |
| 14 | gap | A gear item resting on a wrong or unrevealed tile must not tell anyone anything | FR11: it looks like any gear on the floor; no entity, sound or caption changes. |
| 15 | gap | A team could open a carry reveal by accident, dropping the item on the tile while using it for something else (room 4's stethoscope is carried to the safe's back) | FR7: a carry's tile is kept 2 tiles from the item's start and from every station part, and the linter checks it. |
| 16 | contradiction | The echo requirement said Can't hear sees "the same picture a plate uses", but the design draws the plate only once the chamber is open | Reworded: the twin before the reveal is the walker's figure (the existing parity row); the plate appears after. |

## 6. Handoff notes for planning

- **Tier: Architecture.** It changes the room format, the sim (`uncover` becomes `updateReveals`), the view, the renderer, the linter, six rooms and the cache tests. It supersedes ADR 0020's uncover half (ADR 0021).
- **Phase 14 is not closed.** Its Human reviews are accepted only in part and nothing is committed (Tasks 66, 58, 59, 60 are built and uncommitted). Plan this as **a new phase file** that replaces Tasks 58 and 59's room authoring for the uncover step, not an edit of the old files; say which uncommitted work it overwrites (the rooms' `tiles`, `seeTile`, `drawMotifTile`, the motif glyph) and keep the rest.
- **Must not be re-litigated:** no motif tile and no decoy; reveals are carry, stand and echo only; no order-of-presses; a wrong try is free; a reveal latches; bots never work a reveal; the chamber, vault, take, credits and shelf are unchanged.
- **Tests that must be shown to fail first:** a carry reveal opens only with the named item on the named tile; a stand reveal opens only with the named role; a wrong tile or item does nothing; a send-back shuts a revealed chamber; no entity, sound or caption changes before the reveal; the echo cue sounds on a reveal tile for every hearing seat and has its picture twin; the linter refuses an unreachable tile, a gear item the room lacks, and a stand on the clue's own role.
- **Risks knowingly accepted:** a bot in a stand's role blocks that cache; the echo room needs the `hollow` rule generalised, which touches a parity row and a synth that were just built; the riddle sentences are drafted by the agent and revised by the user after the playtest, as before.
- **Open item for the planner:** whether a carry's gear counts when it is carried onto the tile and held (not dropped). The brainstorm said "rests on", so a held item does not count; confirm with the user's first playtest.
