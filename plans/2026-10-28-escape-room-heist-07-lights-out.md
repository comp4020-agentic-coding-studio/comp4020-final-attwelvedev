# Escape-room heist: Phase 07, room 6 Lights Out

- **Date:** 2026-10-28
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-10-28 (clues spec)
- **Part of:** `plans/2026-10-28-escape-room-heist-00-overview.md`. Read it first, especially §3
  (commands, room workflow, human review on a local build) and §4.5 (clue fields, bot messages).
- **Depends on phases:** 06.

## 1. Summary

Teaches bots to solve this room's new things from what they perceive, then builds room 6
(`rooms/06-lights-out.room`), which introduces radio; switches. Ends with room 6 in the heist, cleared
by perception-only bots in every rotation, and played by the user.

## 2. Requirements (this phase)

### 2.1 Functional

Clues FR2 (radio, switches), FR3 (radio to keypad motif), FR6, FR7, FR8, FR9, FR10 (room 6); spec FR10, FR11.

### 2.2 Non-functional

Room about two to four minutes for a first-time crew; within Task 7's budget; never colour alone.

### 2.3 Out of scope for this phase

Later rooms; side jobs (phase 11).

### 2.4 Assumptions

See overview §2.4.

## 3. Existing code context (verified 2026-10-28)

- `src/game/bots/decode.ts` (Task 13): `DECODERS`, `beliefFrom`; `src/game/bots/brain.ts`
  `stationStep` asks the type's decoder; `src/game/bots/jobs.ts` job targets (`station`, `take`,
  `give`, `sill`, `tow`).
- `src/game/sim/stations.ts`: radio `answer = [setting, digit]`, `PIP_TICKS`; switches `toggled(lamps, i, cols)`, `answer` is the target pattern (shown as the card from Task 11).
- Room workflow (CLAUDE.md): draft in `spec/fixtures/drafts/`, `pnpm mockup:room`, `pnpm
  lint:rooms` (presence rule, clue-path rule from Task 12), `spec/rooms.test.ts`,
  `src/game/rooms/pacing.test.ts` (Task 14: at most two new kinds a room).
- Rooms are played in file-name order; this room's number keeps the old `04-cameras-lasers` and
  `05-vault` after it until phase 10 removes them (renumber them past this room if needed).

### Interfaces from earlier phases (exact)

```ts
// src/game/bots/decode.ts (Task 13)
export interface StationBelief { answer: (number | null)[]; solved: boolean; told: Set<number>; }
export type Decoder = (view: RoleView, inbox: ChannelMessage[], belief: StationBelief,
  o: RoomObject, now: number) => void;
export const DECODERS: Partial<Record<StationType, Decoder>>;
// src/game/bots/brain.ts (Task 13)
export function think(room: Room, view: RoleView, inbox: ChannelMessage[], memory: BotMemory,
  now: number): BotTurn;
// Room format (Task 11): station keys `teach`, `motif`, `slot`; letters `t` (card), `Y` (order)
// View (Task 11): station `teach?`, `motif?`, `reveal?`; `card?: number[]`; sign `text`
// Bot messages (P3): an `x` mark on a part's tile; text /^\d$/; the callout "stop"
```

## 4. Approach

**Radio decoder.** A hearer turns until `static` gives way to `tone`; once tuned it counts the `pip` cues (or a sighted bot counts the light) and sends the digit as text; the keypad slot with the matching motif takes it (the bot matches motifs, not station ids). **Switches decoder.** A sighted bot at the card reads `card`; a sighted bot by the lamps reads their state; the lights-out search (`switchPress`, already in `brain.ts`, fed from the belief instead of the sim) picks the next button, marked with an `x` for the presser.

**Room 6.** A teaching radio; a radio whose digit fits the slot (same motif) of a keypad; a switches panel in one room, its lamps behind glass in another, its card in a third place; the bell and the lamp, counted against this room's two only if the plan places them here (they are placed in room 9).

## 5. Task breakdown

### Task 20: Bots solve radio; switches from what they perceive

- [x] Done 2026-10-29 (overnight run; decisions in `…-overnight.md`)

- **Description:** Per this file's §4: the decoder(s) (or, for gear, the job choice from the view)
  in `src/game/bots/decode.ts`, registered in `DECODERS`; bots send and read only P3's forms.
- **Files touched:** `src/game/bots/decode.ts` (+ `decode.test.ts`), `src/game/bots/brain.ts`
  (+ `brain.test.ts`) where a job needs it; a small fixture room per type in
  `spec/fixtures/rooms-bots/` cleared by bots in `spec/rooms.test.ts`.
- **Tests first (red):** for each new type, a decoder test: given views and inbox messages a role
  would really get (built with `viewFor` on a seeded world), the belief reaches the answer and
  the next press is right; with the clue withheld (the clue tile out of every bot's sight, or
  the sound out of earshot), it never presses a part (it does not guess); the type's fixture
  room is cleared by three bots in every rotation, never caught.
- **Implementation (green):** as described.
- **Acceptance criteria:** tests green; `grep -n "world\.stations\|\.answer" src/game/bots` finds
  nothing outside comments.
- **Depends on:** Task 13, Task 19.

### Task 21: Build and play room 6

- [x] Built 2026-10-29 (overnight run); human review queued in `review/QUEUE.md`

- **Description:** Author `rooms/06-lights-out.room` per this file's §4 (teaching versions first, then
  real), with beats, intents, hints, checkpoints and labels.
- **Files touched:** new `rooms/06-lights-out.room`; renamed later rooms as needed; `playtests/mockups/`
  page for it.
- **Tests first (red):** `spec/rooms.test.ts` (the new room clears in every rotation with
  perception-only bots, never caught, within `budgetS` 240 s); `pacing.test.ts` (two new kinds);
  `pnpm lint:rooms` (presence and clue paths).
- **Implementation (green):** draft in `spec/fixtures/drafts/`, check each role with `pnpm
  mockup:room`, then move to `rooms/`.
- **Acceptance criteria:** those three green; `pnpm check` green.
- **Human review:** on a local build, three tabs at desktop 1280 and phone 375, the user plays
  room 6 in each role at least once: each station's clue can be found and understood, the
  teaching version teaches the real one, any link between stations can be worked out without
  being told, no one waits with nothing to do for more than about 20 s. Pass = the user says so.
- **Depends on:** Task 20.

## 6. Phase Definition of Done

- [ ] Every task in §5 is complete and its tests pass
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start` then `pnpm check` passes
- [ ] Task 21 human review accepted
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| Clues FR6 (this room's types), FR5 | Task 20 |
| Clues FR2 (radio, switches), FR3 (radio to keypad motif), FR6, FR7, FR8, FR9, FR10 (room 6) | Tasks 20, 21 |
| Clues FR9, FR10 (room 6) | Task 21 |

## 8. Risks / open questions

None.

## 9. Corrections log

<!-- one line per user redirect during execution -->
