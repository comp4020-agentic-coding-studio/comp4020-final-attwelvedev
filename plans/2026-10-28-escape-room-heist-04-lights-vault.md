# Escape-room heist: Phase 04, rooms 3 and 4

- **Date:** 2026-10-28
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-10-28
- **Part of:** `plans/2026-10-28-escape-room-heist-00-overview.md`. Read it
  first, especially §3 and §4.1.
- **Depends on phases:** 03 (and its playtest findings).

## 1. Summary

Builds Lights Out (dark sections, radio, switches, sync lock, bell, lamp,
goggles, UV torch, lasers) and The Vault (split wings, hatches, music box,
earpiece, all gear, the meta-code), and removes the two old rooms. Ends with
the four-room heist complete apart from side jobs.

## 2. Requirements (this phase)

### 2.1 Functional

Spec FR26 (rooms 3 and 4), FR2 (design), FR3 (bots), FR13 (vault in a room),
FR14 (sync in a room), FR24–FR25 (one bell and one lamp in room 3).

### 2.2 Non-functional

Room size within Task 7's measured budget.

### 2.3 Out of scope for this phase

Side jobs, credits, comms map, leaderboard (phase 05).

### 2.4 Assumptions

See overview §2.4. Playtest 5's findings (Task 13) may have amended this file;
if so, the amendment is in §9.

## 3. Existing code context (verified 2026-10-28)

- After phase 03: `rooms/01-first-job.room`, `rooms/02-gallery.room`,
  `rooms/03-cameras-lasers.room` and `rooms/04-vault.room` (the old rooms,
  renamed by Task 12).
- Flips in room metadata (`src/game/rooms/format.ts`): `{"kind":"dark","zone":
  [x0,y0,x1,y1]}` and `{"kind":"alarm","trigger":"pN","durationS":n}` via
  `flipsOf(room): Flip[]`.
- Spawns `1 2 3` may be anywhere in the grid (`createWorld` reads `s1..s3`).
- Lint rules still apply: a laser or guard wholly in the dark is flagged
  (`src/game/rooms/lint.ts`, from overhaul FR13); exits reachable from every
  spawn treating doors as open.
- `src/game/rooms/solutions/*.json` and `scripts/solve-rooms.ts` (hand
  routes for old rooms; delete the old rooms' files with them).

### Interfaces from earlier phases (exact)

- Room format (overview §4.1) and station metadata (phase 01 §4's table),
  including `radio` (`pads`, `range`, `yields`), `switches` (`buttons`,
  `lamps`), `sync` (`keys`, `windowMs`), `bells` (`bells`, `tune`), `vault`
  (`sockets`, `from`).
- Door `opensWhen` may name station ids (Task 11).
- Bot hint jobs (Task 4): `station`, `take`, `give`, `sill`, `tow`, plus
  `goTo`, `push`, `all`, `prefer`.
- `lintRoom` with `lintPresence` (Task 5).

## 4. Approach

**Lights Out** (`rooms/03-lights-out.room`, hue mint, ≈56×24):

- A dark east wing holds the lamp case for the lights-out switches; the
  switches are in the lit west wing; goggles lie in the lit wing (who wears
  them is the first argument). Lamps are behind glass, visible only from inside
  the dark wing.
- The radio is in a side room; its pips (`yields`) give the digit count for a
  sync-locked door's second stage (the sync keys ≥3 tiles apart; they need
  someone to signal the moment: the bell and lamp sit between them).
- A UV plaque in the dark wing says which switch pattern is the target
  (`ink` with `text`); the UV torch lies near the radio.
- Lasers on the route to the exit (late use, as agreed); a camera at the
  radio room.

**The Vault** (`rooms/04-vault.room`, hue sky, ≈60×28):

- Three wings, one spawn each (players start apart), joined to the central
  vault by doors and to each other by hatches (`H`).
- **Rose wing:** the music box (tune and lights) and its bells are in different
  wings: the tune plays in rose, the bells hang in mint; the earpiece in rose
  carries the tune's notes as tones for a hearing holder elsewhere.
- **Mint wing:** the bells; a dial safe whose stethoscope is in sky (passed
  through a hatch).
- **Sky wing:** a keypad whose code is a clue chime in rose; the goggles for a
  dark corridor in mint.
- Each wing's last station reveals a symbol in the world; the vault door has
  three sockets (`from`: the three stations) and an order clue in UV ink inside
  the vault antechamber.
- A guard patrols the vault antechamber.

## 5. Task breakdown

### Task 14: Build Lights Out

- **Description:** `rooms/03-lights-out.room` per this file's §4, replacing
  `03-cameras-lasers.room`.
- **Files touched:** new `rooms/03-lights-out.room` (drafted in
  `spec/fixtures/drafts/` first); delete `rooms/03-cameras-lasers.room` and its
  solution file; `playtests/mockups/03-lights-out.html`.
- **Tests first (red):** `spec/rooms.test.ts` (clears every rotation, no
  catches) and `pnpm lint:rooms` (presence, FR2, dark-hazard rule) against the
  new room.
- **Implementation (green):** draft → mockup every role → move.
- **Acceptance criteria:** lint and rooms spec green; bots clear under
  `budgetS`.
- **Human review:** three tabs at both viewports, each role once: the dark
  wing gives the goggle-wearer real work and nobody is stranded (playtest 1's
  problem); the sync lock is fun to coordinate. Pass = the user says so.
- **Depends on:** Task 13.

### Task 15: Build The Vault

- **Description:** `rooms/04-vault.room` per this file's §4, replacing the old
  `04-vault.room`.
- **Files touched:** the room (drafted first); delete the old room's solution
  file; `scripts/solve-rooms.ts` (remove if no hand-authored rooms remain, with
  its `package.json` script, or leave pointing at none: choose removal if
  nothing calls it); `playtests/mockups/04-vault.html`.
- **Tests first (red):** rooms spec and lint as Task 14; a `stations.test.ts`
  case: the vault's socket symbols are the symbols its `from` stations revealed
  for that attempt.
- **Implementation (green):** draft → mockup → move.
- **Acceptance criteria:** lint and rooms spec green.
- **Human review:** three tabs, each role once: starting apart feels exciting,
  not lonely; passing gear through a hatch is clear; the meta-code makes
  everyone's work visible. Pass = the user says so.
- **Depends on:** Task 14.

### Task 16: The four-room heist end to end

- **Description:** Heist-level specs and docs updated for the new room ids.
- **Files touched:** `spec/heist.test.ts`, `spec/heistPlay.ts`,
  `spec/leaderboard.test.ts` (room tabs), `src/game/cues.ts` tests that name
  rooms, `README.md` room list if it has one.
- **Tests first (red):** the heist spec plays through four rooms with bots
  and reaches the results screen.
- **Implementation (green):** id updates only.
- **Acceptance criteria:** `pnpm check` green.
- **Depends on:** Task 15.

## 6. Phase Definition of Done

- [ ] Every task in §5 is complete and its tests pass
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start` then `pnpm check` passes
- [ ] Tasks 14 and 15 human reviews accepted
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR26 room 3, FR14, FR24–FR25 in a room | Task 14 |
| FR26 room 4, FR13 | Task 15 |
| FR2, FR3 | Tasks 14, 15 |
| Heist end to end | Task 16 |

## 8. Risks / open questions

None.

## 9. Corrections log

<!-- one line per user redirect during execution, and any playtest 5 amendment -->
