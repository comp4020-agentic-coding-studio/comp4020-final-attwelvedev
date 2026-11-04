# Braille, riddles and the post-phase-14 fixes — Plan overview

- **Date:** 2026-11-05
- **Status:** Approved
- **Tier:** Architecture (ADR 0023, `proposed`)
- **Requirements confirmed by user:** yes, 2026-11-05
  - Design: `specs/2026-11-05-blind-purpose-and-riddles.md`, approved, with amendments A1 to A5 ruled
    during this plan's investigation (spec §7).
- **Commits:** one per task, once `pnpm check` is green. Each message ends with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push or deploy without the user's
  go-ahead.
- **Review mode:**
  - A task with a `Human review:` line is not committed until the user accepts it, on a local build
    (`pnpm build && pnpm start`), at 1280 and 375.
  - Every user redirection goes in the active phase file's **Corrections log**, and into
    `PROCESS_LOG.md` when it qualifies.

## 0. How to use these plans

Files in the set:

| File | Phase |
| --- | --- |
| `plans/2026-11-05-blind-purpose-00-overview.md` | this file |
| `plans/2026-11-05-blind-purpose-01-bugs.md` | 01: bugs and the room-id guard |
| `plans/2026-11-05-blind-purpose-02-crew-and-jam.md` | 02: played icons and the jam |
| `plans/2026-11-05-blind-purpose-03-braille-room4.md` | 03: braille end to end, room 4 |
| `plans/2026-11-05-blind-purpose-04-radio-and-plates.md` | 04: radio decoys, gap marker, plates in rooms 5 to 9 |
| `plans/2026-11-05-blind-purpose-05-riddles-wrap.md` | 05: riddles and the wrap-up |

- A session reads this overview plus exactly one phase file.
- Task numbers are global (Tasks 67 to 82), continuing phase 14's numbering, which ended at 66.
- Tick a phase in §5 when its phase Definition of Done is met.

## 1. Summary

Phase 14's playtest left Can't see with little to do, the puzzles too plain, and four visible bugs.

- **Braille.** Rooms 4 to 9 each get one plate. It carries a number from one station's answer, and
  only Can't see can read it: dots on their black screen, decoded with a key. The team cannot clear
  the room without Can't see passing that number on.
- **Radio.** The radio gets two decoy bands, and the plate names the real one.
- **Riddles.** Wire plaques read as riddles.
- **Jam.** Teaching stations and caches jam for 3 s after a wrong answer, so spamming Act no longer
  brute-forces them.
- **Room 6.** Its chime gap gets a marker tone.
- **Room-id guard.** A snapshot guards room ids during all of this room editing.
- **Fixes:**
  - the landing feed draws Can't see's walking figure
  - the role screen shows played roles as small outline icons
  - nobody bobs on the cleared screen
  - nobody lands in the next room without readying

## 2. Requirements

The requirements are the spec's **FR1 to FR15** with amendments **A1 to A5**
(`specs/2026-11-05-blind-purpose-and-riddles.md` §2 and §7). Phase files cite them as "FRn". As
amended:

### 2.1 Functional requirements

1. **FR1.** The landing Can't see feed draws its bot's own figure with `drawOwnBlind`. It bobs and
   kicks up dust while walking, and the ring is gone.
2. **FR2.** Once status is `cleared`, no figure bobs or kicks up dust, for every role and for
   spectators.
3. **FR3.** After Next:
   - every seat sees the new room's role screen
   - no page enters the room before a view past tick 0 of that room
   - the timer runs once all three are ready
   - a solo lobby survives

   Bug fix, test first.
4. **FR4.** Each crew row shows the roles played earlier this heist as small outline `RoleShape`s
   behind the word "Played", with the label "Already played: …". Nothing is shown when nothing has
   been played (A4), and never the current role.
5. **FR5.** Exactly one plate (`o`, A5) in each of rooms 4 to 9:

   | Room | The plate carries |
   | --- | --- |
   | 4 | a dial digit |
   | 5 | a digit of keypad Q3 |
   | 6 | the radio's real band |
   | 7 | the wire to cut |
   | 8 | a digit of keypad Q2 |
   | 9 | a digit of keypad Q7 (A3) |

   The carried number is given nowhere else.
6. **FR6.** The plate is drawn for the sighted. Only a Can't see seat's own view carries its cells,
   only while at the plate after Act. Spectators follow the seat they watch.
7. **FR7.** Act at the plate opens the braille card: cells, a fixed 0 to 9 and # key, and in room 4
   only the teaching line. It closes when Can't see steps off, and Act reopens it.
8. **FR8.** Opening plays a `tap`, with sound reach and a parity row, and the sighted see a pulse.
9. **FR9.** Bots: a Can't-see bot is guided to the plate, reads it, and texts the number. Rooms pass
   `spec/rooms.test.ts` in every rotation. The linter fails rooms 4 to 9 without exactly one plate,
   or whose carried number is reachable without Can't see.
10. **FR10.** A radio with a plate has three tuned bands: one real, two decoys pipping wrong digits,
    all seeded.
11. **FR11.** From room 4, wire plaques (rule signs and room 7's numbered ink) read as riddles (A1).
    Rooms 1 to 3 and teaching stations stay plain.
12. **FR12.** Each rule, and the numbered-ink form, has a pool of 2 or 3 phrasings, seeded per
    station. Bots map the text back to the rule, and a test fails if any phrasing resolves to a
    different answer from its siblings.
13. **FR13.** A wrong answer on a teaching station or a cache (A2) jams it for 3 s: inputs are
    ignored, it looks jammed, and a `jam` sound plays with a parity row. The redraw still happens.
    Bots wait out the jam.
14. **FR14.** Room 6's keypad tune plays a quiet low marker where the radio's digit goes, with a
    parity row.
15. **FR15.** A test holds every shipped room's id-to-position map.

### 2.2 Non-functional requirements

- **Perception and parity** (CLAUDE.md, ADR 0007, ADR 0012). Plate cells are an own-seat view field,
  like the cache riddle. `tap`, `jam` and `rest` each get a row in
  `src/game/parity.test.ts` (enforced by the `PARITY: Record<SoundCue["kind"], Scenario>` type).
- **Accessibility:**
  - The card is `role="group"`, labelled "Braille plate".
  - Its hidden text gives dot numbers only, never the number.
  - A polite status says "Plate: N cells".
  - Dots differ by shape, not colour.
  - Reduced motion shows all cells at once.
  - axe passes at both viewports.
- **Layout:** screenshots and a layout spec at 1280 and 375 for every new or changed component.
- **Performance:** no new dependency, and no per-frame cost when the card is closed.
- **Logging:** a plate read and a jam go through `logGame` as kind only, never the number.
- **Docs:** `DESIGN.md` entries for each new visual. `CLAUDE.md`'s perception and rooms bullets name
  the plate.

### 2.3 Out of scope

- Cache hints in braille, and word plates.
- Audio-tap or vibration braille.
- Keypad riddles (A1).
- A jam on ordinary stations (A2).
- The realistic-look pass, the automated playtest, and the other parked backlog items.

### 2.4 Assumptions

- **FR3's cause is a suspicion** (spec §3): `Lobby.tsx` keeps `early.current.view` from the previous
  room, and the re-mounted `Game` reads `tick > 0` as already started. Task 67's failing test
  decides it. If the test shows another cause, fix that cause; the requirement stands.
- **FR2's likely cause:** `Game.tsx`'s input loop returns early once cleared (`if (!online ||
  rt.view?.status === "cleared") return;`), so `rt.walking` keeps `moving: true`. Task 68's test
  decides it.
- Bots get no new information: they read plates from their own view (ADR 0018).

## 3. Shared context and conventions

- **Stack:** Astro, Preact and a Node server (`server.ts`); game code in TypeScript. vitest 5 has two
  projects:
  - `unit`: `src/**/*.test.ts`, no server
  - `spec`: `spec/**/*.test.ts`, against a live app, browser files capped at `maxWorkers: 3`
- **Commands:**
  - Unit tests: `pnpm test:unit`; one file with `pnpm vitest run <path>`.
  - Room linter: `pnpm lint:rooms`. Bot rotations: `pnpm vitest run spec/rooms.test.ts` (needs no
    server: it calls `solveRoom`).
  - Full check (the check-server recipe from phase 14):
    1. `pnpm build`
    2. `pkill -f "node server.ts"`
    3. `PORT=8181 pnpm start:check`, and confirm its log has no `EADDRINUSE`
    4. `APP_URL=http://localhost:8181 pnpm check`

    Do not kill an `astro dev` on :8080.
  - Format only with `pnpm format`.
- **Layering** (`src/layering.test.ts`): `src/game/` is pure. The client reaches net only through
  `src/net/protocol.ts`, and pages never import `src/net/`.
- **Tests:**
  - Unit tests sit beside the code. Promises to users go in `spec/<area>.test.ts`, browser checks in
    `spec/layout/<area>.test.ts`.
  - A browser spec file must stay under 1000 lines (`spec/suite-size.test.ts`).
    `spec/layout/reveal.test.ts` is 628 lines, so new braille browser checks go in a **new**
    `spec/layout/braille.test.ts`.
- **Test discipline:**
  - Every new test is shown red by breaking the code it guards, then restored. The commit message
    says what was broken.
  - A bug fix starts with a failing test.
  - Never retry to get green, and never weaken a test.
  - Flaky-test rules: CLAUDE.md "Flaky tests"; use `settledHash`, never one `canvasHash` frame.
- **Rooms:**
  - Edits append new letters **after** existing ones of their kind, in reading order.
  - After every room edit, run `pnpm lint:rooms` and `spec/rooms.test.ts`.
  - From phase 01 on, the id snapshot (Task 69) must show only the intended change.
- **Visual changes:** read `DESIGN.md` first, and update it in the same commit.
  `spec/design.test.ts` fails on names that don't exist.
- **Admin:**
  - ADR 0023 stays `proposed` until the user accepts it.
  - The backlog lines this work closes move to "Decided" in Task 82.

## 4. Shared design

### 4.1 The plate (`o`), as every phase sees it

**Room format.** `o` is a new tile letter in `src/game/rooms/format.ts`:
- It joins the `Tile` union and `TILES`.
- `NUMBERED` maps it to `o: ["braille", "o"]`, so ids are `o1`, `o2`… in reading order.
- `RoomObject["kind"]` gains `"braille"`.
- Its `params`, whitelisted in `PARAMS`:

```json
"o1": {"for": "Q2", "part": 0}
```

`for` is a station id in the same room. `part` says which piece of that station's answer the plate
carries, and what it means depends on the station type:

| Station type | `part` means | Number shown |
| --- | --- | --- |
| dial | the digit index | that digit, 0 to 9 |
| keypad | the key index | the key + 1, 1 to 9: what a person presses (keys are numbered 1 to 9) |
| radio | always 0 | the real band (setting) |
| wires | always 0 | the cut position + 1 |

The tile is floor, walkable, and the plate is drawn on it. `visibleTo` defaults to
`["deaf","mute"]` (the sighted see the object, never its content).

**Sim** (`src/game/sim/braille.ts`, a new pure module; created by Task 72):

```ts
// The number a plate carries this attempt, from its station's answer (overview §4.1 table).
export function plateNumber(world: World, plateId: string): number | undefined;
// Grade-1 braille for a non-negative integer: the number sign (dots 3 4 5 6), then a to j for each digit.
// Each cell is its raised dots, ascending, from 1..6.
export function brailleCells(n: number): number[][];
// The fixed key the card shows: digits 1..9, 0 and the number sign, as cells.
export const BRAILLE_KEY: readonly { label: string; dots: number[] }[];
```

**World state** (`src/game/sim/world.ts`, Task 72):
- `World` gains `reading: Partial<Record<Seat, string>>` (seat → plate id it has open).
- It is set on Act at the plate, and cleared when that seat's tile is no longer the plate's tile or
  beside it (Chebyshev distance ≤ 1).
- Only a Can't-see seat can open one. The sim does not know roles, so the check is in
  `perception.ts`.
- **Decision:** the sim records any seat's read, and `viewFor` sends cells only when `role ===
  "blind"`. The `tap` sound fires only for a read by a seat whose role is blind. To get that, `step`
  receives the seat's role through a new optional `World.roles?: [Role, Role, Role]`, set by
  `src/net/game.ts`, `attract.ts`, `solve.ts` and `mockup.ts` when they create the world.
- Act at a plate by a non-blind seat does nothing, and the Act hint is absent.

**Event and sound:**
- New `WorldEvent` `{ kind: "braille"; id: string; seat: Seat; at: Vec }`.
- New `SoundCue["kind"]` `"tap"` (`RANGE.tap = 4`), from the event, under ordinary sound reach.
- Parity row `tap` in `parity.test.ts`. The sighted see `EntityView.flash = "ok"` on the plate
  entity for the tick, which the client draws as a pulse.

**View** (`src/game/perception.ts`, `RoleView`, Task 72):

```ts
  braille?: { id: string; cells: number[][]; teach?: true }; // Can't see's own open plate: its cells, never the number
```

- Set only when `role === "blind"` and `world.reading[seat]` is set.
- `teach` is set when the plate's `params.teach === true` (room 4's plate).
- The plate entity, for the sighted: `{ kind: "braille", id, pos }`, with no text.

**Act hint:** in `actHint`, for role `blind` on or beside a plate, `"Read the plate"`.

### 4.2 The jam

- `World` gains `jammedUntil: Record<string, number>` (station id → tick).
- In `src/game/sim/stations.ts` `act(...)`, `fail()` for a teaching station or cache sets
  `world.jammedUntil[o.id] = world.tick + JAM_TICKS`, where
  `export const JAM_TICKS = Math.round(3000 / 50); // 3 s at TICK_MS = 50`.
- `act` returns `false` without effect while `world.tick < (world.jammedUntil[o.id] ?? 0)`.
- New event `{ kind: "station"; result: "jam"; … }`: `result` gains `"jam"`.
- New sound `"jam"` with a parity row.
- `EntityView.station` gains `jammed?: true`. A `detectFx`/render look draws it (Task 71).

### 4.3 Sounds added by this plan

| Kind | Task | Reach | Picture for the sighted |
| --- | --- | --- | --- |
| `jam` | 71 | `RANGE.jam = 6` | `station.jammed` |
| `tap` | 72 | `RANGE.tap = 4` | plate `flash: "ok"` |
| `rest` | 76 | as `clue` (ordinary clue reach) | none: a `clue`-like chime is the documented "no picture" exception, so it is added to that exception with a reason |

### 4.4 Bot contract for plates (Task 74, used by Tasks 77 and 78)

- New `JobTarget` `{ kind: "read"; plate: string; tile: Vec }` in `src/game/bots/jobs.ts`. It is
  parsed from a hint `{"beat":n,"read":"o1"}` and claimed by the `blind` seat only.
- The guide steers Can't see to `tile` (`guideBlind`/`goalFor`).
- `thinkBlind` presses Act once on the tick its view has the plate under it (the act hint "Read the
  plate"). Once `view.braille` arrives, it decodes the cells with
  `export function readBraille(cells: number[][]): number | null` (`decode.ts`) and pushes the
  digits onto `m.toTell`, the same queue the earpiece uses. Those digits go out as `text`, one
  digit per message.
- The receiving seat's decoder takes the number from `b.numbers` (the digits it was texted):
  - keypad: the `part` slot
  - dial: the `part` digit
  - radio: the band to turn to
  - wires: `cut = n - 1`

## 5. Phases

| Phase | File | Tasks | Needs | Ends with | Done |
| --- | --- | --- | --- | --- | --- |
| 01 | `…-01-bugs.md` | 67–70 | — | FR3, FR2, FR1 fixed test-first; room-id snapshot green. Task 70 (feed) has a human review | [x] (review queued) |
| 02 | `…-02-crew-and-jam.md` | 71, 81 | 01 | Played icons on the role screen (human review); teaching and cache stations jam for 3 s | [x] (review queued) |
| 03 | `…-03-braille-room4.md` | 72–75 | 01, 02 (Task 71's `jammedUntil` and `jam` exist; Task 75 extends Task 71's DESIGN.md edit) | Room 4 needs Can't see's plate; bots clear room 4 in every rotation; braille card human-reviewed | [ ] |
| 04 | `…-04-radio-and-plates.md` | 76–78 | 03 | Plates in rooms 5 to 9; radio decoys; room 6 marker; all rooms pass the rotation spec | [ ] |
| 05 | `…-05-riddles-wrap.md` | 79, 80, 82 | 04 (room 9's plate is in place) | Riddle plaques (human review); docs, backlog, ADR status request; full `pnpm check` green | [ ] |

(Task 81 was added to phase 02 so the crew row ships beside the jam. The numbers are global and not
in build order.)

## 6. Feature-level Definition of Done

- [ ] Every phase in §5 is ticked, every task is complete, and its tests pass.
- [ ] `pnpm test:unit` passes.
- [ ] The full check passes via the recipe in §3.
- [ ] `pnpm lint:rooms` passes, and `spec/rooms.test.ts` passes for every room in every rotation.
- [ ] Manually verified on a local build, 3 tabs:
  - the spec's demo script steps 1 to 8 (Phase 4 summary, reproduced in each phase where it
    applies)
  - room 4's plate read by Can't see, relayed, and the safe opened
  - room 6 cleared through a decoy and the real band
- [ ] Every requirement in §2 is covered (see §7).
- [ ] Every `Human review:` task (70, 75, 79, 81) is explicitly accepted by the user.
- [ ] ADR 0023's acceptance has been asked for; the status changes only on the user's word.
- [ ] Nothing remains in §8.

## 7. Requirements coverage check

| Requirement | Covered by |
| --- | --- |
| FR1 | Task 70 |
| FR2 | Task 68 |
| FR3 | Task 67 |
| FR4 | Task 81 |
| FR5 | Tasks 73 (lint), 74 (room 4), 77 (rooms 5, 7, 8, 9), 78 (room 6) |
| FR6 | Task 72 (view), Task 75 (card) |
| FR7 | Task 72 (sim and Act), Task 75 (card) |
| FR8 | Task 72 (`tap`, parity row), Task 75 (pulse drawn) |
| FR9 | Task 73 (lint), Task 74 (bots and room 4), Tasks 77 and 78 (rooms 5 to 9) |
| FR10 | Task 78 |
| FR11 | Task 79 |
| FR12 | Task 79 |
| FR13 | Task 71 |
| FR14 | Task 76 |
| FR15 | Task 69 |
| NFR docs (DESIGN.md, CLAUDE.md), logging, backlog | Tasks 71, 75, 81 (DESIGN.md); Task 72 (logging); Task 80 (CLAUDE.md, process log); Task 82 (backlog, final check) |

## 8. Risks / open questions

None open. Accepted risks, each with a guard:
- **Room budgets.** Bots take longer in rooms with plates and decoys. Guard: `spec/rooms.test.ts`
  asserts `ticks/20 <= budgetS`. Raising a room's `budgetS` needs the user's go-ahead, recorded in
  that phase's Corrections log.
- **Rewiring a room.** Moving a digit onto a plate can make a room unsolvable in some rotation.
  Guard: the rotation spec, plus the Task 69 snapshot.
