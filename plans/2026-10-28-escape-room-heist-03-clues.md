# Escape-room heist: Phase 03, clues a person can follow

- **Date:** 2026-10-28
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-10-28 (clues spec)
- **Part of:** `plans/2026-10-28-escape-room-heist-00-overview.md`. Read it first, especially
  §3 (commands) and §4.5 (the clue, motif, teaching and bot-message shapes this phase creates).
- **Depends on phases:** 02.

## 1. Summary

Makes every station's clue reach a person and be decodable, makes linked stations share a drawn
motif, adds teaching stations, adds a linter rule that fails a room whose clue cannot reach a
person, and replaces the bots' sim read (`Hidden`) with a belief built from each bot's own view
and messages. Ends with: the draft fixture's faults each failing the new linter rule, a corrected
draft passing it, and perception-only bots still clearing every shipped room and fixture room
(none of which has a station). The stations draft leaves `spec/rooms.test.ts`'s bot sweep until
the decoders exist (phase 10 puts it back); the linter still checks it.

## 2. Requirements (this phase)

### 2.1 Functional

Clues FR1, FR2 (sim and view side, plus drawing of the new fields), FR3, FR4, FR5 (core), FR7,
FR8; P3.

### 2.2 Non-functional

Perception: every new view field gated in `viewFor` against the role tables; never colour alone
(the target card is lit vs hollow; motifs are shapes).

### 2.3 Out of scope for this phase

The per-type station decoders (phases 05 to 10, one per room, clues FR6); the rooms themselves.

### 2.4 Assumptions

See overview §2.4. A shipped room (phase 04's rooms 1 to 3) has no stations, so perception-only
bots need no decoder to clear it.

## 3. Existing code context (verified 2026-10-28)

- `src/game/rooms/format.ts`: letters in `TILES`; `NUMBERED: Record<string, [RoomObject["kind"],
  string]>` maps a letter to its kind and id prefix (`S: ["sign","S"]`, `Q: ["station","Q"]`, ...);
  `PARAMS` lists kinds that keep their metadata as `params`; `RoomObject { id; kind; tiles;
  visibleTo; audibleTo; opensWhen?; mode?; params? }`.
- `src/game/sim/stations.ts`: `drawAnswer(type, params, r)`, `drawStations(world)` (fresh answers
  for unsolved stations from `rng(seed * 1000 + attempt)`), `updateStations(world, acts, used =
  new Set()): Wrong | null` (exported; calls the private `act`, whose `fail()` sets
  `wrong.w ??= { id, seat }`, which step turns into a send-back), `stationShows(world, s)`,
  `plaqueText(world, id)` (the wires' rule text for a sign named by a wires station's `plaque`),
  `displayTiles(o)`, `stationParts(o)` (on the phase 02 branch), `SYMBOLS = 6`.
- `src/game/perception.ts`: `entitiesFor` already puts `text` on a sign from `plaqueText`;
  `EntityView` (with `station.parts`, `station.furniture` from phase 02); `viewFor(world, seat,
  role, full)`.
- `src/game/rooms/lint.ts`: `lintRoom(room): LintIssue[]`, `lintPresence` (FR1 balance, via
  `probe` and `worldAt` from `mockup.ts`), `lintSearch` (radio, sync), `lintOpenAtOnce`.
- `src/game/bots/brain.ts`: `Hidden { stations; gear; holding }`, `hiddenOf(world)`, `think(room,
  view, inbox, memory, now, hidden = null)`, `stationStep` reads `m.hidden.stations[id].answer`;
  `workGoal` and the `sync` branch read `m.hidden` too. `src/game/bots/crew.ts:47` passes
  `hiddenOf(world)` when a room has stations or gear. `src/game/bots/jobs.ts`: `Known { solved?;
  gear?; holding?; ... }` (the first three filled from `Hidden`).
- `src/client/render/stations.ts` (phase 02): `codeSwatch`, `turnPad`, `symbolGlyph(ctx, n, cx,
  cy, r)`, `namePlate`, `drawStationStanding`; `src/client/render/blocks.ts` draws signs
  (`kind === "sign"`), not their `text`.
- `src/game/channels.ts`: `STAMPS` (marks) include `"x"`; `Outgoing` text and mark shapes.
- Tests: unit beside the code; `spec/rooms.test.ts` (`clearEveryRotation`) for bots.

### Interfaces from earlier phases (exact)

```ts
// src/game/perception.ts (phases 01, 02)
station?: { type: StationType; shows: number[]; solved: boolean;
            parts: { key: StationPartKey; at: Vec[] }[]; furniture?: true };
text?: string;
// src/game/sim/stations.ts (phase 02)
export function stationParts(o: RoomObject): { key: StationPartKey; at: Vec[] }[];
export function symbolGlyph(ctx: CanvasRenderingContext2D, n: number, cx: number, cy: number, r: number): void; // client
// src/game/bots/brain.ts (phase 01)
export function think(room: Room, view: RoleView, inbox: ChannelMessage[], memory: BotMemory,
  now: number, hidden: Hidden | null = null): BotTurn;
```

## 4. Approach

**Clue fields, per overview §4.5.** A station's `motif` and the fed station's `slot` make links
findable without naming them. A `yields` station, once solved, fixes the fed station's answer at
`slot.at` to its digit on every re-draw (so the digit stays true); a vault's `answer[i]` is the
`reveal` symbol of `from[i]`, drawn when that wing station is solved. The target card (`t`) shows
the switches' `answer` as `card`. A `teach` station: `fail()` re-draws that station alone (no
`wrong.w`, so no dye and no send-back), and a teaching safe shows `shows[1] = 1` at the right
number.

**The clue-path linter (clues FR4)** checks, per station type, that its clue reaches some human
role from some tile: the plaque's `text` is in a sighted view; the target card is in a sighted
view; the code's notes reach a hearer (as today); a radio's pip reaches a viewer as light or
sound; a vault's `from` stations all exist and each has a `reveal`; every `yields`/`slot` pair
names stations that exist and share a `motif`.

**Perception-only bots (clues FR5, core).** `Hidden` goes. A bot's `Known` gains `stations:
Record<string, StationBelief>`, filled from what it sees (`station.shows`, `solved`, `text`,
`card`, `reveal`) and hears, and from teammates' marks (an `x` on a part's tile: "press this")
and text (`/^\d$/`). `stationStep` asks the station type's `Decoder` for the next press from the
belief; with no decoder yet for a type, the bot does not work that station (phases 05 to 10 add
them). Gear and holding are read from the view (`item`, `heldBy`, `holding` on players; `gear`
entities), not the sim.

## 5. Task breakdown

### Task 11: Clue paths, motifs and teaching stations in the sim, view and drawing

- **Description:** Overview §4.5's room-format keys and view fields, wired end to end: parse
  `teach`, `motif`, `slot`, `t` (card), `Y` (order); fix fed answers (`yields` → `slot`; vault
  `from` → `answer`); `reveal` on a solved wing station; teaching `fail()`; and draw them on the
  client: sign and plaque `text` as readable lines on a brass plaque (wrapped, outlined, never below
  11 px), the target card as a grid of lit (rays) and hollow lamps, the motif with `symbolGlyph`
  on both ends, the teaching safe's lamp, a solved wing's symbol plate.
- **Files touched:** `src/game/rooms/format.ts` (+ test), `src/game/sim/stations.ts` (+ test),
  `src/game/perception.ts` (+ test, + `parity.test.ts` rows if a view change needs one),
  `src/client/render/stations.ts`, `src/client/render/blocks.ts` (sign text),
  `src/client/render.test.ts`, `DESIGN.md` §4.8.
- **Tests first (red):** a solved radio fixes keypad `answer[slot.at]` to its digit and a re-draw
  keeps it; a vault's answer equals its wings' reveals; a wrong press at a `teach` station sets no
  `wrong` and re-draws only it; the sighted see `card`, Can't see is sent none of `card`, `motif`,
  `reveal`, `text`; a teaching safe shows `shows[1] === 1` only at the right number; `render.test`
  fills a sign's `text` with `fillText` and draws a card's lit and hollow lamps distinctly.
- **Implementation (green):** as described.
- **Acceptance criteria:** tests green; `pnpm lint:rooms` and `spec/rooms.test.ts` still green.
- **Depends on:** Tasks 2, 3, 8.

### Task 12: The clue-path linter rule

- **Description:** `lintClues(room, issue)` in `src/game/rooms/lint.ts`, called by `lintRoom`,
  per this file's §4.
- **Files touched:** `src/game/rooms/lint.ts` (+ `lint.test.ts`); `spec/fixtures/drafts/
  00-stations-draft.room` corrected (plaque text, a target card for Q8, keypad clue path, vault
  wings with reveals, motifs on Q3/Q5); `spec/fixtures/drafts/01-clue-faults.room` new, a copy
  carrying each fault once, kept out of `spec/rooms.test.ts` by its `lint.test.ts`-only use.
- **Tests first (red):** each fault in `01-clue-faults` gives exactly its message: "Q8 (switches)
  has no target card", "Q4 (wires): its plaque S1 has no text any role can read", "Q2 (vault):
  Q6 reveals no symbol", "Q3 yields to Q5 but they share no motif"; the corrected draft gives
  none.
- **Implementation (green):** as described; reuse `probe`/`worldAt` for "reaches a human".
- **Acceptance criteria:** tests green; the shipped rooms pass.
- **Depends on:** Task 11.

### Task 13: Perception-only bot core

- **Description:** Remove `Hidden`; bots build `Known.stations` (`StationBelief`), gear and
  holding from their own view and inbox; `DECODERS` registry (empty here) and `stationStep` via
  it; bots send a spatial answer as an `x` mark on the part's tile and a number as text `/^\d$/`,
  and read only those forms (P3).
- **Files touched:** `src/game/bots/brain.ts` (+ test), `src/game/bots/jobs.ts` (`Known`),
  new `src/game/bots/decode.ts` (+ test: `DECODERS`, `beliefFrom(view, inbox, o, prior)`),
  `src/game/bots/crew.ts` (no `hiddenOf`); `spec/rooms.test.ts` (the "three bots clear every
  draft room" sweep drops `00-stations-draft` with a comment naming phase 10, Task 27, which
  restores it: a deliberate, dated scope change, not a weakened test); `CLAUDE.md` Rooms bullet
  ("bots solve only from what they perceive", ADR 0018).
- **Tests first (red):** `brain.test.ts`: `think` has no `hidden` parameter and a bot in a room
  with a station never reads `world.stations` (asserted by a world whose `stations` getter
  throws); a sighted bot that sees a teammate's `x` mark on a wire tile puts that tile in its
  belief; a bot reads `"5"` from text and ignores `"five"`; `decode.test.ts`: `beliefFrom` keeps
  `solved` once seen.
- **Implementation (green):** as described.
- **Acceptance criteria:** tests green; `spec/rooms.test.ts` green for every shipped room;
  `grep -n "Hidden\|hiddenOf" src` is empty.
- **Depends on:** Task 11.

## 6. Phase Definition of Done

- [ ] Every task in §5 is complete and its tests pass
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start` then `pnpm check` passes
- [ ] The draft's four faults each fail the linter; the corrected draft passes
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| Clues FR1, FR2 (sim, view, drawing) | Task 11 |
| Clues FR3 (motifs) | Task 11 |
| Clues FR4 (linter) | Task 12 |
| Clues FR5 (core), P3 | Task 13 |
| Clues FR7, FR8 (teaching) | Task 11 |

## 8. Risks / open questions

None.

## 9. Corrections log

<!-- one line per user redirect during execution -->
