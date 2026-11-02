# Escape-room heist: Phase 14 (caches): the secret chamber, the keepsake and loot at pickup

- **Date:** 2026-11-02
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-02 (the plan-feature restatement after Task 56's rejection)
- **Part of:** `plans/2026-11-02-escape-room-heist-14-00-overview.md`. Read it first: the demo script (§2), the shared types (§4, the
  chamber metadata and the new fields), the coverage table (§7).
- **Depends on phases:** 14-01 (Tasks 51 to 53), 14-02 (Task 54), and Task 55 (committed as `1c8f4bc`). Reads `CLAUDE.md` first.

## 1. Summary

The cache stops being "a station that appears" and becomes **a place and an object**. A room carries a **chamber** in its own grid:
a small side room behind a secret door, and inside it a vault alcove behind a second secret door. The right motif tile opens the first;
solving the chamber's station opens the second; the item then stands in the world and **only its owner can take it**, into a keepsake
slot separate from gear. Loot counts at the pickup, not the solve. This phase delivers all of it headless and in the views and wire
formats: the format and linters, the sim, the masked view, the amended server results. Drawing and HUD are phase 14-03. It starts by
committing what survives of Task 56's first build.

## 2. Requirements (this phase)

### 2.1 Functional

Cache FR1 (the chamber, the data side), FR4 (the tile opens the secret door; anyone may enter), FR6, FR7 (stand, owner-only take, loot at
pickup, send-back undo), FR8, FR9 and FR10 (the events, sounds, captions and masked map), FR12 and FR13 (the data: state, keepsake),
FR15, FR16 (the data) and FR18 (logging).

### 2.2 Non-functional

Perception: `viewFor` is the one gate (ADR 0007). The chamber, the vault and both secret doors read `#` in every sighted or watcher tile
grid until each opens, and are in no entity list; nothing in a role's view before then tells it a chamber exists. The riddle stays
owner-only. The door-opening events reach every role in the same tick. Parity: `uncover` and `stash` keep their rows; the take reuses the
`loot` cue (it has a row). Logging: kinds only (CLAUDE.md Logging). Performance: the map is re-sent to three seats on two ticks a room.

### 2.3 Out of scope for this phase

Drawing, the HUD and the cleared tile (14-03); authoring the six chambers (14-04). Bots using a chamber, and dropping or handing on the
keepsake once taken.

### 2.4 Assumptions

See overview §2 and §3. A chamber branches off the main room by a single secret door; authors append rows below the room by default.

## 3. Existing code context (verified 2026-11-02)

- `src/game/rooms/format.ts`: `Tile` includes `"D"`; `RoomObject { id; kind; tiles; visibleTo; audibleTo; opensWhen?; mode?; params? }`;
  doors are `components(raw, "D")` named `D1`..`Dn` in `parseRoom` (line ~444), so two `D` tiles that touch are one door and every `D` tile
  is a door object. `ITEMS`, `ItemId`, `MAX_CACHE_TILES`, `CacheSpec { owner; motif; riddle; item; tiles }`, `checkCache(id, raw)` and
  `cacheOf(o)` exist (this phase adds `chamber`). `Room { id; name; version; width; height; grid; objects; beats; meta }`.
- `src/game/sim/collide.ts`: `solidTile` treats `D` as solid unless `world.doorOpen[id]`; `indexOf(room).doorAt` maps "x,y" to door id.
- `src/game/sim/step.ts`: `updateDoors(world)` computes `open = held || world.doorOpen[id] === true` where `held` needs `opensWhen`, and pushes a
  `door` event only when `open !== world.doorOpen[id]`. So a door with no `opensWhen` is opened only by someone setting `world.doorOpen[id]`
  directly, and doing that pushes **no** `door` event (this is how a secret door avoids the ordinary door click). `floorNear(world, from,
  count)` (private) lists every `.` tile nearest a checkpoint flag. `updateCheckpoints` builds `world.snapshot` (`players, crates, lootTaken,
  gear, cacheUncovered, cacheBy`). `sendBack(world, caught)` restores them, un-solves a cache solved after the checkpoint, and recomputes
  `world.loot` as loot objects taken plus `Object.keys(world.cacheBy).length`. `updateLoot(world)` takes `$` loot.
- `src/game/sim/stations.ts`: `cacheOpen(world, id)` is true when `world.cacheUncovered` has the id; `uncover(world, tile, seat)` (private)
  pushes `cache "uncover"` at the motif tile; `act(...)`'s private `solve()` sets `world.cacheBy[o.id] = seat`, `world.loot += 1` and pushes
  `cache "solved"` at the anchor; `redrawOne(world, o, s)`; `updateStations(world, acts, used)` calls `uncover` then `act` per seat.
- `src/game/sim/world.ts`: `World.cacheUncovered: string[]`, `World.cacheBy: Record<string, Seat>`, `Snapshot.cacheUncovered`, `Snapshot.cacheBy`,
  `WorldEvent { kind: "cache"; id; result: "uncover" | "solved"; seat; at }`, `World.doorOpen: Record<string, boolean>`, `World.lootTaken`,
  `World.loot`, `World.lootTotal`, `World.events`. `createWorld` adds 1 to `lootTotal` per cache.
- `src/game/perception.ts`: `RoleView.cache?: { id; motif; riddle; item; state: "hidden" | "open" | "found"; by? }`; `cacheFor(world, seat)`;
  `EntityView.kind` has `"motiftile"`; `EntityView.station.stash?: ItemId`; `entitiesFor` skips a closed cache station (`cacheOpen`) and pushes
  `motiftile` entities for the sighted; `soundsFor` pushes `uncover`/`stash` with `n` (owner) and, for `stash`, `item`; `maskTiles(grid,
  zones)` masks dark zones to `" "`; `viewFor(world, seat, role, full)` sets `view.tiles` only when `full`; `spectatorView(world, follow, roles,
  full)` likewise. `actHint(world, seat, role)` is the Act hint in the order the sim tries it.
- `src/net/game.ts`: `tickGame(game, full, now, nickname)` builds `viewFor(game.world, seat, game.roles[seat], full.has(seat))` per seat.
- `src/game/rooms/lint.ts`: `lintRoom` calls the presence, clue and cache lints; the door rule (~line 42) says "door D has no opensWhen" and (line
  ~56) rejects a door that names a cache; `lintCaches(room, issue)`, `walkable(room, start)` (treats everything but `#=%H` as walkable),
  `seeTile`, `perceiveClue`, `uncoverSplitFault`, `controls(o)` (the control tiles of a station), `lintOpenAtOnce`.
- `src/game/rooms/mockup.ts`: `worldAt(room, x, y, gear?)` pushes every cache id into `world.cacheUncovered` and places the probe player.
- `src/game/bots/jobs.ts`: `parseJob` validates a job's tiles are `.`; a job naming a cache is a lint error (Task 53). `brain.ts` reads
  `room.grid` directly; it treats a `D` tile it has no entity for as passable, so a path would run through a secret door if one were ever the
  shortest (a chamber is a dead end, so none is; Task 62 adds the guard test).
- `src/game/sim/gear.ts`: `carried(world, seat)`, `actOn(world, seat)` (Act order: towed lets go, take gear under you, hatch sill, hold hands,
  bell, lamp, lever), `gearPress`. The keepsake never goes through these: it has its own slot.
- Fixtures: `spec/fixtures/rooms-cache/01-cache-a.room` and `02-cache-b.room` (cache metadata without a chamber; this phase adds one to each);
  `src/game/sim/cache.test.ts` (inline `GRID`/`OBJECTS`, owner 2, a laser for send-backs); `src/game/parity.test.ts` (`CACHE_AT`).
- Tests: unit tests beside the code; `vitest run --project unit` (about 25 s); `spec/` needs the check server (overview).

### Interfaces from earlier phases (exact)

From 14-01 as built: `ITEMS`, `ItemId`, `MAX_CACHE_TILES`, `CacheSpec { owner: 1 | 2 | 3; motif: Motif; riddle: string; item: ItemId; tiles: { at: Vec;
motif: Motif }[] }`, `cacheOf(o: RoomObject): CacheSpec | null`, `World.cacheUncovered: string[]`, `World.cacheBy: Record<string, Seat>`, `WorldEvent {
kind: "cache"; id: string; result: "uncover" | "solved"; seat: Seat; at: Vec }`, `cacheOpen(world: World, id: string): boolean`, `redrawOne`,
`RoleView.cache`, `cacheFor(world: World, seat: Seat): RoleView["cache"]`, `SoundCue.kind` `"uncover" | "stash"` with `n` and `item`, `lintCaches`.
From 14-02: `creditsOf(world: World): Credit[]`, `cacheResultOf(world: World): CacheResult | undefined` (`{ room; found; item; owner; by?; riddle }`),
`ITEM_NAME: Record<ItemId, string>` in `src/game/sim/credits.ts`; `{ t: "cleared"; ...; cache?: { room; found; item; owner; by?; riddle } }`;
`{ t: "heist"; ...; caches: { room; found; item }[] }`; `logGame` event `cache` with kind `uncover` | `solved`.
From Task 55 (committed `1c8f4bc`): `ITEM_LAYERS`, `ITEM_NAMES: Record<ItemId, string>` in `src/client/items.ts`, `ItemGlyph`, `KeepsakePlate`, `drawItem`.

## 4. Approach

**The chamber is real floor, hidden by the map.** The chamber and its vault are ordinary `.` tiles in the room's grid, walled by `#`, entered
by two `D` tiles. Hiding is the view's job, as dark zones are (`maskTiles`): until a door opens, `viewFor` and `spectatorView` send the
chamber's rectangle, its vault, and both door tiles as `#`, and the entity list omits the secret door objects. The simulation keeps them as
they are: a closed `D` stops bodies and sight, so nothing inside is seen, heard (the station is `cacheOpen`-gated) or listed.

**A secret door is a `D` door that cache state opens.** `secretDoors(room)` resolves `cache.chamber.door` and `cache.chamber.vault.door` to
the door objects at those tiles. `syncCacheDoors(world)` sets `world.doorOpen` for them from state: the chamber door is open iff the cache id
is in `cacheUncovered`; the vault door iff `cacheBy` has it. It sets the flag directly, so `updateDoors` sees no change and pushes no `door`
event: no ordinary door click. The `cache` events (`uncover` at the chamber door, `solved` at the vault door) carry the team moment instead.

**The keepsake is a world object with one rule.** Once `cacheBy` has the id and `cacheTaken` does not, the item stands on
`chamber.vault.item`. An Act on that tile by the owner (`seat === owner - 1`) sets `cacheTaken[id] = seat`, adds 1 loot and pushes
`cache "taken"`; any other Act there does nothing. It is a separate slot: the owner's gear is unchanged. A cache is **found** when it is
taken. The keepsake slot is not stored: the owner holds it iff `cacheTaken` has the id.

**The team moment is in the view.** `RoleView.cacheEvent` (overview §4) carries this tick's door or take, for every role: the sighted slide
the door, hearing seats hear the cue, Can't hear and Can't see read the caption. On a tick where a door opened, `tickGame` builds every seat's
view with `full = true`, so the sighted get the unmasked map the same tick.

**The snapshot closes everything.** A checkpoint snapshot also holds `cacheTaken`; `sendBack` restores all three and calls `syncCacheDoors`
(both doors shut again if the cache state before the checkpoint says so), and recomputes loot as loot objects plus `cacheTaken`'s size.
`floorNear` never picks a tile in a chamber rectangle, so a checkpoint beside the secret door never respawns anyone inside a wall.

## 5. Task breakdown

### Task 61: Commit what survives of Task 56's first build [x]

- **Description:** the user rejected Task 56's approach on 2026-11-02 and ruled "keep the drawings, sounds, the rest, just replace" the
  panel, plate and stash drawing. Commit the parts that stay, on their own, and remove the rejected drawing so the tree builds and is
  green. This is not Task 56 (which stays unticked and is rewritten in 14-03); it is the salvage commit. The kept parts were accepted by
  the user's "keep the rest" ruling, so there is no further human review.
- **Files touched (the whole uncommitted tree, after the removals below):** kept as built: `src/game/perception.ts` (the `uncover`/`stash` cue
  `n` and `item`), `src/client/hud.ts` (`cueCaptions(sounds, names?)`, `cacheMoment`), `src/client/fx.ts`, `src/client/audio.ts` (the two sounds the
  user called ok), `src/client/reveal.ts` + `reveal.test.ts` + `src/components/Lobby.tsx` (`revealOf`: the reveal's `cache` now reaches the
  page), `src/components/MotifGlyph.tsx`, `RoleReveal.tsx` + `RoleRevealCache.test.ts`, `SideJob.tsx` + `SideJob.test.ts` (reworked in Task 56),
  `src/components/Game.tsx`, `Feeds.tsx` (per-effect lifetimes `fxMs`), `src/styles/game.css`, `spec/layout/cache-chip.test.ts`,
  `src/game/sim/cache.test.ts`, `src/client/fx.test.ts`, `src/client/hud.test.ts`, the plan, spec and ADR amendments, `PROCESS_LOG.md`.
  **Removed or reduced:** `src/client/render/stash.ts` keeps only `drawMotifTile` (delete `drawCacheFx`, `drawStash`, `plate`, `star` and their
  helpers); `src/client/render/index.ts` drops the `drawStash` call in the station row loop and the `drawCacheFx` branch in `drawFx` (an `uncover`
  or `stash` effect is skipped, drawing nothing, until Task 56 replaces them); `DESIGN.md` loses the panel/plate motion rows, `drawStash`
  and `drawCacheFx` and the plate-rises text (it keeps `MotifGlyph`, `SideJob`, the reveal row, the cache moment and the sounds).
- **Tests first (red):** none new: the kept tests are already green. (a) A grep test is not added; instead the acceptance below checks the
  removals. The removal is shown by the build: `pnpm typecheck` fails if `drawCacheFx` is imported anywhere after the file is cut.
- **Implementation (green):** the removals above; run `pnpm format`, `git status`; do not touch `scripts/` (the throwaway review script
  lives in `/tmp`).
- **Acceptance criteria:** `pnpm check` green on a fresh check server; `grep -n "drawCacheFx\|drawStash" src` finds nothing; `DESIGN.md`
  names no component or function that does not exist (`spec/design.test.ts` green); the game still plays (the in-place cache of Tasks 51 to
  53 is unchanged until Tasks 62 to 64) and no drawn panel or plate appears; committed with a message that says the first build's panel and
  plate drawing was removed because the user rejected it, and what was kept.
- **Depends on:** 55.

### Task 62: The chamber in the format, the doors helper, the linters and the bots' blind spot [x]

- **Description:** `CacheSpec.chamber` is parsed and validated; `secretDoors` and `syncCacheDoors` exist; the linters prove the chamber is a
  dead end behind the secret door; the mockup and linters see the chamber open; no bot job may target it; both fixtures carry a chamber.
- **Files touched:** `src/game/rooms/format.ts` (`Rect`, `ChamberSpec`, `inRect`, `CacheSpec.chamber`, validation in `parseRoom`, `secretDoors`),
  `src/game/sim/cache.ts` (new: `syncCacheDoors`), `src/game/rooms/lint.ts` (the door rule exempts secret doors; new chamber rules in
  `lintCaches`), `src/game/rooms/mockup.ts` (`worldAt` pushes `cacheBy` and calls `syncCacheDoors`), `src/game/bots/jobs.ts` (a job tile
  inside a chamber rect is a lint error), `spec/fixtures/rooms-cache/01-cache-a.room` and `02-cache-b.room` (append chamber rows, move the
  station's controls inside, add `chamber`), and the inline fixtures that parse a cache: `src/game/sim/cache.test.ts`, `src/game/parity.test.ts`,
  `src/game/perception.test.ts` and any test that builds a cache with `worldWith`; tests: `src/game/rooms/format.test.ts`, `lint.test.ts`,
  `src/game/bots/jobs.test.ts`, `src/game/sim/chamber.test.ts` (new).
- **Tests first (red):** (a) `parseRoom` accepts a valid chamber and throws, naming the cache and the field, on: a missing `chamber`; a rect
  not inside the grid or with `x0 > x1`; a `chamber.rect` tile that is not `.`, `#` or the vault door's `D` (a bounding box: interior walls are allowed), or a `vault.rect` tile that is not `.`; `chamber.door` or `vault.door` not a `D` tile; the two doors touching
  (they would merge into one door object); `vault.rect` not inside `chamber.rect`; `vault.item` not in `vault.rect`. (b) `secretDoors(room)`
  returns, per cache, the chamber door and the vault door with their door object ids and tiles. (c) `syncCacheDoors`: with the id in
  `cacheUncovered` the chamber door's `doorOpen` is true and the vault's false; with `cacheBy` too both true; with neither both false; it
  pushes no event. (d) `lintRoom` fails a cache whose vault floor is reachable from the chamber door with the vault door closed (the vault must be sealed), whose chamber door does not border chamber floor on one side and non-chamber floor on the
  other, whose vault door does not border the vault on one side and chamber floor outside the vault on the other, whose chamber floor is
  reachable from a spawn with both secret doors closed (the other doors open, as the lint treats them), that has any object other than its own
  station inside `chamber.rect` (an exit, plate, spawn, checkpoint, hazard, crate, gear, loot; the vault door is exempt), or whose station has a control tile outside
  `chamber.rect` (a clue tile such as a dial's `back` or a plaque may lie anywhere); and it still passes the ordinary door rule for a door with no
  `opensWhen` (a plain door without one fails as before; a secret door does not). (e) A `hints.jobs` entry whose tile lies inside a chamber rect
  fails. (f) `worldAt` shows the chamber open: a probe player standing in the chamber perceives the station's clue per role (the existing
  `perceiveClue` lint still passes on both fixtures). (g) A bots guard: the whole existing `spec/rooms.test.ts` stays green on the nine
  shipped rooms (no chamber is authored there yet), and a fixture test runs bots through `01-cache-a` and asserts no bot position ever lies
  inside the chamber rect.
- **Implementation (green):** as this file's §4. Append the chamber rows below each fixture room (pad rows to the room's width with `#`).
  Reuse `walkable` with a flag for "secret doors closed"; reuse `controls(o)` and `perceiveClue`.
- **Acceptance criteria:** the tests green and each rule shown red by disabling it (break the border check, open the chamber to a spawn,
  put an exit in the rect, move a control tile out, drop the door-rule exemption, drop the jobs rule); `pnpm lint:rooms` still reports
  "9 room(s) ok"; `pnpm test:unit` green; `src/game/bots` never reads `cacheUncovered`, `cacheBy` or `cacheTaken`.
- **Depends on:** 51, 53, 61.

### Task 63: The chamber in the sim: doors, the standing item, the owner's take, loot at pickup [x]

- **Description:** the cache's state opens the secret doors; solving no longer gives loot; the item stands in the vault and only its owner
  takes it, into its own slot, which adds the loot; a send-back undoes all of it.
- **Files touched:** `src/game/sim/world.ts` (`World.cacheTaken`, `Snapshot.cacheTaken`, `WorldEvent.cache.result` gains `"taken"`),
  `src/game/sim/cache.ts` (`takeKeepsake(world, seat): boolean`, `keepsakeTile(o: RoomObject): Vec | null`), `src/game/sim/stations.ts` (`uncover`
  calls `syncCacheDoors` and puts the event `at` the chamber door's centre; `solve()` of a cache calls `syncCacheDoors`, pushes `solved` at the vault
  door's centre and **no longer adds loot**; `updateStations` calls `takeKeepsake` after `uncover`, marking the seat used), `src/game/sim/step.ts`
  (the snapshot and `sendBack` carry `cacheTaken` and call `syncCacheDoors`; `loot` recomputed as loot objects plus `Object.keys(world.cacheTaken).length`;
  `floorNear` skips every tile inside a chamber rect), tests: `src/game/sim/cache.test.ts`, `chamber.test.ts`, `step.test.ts`.
- **Tests first (red):** (a) The right motif tile's Act opens the chamber door in the same tick: `doorOpen` true, a `cache "uncover"` event `at` the
  door's centre, **no `door` event**; before it a body cannot enter (a player walking into the door tile is blocked), after it any seat can walk in
  and reach the station. A decoy does nothing. (b) A wrong answer re-draws only the cache (as before; no dye, no send-back). (c) A right answer opens the
  vault door, pushes `cache "solved"` at the vault door, and leaves `loot` at its old value while `lootTotal` is unchanged (already +1); `cacheTaken`
  is empty. (d) The owner's Act on `vault.item` sets `cacheTaken`, adds 1 to `loot`, pushes `cache "taken"` with the owner's seat; a non-owner's Act
  there does nothing and pushes nothing; a second Act by the owner does nothing; an Act there before the solve does nothing. (e) The owner carrying
  gear can still take it and still carries the same gear afterwards (separate slot). (f) A send-back to a checkpoint taken before the uncover shuts
  both doors (`doorOpen` false for both), empties `cacheUncovered`, `cacheBy` and `cacheTaken`, takes the loot back, and the station is unsolved with
  a fresh answer; a send-back to a checkpoint taken after the take leaves it taken and the loot kept. (g) A checkpoint flag beside the secret door
  snapshots only main-room spots (`floorNear` never returns a chamber tile). (h) `lootTotal` is unchanged by this phase's rules (a room with a cache
  still counts it) and a room cleared with the item left behind has `loot === lootTotal - 1`.
- **Implementation (green):** as this file's §4. `takeKeepsake` requires `world.cacheBy[id] !== undefined`, `world.cacheTaken[id] === undefined`,
  `seat === cache.owner - 1` and the seat's tile equal to `keepsakeTile(o)`.
- **Acceptance criteria:** the tests green and each shown red by breaking its line (let a non-owner take it, give loot on solve, drop `cacheTaken` from
  the snapshot, let `floorNear` pick a chamber tile, push a `door` event on uncover); `pnpm test:unit` green; `src/game/bots` still never reads cache state.
- **Depends on:** 62.

### Task 64: The masked map, the standing item and the team moment in the view [x]

- **Description:** a sighted seat's map hides the chamber until its door opens; the item is an entity; the owner's slot and the moment are in the
  view; captions say the new words; the map is re-sent the tick a door opens.
- **Files touched:** `src/game/perception.ts` (`maskCache(world, grid)`, applied in `viewFor` and `spectatorView` to `view.tiles`; `entitiesFor` omits a
  secret door object while closed and pushes it as an open door once open, pushes a `keepsake` entity while the item stands; `EntityView.kind` gains
  `"keepsake"` and `EntityView.keep?: ItemId`; `RoleView.cache.state` becomes `"hidden" | "open" | "vault" | "taken"`; `RoleView.keepsake?: ItemId`;
  `RoleView.cacheEvent?`; `actHint` for the item; `soundsFor` emits the cue for `taken` as a `loot` cue with `n` = the owner and `item`; the existing `uncover`
  and `stash` cues now carry the door's position through the event's `at`), `src/net/game.ts` (`tickGame` builds every seat's view with `full = true` on a
  tick that has a `cache` `uncover` or `solved` event), `src/client/hud.ts` (`word()`: `stash` reads "<owner>'s side job open: the <item>", a `loot` cue with an
  item reads "<owner> took the <item>"; the owner is named only where the cue carries it), `src/game/parity.test.ts` (the `uncover` and `stash` rows now
  observe the open door and the keepsake), tests: `src/game/perception.test.ts`, `src/game/sim/cache.test.ts`, `src/net/game.test.ts`, `src/client/hud.test.ts`; plus `src/components/SideJob.tsx` and `SideJob.test.ts` (the stopgap below).
- **Tests first (red):** (a) For `deaf` and `mute` seats and for a watcher, `view.tiles` shows `#` over the chamber rect, the vault and both door tiles
  until each opens (the chamber after the uncover; the vault after the solve), and the masked area is identical to the wall around it (no `.`, `D`);
  `blind` gets no tiles (as before). (b) No entity list holds a secret door while it is closed; after the uncover the chamber door is an `open` door
  entity and the vault door is still absent; after the solve both are. (c) The `keepsake` entity appears for the sighted only from the solve until the
  take, at `vault.item`, with `keep` the item; never for `blind`. (d) `cacheEvent` is present in the tick an event happens and absent the next, for all
  three roles, with the right `result`, `at` (the door, or the item tile for `taken`) and `owner`; `item` is present for `solved` and `taken` and absent
  for `uncover`. (e) `RoleView.cache.state` walks `hidden`, `open`, `vault`, `taken` for the owner; other seats have no `cache`, no `keepsake`, and
  `JSON.stringify` of their views before the solve contains neither the riddle nor the item name. (f) `RoleView.keepsake` is the item for the owner
  after the take and absent for everyone else. (g) The Act hint on `vault.item`: the owner "Take the gold watch", others "Only its owner can take this",
  none before the solve. (h) `tickGame` returns views with `tiles` for all three seats on the uncover tick and on the solve tick even when no seat was
  owed a full view, and without tiles on an ordinary tick. (i) `cueCaptions` words: `stash` "Bo's side job open: the gold watch"; a take "Bo took the
  gold watch"; `uncover` still "Something opened". (j) The parity file fails to typecheck without both rows.
- **Implementation (green):** as this file's §4. `maskCache` fills each hidden rect and door tile with `#`. Keep every new field own-only or team-wide
  per the role tables (CLAUDE.md Perception); the item name is public from the solve (the cleared card shows it to everyone).
  **Client stopgap (added in the execute-plan review):** `RoleView.cache.state` no longer has `"found"`, and `src/components/SideJob.tsx:22` branches on it.
  Change that branch to treat `"vault"` and `"taken"` as the existing found-style chip (keep `.side-job.is-found`), and extend `SideJob.test.ts` to cover
  both states. No redesign: Task 56 (14-03) replaces the chip.
- **Acceptance criteria:** tests green and each shown red by breaking its line (send the rect unmasked, list a closed secret door, give the riddle to
  every seat, drop the `full` rule, show the item to `blind`); `pnpm typecheck` and `pnpm test:unit` green; a parity row removed fails the typecheck
  (shown); `SideJob` renders a chip for `vault` and `taken`.
- **Depends on:** 63.

### Task 65: Results data: opened versus taken, credits and the log [x]

- **Description:** a cache is **found** when its item is taken; the cleared message also says whether the vault was **opened**; credits name who
  opened the way and who took the item; the log gains the `taken` kind.
- **Files touched:** `src/game/sim/credits.ts` (`CacheResult` gains `opened: boolean`; `found` means taken; `creditsOf` lines: the solver "opened the
  vault: the gold watch" or "opened {owner}'s vault: the gold watch", the owner after a take "took the gold watch"; a cache stays out of the station fold),
  `src/net/attach.ts` and `src/net/protocol.ts` (`cleared.cache.opened`; `heist.caches[].found` is the take), `src/lib/gameLog.ts` (`cache` detail kind
  `taken`; the redacted line carries kinds only), `spec/heistPlay.ts` (`ClearedMsg.cache.opened`), tests: `src/game/sim/credits.test.ts`,
  `src/lib/gameLog.test.ts`, `src/net/protocol.test.ts`, `spec/heist-cache.test.ts`, `spec/game-log.test.ts`.
- **Tests first (red):** (a) `cacheResultOf` for a world where nothing happened, where the vault was opened but the item left, and where it was taken:
  `{ opened: false, found: false }`, `{ opened: true, found: false, by }`, `{ opened: true, found: true, by }`. (b) `creditsOf`: opened and left gives the solver
  its line and the owner nothing; taken gives both; a room without a cache adds nothing; two safes still fold to "cracked 2 safes". (c) `gameLinesFor`
  turns a `taken` event into `{ event: "cache", detail: { kind: "taken" } }` and no redacted line contains an item, motif, seat or riddle. (d) The
  `cleared` message carries `cache.opened`; the `heist` message's `caches[i].found` is true only for a take. (e) `spec/heist-cache.test.ts` (the fixture rooms
  nobody opens) sees `opened: false, found: false` in both rooms.
- **Implementation (green):** as described; the log follows CLAUDE.md Logging (through `logGame`, kinds only).
- **Acceptance criteria:** tests green; each guarding test shown red (leak the item into a log detail; make `found` mean opened); `pnpm check` green on
  a fresh check server.
- **Depends on:** 63.

## 6. Phase Definition of Done

- [ ] Tasks 61 to 65 done and committed one each.
- [ ] `pnpm test:unit` and `pnpm check` pass on a fresh check server.
- [ ] `src/game/sim/cache.test.ts` and `chamber.test.ts`: a chamber opened, solved, its item taken by the owner only, and all of it undone by a send-back.
- [ ] No sighted or watcher view lists the chamber, the vault or a secret door before it opens (the tests of Task 64).
- [ ] CLAUDE.md invariants: parity rows (`uncover`, `stash`, `loot`), `viewFor` gating, no bot reads cache state.
- [ ] Tick this phase in the 14 overview §5 and commit.

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR1 (data), FR4, FR6, FR8 (the chamber and its lints) | 62, 63 |
| FR7 (stand, owner-only take, loot at pickup, undo) | 63 |
| FR9, FR10, FR12, FR13 (events, map mask, state, slot: data) | 64 |
| FR15, FR16 (data), FR18 | 65 |

## 8. Risks / open questions

None open. Watch: brain.ts treats an unseen `D` as passable, which is safe only while a chamber is a dead end (Task 62's bots test guards it); a
checkpoint near a chamber must never snapshot a chamber tile (Task 63 test).

## 9. Corrections log

(execution appends one line per user redirect and mirrors it into `PROCESS_LOG.md`)

- 2026-11-02, Task 62 (found in execution, ruled by the user): the plan required every `chamber.rect` tile to be `.`, yet its example puts the vault's `D` inside the rect and cannot seal a vault in an all-floor rectangle. Expected the plan's format rule and example to agree. Ruling: `chamber.rect` is a bounding box (`.`, `#` or the vault door); `vault.rect` is all `.`; a new lint requires the vault to be sealed when its door is closed. Overview §4's example gains walls at (32,10) and (34,9).
