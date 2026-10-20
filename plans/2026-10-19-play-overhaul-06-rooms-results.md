# Play overhaul — Phase 06: Four new rooms, labels, comms map, versioned board

- **Date:** 2026-10-19
- **Status:** Approved
- **Requirements confirmed by user:** yes — 2026-10-19
- **Part of:** `plans/2026-10-19-play-overhaul-00-overview.md`. Read it first,
  especially §2.1 A2–A3 and §3's room rules. The balance model is
  `specs/2026-10-19-play-overhaul.md` §4 ("Balance model") and FR12–FR15.
- **Depends on phases:** 03, 04, 05. Task order in this file: 22, 28, 23, 24, 25
  (Task numbers are global; 28 was added after the set was planned, so it sits
  between 22 and 23 here and the numbering of 23–27 is unchanged). Tasks 28 and 23
  are executed as one unit (see Task 28), so run them in one session.

## 1. Summary

The heist becomes four rooms: a tutorial that teaches every object with small
labels, then one room for each role's lead beat (dark → Can't see, alarm →
Can't hear, twin cue → Can't speak), each with a split cue, glass and vents.
Bots clear every room in every rotation and fail each lead beat without its
lead's sends. Room end shows a comms map. The leaderboard gets a new edition,
with the old board kept.

This phase also finishes the bot work phase 04 left open (amendment A3 and the
tolerant guide, Task 28): the bots must plan only around hazards their role has
perceived, or "every role is needed" would pass falsely. It is built against the
new rooms, which are designed for it, not the old ones, which Task 23 deletes.

## 2. Requirements (this phase)

### 2.1 Functional

FR12, FR13 (rooms satisfy it), FR14, FR15, FR35, FR36 (versioning), A3 (Task 28).

### 2.2 Non-functional

Each room: `pnpm lint:rooms` clean; bots clear it in every rotation within its
`budgetS` without being caught; cue-dependent safe windows ≥ 2 s (existing
rule); rooms fit the 3/4 view (height 9–13 tiles).

### 2.3 Out of scope for this phase

Ambience and music (Task 26). New hazard kinds (the pivoting camera stays in
the backlog).

### 2.4 Assumptions

See overview §2.4. Room ids change (`01-…` to `04-…` new slugs); old records
stay on the edition-1 board.

## 3. Existing code context (verified 2026-10-19)

- Rooms: `rooms/01-loading-dock.room`, `02-cameras-lasers.room`,
  `03-vault.room` (JSON meta, `---`, grid). Meta keys: `id`, `name`, `version`,
  `beats[] { name; x: [from, to]; intent: { blind; deaf; mute } }` (Task 15
  adds `lead?`, `cue?`), `objects { <id>: params }` (doors `opensWhen`, `mode:
  "sequence"`; cameras `facingDeg, fovDeg, range, periodS, watchingS, offsetS`;
  lasers `dir, onS, offS, offsetS`; guards `patrol, speedTps, sightTiles,
  fovDeg, turnDegPerS`; signs `shows`; clues `n, everyS` from Task 14),
  `flips[]` (dark `zone`, alarm `trigger, durationS`), `hints.jobs[]`
  (`{ beat; goTo: plateId | "K<n>" | "E" | [x, y] | "clue:<id>"; prefer?;
  until?; after?; all? }` or `{ beat; push; to }`), optional `budgetS`, `leads`
  (Task 15), `hue` (read by the renderer, Task 18).
- Legend after phase 04: `# . 1 2 3 B p D E G C L h K $ S = % c`.
- `src/game/rooms/load.ts` `loadRooms(dir = "./rooms")`; `src/net/attach.ts`
  `roomList()` (Task 1 added a `ROOMS_DIR` override); the home page feeds load
  `rooms/01-loading-dock.room?raw` in `src/components/Feeds.tsx`;
  `spec/heistPlay.ts` `clearRoomOne(players)` drives hard-coded waypoints for
  room 01; `spec/heist.test.ts` asserts room ids `01-loading-dock` →
  `02-cameras-lasers`; `spec/caught.test.ts` runs into room 02's camera;
  `spec/leaderboard.test.ts` tabs per room.
- `src/game/rooms/solvePlans.ts`, `solveBuilder.ts`, `scripts/solve-rooms.ts`,
  `src/game/rooms/solutions/*.json`: unread by anything but the script; plans
  only for the old rooms 02–03.
- Comms: `src/net/attach.ts` logs `channel.send` per human send (Task 1:
  `{ method, role }`) and forwards bot sends from `tick`; `cleared` message is
  `{ t: "cleared"; room; ms; loot; lootTotal }`; `src/components/RoomCleared.tsx`
  `{ ms; loot; lootTotal; last; host; onNext; onRestart }` (Task 8 turned
  restart into a vote proposal), `HeistComplete.tsx` `{ ms; loot; lootTotal;
  rank }`.
- Records: `src/lib/schema.ts` `runs` (id, kind, room_id, room_version,
  heist_version, team_name, names JSON, ms, loot, loot_total, created_at);
  `src/lib/runs.ts` `RunInput`, `saveRun`, `topRuns(db, { kind; roomId? },
  limit)` (shows the most recently played version only; `sameHeat` by kind +
  room + version); migrations in `drizzle/` up to `0009_rich_wind_dancer`;
  `src/pages/leaderboard.astro` tabs from `loadRooms()`.

### Interfaces from earlier phases (exact)

- Task 13: tiles `=` glass, `%` vent.
- Task 14: object kind `clue` (letter `c`, params `{ n: 1 | 2 | 3; everyS:
  number }`), `SoundCue` kind `"clue"`; `RoleView.seen?: string[]`.
- Task 15: `Beat.lead?: Role`, `Beat.cue?: "twin" | "split"`; meta `leads:
  true` requires all three roles to lead a beat; held sequences (plates ≥ 3
  tiles apart); lint rule "no beat both fully dark and alarmed".
- Task 16 (what phase 04 shipped, verified against the code): `solveRoom(room,
  roles, budgetS = 600, humans = new Set(), opts?: { mute?: Role }):
  SolveResult` (with `sentBy: [number, number, number]`); `botsAct(…, full,
  muted?: Seat)`; the `spec/rooms.test.ts` "each lead role is needed" describe
  (skips while no room declares leads); job target `"clue:<id>"`;
  `forecastFor(room: Room, alarms: readonly AlarmWindow[] = [], only?:
  ReadonlySet<string>): Forecast` (hazard ids to plan around; left out, all);
  `Known` (in `src/game/bots/jobs.ts`) has `seenHazards: Record<string, {
  lastTick: number }>`, filled from sight (a guard, camera or laser entity in the
  view) and from hearing (a `guard`, `camera` or `laser` cue names the nearest
  hazard of its kind within 25° of the cue's `dir`), and `clues: Record<string,
  number>` (a heard `clue` cue's `n`, by the nearest clue along its bearing);
  `BotMemory.blindAt`; the deaf guide walks back to its last estimate when it
  loses sight of Can't see. **Not built:** the planner (`decide` in
  `src/game/bots/brain.ts`) still calls `forecastFor(room, m.alarms)` with no
  hazard set, so it plans from the room file; Task 28 changes that.
- Task 18: meta `hue?: "rose" | "apricot" | "butter" | "mint"` (renderer
  reads it; default rose).
- Task 1: `ROOMS_DIR` env override for `roomList()`. Task 6: `reveal.rooms`
  count.
- Task 1: `channel.send` log detail `{ method, role }`; `ChannelMessage.from.seat`.
- Task 12: `src/components/HudMenu.tsx` (the `[≡]` menu; add items as
  `<li>` buttons), `src/components/RoomCleared.tsx` props `{ ms: number; loot:
  number; lootTotal: number; last: boolean; host: boolean; onNext: () => void;
  onRestart: () => void }` (`onRestart` proposes a vote since Task 8).
- Task 2: `src/client/settings.ts` `Settings` (add `labels: boolean`).
- Task 17: `DESIGN.md` (repo root), the `CLAUDE.md` rule that visual
  changes update it, and `spec/design.test.ts`.
- Task 18: `src/client/render/` modules and `toScreen(cam, x, y, z = 0)`.

## 4. Approach

**Room designs** (each is drafted as ASCII in the task, linted, then run
through the bots, then reviewed by the user on a local build):

1. `01-first-job` (tutorial, ~40×11, hue rose): crate push to a plate, a
   three-plate door, a glass wall to see a camera through, a vent to hear a
   guard through, loot, exit. No flips, no leads. Labels on.
2. `02-blackout` (lead: Can't see, ~48×11, hue apricot): a dark corridor
   holding a guard and two lasers; Can't see hears the guard's steps and the
   hums and calls the crossing with talk; Can't hear follows faces Can't see
   sends; split cue: a clue `c` behind a vent in the dark gives the number of
   the plate to hold on the far side, heard only by the hearing roles.
3. `03-alarm` (lead: Can't hear, ~48×11, hue butter): an alarm plate that the
   route must cross; during the alarm the cues are drowned for hearers and
   cameras lock on; Can't hear reads cameras through glass and leads the
   others with talk; split cue: a sequence sign seen through glass by one
   sighted player while the plates are in another area.
4. `04-chimes` (lead: Can't speak, ~50×13, hue mint): three doors, one hums
   (twin cue: a clue `c` on the door's tile plus its glyph seen through glass);
   only Can't speak both sees which door is marked and hears which one chimes,
   and translates with marks and clips; a held sequence at the vault.

Each beat's jobs carry `prefer` so the solver gives the lead role the lead
job. `budgetS` set from the bots' times plus 50 %.

**Designed for perception-only bots (A3, Task 28).** A lead beat is built so each
role can get what it needs through its own channel, because the bots will use
nothing else: the hazard a sighted role can't see must be one the lead role
perceives *and has a method to tell the others about* (Can't see sends callout,
text, voice, face; Can't hear receives only face and mark; Can't speak receives
callout, text, voice, clip, face, mark). Concretely, room 2's dark corridor must
not put its only hazard where just Can't see can perceive it and only a face can
warn Can't hear: give Can't hear a way in (a glass pane onto the lane, or a
checkpoint where the team waits and listens before crossing), as phase 04's
diagnosis of the old room 03 showed this is what makes the beat solvable.

**Labels (FR15).** `src/client/labels.ts` (pure): `labelsFor(entities,
tiles, shown: Set<string>): Label[]` returns at most two new labels per frame
for kinds first seen this room, with the copy table from the spec ("Plate: one
person on each opens the door", "Glass: see through it, sound doesn't pass",
"Vent: sound passes, you can't see through", crate, door, loot, camera, laser,
guard, exit, dark). Drawn by `src/client/render/labels.ts` as a glass chip
with a leader line; shown for 6 s each; a "Labels" toggle in the HUD menu
(`Settings.labels`, default on in the first room only: the HUD reads
`reveal.index === 0`).

**Comms map (FR35).** `Running.comms: Record<string, Record<Method, number>>`
keyed `"from>to"` by seat, counted for every delivered message (humans in the
`send` case, bots in `tick`, voice by talk spurt: a new spurt after 1 s of
silence counts once); reset each room. `cleared` gains `comms: CommsEdge[]`
with `interface CommsEdge { from: Seat; to: Seat; count: number; by:
Partial<Record<Method, number>> }`. `src/components/CommsMap.tsx` draws the
triangle as SVG (seats at the corners with `RoleShape` and nickname, two
arrows per edge with counts, stroke width 2–8 px by share), lists per-edge
method counts on hover or focus, and writes the summary line ("Most messages
went Ana → Bo. Cy sent 5 in total."). Logged as one `room.clear` detail
`{ sends: <total> }` (a number, allowlisted).

**Edition (FR36, ADR 0014).** `runs` gains `edition integer not null default
1` (migration `0010_…` via `pnpm db:generate`). `src/lib/runs.ts` exports
`EDITION = 2`; `saveRun` writes it; `topRuns(db, { kind; roomId?; edition? })`
filters by edition (default `EDITION`). The leaderboard page: tabs for the
current rooms; a link "Earlier heist (edition 1)" to `?edition=1`, whose room
tabs come from the distinct `room_id`s stored with edition 1 (names from a
small map of the old ids: Loading Dock, Don't Blink, Lights Out, Sound Off).

## 5. Task breakdown

### Task 22: Room 1 tutorial with in-world labels

- **Description:** Replace `rooms/01-loading-dock.room` with `01-first-job`;
  labels; update the fixtures and specs that drive room 1.
- **Files touched:** `rooms/01-first-job.room` (new; delete
  `01-loading-dock.room`), new `src/client/labels.ts` (+ test),
  `src/client/render/labels.ts`, `src/client/settings.ts` (+ test: `labels`),
  `src/components/HudMenu.tsx` (Labels toggle), `src/components/Game.tsx`,
  `src/components/Feeds.tsx` (load the new room), `spec/heistPlay.ts`
  (`clearRoomOne` waypoints for the new room), `spec/heist.test.ts`,
  `spec/caught.test.ts` (uses whichever room has a camera nearest a spawn —
  room 01's glass-viewed camera), `src/game/bots/attract.ts` if room-specific.
- **Tests first (red):** `labels.test.ts`: the first sight of a plate gives
  the plate label once; at most two per frame; none once `shown` has the kind;
  none when labels are off. `spec/rooms.test.ts` (existing) covers clearing.
  Browser in `spec/layout/hud.test.ts`: "room 1 shows a label the first time
  a plate is in sight, and the Labels toggle hides them".
- **Implementation (green):** this file's §4 room 1 and "Labels".
- **Acceptance criteria:** lint + bots green; home feeds still play `DESIGN.md` updated (labels / comms map, per its `CLAUDE.md` rule).
  (`spec/layout/home.test.ts`); `clearRoomOne` clears the new room.
- **Human review:** the user plays room 1 on a local build as a newcomer would
  and judges whether every object is understandable from the room and labels
  alone. Pass = user says so.
- **Depends on:** Tasks 18–21, 16.

### Task 28: Bots plan only around what their role has perceived (A3), and a tolerant guide

- **Description:** Make `decide` plan from `Known.seenHazards` (hazards seen or
  heard within the last 2 s) instead of the room file, so the room spec cannot
  pass by bots knowing what their role can't; then make the guide tolerant of a
  person who hesitates. Built **before** Task 23, on a draft of the dark-corridor
  beat that has a hazard a sighted role can't see, so the design is proved on a
  room made for it. The draft lives in `spec/fixtures/rooms/` (the directory the
  linter test already loads), **not** in `rooms/`, so players and
  `spec/heist.test.ts` still see only the shipped rooms until it clears; Task 23's
  `02-blackout` is that draft finished. Task 28 adds a spec that runs the same two `rooms.test.ts`
  describes over `loadRooms("./spec/fixtures/rooms")`.
- **What phase 04 found (constraints, not a design):** (a) on the old room 03 the
  first beat is a dark corridor in which only Can't see perceives the guard (by
  hearing) and a Can't-see bot tells nobody, so planning only from perception
  left the sighted bots walking into it: 7 catches, room 03 uncleared in every
  rotation. (b) The one method that reaches Can't hear from Can't see is a
  `face` (`RECEIVES.deaf` is `face`, `mark`), so a warning from a Can't-see bot is
  a face or a text/callout to Can't speak only. (c) A "Hold up" face (`f04`) sent
  on every hazard cue froze the team (70–75 faces a run, each resetting a 5 s
  hold, nobody left the spawns); sent only when the cue is loud (gain ≥ 0.5) it
  came too late (35 catches). Do not retry either setting. (d) A bot reads only
  its `RoleView` and the messages its role receives (ADR 0007, ADR 0011); no
  shared bot memory, no sends outside `route`.
- **Files touched:** `src/game/bots/brain.ts` (+ test: `decide` passes the
  perceived set, `planKey` includes it; the hazard cue handling), `src/game/bots/
  forecast.ts` (+ test, only if the set needs more), `src/game/bots/attract.ts`
  (`HUMAN.blind.pauseChance` back to 0.01), `src/game/bots/attract.test.ts`,
  `spec/fixtures/rooms/02-blackout-draft.room` (new; Task 23 turns it into
  `rooms/02-blackout.room` and deletes the fixture), `spec/rooms.test.ts` (a third
  describe that runs the clear-every-rotation and lead-needed checks over
  `loadRooms("./spec/fixtures/rooms")`; `01-tiny` is already there and stays
  green), `src/game/rooms/lint.test.ts` (its "fixture rooms" test lists the
  fixture ids: add the draft's), `PROCESS_LOG.md`.
- **Tests first (red):** brain: a sighted bot that has never seen or heard a
  guard heads down the lane the guard covers, and a bot that saw it 1 s ago does
  not (the fixture from phase 04's `brain.test.ts`, "records the hazards it has
  perceived", with its L-shaped corridor, extended to assert the move); the guide
  recovers when the blind seat pauses 1 s mid-tile (no endless "go"), and decides
  at a position that is not a tile centre; with `HUMAN.blind.pauseChance` at 0.01
  `attract.test.ts` still clears room 1 in under 30 s for every seed.
- **Implementation (green):** the planner change as above; the tolerant guide as
  phase 04 §4 described it ("decides at any position, resends stop/go if the
  blind seat's motion doesn't match within 800 ms"). How a Can't-see bot makes
  the team safe in a dark beat is **the room's design**, not a bot trick: the
  draft room gives its lead beat something each role perceives (see §4, rooms 2
  and 3), and the bots use only that.
- **Decided by the user (2026-10-20): Tasks 28 and 23 are built together, as one
  working unit on one branch.** The old rooms cannot pass this task, and must not
  be kept alive by a flag: one planner serves every room, and phase 04 showed the
  old rooms 02 (`02-cameras-lasers`) and 03 (`03-vault`) cannot be cleared by
  perception-only bots (room 03: 7 catches, uncleared in every rotation; room 02
  failed once a warning was added). So the old rooms are deleted, together with
  everything that names them, **only once the first new room (`02-blackout`)
  clears under the new planner**, and in the same commit that switches the
  planner. The heist is therefore never short a room on the branch. Task numbers
  and acceptance criteria stay separate (Task 28 is the planner, guide and
  draft-room proof; Task 23 is the three rooms); they are executed in one session
  with one stop condition, in this order: Task 22, the draft room and planner
  (Task 28), `02-blackout` finished and the old rooms deleted, then `03-alarm` and
  `04-chimes` (Task 23). The deletion list (`rooms/02-cameras-
  lasers.room`, `rooms/03-vault.room`, `src/game/rooms/solvePlans.ts`,
  `solveBuilder.ts`, `solutions/`, `scripts/solve-rooms.ts`, the `solve:rooms`
  script, `spec/heist.test.ts`'s room ids, `spec/caught.test.ts`, `README.md`'s
  room list), moved here, **plus** the places that use the old rooms as fixtures,
  found by `rg -n "02-cameras-lasers|03-vault" src spec scripts`: `src/net/
  game.test.ts` (3 references), `src/game/bots/brain.test.ts` (9),
  `src/game/bots/forecast.test.ts` (5), `src/game/perception.test.ts` (1),
  `scripts/bench-tick.ts` (2, from phase 04: re-point it at a new room). The
  `brain.test.ts` and `forecast.test.ts` references are the real cost: they test
  the held sequence, the dark corridor and the camera and laser timing on those
  rooms, so each such test needs an equivalent on a small fixture room, not just a
  new id. Because the old rooms go only when `02-blackout` clears, `spec/heist.test.ts`
  keeps a second room to hand off to throughout, and its room-order assertion
  changes in that same commit to `01-first-job` → `02-blackout`.
- **Acceptance criteria:** the fixture-room describe in `spec/rooms.test.ts` is
  green on the draft room and on `01-tiny` in every rotation, with no catches,
  and "each lead role is needed" passes for the draft's lead beat; the shipped
  rooms (`01-first-job` and, once it replaces the old room 02, `02-blackout`) are
  green in every rotation under the new
  planner; `src/game/bots/attract.test.ts` green with blind pauses on;
  `grep -n "forecastFor(room, m.alarms)" src/game/bots/brain.ts` finds nothing
  (the planner no longer reads the room file's hazards unless told of them);
  `rooms/02-cameras-lasers.room` and `rooms/03-vault.room` are gone and nothing
  in `src/` or `spec/` names them (`rg -n "02-cameras-lasers|03-vault" src spec
  scripts` is empty).
- **Stop condition:** if the draft room cannot be cleared uncaught by bots in
  every rotation using only perception, **stop and ask the user**; do not fall
  back to planning from the room file, mark a rotation `it.fails`, loosen "never
  caught", or tune a threshold until the spec passes. The options then are to
  redesign the beat, or to change A3, and the second is the user's decision.
- **Depends on:** Task 16 (the record, the harness), Task 22 (the first new room
  and its fixtures), Tasks 18–20 (the 3/4 view the draft room is drawn in).

### Task 23: Rooms 2–4, each led by one role

- **Description:** `02-blackout`, `03-alarm`, `04-chimes` per §4, with
  `leads: true`, lead beats, split and twin cues, budgets. (Tasks 28 and 23 are
  one unit of work, decided 2026-10-20: the old rooms and the unused solver
  scripts are deleted when `02-blackout` clears, in the commit that switches the
  planner; the deletion list is in Task 28.) `02-blackout` is built from Task 28's
  `spec/fixtures/rooms/02-blackout-draft.room` (move it to `rooms/`, finish it,
  delete the fixture and its entry in `lint.test.ts`); all three rooms are cleared
  by the Task 28 planner, which plans only around what each role has perceived.
  If a room can't be cleared that way, that is Task 28's stop condition: stop and
  ask, never fall back to the room file.
- **Files touched:** `rooms/02-blackout.room`, `rooms/03-alarm.room`,
  `rooms/04-chimes.room` (new); `spec/heist.test.ts` (room ids: the full-heist
  order becomes `01-first-job` → `02-blackout` → `03-alarm` → `04-chimes`);
  `README.md` room list. The old-room deletions listed in Task 28 are done there.
- **Tests first (red):** the existing `spec/rooms.test.ts` (both describes)
  run against each new room as it is added: clear in all three rotations, and
  fail each lead beat with that role muted. Write each room's lead check before
  tuning it, and see it fail on a draft where the lead isn't yet needed.
- **Implementation (green):** design, lint, run bots, tune; one commit per
  room.
- **Acceptance criteria:** `pnpm lint:rooms` clean; `spec/rooms.test.ts`
  green including "each lead role is needed" for every lead beat; no
  `it.skip` left in that file.
- **Human review:** per room, the user plays it on a local build (three tabs)
  and judges: the lead role clearly leads that beat; nobody is idle for long;
  the split cue forces a hand-off. Pass = user says so for each room.
- **Depends on:** Task 22, Task 28.

### Task 24: The comms map at room end

- **Description:** Count deliveries per direction and method; send them with
  `cleared`; draw `CommsMap` in `RoomCleared` and `HeistComplete`.
- **Files touched:** `src/net/attach.ts`, `src/net/game.ts` (+ test:
  `countComms(comms, from, receivers, method)` pure helper),
  `src/net/protocol.ts`, `src/lib/gameLog.ts`/`src/lib/log.ts` (`sends`),
  new `src/components/CommsMap.tsx`, `src/components/RoomCleared.tsx`,
  `src/components/HeistComplete.tsx`, `src/styles/game.css`,
  `spec/heist.test.ts` (the `cleared` message has `comms` edges whose counts
  match the messages the test sent), `spec/layout/hud.test.ts` (map visible,
  axe clean, summary line names the busiest direction).
- **Tests first (red):** unit: two callouts from seat 1 to seats 0 and 2 count
  1 each on `1>0` and `1>2`; a voice spurt counts once; counts reset on the
  next room. Spec and browser as listed.
- **Implementation (green):** §4 "Comms map".
- **Acceptance criteria:** tests green; never a message's content in the map `DESIGN.md` updated (labels / comms map, per its `CLAUDE.md` rule).
  or the log.
- **Depends on:** Task 12 (RoomCleared shape), Task 1.

### Task 25: A new leaderboard edition, the old one kept

- **Description:** `edition` column and migration, `EDITION = 2`, filtering,
  the earlier-edition link and tabs.
- **Files touched:** `src/lib/schema.ts`, `drizzle/0010_*.sql` + meta
  (generated), `src/lib/runs.ts` (+ test), `src/pages/leaderboard.astro`,
  `spec/leaderboard.test.ts`.
- **Tests first (red):** `runs.test.ts`: a run saved now has edition 2; `topRuns`
  defaults to edition 2 and returns edition-1 rows only when asked; an
  existing database's rows read as edition 1 after migrating.
  `spec/leaderboard.test.ts`: "has a tab for the full heist and each of the
  four rooms"; "links to the earlier heist's board, whose tabs are the old
  rooms"; the "real run" case still passes.
- **Implementation (green):** §4 "Edition".
- **Acceptance criteria:** tests green; `pnpm db:generate` output committed;
  ADR 0014's consequences hold (no rows deleted).
- **Depends on:** Task 23 (room ids).

## 6. Phase Definition of Done

- [ ] Every task in §5 is complete and its tests pass
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start` then `pnpm check` passes
- [ ] Task 28 done: bots plan only around hazards their role has perceived, and
      no room is cleared by planning from the room file
- [ ] Tasks 22 and 23 human reviews accepted
- [ ] Playtest 4 offered to the user (the whole heist), written up in
      `playtests/` with the comms maps as balance evidence, and logged in
      `PROCESS_LOG.md`
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR12 | Tasks 22, 23 |
| FR13 (rooms satisfy) | Tasks 22, 23 |
| FR14 | Tasks 23, 28 |
| FR15 | Task 22 |
| A3 | Task 28 |
| FR35 | Task 24 |
| FR36 (versioning) | Task 25 |

## 8. Risks / open questions

No open questions. One accepted risk: Task 28 may find that a lead beat cannot be
cleared by perception-only bots. Phase 04 tried two ways of getting there on the
old room 03 and each failed (Task 28 lists them), so the plan does not promise it.
The task's stop condition says what happens then: stop and ask the user. It never
falls back to the room file.
