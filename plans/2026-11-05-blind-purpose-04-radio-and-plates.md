# Braille, riddles and fixes — Phase 04: radio decoys, the rest marker, plates in rooms 5 to 9

- **Date:** 2026-11-05
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-05
- **Part of:** `plans/2026-11-05-blind-purpose-00-overview.md`. Read it first: §2 (FR5, FR9, FR10,
  FR14), §4.1, §4.3, §4.4, §3.
- **Depends on phases:** 03.

## 1. Summary

Every room 4 to 9 has its plate:

- a keypad's tune plays a quiet marker in any rest, whether the slot is fed by a radio or held by a
  plate
- the radio gets two decoy bands
- rooms 5 to 9 are rewired

All rooms pass the rotation spec, and `PLATE_ROOMS` lists all six.

## 2. Requirements (this phase)

### 2.1 Functional

- FR5 (rooms 5 to 9)
- FR9 (bots, in rooms 5 to 9)
- FR10
- FR14

### 2.2 Non-functional

- The `rest` sound has a parity row and joins the `clue` chime's documented "no picture" exception,
  with a reason.
- The id snapshot diffs show only added plates.

### 2.3 Out of scope for this phase

Riddles (phase 05).

### 2.4 Assumptions

See overview §2.4.

**Decided here** (a consequence of FR5, consistent with FR14): a keypad digit held by a plate is a
rest in its tune, exactly like a radio-fed slot, so the marker plays there too. Without it, the
plate's gap would be the same too-subtle silence the room-6 backlog item complained about.

## 3. Existing code context (verified 2026-11-05)

- **`src/game/sim/chimes.ts`:**
  - `tuneGroups(code: readonly number[], rest: number | null = null): { groups: ChimeGroup[]; period: number }`
  - `ChimeGroup { at; chimes; note }`
  - `groupStartingOn(tick, tune)`
  - constants `CHIME_TICKS = 4`, `GROUP_GAP_TICKS = 12`, `TUNE_PAUSE_TICKS = 40`
  - a rest adds `GROUP_GAP_TICKS` of silence
- **`src/game/sim/stations.ts`:**
  - `noteOf(world, station)` reads `params.slot.at` as the rest
  - `tuneNote(world, id)`
  - radio `drawAnswer`: `return [1 + int(num(params.range, 10) - 1), 1 + int(3)];`
  - radio act: `if (s.type === "radio" && value === s.answer[0]) solve();`
  - `stationShows` radio: `const pip = s.solved && world.tick % PIP_TICKS === 0; return pip ? [s.input[0] ?? 0, s.answer[1] as number] : [s.input[0] ?? 0];`
  - `fixFeeds`: `s.answer[slot.at] = (from.answer[1] as number) - 1;`
  - `export const PIP_TICKS = 40;`
- **`src/game/sim/step.ts` `updateClues` (~222):** pushes `{ kind: "clue", id, n: note + 1, at }` on a
  group start.
- **`src/game/perception.ts` `stationAmbience` (~740):**

  ```ts
  if (s?.type === "radio") {
    const c = cue(world, s.solved ? "tone" : "static", at, me); …
    const pip = s.solved && world.tick % PIP_TICKS === 0 ? cue(world, "pip", at, me) : null;
    if (pip) out.push({ ...pip, n: s.answer[1] });
  }
  ```

  The earpiece goes through `tuneNote` (760).
- **Client chimes:** `src/client/chimeSound.ts`, with
  `chimePlan(kind: ChimeKind, n: number | undefined): PlannedChime[]` and
  `export type ChimeKind = "key" | "bellnote" | "earpiece" | "clue";`.
- **Bots** (`src/game/bots/decode.ts`):
  - `radio` decoder: `if (b.shows.length === 2) b.answer = [b.shows[1] as number];` and pip sounds
    set `b.answer = [s.n]`
  - `brain.ts` `stationStep` (~859) turns the right pad until tuned
  - keypad: `tuneOf(b.heard, now)`; `slotOf(o)` inserts a `null` at the slot
  - `b.answer[slot] = d - 1` from `b.fed ?? b.numbers.at(-1)`
  - `KEYPAD_LENGTH`
- **Rooms:**
  - Room 5: `Q3` keypad `"clue":"c2","length":3`.
  - Room 6:
    - `Q1` teach radio (range 6)
    - `Q3` radio `{"pads":[[22,1],[24,1]],"range":8,"yields":"Q4","motif":"moon"}`
    - `Q4` keypad, `"slot":{"from":"Q3","at":2}`, `length 4`, `clue c1`
    - `D1` opens on Q4
  - Room 7:
    - wires `Q1` (teach, ink `u2`)
    - `Q3` `{"wires":[[27,1],[28,1],[29,1],[30,1]],"plaque":"u3","numbered":true}`
    - `Q7` (cache, ink `u1`)
    - ink text comes from `plaqueText` → `String(answer[0] + 1)`
  - Room 8: `Q2` keypad `"clue":"g1"` (the earpiece), `length 3`, `practice v2`.
  - Room 9: `Q7` keypad `"clue":"c1"`, `length 3`, `reveal`, `motif leaf`.

### Interfaces from earlier phases (exact)

From Task 72:

```ts
export function plateNumber(world: World, plateId: string): number | undefined;
export function brailleCells(n: number): number[][];
export const BRAILLE_KEY: readonly { label: string; dots: number[] }[];
```

- `World.reading: Partial<Record<Seat, string>>`
- `World.roles?: [Role, Role, Role]`
- `RoleView.braille?: { id: string; cells: number[][]; teach?: true }`
- `SoundCue` kind `"tap"`
- `WorldEvent` `{ kind: "braille"; id: string; seat: Seat; at: Vec }`
- `RoomObject.kind` includes `"braille"`; tile `o`; params `{ for: string; part: number }`

From Tasks 73 and 74:
- `lintPlates(room): string[]` and `const PLATE_ROOMS` in `src/game/rooms/lint.ts`, currently
  `["04-the-safe"]`
- `export function readBraille(cells: number[][]): number | null` (`decode.ts`)
- `JobTarget` `{ kind: "read"; plate: string; tile: Vec }`, parsed from `{"beat":n,"read":"oN"}`
- the blind bot pushes the decoded digits to `m.toTell` (texted)

From Task 71:
- `World.jammedUntil`
- `JAM_TICKS`
- `jam` sound

## 4. Approach

- **Rests:**
  - `tuneGroups` gains a list of rests (`rests: readonly number[]`, keeping the single-number call
    working) and returns `rests: { at: number }[]`.
  - `noteOf`'s caller gathers rests from `params.slot.at` **and** any plate with `for === station.id`.
  - `updateClues` pushes `{ kind: "clue", id, rest: true, at }` at a rest's tick, which becomes the
    sound `rest`.
  - The earpiece path pushes an `earpiece` cue with `rest: true` instead (it is private to the
    holder already).
  - The client plays a rest as one low muted chime (`chimePlan` gains a `"rest"` kind: one note,
    an octave below the clue voice, at half level).
- **Decoys:**
  - A radio named by a plate draws `answer = [setting, digit, decoyA, digitA, decoyB, digitB]`,
    with three distinct settings in 1 to range-1 and decoy digits ≠ the real digit.
  - It is "tuned" (tone and pips) at any of the three settings; the pips carry that setting's digit.
  - `solved` is set only at the real setting. Decision: a decoy does not solve. The station shows
    tuned at a decoy but isn't solved. `fixFeeds` takes the real digit.
  - A new field `StationState.tuned?: boolean` drives the tone and pips (`stationShows` uses `tuned`
    in place of `solved`).
  - Turning off a decoy clears `tuned`.
  - The radio's `yields` keypad receives the digit only once solved, as today.
- **Bots, radio:**
  - With a plate, the blind bot texts the band.
  - The turner's radio decoder takes `b.numbers.at(-1)` as the target setting and turns toward it
    (the left or right pad, by shortest way), instead of until-tuned.
  - Without a plate, the behaviour is unchanged.

## 5. Task breakdown

### Task 76: A rest in a tune plays a quiet marker (FR14) — done

- **Description:** wherever a keypad's tune rests (a radio-fed slot, or a plate-held key), a single
  low muted chime plays at that rest. It is the `rest` sound.
- **Files touched:**
  - `src/game/sim/chimes.ts` (+ test)
  - `src/game/sim/stations.ts`
  - `src/game/sim/step.ts`
  - `src/game/perception.ts`
  - `src/game/parity.test.ts`
  - `src/client/chimeSound.ts` (+ test), `src/client/audio.ts`, `src/client/hud.ts` (caption
    "A gap in the tune")
  - `src/game/bots/decode.ts` (a `rest` must not be read as a note)
- **Tests first (red):**
  1. `chimes.test.ts`: `tuneGroups([2,0,4,1], [2]).rests` is `[{ at: <the tick the third group would
     start> }]`, and periods are unchanged from today for the same input.
  2. `parity.test.ts` row `rest` (exempt, with the reason "a chime with no picture, like `clue`").
  3. `decode.test.ts`: a keypad belief hearing a tune with rests still yields the code with `null`
     at the slot.
  4. `chimeSound.test.ts`: `chimePlan("rest", undefined)` is one chime, below the clue octave, at
     a lower level.
- **Implementation (green):** per this file's §4.
- **Acceptance criteria:**
  - red shown by removing the rest push
  - `spec/rooms.test.ts` green for room 6
  - `pnpm test:unit` green
- **Depends on:** none in this phase (Task 74's plate gathering is optional; rests from plates are
  added in Task 77).

### Task 78: Room 6's radio has decoys and a plate names the real band (FR5 room 6, FR10)  — done

- **Description:**
  - room 6 gains `o` `{"for":"Q3","part":0}`
  - Q3 gets two decoy bands
  - Can't see reads the band and texts it, and the turner turns to it
  - the decoys tone and pip wrong digits but never solve
- **Files touched:**
  - `src/game/sim/stations.ts` (+ test)
  - `src/game/sim/world.ts` (`StationState.tuned`)
  - `src/game/perception.ts`
  - `src/game/bots/decode.ts`, `brain.ts` (+ tests)
  - `rooms/06-lights-out.room`
  - `src/game/rooms/__ids__/06-lights-out.json`
  - `src/game/rooms/lint.ts` (`PLATE_ROOMS` += `"06-lights-out"`; the radio-pip check: a decoy is
    allowed to pip, the real band's setting is never shown as a number)
- **Tests first (red):**
  1. `stations.test.ts`:
     - a plate-named radio draws three distinct settings
     - turning to a decoy sets `tuned` and not `solved`, and its pips carry a wrong digit
     - turning to the real setting solves it
     - a radio with no plate is unchanged (one band)
  2. `brain.test.ts`: a turner told "5" turns toward setting 5 by the shorter way and stops there.
  3. `spec/rooms.test.ts` fails for room 6 after the room edit and before the bot change. Record
     this.
- **Implementation (green):** per this file's §4. Place the plate in Q3's beat by mockup, appended
  in reading order.
- **Acceptance criteria:**
  - room 6 is green in all rotations within `budgetS`
  - the id snapshot adds only the plate
  - `pnpm lint:rooms` green
- **Depends on:** Task 76 (the slot rest marker plays in room 6's keypad).

### Task 77: Plates in rooms 5, 7, 8 and 9 (FR5, FR9) — done

- **Description:**
  - room 5: `{"for":"Q3","part":<i>}`
  - room 7: `{"for":"Q3","part":0}` — the wire. Q3's ink `u3` no longer shows the number:
    `plaqueText` returns `undefined` for a wire station named by a plate, and `u3` keeps
    `{"text":""}`.
  - room 8: `{"for":"Q2","part":<i>}` — the earpiece tune rests there
  - room 9: `{"for":"Q7","part":<i>}`

  Pick each `<i>` so the rest is not the last note (it reads more clearly mid-tune): `<i> = 1`.
  Each keypad's tune rests at the plate's key, and the blind bot reads the plate and texts the digit.
- **Files touched:**
  - `rooms/05-the-gallery.room`, `07-night-shift.room`, `08-music-room.room`, `09-the-vault.room`,
    and their `__ids__` JSON
  - `src/game/sim/stations.ts` (rests from plates; `plaqueText` skips plate-carried wires)
  - `src/game/bots/decode.ts` (the keypad slot from `b.numbers` for a plate part; wires `cut` from a
    texted digit)
  - `src/game/bots/jobs.ts` (if the `read` job needs anything per type)
  - `src/game/rooms/lint.ts` (`PLATE_ROOMS` = all six)
- **Tests first (red):**
  1. `stations.test.ts`: a plate-named keypad's tune rests at `part`; a plate-named numbered wire's
     `plaqueText` is `undefined`.
  2. `decode.test.ts`:
     - the keypad answer takes the texted digit at the plate slot
     - the wires answer takes `cut = n - 1` from a text
  3. `lint.test.ts`: `PLATE_ROOMS` equals the six room ids (this guards that none is forgotten).
  4. After each room edit, `spec/rooms.test.ts` for that room is red before the decoder change,
     where the decoder is the blocker. Record per room.
- **Implementation (green):**
  - **Rooms.** One room at a time: edit, run the snapshot, `pnpm lint:rooms`, the rotation spec, then
    commit.
  - **Room 8's earpiece:** the earpiece holder is the blind bot by the hint list, and it also reads
    the plate. Check that the job order puts the read before the keypad.
  - **Room 7:** the cache ink `u1` (Q7) and teaching `u2` (Q1) are unchanged.
- **Acceptance criteria:**
  - every room 4 to 9 is green in all rotations within `budgetS`
  - `pnpm lint:rooms` green with all six in `PLATE_ROOMS`
  - each snapshot diff adds only its plate
- **Depends on:** Task 76 (rests). Independent of Task 78.

## 6. Phase Definition of Done

- [x] Tasks 76 to 78 complete, shown red then green.
- [x] `pnpm test:unit` passes.
- [x] `pnpm lint:rooms` passes, and `spec/rooms.test.ts` passes for every room.
- [x] The full check passes (overview §3 recipe).
- [x] (queued for morning) A manual three-tab run of room 6 on a local build: a decoy tones and pips, but the door stays
  shut until the real band.
- [x] Tick phase 04 in overview §5 and commit.

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR5 (rooms 5 to 9) | Tasks 77, 78 |
| FR9 (rooms 5 to 9) | Tasks 77, 78 |
| FR10 | Task 78 |
| FR14 | Task 76 |

## 8. Risks / open questions

None. If a room breaks its `budgetS`, ask the user before raising it and log the answer below.

## Corrections log

(empty)
