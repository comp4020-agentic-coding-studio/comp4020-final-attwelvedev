# Escape-room heist: Phase 14 (caches): sim, view, linters

- **Date:** 2026-11-02
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-02
- **Part of:** `plans/2026-11-02-escape-room-heist-14-00-overview.md`. Read it first: the demo script (§2), shared types and
  cache metadata (§4), coverage (§7).
- **Depends on phases:** 11 (Tasks 28 to 30, committed first; see this file's Task 51 step 0), 13.

## 1. Summary

The cache exists in the simulation and is perceived correctly: a hidden optional station, uncovered by pressing the matching
motif tile, solved like any station, undone by a send-back. The riddle reaches only its owner; the hidden station is in no one's
view; uncover and solve are team-wide events with new sounds. Linters guard the clue path. The floor-item side-job pickup is gone.
Ends with a test room where a cache is uncovered, solved and undone, and the existing rooms still lint and clear.

## 2. Requirements (this phase)

### 2.1 Functional

Cache FR1 (hidden, one a room: the data side), FR3, FR4, FR5, FR6, FR7, FR8 (bots ignore: no job is ever made for a cache), and
the data half of FR9 to FR13 (events, sounds, captions, `RoleView.cache`, the reveal field). Drawing is Phase 14-03.

### 2.2 Non-functional

Perception: `viewFor` is the one gate; the riddle is own-only. Parity: `uncover` and `stash` rows in `src/game/parity.test.ts`.
Logging is Phase 14-02. Performance: `lintCaches` runs inside `pnpm lint:rooms`; keep it to one `probe`-style pass per cache.

### 2.3 Out of scope for this phase

The server's credits and heist record (14-02), all drawing and HUD (14-03), authoring the six caches (14-04).

### 2.4 Assumptions

See overview §2 and the spec §2.4. A cache is always an ordinary station type already met in an earlier room; Task 53 lints it.

## 3. Existing code context (verified 2026-11-02)

- `src/game/rooms/format.ts`: `RoomObject["kind"]` includes `"sidejob"` (added by Task 28, removed here); `PARAMS` keeps a
  station's whole metadata as `params`; `isMotif(v: unknown): v is Motif` and `MOTIFS` exist; `GEAR_ITEMS` is the pattern for `ITEMS`.
- `src/game/sim/stations.ts`: `redrawOne(world, o, s)` (private) re-draws one station from the tick, no dye, no send-back;
  `act(world, o, tile, seat, wrong)` takes `Wrong { id; seat }`; `solve()` sets `s.solved`, `world.solvedBy[o.id] = seat`
  (added by Task 28), calls `revealOn`, pushes the `station "solved"` event; `partAt(world, tile): Part | null` skips solved
  stations; `stationObjects(world)`; `drawStations(world)`; `updateStations(world, acts: Seat[], used: Set<Seat>): Wrong | null`.
- `src/game/sim/step.ts`: `step` calls `updateStations` then `actOn`; `updateCheckpoints` builds `world.snapshot`
  (`players, crates, lootTaken, gear, sideJobsDone`); `sendBack(world, caught)` restores them and recomputes `world.loot`;
  `updateLoot(world)` takes `$` loot and (Task 28) side-job items.
- `src/game/sim/world.ts`: `World.sideJobsDone`, `World.sideJobBy`, `World.solvedBy`, `Snapshot.sideJobsDone`, `WorldEvent
  "sidejob"`; `createWorld` sums `lootTotal` over `loot` objects and (Task 28) `sidejob` objects.
- `src/game/perception.ts`: `entitiesFor(world, seat, role)` pushes a `station` entity for every station (it does not skip a
  hidden one); `sideJobFor(world, seat): RoleView["sideJob"]` (Task 28); `RoleView.sideJob?: { id; text; done }`;
  `soundsFor` handles `e.kind === "station"` through `stationSound`, and team-wide events through `cue()` or a global push (`dye`);
  `SoundCue["kind"]` is a string union with `"solved"` last; `EntityView["kind"]` has `"sidejob"` (unused: removed here).
- `src/client/hud.ts`: `CUE_WORD: Record<SoundCue["kind"], string>` and `EVERYWHERE` (a `Set`); a new cue kind needs a word.
- `src/game/rooms/lint.ts`: `lintRoom` calls `lintPresence`, `lintClues`, `lintSideJobs` (Task 28, removed here), then reachability;
  `probe(room, o, tile, role, gear)` and `controls(o)` and `worldAt(room, x, y, gear?)` (`src/game/rooms/mockup.ts`) are the helpers.
  `lintOpenAtOnce(room, stations, issue)` counts stations whose controls are reachable and not behind a station-locked door.
- `src/game/rooms/pacing.test.ts`: `EVERYWHERE = new Set(["loot", "sidejob", "checkpoint", "exit", "spawn"])` (the `sidejob` entry
  was added by the 2026-11-02 ruling and is removed here).
- `src/game/bots/jobs.ts`: `rawJobs`/`parseJob` read a room's `hints.jobs`; `brain.ts` builds `known.stations` for every
  `kind === "station"` object (line 323) and works a station only if `DECODERS[type]` exists and a job names it.
- Tests: unit tests beside the code; `vitest run --project unit` (about 24 s). `spec/` needs the check server (overview).

### Interfaces from earlier phases (exact)

From phase 11 Task 28 (committed as "Credits and the cleared card", see Task 51 step 0): `creditsOf(world: World): Credit[]` in
`src/game/sim/credits.ts` with `Credit { seat: Seat; lines: string[] }`; `World.solvedBy: Record<string, Seat>`; `sideJobFor`;
`RoleView.sideJob`; the reveal `sideJob?: string`; `{ t: "cleared"; ...; credits: { seat: Seat; lines: string[] }[] }`;
`src/client/credits.ts: creditRows(credits, crew): CreditRow[]`; `RoomCleared`'s one-column card.

## 4. Approach

A cache is a `Q` station whose `params.cache` (overview §4) makes it start hidden. Hidden means: absent from `entitiesFor`, from
`stationParts` hints, from `stationAmbience`, from `partAt` (so an Act on its tiles does nothing), and from the `act` hint. The
motif tiles are separate entities (`motiftile`) drawn for the sighted at all times, so a decoy and the right tile look alike.
`updateStations` gains one step before the per-seat loop: a seat that presses Act while standing on a motif tile's floor tile (the same press rule as a station part: `world.players[seat].pos` floors to the tile, Act is edge-triggered), where that tile's motif matches an unsolved, un-uncovered
cache's, pushes `cache "uncover"` and adds the id to `world.cacheUncovered`; a non-matching tile does nothing, silently.
A solved cache pushes `cache "solved"`, records `cacheBy`, and adds 1 loot (its `value` is 1; counted in `lootTotal` at creation).
A wrong answer on a cache calls `redrawOne`, never `wrong.w`. The snapshot carries `cacheUncovered` and `cacheBy`; `sendBack` restores
them and recomputes `loot` including solved caches. The riddle is `RoleView.cache` for the owner's seat only.

## 5. Task breakdown

### Task 51: Replace the floor-item side job with the cache in the sim

- **Step 0 (commit the tree as it is), only after the user has accepted Task 28's Human review (the redesigned cleared card at 1280 and 375;
  ask first, never commit it on silence):** the Task 28 tree is green (`pnpm check`, 130 files, 1878 tests, 2026-11-02) but its kept and replaced
  code share files (`world.ts`, `step.ts`, `perception.ts`, `lint.ts`, `RoomCleared.tsx`), so a partial commit would not build. Run the check
  server routine (overview), re-run `pnpm check`, and commit the whole tree as "Credits and the cleared card (floor-item side jobs follow, replaced in
  the next commit)" with the Co-Authored-By line. Tick Task 28 in `plans/2026-10-28-escape-room-heist-11-wrap-up.md` only after the user accepts
  its Human review. The replacement below then removes the floor items in one commit that is itself green.
- **Description:** remove the `j` tile and the `sidejob` kind and its pickup; add `ITEMS`, `ItemId`, `CacheSpec`, `cacheOf`; the
  hidden/uncover/solve rules and the snapshot in the sim.
- **Files touched:** `src/game/rooms/format.ts` (remove `j`, `"sidejob"`; add `ITEMS`, `ItemId`, `CacheSpec`, `cacheOf`, validation: owner 1 to 3,
  motif a `Motif`, exactly one tile whose motif matches, item in `ITEMS`, at most six tiles), `src/game/sim/credits.ts` and `credits.test.ts` (drop the side-job lines; a cache line comes in Task 54), `src/lib/gameLog.ts` and `gameLog.test.ts`
  (drop the `sidejob` event, line and test; Task 54 adds `cache`), `src/game/sim/world.ts` (remove `sideJobsDone`, `sideJobBy`, the
  `sidejob` event, the snapshot field; add `cacheUncovered`, `cacheBy`, snapshot fields, the `cache` event, `lootTotal` +1 per cache),
  `src/game/sim/stations.ts` (`updateStations` uncover step, `cacheOpen(world, id)`, wrong answer to `redrawOne`, `solve` records `cacheBy`
  and `loot`, `partAt` skips a hidden cache), `src/game/sim/step.ts` (remove the side-job loop in `updateLoot`; snapshot and `sendBack`),
  `src/game/rooms/pacing.test.ts` (remove the `sidejob` entry), `rooms/04..09-*.room` (remove the 18 `j` tiles and their metadata),
  tests beside each: `src/game/sim/cache.test.ts` (new), `format.test.ts`, `stations.test.ts`.
- **Tests first (red):** (a) `cacheOf` returns null for a plain station and a `CacheSpec` for a cache; `parseRoom` throws on a cache with two
  matching tiles, an owner of 4, an unknown item. (b) A cache is not in `world` views before uncover: an Act on its pads does nothing and
  makes no event. (c) An Act on the matching motif tile pushes `cache "uncover"` once and adds the id; an Act on a decoy tile does nothing.
  (d) After uncover a wrong answer re-draws only that station (its `answer` changes, `world.attempt` unchanged, no `dye`, no `caught`);
  a right answer pushes `cache "solved"` with the solver's seat, `cacheBy` has it, `loot` and `lootTotal` are each +1. (e) A send-back to a
  checkpoint taken before the solve closes it: `cacheUncovered` and `cacheBy` restored, `loot` back, the station unsolved with a fresh answer.
  (f) `pacing.test.ts` still passes with `sidejob` gone from `EVERYWHERE` (no object has that kind).
- **Implementation (green):** as described in this file's §4.
- **Refactor:** `redrawOne` becomes exported so a cache and a teach station share it (one call each).
- **Acceptance criteria:** the six tests green; `pnpm test:unit` green; each test shown red by breaking the line it guards (revert the
  `redrawOne` call, drop the snapshot restore, drop the matching-motif check) and restored; `grep -rn "sidejob\|sideJob" src rooms` finds
  only what Task 52 renames.
- **Depends on:** Task 28 (committed in step 0).

### Task 52: The owner's riddle, the hidden station and the team sounds in the view

- **Description:** gate everything in `viewFor`: `RoleView.cache` (own seat), `motiftile` entities for the sighted, no entity or sound for
  a hidden cache, `stash`/`uncover` team sounds, the reveal's `cache` field, caption words.
- **Files touched:** `src/game/perception.ts` (`cacheFor(world, seat): RoleView["cache"]` replacing `sideJobFor`, `entitiesFor` skips
  hidden caches and adds `motiftile` entities, `soundsFor` pushes `uncover`/`stash` globally, `RoleView.cache`, `EntityView["kind"]`
  gains `"motiftile"` and loses `"sidejob"`, `EntityView.station.stash?`), `src/client/hud.ts` (`CUE_WORD.uncover`, `.stash`; both in
  `EVERYWHERE`), `src/net/attach.ts` and `src/net/protocol.ts` (the reveal's `cache?: { motif; riddle; item }`, replacing `sideJob?: string`),
  `src/game/parity.test.ts` (two rows), `src/game/perception.test.ts`, `src/game/sim/cache.test.ts`; the client only as far as the types force it, so
  the tree builds: `src/components/Game.tsx` (state typed `RoleView["cache"]`, the `Reveal.cache` field), `src/components/SideJob.tsx` (shows the riddle
  text from `cache`; the keepsake look is Task 56), `src/components/RoleReveal.tsx` (shows the riddle row from `cache`; the motif picture is Task 56).
- **Tests first (red):** (a) `viewFor(world, ownerSeat, ...).cache` has the motif, riddle, item and `state`; other seats' views have
  none, and `JSON.stringify` of their views contains neither the riddle nor the item name. (b) Before uncover no role's entities list the
  station and `act` is undefined on its pads; after uncover the sighted see it and Can't see hears its clicks. (c) `motiftile` entities
  appear for deaf and mute, never blind, and a decoy and the right tile are indistinguishable in the view (same fields but `motif`).
  (d) Uncover and solve each put the same cue on every seat's `sounds` in the same tick (blind, deaf, mute); `cueCaptions` words them.
  (e) The parity file's typed `Record` fails the typecheck until both rows exist; the rows' `sees` check the sighted picture
  (the station entity appears; the stash item is set).
- **Implementation (green):** as above. `RoleView.sideJob` and `sideJobFor` are deleted; the three client files above are retyped, nothing more.
- **Acceptance criteria:** tests green; `pnpm typecheck` and `pnpm check` green (no half-renamed field); the typecheck fails when a parity row is removed (shown); no field is added to a view without a
  role-table check (CLAUDE.md Perception).
- **Depends on:** 51.

### Task 53: Linters and the bots' blind spot

- **Description:** `lintCaches` proves the clue path; caches are excluded from FR2 and from door conditions; a cache is never a first
  station type; bots make no job for one.
- **Files touched:** `src/game/rooms/lint.ts` (`lintCaches`, called from `lintRoom`; delete `lintSideJobs`; `lintOpenAtOnce` skips caches),
  `src/game/rooms/lint.test.ts`, `src/game/bots/jobs.ts` (a job naming a cache is a lint error), `src/game/bots/jobs.test.ts`,
  `src/game/rooms/pacing.test.ts` (a second test: each cache station's type was met in an earlier room, or in the same room as a
  non-cache station of that type, taught first).
- **Tests first (red):** (a) a cache whose motif has no tile, whose tile is unreachable for walking, or whose tile is perceivable by no
  sighted role fails; (b) a cache whose clue and uncover tile are both perceivable by one role alone (the only role to perceive either)
  fails with a message naming the role; (c) a door whose `opensWhen` names a cache fails; a room whose only two open stations include a
  cache fails FR2; (d) a cache of a type first met in that room fails the pacing test; (e) a `hints.jobs` entry that names a cache fails.
- **Implementation (green):** reuse `probe`/`controls`/`reachesSighted`; the uncover tile's perceivability is its `motiftile` entity in a
  sighted view, the clue's is `hasClue`. Mutation-check each rule.
- **Acceptance criteria:** the five tests green and each shown red by disabling its rule; `pnpm lint:rooms` still reports "9 room(s) ok"
  (no cache is authored yet); `src/game/bots` never reads `world.cacheUncovered`.
- **Depends on:** 51, 52.

## 6. Phase Definition of Done

- [ ] Tasks 51 to 53 done and committed one each; the Task 28 commit made first.
- [ ] `pnpm test:unit` passes; `pnpm check` passes on a fresh check server.
- [ ] A unit-test room has a cache uncovered, solved and undone, perceived by the right roles; the nine shipped rooms still clear.
- [ ] CLAUDE.md invariants: parity rows, `viewFor` gating, no bot reads cache state.
- [ ] Tick this phase in the 14 overview §5 and commit.

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR1 (hidden, data), FR2 (owner field), FR4, FR5, FR7 | 51 |
| FR3, FR9 to FR13 (data and sounds) | 52 |
| FR6, FR8, §2.2 linting | 53 |

## 8. Risks / open questions

None open.
