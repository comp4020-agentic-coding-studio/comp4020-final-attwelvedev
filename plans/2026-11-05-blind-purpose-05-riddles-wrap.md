# Braille, riddles and fixes — Phase 05: riddles and the wrap-up

- **Date:** 2026-11-05
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-05
- **Part of:** `plans/2026-11-05-blind-purpose-00-overview.md`. Read it first: §2 (FR11, FR12), §3,
  §6.
- **Depends on phases:** 04 (room 7's Q3 ink is plate-carried; room 9's wire plaque stays).

## 1. Summary

From room 4 on, wire plaques read as riddles, seeded from a small pool per rule, and the bots still
read them. The docs, backlog and process log are brought up to date, and the full check is green.

## 2. Requirements (this phase)

### 2.1 Functional

FR11, FR12.

### 2.2 Non-functional

- `CLAUDE.md`'s perception and rooms bullets name the plate, the jam and the riddles.
- `DESIGN.md` §7 Copy covers the riddle voice.

### 2.3 Out of scope for this phase

Keypad riddles (spec A1).

### 2.4 Assumptions

See overview §2.4.

## 3. Existing code context (verified 2026-11-05)

- **`src/game/sim/stations.ts:21–48`:**
  - `export const WIRE_RULES: { text: string; cut: (c: number[]) => number | null }[]`, six rules in
    order:
    1. no red → second
    2. more than one red → last red
    3. last white → last
    4. exactly one blue → the blue
    5. more than one yellow → first yellow
    6. exactly one red → first
  - `ruleFor(colours): { rule; cut }`
- **`plaqueText(world, id)` (203–209):**
  - `if (o.params?.numbered === true) return String((s.answer[0] as number) + 1);`
  - `return WIRE_RULES[s.answer[1] as number]?.text;`
  - After Task 77 it returns `undefined` for a plate-carried wire.
  - Used at `perception.ts:415` (signs) and `:1247` (ink), into `EntityView.text`.
- **Bot** (`src/game/bots/decode.ts:153–163`):

  ```ts
  const plaque = view.entities.find((e) => e.id === o.params?.plaque && e.text);
  const read = plaque ? WIRE_RULES.findIndex((r) => r.text === plaque.text) : -1;
  if (read >= 0) b.rule = read;
  const digit = plaque?.text && /^\d$/.test(plaque.text) ? Number(plaque.text) - 1 : -1;
  ```

- **Linter:** `lintClues` (`src/game/rooms/lint.ts:787`) checks that a plaque has text some role can
  read.
- **Wire stations by room:**
  - Room 5: `Q1` (teach, sign `S2`) and `Q2` (sign `S1`).
  - Room 7: `Q1` (teach, ink `u2`), `Q3` (plate-carried after Task 77, so no ink text), and `Q7`
    (cache, ink `u1`).
  - Room 9: `Q2` (sign `S1`).
  - Rooms 1 to 3 have no wire stations.
  - **Riddled after this phase:** room 5 Q2, room 7 Q7 (numbered ink), room 9 Q2.
- **The world's rng:** `rng(seed)` (`src/game/sim/rng.ts`); `drawStations` uses
  `rng(world.seed * 1000 + world.attempt)`.

### Interfaces from earlier phases (exact)

- `PLATE_ROOMS` in `src/game/rooms/lint.ts` = all six room ids (Task 77).
- Room 7 `Q3`'s `plaqueText` is `undefined` (Task 77).
- `JAM_TICKS`, `jam` (Task 71); `tap`, `rest` sounds (Tasks 72, 76); `RoleView.braille` (Task 72).
  Named in the docs task.

## 4. Approach

- **Rule riddles.** `WIRE_RULES` entries gain `riddles: readonly string[]` (2 or 3 each) beside
  `text` and `cut`. Examples of the voice wanted, for the implementer to finish:
  - rule 0, no red: "Where no blood runs, the second falls."
  - rule 3, exactly one blue: "One sky among them: sever it."
- **Numbered ink.** `NUMBER_RIDDLES: readonly ((n: number) => string)[]` — phrasings that resolve to
  a 1-based wire number. For example `(n) => \`${n - 1} wires stay before the cut.\``. Each must state
  the number unambiguously and without arithmetic beyond ±1.
- **Choosing the wording.** `plaqueWording(world, o, s): string`:
  - teaching station, or a room whose id starts `01`, `02` or `03` (`world.room.id`; the world has no room index) → plain `text` / digit
  - otherwise pick with `rng(world.seed * 1000 + world.attempt + hash(o.id))` from the pool
  - `plaqueText` returns it
- **Bots.** `export function ruleOfText(text: string): number | null` and
  `export function numberOfText(text: string): number | null` in `src/game/sim/stations.ts`, which
  look up the pools (an exact match: bots know the table as a person learns it). `decode.ts` uses
  them in place of `findIndex`/`/^\d$/`.

## 5. Task breakdown

### Task 79: Wire plaques as riddles (FR11, FR12) (done, review queued)

- **Description:**
  - from room 4, non-teaching wire plaques show a seeded riddle that resolves to the same rule or
    number
  - teaching plaques and rooms 1 to 3 stay plain
  - bots read riddles
- **Files touched:**
  - `src/game/sim/stations.ts` (+ test)
  - `src/game/bots/decode.ts` (+ test)
  - `src/game/rooms/lint.ts` (optional: a pool-integrity check lives in the unit test instead)
- **Tests first (red):**
  1. `stations.test.ts`, "every riddle in a rule's pool resolves to that rule": for each rule `i`
     and each riddle `r`, `ruleOfText(r) === i`; no riddle text appears in two pools; every pool has
     2 or 3 entries.
  2. "every number riddle names its number": for `n` in 1 to 4 and each phrasing,
     `numberOfText(f(n)) === n`.
  3. "a teaching plaque stays plain": a teach wires station's `plaqueText` equals
     `WIRE_RULES[rule].text`.
  4. "a non-teaching plaque in a room whose id is `04` or later is a riddle, the same one on each read within an attempt,
     and seeded": two worlds with different seeds can differ, and the same seed gives the same
     text.
  5. `decode.test.ts`: the wire belief sets `b.rule` from a riddle and `cut` from a number riddle.
- **Implementation (green):** per this file's §4.
- **Acceptance criteria:**
  - red shown by returning plain text for all plaques
  - `spec/rooms.test.ts` green for rooms 5, 7, 9 in all rotations
  - `pnpm lint:rooms` green
- **Human review:** read the full riddle table in the diff of `stations.ts`. Each riddle is
  answerable from the wires in front of you, is in the game's voice (DESIGN.md §7 Copy), and is not
  a plain instruction with words swapped. Pass = the user accepts the wording.
- **Depends on:** none in this phase.

### Task 80: Docs and process log (done)

- **Description:** bring CLAUDE.md, DESIGN.md and the process log up to date.
- **Files touched:** `CLAUDE.md`, `DESIGN.md`, `PROCESS_LOG.md`, and the spec's §6/§7 if anything
  changed.
- **Changes:**
  - **CLAUDE.md, perception bullet:** a braille plate's cells are an own-seat view field for Can't
    see only; `tap`, `jam` and `rest` have parity rows; `rest` joins the no-picture exceptions.
  - **CLAUDE.md, rooms bullet:** rooms 4 to 9 have exactly one `o` plate (`PLATE_ROOMS`); its carried
    part is given nowhere else; it never names a teaching station or cache; run the id snapshot.
  - **DESIGN.md §7:** the riddle voice.
  - **PROCESS_LOG.md:** the plan-time amendments A1 to A4 (the user's rulings after the
    investigation), and each correction from the phases' logs, in its header format.
- **Tests first:**
  - `spec/design.test.ts` and `spec/readme.test.ts` stay green
  - `pnpm check:evidence` if `PROCESS.md` is touched (it should not be: it is rewritten only at a
    crit)
- **Acceptance criteria:** the docs name only things that exist, which `spec/design.test.ts`
  checks.
- **Depends on:** Task 79.

### Task 82: Backlog, ADR and final check

- **Description:**
  - Move these backlog lines to "Decided" with a pointer to this plan:
    - 2026-11-01 riddles
    - 2026-11-01 radio
    - 2026-11-02 room 6 gap
    - 2026-11-03 brute force
    - 2026-11-03 room ids
  - Add a parked line for cache hints in braille (spec §2.3).
  - Run the full check.
  - Ask the user to accept ADR 0023. Change its status only on their word.
- **Files touched:** `specs/backlog.md`, `doc/adr/0023-…md` (status only, after the user accepts).
- **Acceptance criteria:**
  - the full check is green via the overview §3 recipe
  - the backlog edits are made
  - overview §6 is fully ticked
- **Depends on:** Task 80.

## 6. Phase Definition of Done

- [ ] Tasks 79, 80 and 82 complete.
- [ ] `pnpm test:unit` passes.
- [ ] `pnpm lint:rooms` passes, and `spec/rooms.test.ts` passes.
- [ ] The full check passes (overview §3 recipe).
- [ ] The user accepted Task 79's wording.
- [ ] Tick phase 05 in overview §5, and the overview §6 Definition of Done, then commit.

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR11 | Task 79 |
| FR12 | Task 79 |
| Docs, backlog | Tasks 80, 82 |

## 8. Risks / open questions

None.

## Corrections log

(empty)
