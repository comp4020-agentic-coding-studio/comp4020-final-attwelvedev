# Escape-room heist: Phase 13 (chimes)

- **Status:** Approved
- **Part of:** `plans/2026-11-01-escape-room-heist-13-00-overview.md` (read it first: requirements, demo script, conventions, coverage).
  Depends on phase 12. Task numbers are global.
- **Commits:** one per task once `pnpm check` is green, ending with
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never push or deploy without the user's go-ahead.
- **Review mode:** build and commit as checks go green; `Human review:` items are reviewed together at the end of phase 13 (overview §5).

## Interfaces from earlier phases (exact)

None. Produces, for phase 04: `chimePlan(kind: ChimeKind, n: number | undefined): PlannedChime[]` accepting `"clue"` (`src/client/chimeSound.ts`), and a `practice` `SoundCue` that carries `n` and `of`.

## Tasks

### Task 41: Vent chimes climb and give the full count  [x]  (demo 1, 2)

Root cause found while planning: the `clue` cue (`src/client/audio.ts:270`) plays `Math.min(3, n)` flat 880 Hz
sine beeps 0.28 s apart, so a vent never climbed and never passed three; Task 36 only changed keys, bells and the earpiece
(`isChimeCue` in `src/client/chimeSound.ts`).

- **Red first:** `chimeSound.test.ts`: `chimePlan("clue", 7)` is eight chimes rising in pitch; `clue` is a chime kind.
  `chimes.test.ts`: `CHIME_TICKS * TICK_MS` is 200 (was 150); the pause between repeats of a tune (`TUNE_PAUSE_TICKS`)
  already exceeds a group gap, so room 6 needs no change (ruling 2026-11-01). A decoder test that bots read a vent's `n` above 3.
  On the wire `clue.n` stays a COUNT (`note + 1`, as `step.ts` sends it and `decode.ts` reads `n - 1`): `audio.ts` plays
  `chimePlan("clue", n - 1)`.
  `parity.test.ts` keeps its `clue` row.
- **Green:** add `"clue"` to `ChimeKind`, give it a soft bell voice of its own (a vent is not a key or a bell);
  remove the `Math.min(3` cap and the flat-880 branch. Slow `PENTATONIC` spacing: `CHIME_GAP_S` 0.15 → 0.20 (a whole 4 ticks; 0.22 is not a tick multiple) and
  `CHIME_TICKS` in `src/game/sim/chimes.ts` to 4 (the test that holds them equal stays green; update the 150 ms assertion in `chimes.test.ts`;
  `TUNE_MAX_TICKS` grows with it to fit four 9-chime groups plus the pause; the decoder and `lint.ts` read it).
  Room 6: no change. Update the Captions text if it names a cap.
- **Done when:** unit tests pass; `spec/rooms.test.ts` bots clear rooms 5, 6 and 8 in every rotation inside their budgets.
  **Human review:** eyes closed in rooms 5, 6, 8, no subtitles: the count of a group of 7 is countable, room 6's start of a repeat is clear.

### Task 42: Practice mode plays the real chime  [x]  (demo 3)

Today the `practice` cue is a dry noise tap (`src/client/audio.ts:297`) so a person cannot hear which key or bell they pressed.

- **Red first:** `stations.test.ts`: a practice press of key 5 or bell 3 pushes a `practice` cue carrying `n` (and its source kind: key or bell).
  `chimeSound.test.ts`: the practice plan equals the real plan for that `n` and kind, at a lower level. `parity.test.ts` row still passes;
  `perception.test.ts`: the cue's `n` reaches only roles that hear it.
- **Green:** carry `n` and `of` ("key" | "bellnote") on the `practice` cue (`SoundCue` in `src/game/perception.ts`; `protocol.ts` re-exports it);
  `audio.ts` plays `chimePlan(of, n)` at 60 % level, with a short low tick before it so it is still not mistaken for
  a solve-time note. Update the Captions line ("practice: key 5"). Update the Task 38 comment in `audio.ts`.
- **Done when:** tests pass. **Human review:** eyes closed in room 8, practice key 5 sounds like five rising chimes and the tick makes it read as practice.
- **Depends on:** 41 (shares `chimePlan`).

## Phase Definition of Done

- [ ] Tasks 41 and 42 committed, \`pnpm test:unit\` green, bots clear rooms 5, 6, 8 in every rotation.
- [ ] Covers demo 1, 2, 3.
