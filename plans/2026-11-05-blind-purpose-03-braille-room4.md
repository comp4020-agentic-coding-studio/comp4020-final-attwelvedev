# Braille, riddles and fixes — Phase 03: braille end to end, room 4

- **Date:** 2026-11-05
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-05
- **Part of:** `plans/2026-11-05-blind-purpose-00-overview.md`. Read it first: §2 (FR5 to FR9),
  §4.1 (the plate contract, verbatim types), §4.3, §4.4 (the bot contract), §3.
- **Depends on phases:** 01 (the id snapshot), 02 (`jammedUntil` exists in `World`; Task 75 adds to
  DESIGN.md after Task 71's edit).

## 1. Summary

Braille works end to end in one room:

- the room format, sim, view and sound
- the linter
- a bot that reads a plate
- the card on Can't see's screen
- room 4's plate carrying the second digit of safe Q2

Room 4 can no longer be cleared without Can't see reading it.

## 2. Requirements (this phase)

### 2.1 Functional

- FR5 (room 4 only)
- FR6, FR7, FR8
- FR9 (the linter, the bot, room 4)

### 2.2 Non-functional

- Perception: cells only in a blind seat's own view.
- `tap` has a parity row.
- Accessibility: hidden dot numbers only, a polite status, shape-not-colour dots, reduced motion.
- axe passes at both viewports.
- `logGame` records a plate read as `{ kind: "braille" }` (the `GameEvent` `"station"` family:
  detail kind only).
- DESIGN.md entries for `BrailleCell`, `BrailleCard` and the plate's drawing.

### 2.3 Out of scope for this phase

- Rooms 5 to 9, radio decoys, the rest marker (phase 04).
- Riddles (phase 05).

### 2.4 Assumptions

See overview §2.4.

## 3. Existing code context (verified 2026-11-05)

- **Room format** (`src/game/rooms/format.ts`):
  - `Tile` union (line 3); `TILES` set (121–150)
  - `RoomObject.kind` union (30–61)
  - `NUMBERED: Record<string, [RoomObject["kind"], string]>` (153–171)
  - `PARAMS` whitelist (173–189)
  - grid normalisation `raw.map((row) => row.replace(/[^#D=%H]/g, "."))`: a plate tile becomes floor
  - reading-order loop in `parseRoom` (~530–547)
  - `B` is a crate, so the plate is `o` (spec A5)
- **Sim:**
  - `World` (`src/game/sim/world.ts:85–119`); `createWorld(room, seed = 1)` (168)
  - `WorldEvent` union (121+)
  - `step(...)` (`src/game/sim/step.ts:462`). Act dispatch (484–511):

    ```ts
    const acts = actEdges(world, inputs);
    const used = new Set<Seat>(acts.filter((s) => world.holding[s] !== undefined));
    const wrong = updateStations(world, acts.filter((s) => !used.has(s)), used);
    for (const seat of acts) {
      if (world.holding[seat] !== undefined || !used.has(seat)) actOn(world, seat);
    }
    ```

    `updateStations(world, acts: Seat[], used = new Set()): Wrong | null` adds seats that acted on a
    station to `used`.
  - `actOn(world, seat)` is in `src/game/sim/gear.ts:85` (release → take → sill → hands, bell, lamp,
    lever). Add the plate read in `step` before `actOn`, for seats not in `used`.
- **Station answers** (`src/game/sim/stations.ts`):
  - dial `answer` is its digits, each 0 to `range-1`
  - keypad `answer` is key indexes 0 to 8 (key n+1)
  - radio `[setting, digit]`
  - wires `[cut, rule, ...colours]`
  - `redrawOne` and `drawStations` (seed `rng(world.seed * 1000 + world.attempt)`) change answers,
    so `plateNumber` must read `world.stations[for].answer` live
- **The dial's tumbler** (`src/game/perception.ts` `stationSound`, ~726):

  ```ts
  if (s.type === "dial" && e.result === "turn" && e.n === s.answer[s.input.length - 1]) { … cue(world, "tumbler", at, me) … }
  ```

  The plate's digit must not also sound a tumbler: guard on `s.input.length - 1 !== platePart`.
- **View:** `RoleView` (`perception.ts:203–245`); `viewFor(world, seat, role, full)` (1111).
  - The own-seat precedent: `const cache = cacheFor(world, seat); if (cache) view.cache = cache;`
    (1130).
  - `spectatorView(world, follow, roles, full)` (1179) builds its view from `entitiesFor` and
    `soundsFor`. Add `braille` when `follow !== null && roles[follow] === "blind"`.
  - `actHint(world, seat, role)` (1272).
  - `SoundCue["kind"]` (146–191); `RANGE` (254–273); event-to-sound branches in `soundsFor` (~622).
  - `EntityView.flash?: "ok" | "wrong"` already exists (a sign's result).
- **Parity** (`src/game/parity.test.ts`):
  - `PARITY: Record<SoundCue["kind"], Scenario>`
  - `Scenario = { world; act: () => void; sees: (before: RoleView, after: RoleView) => boolean; exempt?: string }`
  - helpers `worldWith(grid, objects)`, `put([x, y, ch])`, `place`, `go`, `actBy`, `BLIND`, `MUTE`
- **Linter** (`src/game/rooms/lint.ts`):
  - `export function lintRoom(room: Room): LintIssue[]` (28)
  - `lintClues` (787) checks perceivability with real `viewFor` views (`reachesSighted`)
  - the role-split rule shape is `uncoverSplitFault` (522–531)
  - script: `scripts/lint-rooms.ts`
- **Bots:**
  - `src/game/bots/brain.ts`: `think` → `thinkBlind(view, inbox, m, now)` (261). It handles callout
    headings, holds on a `hum`, sends "stop" on a stethoscope `tumbler`, and drains `m.toTell` (filled
    by `earStep`).
    - It never presses Act; it ends with `return { input: idle(m, m.holding || led ? ZERO : m.heading), send };`.
    - Its digits go out through `m.toTell` (`toTell: number[]`, line 93) as `{ method: "text",
      text: String(digit) }`.
  - `guideBlind` (1270) and `goalFor(room, m, seat, own, at, known, from, view)` (646) steer a
    blind seat to the job's `jobTile`.
  - `src/game/bots/jobs.ts`:
    - `JobTarget` union (7–24)
    - `parseJob(room, j, index): Job | string` (73)
    - `hintsOf(room)`, `jobTile(room, job, seat)` (279), `claimJobs`, `isDone` (401)
  - `src/game/bots/decode.ts`:
    - `readNumber(text)` (`/^\d$/`)
    - `beliefFrom` pushes texted digits into `b.numbers`
    - the `dial` decoder sets `b.answer[pos]` from a "stop" callout
    - `DECODERS`
- **Room 4** (`rooms/04-the-safe.room`):
  - `"Q2":{"type":"dial","pads":[[19,1],[21,1]],"back":[23,1],"digits":2,"range":10}`
  - hint `{"beat":3,"listen":"Q2","at":[23,1],"prefer":"blind"}`
  - beat 3 "The safe" spans x 13 to 27
  - the stethoscope is `g1`
- **Client:**
  - `src/components/Game.tsx` HUD; Can't see shows `<p class="hud-hint">No map. Listen.</p>` (~1068)
  - `src/components/ActHint.tsx`; `src/components/SideJob.tsx` sits top-centre
  - `src/client/render/stations.ts` draws station objects (add the plate's floor drawing there, or in
    `hazards.ts` beside floor objects)
- **Spectator:** `src/components/Spectator.tsx` renders the followed seat's view and must render
  `BrailleCard` when the view has `braille`.

### Interfaces from earlier phases (exact)

- `World.jammedUntil: Record<string, number>`; `export const JAM_TICKS = Math.round(3000 / 50);`
  (`src/game/sim/stations.ts`; Task 71)
- `EntityView.station.jammed?: true` (Task 71)
- `Scene.cleared?: boolean` (Task 68)
- `RoleShape({ role, size, mono, outline }: { role: Role; size?: number; mono?: boolean; outline?: boolean })` (Task 81)
- Room-id snapshot `src/game/rooms/ids.test.ts`, files `src/game/rooms/__ids__/*.json` (Task 69)

## 4. Approach

The contract is overview §4.1 and §4.4. Phase-specific choices:

- **Reach:** "at the plate" means the seat's tile is the plate tile or one of its 8 neighbours.
  `world.reading[seat]` is cleared in `step` each tick when that no longer holds.
- **Roles:** `World.roles?: [Role, Role, Role]` (overview §4.1).
  - `createWorld(room, seed, roles?)` takes it as an optional third argument.
  - Callers pass it: `src/net/game.ts`, `attract.ts`, `solve.ts`, `forecast.ts`, `brain.ts` (its own
    worlds, if any), `mockup.ts`.
  - A world with no roles (old tests) treats no seat as blind, so no read works.
- **Silencing the carried part:**
  - a dial digit carried by a plate never sounds the tumbler, and the linter (Task 73) proves no
    other path reveals it
  - a teaching dial's lamp is excluded: plates may not name a teaching station (a lint rule)
- **Card layout:** spec §4.1 A. `BrailleCell({ dots, size }: { dots: number[]; size: number })` is an
  SVG of 2×3 positions: raised = a filled `--ui` disc, flat = a ~4 px hollow ring.
  `BrailleCard({ cells, teach }: { cells: number[][]; teach?: boolean })`.

## 5. Task breakdown

### Task 72: The plate in the sim, view and sound (FR6, FR7 sim side, FR8) [x]

- **Description:** a room can hold `o` plates. Act by a Can't-see seat at one sets
  `world.reading[seat]`, emits `braille` and the `tap` sound. That seat's view carries
  `braille.cells` until it steps off. No other view ever does.
- **Files touched:**
  - `src/game/rooms/format.ts` (+ test)
  - `src/game/sim/braille.ts` (new) + `braille.test.ts`
  - `src/game/sim/world.ts`
  - `src/game/sim/step.ts`
  - `src/game/perception.ts` (+ `perception.test.ts`)
  - `src/game/parity.test.ts`
  - `createWorld` callers (§4)
  - `src/net/attach.ts` (log)
  - `src/client/hud.ts` (caption "Plate read"), `src/client/audio.ts` (a synthesised soft tap)
- **Tests first (red):**
  1. `format.test.ts`: `o` parses to `kind: "braille"`, id `o1`, `params.for`/`part` kept, the tile
     is floor in `grid`.
  2. `braille.test.ts`:
     - `brailleCells(7)` = `[[3,4,5,6],[1,2,4,5]]`; `brailleCells(10)` = `[[3,4,5,6],[1],[2,4,5]]`
     - `BRAILLE_KEY` has 11 entries with labels `1`…`9`, `0`, `#`
     - `plateNumber` follows overview §4.1's table for each station type, and changes after
       `redrawOne`
  3. `perception.test.ts`:
     - (a) a blind seat beside `o1` presses Act, and its next view has `braille.cells` equal to
       `brailleCells(plateNumber)`
     - (b) a deaf or mute seat at the same tile never gets `braille`, and its act hint is undefined
     - (c) after stepping two tiles away, `braille` is gone
     - (d) every other seat's view and every `EntityView` lacks the number: serialise all three
       views to JSON and check that the decoded number appears only inside the blind view's
       `braille`
     - (e) a spectator following the blind seat gets `braille`
  4. `parity.test.ts` row `tap`: the hearing in range hear it, and the sighted in sight see the
     plate entity `flash: "ok"` that tick.
  5. `actHint` for blind beside a plate is `"Read the plate"`.
- **Implementation (green):** per overview §4.1, exactly the listed types and fields. The plate
  entity is `{ id, kind: "braille", pos }` for the sighted, with `flash: "ok"` on the tick of a
  read.
- **Acceptance criteria:**
  - every test shown red: remove the role check in `viewFor`, and remove the step-off clear
  - existing perception and parity tests green
  - `pnpm test:unit` green
- **Depends on:** none in this phase.

### Task 73: The linter guards plates (FR9 lint) [x]

- **Description:** `pnpm lint:rooms` fails a room that breaks any of these rules:
  - a room 4 to 9 (id prefix `04`…`09`) with not exactly one plate
  - a plate whose `for` is not a station in the room, or is a teaching station or cache
  - a plate whose `part` is out of range for its station
  - a plate in rooms 1 to 3
  - a carried part that some role perceives through another path: a dial with a `back` (tumbler) or
    a stethoscope listen hint for the carried digit; a keypad clue that plays the carried key (Task
    76 makes the tune rest there; until then, the lint requires the plate's keypad to have no tune
    note at `part`); a radio's pips naming the band; a wire plaque or ink naming the cut
- **Files touched:**
  - `src/game/rooms/lint.ts` + `lint.test.ts`
  - `spec/fixtures/clue-faults/` (one faulty fixture per rule, following that folder's pattern)
- **Tests first (red):** one `lint.test.ts` case per rule, each with a small inline room string
  breaking that rule and expecting its message. Plus "room 4 without a plate fails" while room 4 has
  none yet. Mark that case `// becomes green in Task 74` and assert on the message rather than
  skipping it.
- **Implementation (green):** a `lintPlates(room): string[]` called from `lintRoom`.
  - Perception checks reuse the existing real-`viewFor` helpers, so a carried number counts as
    "perceived elsewhere" exactly when a non-blind view, or a blind sound other than via `braille`,
    reveals it.
  - Simplest sound check: run the world for one tune period and confirm no `clue`/`earpiece`/`pip`
    cue carries the number at that position.
- **Acceptance criteria:**
  - each rule is red on its fixture and green when fixed
  - a unit test that calls `lintPlates` on each of today's rooms 4 to 9 with gating forced on reports
    **exactly** one issue each, the missing plate, and nothing else
  - **Gating:** the "exactly one plate" rule is enforced for room ids listed in `PLATE_ROOMS`, a
    `const` in `lint.ts` that Tasks 74, 77 and 78 extend room by room. It starts as `[]`, so
    `pnpm lint:rooms` stays green between tasks. Phase 04's last task asserts it equals all six.
- **Depends on:** Task 72 (`o` parses).

### Task 74: A Can't-see bot reads a plate; room 4 needs it (FR5 room 4, FR9 bots) [x]

- **Description:**
  - room 4 gains `o1` carrying Q2's second digit (`{"for":"Q2","part":1}`)
  - the tumbler no longer sounds for that digit
  - the hint list gains a read job
  - bots clear room 4 in every rotation, with the digit going from the plate to Can't see's text to
    the dial turner
- **Files touched:**
  - `src/game/bots/jobs.ts`, `brain.ts`, `decode.ts` (+ tests)
  - `src/game/perception.ts` (tumbler guard)
  - `rooms/04-the-safe.room`
  - `src/game/rooms/__ids__/04-the-safe.json` (updated with `-u`, diff reviewed: only `o1` added)
  - `src/game/rooms/lint.ts` (`PLATE_ROOMS = ["04-the-safe"]`)
- **Tests first (red):**
  1. `decode.test.ts`: `readBraille(brailleCells(n)) === n` for 0 to 99; `readBraille([[1]])` is
     `null` (no number sign).
  2. `jobs.test.ts`: `parseJob` accepts `{"beat":3,"read":"o1"}` into `{ kind: "read", plate: "o1",
     tile }`, rejects an unknown plate, and `claimJobs` gives it to the blind seat only.
  3. `brain.test.ts`: a blind bot standing at a plate whose view shows the act hint "Read the plate"
     sends `act: true` once. Given `view.braille` it queues the digits to `toTell`, then sends them
     as texts.
  4. `perception.test.ts`: the tumbler does not sound for a plate-carried dial digit, and still does
     for the other.
  5. `spec/rooms.test.ts` (existing) **fails** for room 4 after the room edit and before the bot
     work. Record this.
- **Implementation (green):**
  - **Room edit.** Place `o` on a floor tile in beat 3, inside x 13 to 27 and reachable before the
    safe, at a spot the sighted can see and steer to. Choose it with
    `pnpm mockup:room rooms/04-the-safe.room /tmp/r4.html`: it must not be a tile any existing object
    uses. Append the plate in reading order. No other letter moves; confirm with the id snapshot.
  - **Hint.** Add `{"beat":3,"read":"o1","prefer":"blind"}` before the listen job.
  - **Dial decoder.** For the plate's `part`, take `b.answer[part]` from the texted digit
    (`b.numbers.at(-1)`).
- **Acceptance criteria:**
  - `pnpm lint:rooms` green with `PLATE_ROOMS = ["04-the-safe"]`
  - `spec/rooms.test.ts` green for room 4 in all three rotations, within its `budgetS`
  - the id snapshot diff adds only `o1`
- **Depends on:** Tasks 72 and 73.

### Task 75: The braille card on Can't see's screen (FR7 client, FR8 pulse) [x] (review queued)

- **Description:**
  - Can't see's HUD shows the card (spec §4.1 A) while `view.braille` is set, with the teaching line
    in room 4
  - the Act button and `ActHint` say "Read the plate"
  - the sighted see the plate drawn and pulsing on a read
  - spectators following Can't see see the card
- **Files touched:**
  - `src/components/BrailleCell.tsx`, `BrailleCard.tsx` (new)
  - `src/components/Game.tsx`, `Spectator.tsx`
  - `src/styles/game.css`
  - `src/client/render/stations.ts` (plate floor drawing and pulse)
  - `src/client/fx.ts` (a `flash` on a `braille` entity becomes a pulse fx)
  - `spec/layout/braille.test.ts` (new)
  - `DESIGN.md` (entries for `BrailleCell`, `BrailleCard`, the plate's drawing; copy "Plate under
    your hand", "Read the plate", the room 4 line)
- **Tests first (red):** `spec/layout/braille.test.ts`, at 1280 and 375. Drive room 4 by sockets for
  two seats and a page for the blind seat, or use a fixture room `spec/fixtures/rooms-braille/
  01-plate.room` (a plate beside the blind spawn, for speed, served with `ROOMS_DIR` like
  `leaderboard.test.ts:205`):
  1. Blind presses Space at the plate: `getByRole("group", { name: "Braille plate" })` is visible,
     with N `BrailleCell` svgs, a key of 11, and the polite status "Plate: N cells".
  2. Its accessible text contains "dots" and never the decoded number (the test knows it from the
     fixture's fixed seed).
  3. Stepping off closes it, and Space reopens it.
  4. The card's box does not overlap the comms wheel button's box at 375, and no text is clipped
     (`scrollHeight <= clientHeight`).
  5. axe has no violations on the open card.
  6. With reduced motion, all cells are present at once (no staggered animation).
  7. A sighted page's canvas changes at the plate on a read (`settledHash` before and after).
- **Implementation (green):** per spec §4.1 A and this file's §4.
- **Acceptance criteria:** the layout spec is green at both viewports, and `spec/design.test.ts` is
  green.
- **Human review:** local build, room 4, three tabs, 1280 and 375:
  - the card reads as "felt, not lit" on black
  - the dots are distinguishable from flat positions
  - the key is easy to match
  - the room 4 line is clear
  - on a phone nothing important is covered

  Pass = the user accepts.
- **Depends on:** Task 72 (view field), Task 74 (room 4's plate, for the human review).

## 6. Phase Definition of Done

- [x] Tasks 72 to 75 complete, each shown red then green. (Task 74 was parked on the pacing rule; ruled
  option 1 (a plate is not counted as a new kind of thing), `bb0ed58`, then merged.)
- [x] `pnpm test:unit` passes (on this branch).
- [x] `pnpm lint:rooms` passes, and `spec/rooms.test.ts` passes (room 4's plate `o1` is in; all three rotations clear).
- [x] The full check passes (overview §3 recipe), 362 s.
- [x] The user accepted Task 75. (review queued)
- [x] Tick phase 03 in overview §5 and commit. (ticked as "review queued", like phases 01 and 02: Task 75's human review is still queued)

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR5 (room 4) | Task 74 |
| FR6 | Task 72, Task 75 |
| FR7 | Task 72, Task 75 |
| FR8 | Task 72, Task 75 |
| FR9 | Tasks 73, 74 |

## 8. Risks / open questions

None.

## Corrections log

(empty)
