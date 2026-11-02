# Escape-room heist: Phase 14 (caches): items, chip, moments, results

- **Date:** 2026-11-02
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-02
- **Part of:** `plans/2026-11-02-escape-room-heist-14-00-overview.md`. Read it first (demo §2, types §4).
- **Depends on phases:** 14-01 (Tasks 51 to 53), 14-02 (Task 54). Reads `DESIGN.md` before any look change (CLAUDE.md).

## 1. Summary

Everything a player sees: six drawn items on a keepsake plate, the owner's reveal row and chip (riddle, then keepsake), the uncover and
stash moments on the map with captions, the cleared card's side-job tile, and the heist shelf. Ends with screenshots at 1280 and 375,
layout specs, DESIGN.md updated and the user's reviews.

## 2. Requirements (this phase)

### 2.1 Functional

Cache FR9 to FR11 (the drawing and motion half), FR12, FR13, FR14, FR16 (the shelf), FR17.

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
- `src/components/SideJob.tsx`: `SideJob({ job: { id; text; done } | undefined })`, a `<button class="side-job">` with `aria-expanded`, text
  clamped on a phone; CSS `.side-job`, `.side-job-text`, `.side-job-text.is-open` in `src/styles/game.css` (~L1496 to L1530).
- `src/components/Game.tsx`: `import { SideJob }`, `const [sideJob, setSideJob] = useState<RoleView["sideJob"]>(undefined)` (L605), updated at
  L860 from `view.sideJob`, rendered `<SideJob job={sideJob} />` (L1068); `Reveal.sideJob?: string` (L86); `summary` state holds
  `{ ms, loot, lootTotal, board, credits }` from `cleared`; `heist` state holds `{ ms, loot, lootTotal, rank }` from `heist`;
  `creditRows(summary.credits, reveal.crew)` feeds `RoomCleared`.
- `src/components/RoomCleared.tsx` (the one-column card, `.cleared`, `.cleared-head`, `.cleared-stats`, `.credits`, `.cleared-actions`),
  `src/components/HeistComplete.tsx` (`{ ms, loot, lootTotal, rank, onBoard }`), `src/components/RoleReveal.tsx` (a `<dl class="reveal-facts">` row,
  `sideJob?: string`), `src/components/RoleShape.tsx`.
- Canvas: `src/client/render/stations.ts` (`motifGlyph(ctx, motif, cx, cy, r)` L168, `symbolGlyph` L130, station drawing),
  `src/client/render/pops.ts` and `src/client/fx.ts` (`Fx { kind: "ring"|"dust"|"spark"|"swing"|"arc"|"cloud"; pos; tone; big?; to?; item? }`,
  `detectFx(prev, next)`), `src/client/render/index.ts` (`FLAT`, `STANDING` lists, `scene.reducedMotion`, `scene.nowMs`), doors slide into the floor
  (DESIGN 4.8). Tokens: `--w-card`, `--w-brass`, `--w-line`, `--w-steel`, `--w-steel-front`, `--w-code-*`, `--goal`, `--ui-muted`, `--panel`, `--glass`.
- `src/client/hud.ts`: `cueCaptions(sounds)`, `CUE_WORD`, `hearCues`; `Captions.tsx` renders lines; `VotePrompt` is the model for a card at the
  top of the map that does not block play. `src/client/audio.ts`: cue synthesis (`s.kind === "solved"` plays three rising sines).
- Specs: `spec/layout/leaderboard.test.ts` has the cleared-card layout spec (one column, centred board, stacked/side-by-side credits, essentials
  in view); `spec/layout/hud.test.ts`; `spec/design.test.ts` fails if DESIGN.md names a token or component that does not exist.

### Interfaces from earlier phases (exact)

From 14-01: `ITEMS = ["watch","ledger","ring","goblet","pen","necklace"] as const`, `type ItemId`, `CacheSpec`, `RoleView.cache?: { id: string; motif:
Motif; riddle: string; item: ItemId; state: "hidden" | "open" | "found"; by?: Seat }`, `EntityView.kind` `"motiftile"` with `motif`,
`EntityView.station.stash?: ItemId`, `SoundCue.kind` `"uncover" | "stash"` (team-wide), the reveal `cache?: { motif; riddle; item }`.
From 14-02: `{ t: "cleared"; ...; cache?: { room: string; found: boolean; item: ItemId; owner: Seat; by?: Seat; riddle: string } }` and
`{ t: "heist"; ...; caches: { room: string; found: boolean; item: ItemId }[] }`; `ITEM_NAME` is server-side, so the client keeps its own
`ITEM_NAMES: Record<ItemId, string>` in `src/client/items.ts` (a unit test asserts the two tables agree).

## 4. Approach

**Items and the plate.** `src/client/items.ts` holds `ITEM_PATHS: Record<ItemId, { silhouette: string; shade: string; detail: string }>` (64 grid), `ITEM_NAMES`,
and fill choices as token names. `ItemGlyph` (HUD, `<svg>`/`<path>`) and `drawItem` (canvas, `Path2D` from the same strings) both read it; the
detail layer is dropped under 32 px. `KeepsakePlate` is a CSS box (`--w-card` face, `--w-brass` rim, `--w-line` outline); found vs missed is a
modifier (`.is-missed`: dashed `--ui-muted`, empty face with the motif outline).

**The chip.** `SideJob` takes `cache: RoleView["cache"]` and the crew's nicknames: unsolved shows the motif glyph and "Side job" and the riddle
(tap expands on a phone); solved shows the plate with the item, its name, a drawn tick, "Found by Bo"/"Found by you"; it pulses once (a CSS
animation, `prefers-reduced-motion` and the in-game reduced-motion setting skip it) and does not expand.

**The moments.** `detectFx` sees a station entity appear (uncover: a smaller panel slide, `Fx kind "swing"`-style) and `station.stash` set (stash:
the steel panel slides into the floor, the plate rises 6 px scaling 0.8 to 1 over 300 to 600 ms, one spark burst at 400 ms, a `--goal` ring at
600 ms); reduced motion: no slide, a 300 ms cross-fade, a static four-ray star for 1 s. The top-centre glass chip is a `VotePrompt`-style card
for 4 s, driven by the `cache` cue captions (the stash and uncover words). The item stays drawn in the stash, still. Audio: `stash` is two soft
rising notes about 0.5 s; `uncover` one soft low "thunk"; both distinct from `solved` and `dye` by ear (human review).

**The cleared tile and the shelf.** `SideJobTile` after the credits, before the buttons; `KeepsakeShelf` above the rank line in `HeistComplete`.
Found, missed and no-cache states as the spec's §4.1 wireframes.

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

### Task 56: The reveal row, the chip and the moments on the map

- **Description:** the owner's riddle on reveal and chip, the keepsake chip, the uncover and stash moments, their captions and sounds.
- **Files touched:** `src/components/RoleReveal.tsx` (the row with the motif at 48 px, riddle and "Only you can read this"),
  `src/components/SideJob.tsx` and `src/components/Game.tsx` (the new data, the nicknames), `src/client/fx.ts` and `src/client/render/pops.ts`
  (+ `stash.ts` if clearer: panel, plate rise, spark, ring, reduced-motion star), `src/client/render/index.ts` (`motiftile` drawn flat; the
  stash drawn standing, still), `src/client/hud.ts` (words), `src/client/audio.ts` (`uncover`, `stash`), `src/styles/game.css` (chip states,
  the top-centre chip, the pulse), `DESIGN.md` (SideJob, the stash moment, motion, reduced motion, high contrast), tests beside each.
- **Tests first (red):** (a) `SideJob` renders the riddle and motif unsolved and the item, name, tick and "Found by Bo" solved; never both;
  solved is not expandable; `aria-label` says "Side job found: gold watch, with Bo"; (b) `RoleReveal` shows the row only when given a `cache`;
  (c) `detectFx` emits the uncover and stash effects exactly once when an entity appears or `stash` is set, none on the first view, and a
  reduced-motion scene emits the static star; (d) `cueCaptions` words `uncover`/`stash` with the item's name; (e) `spec/layout/hud.test.ts` (or a new
  `spec/layout/cache.test.ts`) measures the chip: motif and text inside the frame, 48 px target, no clipping with a 40-character riddle and a long
  item name, at 1280 and 375, and the solved chip pulses once (the animation runs once) and not under reduced motion.
- **Implementation (green):** as in this file's §4.
- **Acceptance criteria:** tests green and each shown red; the stash moment checked in screenshots at four moments (before, +400 ms, +800 ms,
  settled) at both viewports, in reduced motion and in high contrast; a hearing seat's `sounds` and a deaf seat's captions checked in the unit test.
- **Human review:** on a local build the user triggers the moments in a test room and accepts or sends back the motion, the chime and the chip
  (by ear and eye), at 1280 and 375.
- **Depends on:** 55.

### Task 57: The cleared tile and the heist shelf

- **Description:** make the side job important on the results.
- **Files touched:** `src/components/SideJobTile.tsx` (new: found, missed), `src/components/RoomCleared.tsx` (tile after the credits),
  `src/components/KeepsakeShelf.tsx` (new), `src/components/HeistComplete.tsx` (shelf above the rank line), `src/components/Game.tsx` (pass
  `summary.cache` and `heist.caches`), `src/styles/game.css` (`.side-job-tile`, `.keepsake-shelf`), `DESIGN.md` (RoomCleared, HeistComplete,
  SideJobTile, KeepsakeShelf), tests: `RoomCleared.test.ts`, a new `HeistComplete.test.ts`, `SideJobTile.test.ts`, and the layout spec in
  `spec/layout/leaderboard.test.ts`.
- **Tests first (red):** (a) `RoomCleared` with `cache.found` shows the plate, the name, a tick and "Ana's side job, found by Bo. Worth 1 loot.";
  with `found: false` a dashed tile reads "Side job not found: <riddle>" and shows no item name; with no `cache`, no tile at all;
  (b) `HeistComplete` shows six slots in room order, found ones with names, missed ones empty with "Room 7, not found", and shows at 0 of 6;
  (c) a jsdom structure test at both widths' class names: the tile is after `.credits` and before `.cleared-actions`, found and missed share one height class,
  names wrap (`overflow-wrap`). The browser layout spec that needs a real cache room (the tile inside the column, no clipping, the buttons' bottom edge
  inside the frame at 1280, found and missed tiles the same height) is **Task 58**'s, once a cache room exists.
- **Implementation (green):** as in this file's §4.
- **Acceptance criteria:** tests green and shown red by breaking the line (move the tile below the buttons; shrink the missed tile); screenshots of found, missed and no-cache and of the shelf at 0, 3 and 6 of 6 from a local page that renders the components with fixed props (not committed), read by the agent; DESIGN.md names only what exists.
- **Human review:** the user looks at the cleared card (found and missed) and the heist shelf from that local page at 1280 and 375 and accepts or
  sends back specifics; the real-flow look comes with Task 58. Phase 11's cleared-card redesign stays as built.
- **Depends on:** 54, 55.

## 6. Phase Definition of Done

- [ ] Tasks 55 to 57 done and committed one each (Human review tasks only after acceptance).
- [ ] `pnpm test:unit` and `pnpm check` pass on a fresh check server.
- [ ] Screenshots at 1280 and 375 read for every state in the spec's §4.1; layout specs measure the promises.
- [ ] DESIGN.md names only tokens and components that exist (`spec/design.test.ts` green).
- [ ] Tick this phase in the 14 overview §5 and commit.

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR17 (items, one path table) | 55 |
| FR9 to FR11 (drawing, motion, sound), FR12, FR13 | 56 |
| FR14 (tile), FR16 (shelf) | 57 |

## 8. Risks / open questions

None open. Accepted: the watch and the necklace may need a redraw after the real-size look (Task 55 reviews them).

## 9. Corrections log

- 2026-11-02, Task 55: the detail (the watch's face, the necklace's string) vanished at 24 px, and the items looked too cartoonish. Expected flat fills with a detail layer dropped under 32 px; the user wanted them readable at 24 px and more realistic (gradients, shadows). The first cut treated size as "drop detail", not "keep what makes the item itself".
- 2026-11-02, Task 55: six defects after the realism pass (ring glint over the rim, straight watch-band glint, a white hole in the watch's shadow, no shadow under the ribbon or the chain, a gap in the goblet's shadow). Expected one filled shadow path to be safe; overlapping shapes wound the opposite way cancel to a hole. Added geometry tests (winding, a gap-free silhouette, glints inside the item).

