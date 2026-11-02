# Escape-room heist: Phase 14 (caches): items, chip, moments, results

- **Date:** 2026-11-02
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-02
- **Part of:** `plans/2026-11-02-escape-room-heist-14-00-overview.md`. Read it first (demo §2, types §4).
- **Depends on phases:** 14-01 (Tasks 51 to 53), 14-02 (Task 54), 14-02b (Tasks 61 to 65: the chamber, the keepsake, the masked map). Reads `DESIGN.md` before any look change (CLAUDE.md).
- **Amended 2026-11-02:** Task 56's first build was rejected on human review (§9); Tasks 56 and 57 are rewritten for the chamber and the keepsake. Task 55 stands.

## 1. Summary

Everything a player sees: six drawn items on a keepsake plate (done), the owner's reveal row and chip (riddle, then the item waiting in the
vault, then taken), the **secret doors sliding open** on the map, the **keepsake standing in the vault** and its pickup, the team-moment captions,
the cleared card's side-job tile (three states) and the heist shelf. Ends with screenshots at 1280 and 375, layout specs, DESIGN.md updated and
the user's reviews.

## 2. Requirements (this phase)

### 2.1 Functional

Cache FR9 to FR11 (the drawing and motion half: doors, vault, keepsake), FR12, FR13 (the chip and the slot), FR14 (three states), FR16 (the shelf), FR17.

### 2.2 Non-functional

Never colour alone; targets at least 48 px; reduced motion and high contrast (every fill from tokens, remapped automatically); names wrap,
never clip; the cleared card stays one centred column with title, stats, credits, tile and buttons in view on a 1280 desktop.

### 2.3 Out of scope for this phase

Authoring caches in rooms (14-04). New colour, type or spacing tokens (none are added: the plate uses `--w-card`, `--w-brass`, `--w-line`).

### 2.4 Assumptions

See overview §2. Item pictures are vector paths on a 64 grid (spec FR17); no raster files, no new dependency.

## 3. Existing code context (verified 2026-11-02)

- `src/components/GearGlyph.tsx`: `GEAR_NAME: Record<GearItem, string>`; `GearGlyph({ item, size })` draws an inline `<svg viewBox="0 0 24 24">`
  with `currentColor` strokes; `src/client/render/gear.ts: gearGlyph(...)` is its canvas mirror. The pattern for items: one path table, both
  renderers from it (a unit test reads both and compares).
- `src/components/SideJob.tsx` (as of the Task 61 salvage commit): `SideJob({ cache, names, me })`, a `<button class="side-job">` for `hidden`/`open` (motif, "Side job", the
  riddle, `aria-expanded`) and a `<div class="side-job is-found" role="img">` for the old solved state (to be replaced by Task 56's `vault` and `taken`); CSS `.side-job`,
  `.side-job-text`, `.side-job-found`, `.side-job-tick`, `.cache-moment`, `.reveal-cache` in `src/styles/game.css`.
- `src/components/Game.tsx`: `const [cache, setCache] = useState<RoleView["cache"]>(undefined)`, updated in the 100 ms poll from `view.cache`; `seatNames(crew)`; `Runtime.moment`
  (a cache card's text and expiry, set in `onView` from `cacheMoment`); `<SideJob cache={cache} names={names} me={me} />` and the `.cache-moment` card; `Reveal.cache?:
  RevealCache` (built by `revealOf`); `summary` holds `{ ms, loot, lootTotal, board, credits }` from `cleared` and `heist` holds `{ ms, loot, lootTotal, rank }`;
  `creditRows(summary.credits, reveal.crew)` feeds `RoomCleared`; `rt.fx` entries live `fxMs(fx)` each.
- `src/components/RoomCleared.tsx` (the one-column card, `.cleared`, `.cleared-head`, `.cleared-stats`, `.credits`, `.cleared-actions`),
  `src/components/HeistComplete.tsx` (`{ ms, loot, lootTotal, rank, onBoard }`), `src/components/RoleReveal.tsx` (the `.reveal-cache` row from `cache`), `src/components/RoleShape.tsx`.
- Canvas: `src/client/render/stations.ts` (`motifGlyph(ctx, motif, cx, cy, r)` L168, `symbolGlyph` L130, station drawing),
  `src/client/render/pops.ts` and `src/client/fx.ts` (`Fx { kind: "ring"|"dust"|"spark"|"swing"|"arc"|"cloud"|"uncover"|"stash"; pos; tone; big?; to?; item?; keep? }`,
  `detectFx(prev, next)`, `fxMs(fx)`), `src/client/render/index.ts` (`FLAT`, `STANDING` lists, `scene.reducedMotion`, `scene.nowMs`), doors slide into the floor
  (DESIGN 4.8). Tokens: `--w-card`, `--w-brass`, `--w-line`, `--w-steel`, `--w-steel-front`, `--w-code-*`, `--goal`, `--ui-muted`, `--panel`, `--glass`.
- `src/client/hud.ts`: `cueCaptions(sounds)`, `CUE_WORD`, `hearCues`; `Captions.tsx` renders lines; `VotePrompt` is the model for a card at the
  top of the map that does not block play. `src/client/audio.ts`: cue synthesis (`s.kind === "solved"` plays three rising sines).
- Specs: `spec/layout/leaderboard.test.ts` has the cleared-card layout spec (one column, centred board, stacked/side-by-side credits, essentials
  in view); `spec/layout/hud.test.ts`; `spec/design.test.ts` fails if DESIGN.md names a token or component that does not exist.

### Interfaces from earlier phases (exact)

From 14-01: `ITEMS`, `type ItemId`, `RoleView.cache`, `EntityView.kind` `"motiftile"` with `motif`, `SoundCue.kind` `"uncover" | "stash"` (team-wide).
From 14-02: `ITEM_NAME` is server-side; the client keeps `ITEM_NAMES: Record<ItemId, string>` in `src/client/items.ts` (a unit test keeps them in step).
From Task 55 (committed): `ItemGlyph`, `KeepsakePlate`, `drawItem(ctx, item, x, y, size)`, `ITEM_LAYERS`, `ITEM_NAMES`.
From Task 61 (the salvage commit): `cueCaptions(sounds, names?)`, `cacheMoment(fx, sounds, names?)` (reworked in Task 64), `fxMs(fx)`, `MotifGlyph`, `revealOf`,
`SideJob({ cache, names, me })`, the reveal row `.reveal-cache`, `.cache-moment`, `drawMotifTile`, the `uncover`/`stash` sounds in `audio.ts`.
From 14-02b (exact, overview §4): `RoleView.cache?: { id; motif; riddle; item; state: "hidden" | "open" | "vault" | "taken"; by?: Seat }`;
`RoleView.keepsake?: ItemId`; `RoleView.cacheEvent?: { result: "uncover" | "solved" | "taken"; at: Vec; owner: Seat; item?: ItemId }`;
`EntityView.kind` `"keepsake"` with `keep?: ItemId` (standing in an open vault, sighted only); secret doors are `door` entities that are absent while
closed and `state: "open"` once open; `RoleView.tiles` masks the chamber, the vault and both doors as `#` until each opens, and is re-sent on the tick a
door opens; `SoundCue` `"loot"` from a take carries `n` (owner) and `item`; the cleared message's `cache: { room; found; opened; item; owner; by?; riddle }`
(`found` = taken, `opened` = the vault door opened); `heist.caches[].found` = taken.

## 4. Approach

**Items and the plate.** `src/client/items.ts` holds `ITEM_PATHS: Record<ItemId, { silhouette: string; shade: string; detail: string }>` (64 grid), `ITEM_NAMES`,
and fill choices as token names. `ItemGlyph` (HUD, `<svg>`/`<path>`) and `drawItem` (canvas, `Path2D` from the same strings) both read it; the
detail layer is dropped under 32 px. `KeepsakePlate` is a CSS box (`--w-card` face, `--w-brass` rim, `--w-line` outline); found vs missed is a
modifier (`.is-missed`: dashed `--ui-muted`, empty face with the motif outline).

**The chip.** `SideJob` takes `cache: RoleView["cache"]`, `keepsake: RoleView["keepsake"]` and the crew's nicknames: `hidden` or `open` shows the motif glyph,
"Side job" and the riddle (tap expands on a phone); `vault` shows the plate with the item, its name and "Waiting in the vault" (no tick yet); `taken` shows the plate,
the name, a drawn tick and "Taken by you" (the owner is the only viewer), and pulses once (a CSS animation; `prefers-reduced-motion` skips it). A non-owner has no
chip (they never had one). Neither solved state expands.

**The chamber on the map.** The map arrives masked (Task 64), so a hidden chamber is simply wall. When a door opens, `onView` sees `view.cacheEvent` and starts a
**door slide** keyed to the door's position: the wall tile's front face slides down into the floor over 600 ms, as an ordinary door does (DESIGN 4.8), using the
door's own tokens, with a short dust puff (reduced motion: a 300 ms cross-fade, no slide). The chamber's floor appears from the re-sent map. The vault door does
the same. `fx.ts` gains `kind: "slide"` (`pos`, `tone`) emitted by `detectFx` when a `door` entity that was not in the previous view appears open (first view: none).
**The keepsake** is a `keepsake` entity drawn standing: `drawItem` on a small stone plinth tile at `pos`, with its own soft contact shadow and **no bob**, so it never
reads as the loot diamond. It leaves the map the tick it is taken (the owner's chip is the new home). The top-centre glass chip (the `.cache-moment` card, 4 s,
`pointer-events: none`) carries `cacheMoment`'s words. The take plays the existing `loot` chime (accepted sounds unchanged); the item rising to the owner is a short
lift-and-fade of the drawn item (reduced motion: a cross-fade), a spark burst and a `--goal` ring at the plinth.

**The cleared tile and the shelf.** `SideJobTile` after the credits, before the buttons; `KeepsakeShelf` above the rank line in `HeistComplete`.
Three tile states (taken, opened but left behind, not found) and no-cache; the shelf marks only a take as found.

## 5. Task breakdown

### Task 55: The six items and the keepsake plate  [x] (human review accepted by the user 2026-11-02, after two rounds: more realism, then six fixes to glints and shadows)

- **Description:** draw the six items once, in code, for both the HUD and the canvas; the plate.
- **Files touched:** `src/client/items.ts` (new: `ITEM_PATHS`, `ITEM_NAMES`), `src/components/ItemGlyph.tsx` (new), `src/components/KeepsakePlate.tsx`
  (new), `src/client/render/items.ts` (new: `drawItem(ctx, item, x, y, size)`), `src/styles/game.css` (`.keepsake`, `.keepsake.is-missed`),
  `DESIGN.md` (new components: ItemGlyph, KeepsakePlate; the plate's job; the six items), tests: `src/client/items.test.ts`.
- **Tests first (red):** (a) every `ITEMS` entry has a name and a path set; the two renderers read the same strings (a test renders
  `ItemGlyph` and compares its `<path d>` to `ITEM_PATHS`); (b) the names table agrees with the server's `ITEM_NAME` (import the server table in the
  test, a one-way read is allowed for tests); (c) at 24 px the detail layer is absent; (d) no raw hex in `items.ts` (fills are token names).
  `spec/design.test.ts` stays green.
- **Implementation (green):** as in this file's §4. Draw to the shape vocabulary: watch (round case, crown nub, strap tail), ledger (tall
  rectangle, brass corners, ribbon), signet ring (donut band, square seal), goblet (flared bowl, stem, foot), pen (long diagonal barrel, nib),
  necklace (arc of beads, clasp).
- **Acceptance criteria:** tests green, each shown red by breaking its line; screenshots at 24, 48 and 64 px of all six on the plate in normal and
  high contrast, read by the agent; the watch and the necklace checked at 24 px and redrawn if two items can be confused.
- **Human review:** the user looks at one page showing the six items at 24, 48 and 64 px in both contrast modes (a throwaway local page
  built by the task, not committed) and accepts or sends back specific items.
- **Depends on:** 52.

### Task 56: The chamber on the map, the chip, the keepsake slot and the moments

- **Description:** draw the secret doors sliding open, the keepsake standing in the vault and its pickup; the owner's chip through its four states; the
  captions and the cue's new words (data from Task 64); a client that rebuilds when the map is re-sent. Sounds and the item drawings are unchanged.
- **Files touched:** `src/client/fx.ts` (`kind: "slide"`; `detectFx` emits it for a `door` entity newly open; `uncover` and `stash` stop being drawn effects),
  `src/client/render/stash.ts` (`drawKeepsake(ctx, e, cam)`: the plinth, the item, the shadow; `drawMotifTile` stays; rename the file `src/client/render/chamber.ts`
  if clearer), `src/client/render/index.ts` (a `keepsake` entity is drawn standing in its row; `drawFx` draws `slide` as the door's slide plus dust; the item's lift
  on a take), `src/client/render/blocks.ts` (the door slide takes an `age` so an animating door is drawn mid-slide), `src/components/SideJob.tsx` and
  `SideJob.test.ts` (the four states, `keepsake`), `src/components/Game.tsx` (the `keepsake` state, `cacheEvent`, a `rt.cacheEvent` hold for the card, rebuilding
  the predictor when `view.tiles` changes), `src/client/predict.ts` (`createPredictor` accepts a replacement map: `setTiles(tiles)`), `src/client/hud.ts`
  (`cacheMoment` reads `cacheEvent`), `src/client/audio.ts` (no new sound: the take is the `loot` chime), `src/styles/game.css` (chip states, the pulse, the plinth's
  focus ring), `DESIGN.md` (the chamber, the door slide, the keepsake in the vault, the chip states, the moments, reduced motion, high contrast), tests beside each
  and `spec/layout/cache-chip.test.ts` (extended).
- **Tests first (red):** (a) `SideJob`: `hidden` or `open` shows the motif and riddle, never the item; `vault` shows the plate, the name and "Waiting in the vault",
  no tick; `taken` shows the plate, name, a tick and "Taken by you"; never the riddle once in `vault` or `taken`; the two later states are not expandable;
  `aria-label` says "Side job in the vault: gold watch" and "Side job taken: gold watch". (b) `detectFx` emits `slide` once when a `door` entity appears open
  that was not in the previous view and none on the first view; an ordinary door opening (a `closed` entity becoming `open`) still emits its ring, not a slide.
  (c) `cacheMoment` words from `cacheEvent`: "Something opened", "Bo's side job open: the gold watch", "Bo took the gold watch"; Can't hear (no sounds) gets the same
  words from the event. (d) `Game` rebuilds the predictor when the map changes: after `view.tiles` carries the chamber open, a walk into the chamber is predicted
  as passable (a `predict.test.ts` case: a map with the chamber `.` after one with `#`, the predicted position moves in). (e) `spec/layout/cache-chip.test.ts` measures
  the chip in all four states: 48 px target, motif or plate and text inside the frame, a long item name and the longest nickname wrap not clip, the solved chip pulses
  once and not under reduced motion, the moment card never covers the chip, at 1280 and 375. (f) A render test with a fake canvas: `drawKeepsake` draws the item with
  `drawItem` and a plinth, and is not called for a seat that has no `keepsake` entity.
- **Implementation (green):** as in this file's §4. Delete the first build's panel and plate (Task 61 already did).
- **Acceptance criteria:** tests green and each shown red by breaking its line; the sequence checked in screenshots at five moments (before, door half open, door open,
  item standing, taken) at both viewports, in reduced motion and in high contrast, from a real three-player game on a fixture room that carries a chamber (Task 62's
  `01-cache-a`); a hearing seat's sounds and a deaf seat's captions checked in the unit tests.
- **Human review:** on a local build the user plays a test room with a chamber (the fixture `01-cache-a`, served with `ROOMS_DIR`): opens the chamber with the right tile,
  works the station, sees the vault open and the item stand, tries to take it as a non-owner (nothing) and as the owner, at 1280 and 375. The user accepts or sends back the
  doors' motion, the item's standing look, the chip and the card. (A fresh review: the first build was rejected.)
- **Depends on:** 55, 61, 64.

### Task 57: The cleared tile and the heist shelf

- **Description:** make the side job important on the results, in three states.
- **Files touched:** `src/components/SideJobTile.tsx` (new: taken, left behind, not found), `src/components/RoomCleared.tsx` (tile after the credits),
  `src/components/KeepsakeShelf.tsx` (new), `src/components/HeistComplete.tsx` (shelf above the rank line), `src/components/Game.tsx` (pass `summary.cache` and
  `heist.caches`), `src/styles/game.css` (`.side-job-tile`, `.keepsake-shelf`), `DESIGN.md` (RoomCleared, HeistComplete, SideJobTile, KeepsakeShelf), tests:
  `RoomCleared.test.ts`, a new `HeistComplete.test.ts`, `SideJobTile.test.ts`, and the layout spec in `spec/layout/leaderboard.test.ts`.
- **Tests first (red):** (a) `RoomCleared` with `cache.found` (taken) shows the plate, the name, a tick and "Ana took the gold watch. Bo opened the way. Worth 1 loot." (the
  opener clause only when `by` differs from the owner; "Ana took the gold watch and opened the way themselves" is not used: when the owner opened it the line is "Ana opened the
  vault and took the gold watch. Worth 1 loot."); with `opened: true, found: false` a dashed tile reads "Side job opened, but the gold watch was left behind." with the
  plate empty and the item named (it was seen); with `opened: false` a dashed tile reads "Side job not found: <riddle>" and shows no item name; with no `cache`, no tile at
  all; the owner's name comes from the crew, never from the server's data. (b) `HeistComplete` shows six slots in room order, taken ones with names, the rest empty with
  "Room 7, not found", and shows at 0 of 6. (c) A jsdom structure test: the tile is after `.credits` and before `.cleared-actions`, the three states share one height class,
  names wrap (`overflow-wrap`). The browser layout spec that needs a real chamber room (the tile inside the column, no clipping, the buttons' bottom edge inside the frame
  at 1280, the three tiles the same height) is **Task 58**'s, once a chamber room exists.
- **Implementation (green):** as in this file's §4.
- **Acceptance criteria:** tests green and shown red by breaking the line (move the tile below the buttons; shrink the left-behind tile; let `opened` count as found); screenshots of
  taken, left behind, not found, no-cache and of the shelf at 0, 3 and 6 of 6 from a local page that renders the components with fixed props (not committed), read by the
  agent; DESIGN.md names only what exists.
- **Human review:** the user looks at the cleared card (the three states) and the heist shelf from that local page at 1280 and 375 and accepts or sends back specifics; the
  real-flow look comes with Task 58. Phase 11's cleared-card redesign stays as built.
- **Depends on:** 54, 55, 65.

## 6. Phase Definition of Done

- [ ] Tasks 55 to 57 done and committed one each (Human review tasks only after acceptance); Task 55 is.
- [ ] `pnpm test:unit` and `pnpm check` pass on a fresh check server.
- [ ] Screenshots at 1280 and 375 read for every state in the spec's §4.1; layout specs measure the promises.
- [ ] DESIGN.md names only tokens and components that exist (`spec/design.test.ts` green).
- [ ] Tick this phase in the 14 overview §5 and commit.

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR17 (items, one path table) | 55 |
| FR9 to FR11 (doors, vault, keepsake: drawing, motion, sound), FR12, FR13 (chip, slot) | 56 |
| FR14 (tile, three states), FR16 (shelf) | 57 |

## 8. Risks / open questions

None open. Accepted: the watch and the necklace may need a redraw after the real-size look (Task 55 reviewed them and the user called the designs nice).

## 9. Corrections log

- 2026-11-02, plan-feature amendment after the rejection below: Tasks 56 and 57 rewritten for the chamber and the keepsake; new dependencies 14-02b (Tasks 61 to 65); Task 55 stands.

- 2026-11-02, Task 55: the detail (the watch's face, the necklace's string) vanished at 24 px, and the items looked too cartoonish. Expected flat fills with a detail layer dropped under 32 px; the user wanted them readable at 24 px and more realistic (gradients, shadows). The first cut treated size as "drop detail", not "keep what makes the item itself".
- 2026-11-02, Task 55: six defects after the realism pass (ring glint over the rim, straight watch-band glint, a white hole in the watch's shadow, no shadow under the ribbon or the chain, a gap in the goblet's shadow). Expected one filled shadow path to be safe; overlapping shapes wound the opposite way cancel to a hole. Added geometry tests (winding, a gap-free silhouette, glints inside the item).

- 2026-11-02, Task 56 (found in the execute-plan review): the `uncover`/`stash` cues carried no owner or item, though the 14-00 overview §4 listed `SoundCue += { item?, motif? }`. Expected the 14-01 view task to have built it; it had not, and 14-01's cue test only checked the caption word. The user ruled: extend the cue (`n` is the owner seat on both, `item` on `stash` only) and name the owner on the stash caption only ("Bo's side job found: the gold watch"), leaving `uncover` generic so it does not say whose riddle it is. A test that checks a sound's word and not its payload misses a missing field.
- 2026-11-02, Task 56 (found by the layout spec, not the unit tests): the owner's reveal row never showed. `Lobby.tsx` built the page's `Reveal` field by field and dropped `cache`, so 14-02's wire field stopped at the socket. Expected the reveal's `cache` to reach `RoleReveal`; the unit test mounted `RoleReveal` with the prop given, which skips the copy that lost it. Fix: the copy is now `revealOf` (src/client/reveal.ts) with a test that a `cache` on the message is on the `Reveal`. Pattern: a test of a component with its props handed in does not cover the code that builds the props.
- 2026-11-02, Task 56 human review REJECTED (approach, not wording). Expected a steel panel that slides aside over the station, and the item shown as a picture on a plate beside it. The user said the panel "is hiding a whole safe", and the picture "feels weird as a picture". They want instead: a side room that branches up or down from the room, entered through a hidden door that animates open (this fits the existing game: doors and rooms are what it already has); the item uncovered in that room, behind a second hidden door, as a real object the player picks up like gear; and the loot counted only on pickup, not on solving. The sounds were accepted ("ok"), and so were the item designs ("nice"). The first cut treated the cache as a station state change with a drawn overlay; the user sees it as a place and an object in the world. This changes the spec (FR7, FR9, FR10), the sim (loot moves from the solve to a pickup), the room format (a side room) and ADR 0020 (still `proposed`, so it can be amended). Handed back to `plan-feature`; Task 56 stays unticked and uncommitted.
