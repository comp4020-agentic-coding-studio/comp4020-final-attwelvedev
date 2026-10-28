# Escape-room heist: Phase 09, room 8 Music Room

- **Date:** 2026-10-28
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-10-28 (clues spec)
- **Part of:** `plans/2026-10-28-escape-room-heist-00-overview.md`. Read it first, especially §3
  (commands, room workflow, human review on a local build) and §4.5 (clue fields, bot messages).
- **Depends on phases:** 08.

## 1. Summary

Teaches bots to solve this room's new things from what they perceive, then builds room 8
(`rooms/08-music-room.room`), which introduces music box; earpiece. Ends with room 8 in the heist, cleared
by perception-only bots in every rotation, and played by the user.

## 2. Requirements (this phase)

### 2.1 Functional

Clues FR2 (music box), FR6, FR7, FR8, FR9, FR10 (room 8); spec FR12, FR17.

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
- `src/game/sim/stations.ts`: bells `answer` (four bell indices), `noteOf`, `tuneNote`; `stationShows` for bells is `[playing?, ...struck]`.
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

**Music box decoder.** As each note plays, the bell it belongs to lights (a sighted bot sees which, Task 11's drawing reads `shows`) and its pitch sounds (a hearer hears it); the bot that perceives the order marks bells with `x` in order, or strikes them itself. **Earpiece.** A hearing bot with the earpiece hears the keypad's code as `earpiece` notes and works the keypad as in phase 06.

**Room 8.** A teaching music box (two notes); a real one whose tune box is behind glass from the bells; a keypad whose code is only on the earpiece.

## 5. Task breakdown

### Task 24: Bots solve music box; earpiece from what they perceive

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
- **Depends on:** Task 13, Task 23.

### Task 25: Build and play room 8

- **Description:** Author `rooms/08-music-room.room` per this file's §4 (teaching versions first, then
  real), with beats, intents, hints, checkpoints and labels.
- **Files touched:** new `rooms/08-music-room.room`; renamed later rooms as needed; `playtests/mockups/`
  page for it.
- **Tests first (red):** `spec/rooms.test.ts` (the new room clears in every rotation with
  perception-only bots, never caught, within `budgetS` 240 s); `pacing.test.ts` (two new kinds);
  `pnpm lint:rooms` (presence and clue paths).
- **Implementation (green):** draft in `spec/fixtures/drafts/`, check each role with `pnpm
  mockup:room`, then move to `rooms/`.
- **Acceptance criteria:** those three green; `pnpm check` green.
- **Human review:** on a local build, three tabs at desktop 1280 and phone 375, the user plays
  room 8 in each role at least once: each station's clue can be found and understood, the
  teaching version teaches the real one, any link between stations can be worked out without
  being told, no one waits with nothing to do for more than about 20 s. Pass = the user says so.
- **Depends on:** Task 24.

## 6. Phase Definition of Done

- [ ] Every task in §5 is complete and its tests pass
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start` then `pnpm check` passes
- [ ] Task 25 human review accepted
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| Clues FR6 (this room's types), FR5 | Task 24 |
| Clues FR2 (music box), FR6, FR7, FR8, FR9, FR10 (room 8) | Tasks 24, 25 |
| Clues FR9, FR10 (room 8) | Task 25 |

## 8. Risks / open questions

None.

## 9. Corrections log

<!-- one line per user redirect during execution -->
