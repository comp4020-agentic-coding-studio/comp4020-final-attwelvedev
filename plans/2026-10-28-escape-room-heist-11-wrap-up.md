# Escape-room heist: Phase 11, credited results, comms map, edition, wrap-up

- **Date:** 2026-10-28
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-10-28
- **Part of:** `plans/2026-10-28-escape-room-heist-00-overview.md`. Read it first.
- **Depends on phases:** 10.
- **Re-plan:** was phase 05 (Tasks 17 to 20); same work, renumbered 28 to 31, nine leaderboard room tabs, ADR 0018 alongside 0017.
- **Re-plan, 2026-11-02:** the floor-item side jobs were played and rejected by the user (anyone can take them; nothing to work out). Side jobs
  are replaced by hidden caches in **phase 14** (`plans/2026-11-02-escape-room-heist-14-00-overview.md`, spec
  `specs/2026-11-02-escape-room-caches.md`, ADR 0020). This phase keeps credits and the cleared card (Task 28, narrowed), the comms map (29), the
  edition (30) and the docs (31).

## 1. Summary

Adds credited results and a redesigned room-cleared card (Task 28, narrowed from side jobs), the comms map at room end, a new leaderboard
edition for the nine-room heist with the old one kept, and brings CLAUDE.md, DESIGN.md, the backlog and ADR 0017 and 0018 in line with the
code. Side jobs moved to phase 14.

## 2. Requirements (this phase)

### 2.1 Functional

Spec FR30 (credited results), FR31; overhaul FR35 (comms map). (Spec FR28 and clues FR11, side jobs, are phase 14.)

### 2.2 Non-functional

Logging: nothing new here (the cache log line is phase 14, Task 54).

### 2.3 Out of scope for this phase

Ambience and music (overhaul phase 07). Side jobs (phase 14).

### 2.4 Assumptions

See overview §2.4.

## 3. Existing code context (verified 2026-10-28)

- `src/net/protocol.ts` — server message `{ t: "cleared"; room: string; ms:
  number; loot: number; lootTotal: number }`.
- `src/net/attach.ts` ~L344 builds a room run with `version:
  String(world.room.version)` and ~L361 a heist run with `version:
  running.heist.versions.join(".")`.
- `src/lib/runs.ts` — `version: string` per run; `sameHeat(kind, roomId,
  version)`; "the current version of a kind/room is whichever one was most
  recently played".
- `src/lib/schema.ts`, `drizzle/` migrations (`pnpm db:generate`).
- `src/components/RoomCleared.tsx`, `HeistComplete.tsx`, `src/pages/leaderboard.astro`.
- Overhaul phase 06's Task 24/25 text (in
  `plans/2026-10-19-play-overhaul-06-rooms-results.md` §5, now marked moved):
  comms map = per-direction, per-method delivery counts sent with `cleared`,
  drawn as a triangle with arrow thickness by count, a one-line summary;
  edition = an `edition` column, `EDITION = 2`, old board by link.
- `src/lib/gameLog.ts` `GameEvent`; `src/lib/log.ts` `redact` allowlist.

### Interfaces from earlier phases (exact; corrected at execution, 2026-11-02)

- Rooms `rooms/01-first-steps.room` to `09-the-vault.room` (phases 04 to 10); the old rooms are gone.
- `{ t: "cleared"; room; ms; loot; lootTotal; board; credits: { seat: Seat; lines: string[] }[] }` in `src/net/protocol.ts`, sent from
  `src/net/attach.ts` with `credits: creditsOf(world)`. (Task 28 added `credits`; Task 29 adds `comms`.)
- `World.solvedBy: Record<string, Seat>` (`src/game/sim/world.ts`, set in `src/game/sim/stations.ts` `solve()`);
  `creditsOf(world: World): Credit[]` and `Credit { seat: Seat; lines: string[] }` in `src/game/sim/credits.ts`;
  `creditRows(credits, crew): CreditRow[]` in `src/client/credits.ts`; `RoomCleared` takes `credits?: CreditRow[]`.

## 4. Approach

**Credits.** The server keeps `solvedBy` (which seat's Act solved each station) and builds one `lines[]` per seat from fixed templates
("cracked the safe", repeats folded to "cracked 2 safes"; a seat that did nothing reads "kept the crew moving"). A teammate in a line is a
`{seat}` token the page fills with a nickname (never logged, never on the server).

**The cleared card.** One centred column (`.cleared`, 44rem or the frame): title, Time and Loot as two stats, a card per player (role shape,
name, lines; side by side while three fit, stacked on a phone), the buttons, then the room's board on the same middle. A layout spec measures it.

**Comms map.** The server counts deliveries per directed edge and method for the room:
`comms: Record<"0>1" | ..., Partial<Record<Method, number>>>`; a send counts once per receiver (a callout from seat 1 to seats 0 and 2 is `1>0: 1`,
`1>2: 1`); a voice spurt counts once per receiver; counts reset each room. Sent with `cleared` next to `credits`. Never message content.
`countComms(comms, from, receivers, method)` mutates and returns the map. The map sits between the credits and the buttons.

**Edition.** An `edition` column (default 1 for existing rows), `EDITION = 2`; `version` and `sameHeat` are untouched.

## 5. Task breakdown

### Task 28: Credits and the cleared card (narrowed 2026-11-02 from "Side jobs and credited results")

- **Status:** DONE. Human review accepted by the user 2026-11-02; committed as "Credits and the cleared card" (phase 14 Task 51 step 0). Its side-job parts (the `j` tile, floor-item pickup, `lintSideJobs`, the 18 placed items, the
  `sidejob` pacing exception) are replaced by phase 14 Task 51, which commits this task first (its step 0) and then removes them.
- **Description:** one credit card per player on `cleared`, folded lines; the cleared card redesigned into one centred column.
- **Files touched:** `src/game/sim/credits.ts` (+ test), `src/game/sim/world.ts` and `stations.ts` (`solvedBy`), `src/net/protocol.ts` and
  `attach.ts` (`credits` on `cleared`), `src/client/credits.ts` (+ test), `src/components/RoomCleared.tsx` (+ test), `src/components/Game.tsx`,
  `src/styles/game.css` (`.cleared`, `.credits`), `DESIGN.md` (`RoomCleared`), `spec/heist.test.ts` and `spec/heistPlay.ts` (credits arrive),
  `spec/layout/leaderboard.test.ts` (the cleared-card layout spec).
- **Tests first (red) (done):** `creditsOf` folds repeats and falls back for a seat with nothing; `creditRows` fills `{seat}` tokens; the card shows
  a card per player and two stats; the layout spec fails with the board left-aligned, a huge gap, or the card wider than the frame (each shown).
- **Acceptance criteria:** tests green; `pnpm check` green (130 files, 1878 tests, 2026-11-02); screenshots at 1280 and 375 read.
- **Human review:** the user looks at the cleared card (credit cards, centred board) at 1280 and 375 on a local build. Pass = the user says so.
- **Depends on:** Task 27.

### Task 29: The comms map at room end (was overhaul Task 24)

- [x] **Done** on `auto/side-work` (overnight side session, 2026-10-29), ahead of Task 28: no
  side-job credit yet; `RoomCleared.tsx` marks where Task 28's credit lines go, under the map. The
  keyboard path is a 48 px chip per busy arrow (the SVG itself is a picture), and HeistComplete
  shows the last room's map. Merge into `auto/escape-room` is the user's.

- **Description:** Count deliveries per direction and method; send them with
  `cleared`; draw `CommsMap` in `RoomCleared` and `HeistComplete`.
- **Files touched:** `src/net/attach.ts`, `src/net/game.ts` (+ test:
  `countComms(comms, from, receivers, method)` pure helper),
  `src/net/protocol.ts`, `src/lib/gameLog.ts`/`src/lib/log.ts` (`sends`),
  new `src/components/CommsMap.tsx`, `RoomCleared.tsx`, `HeistComplete.tsx`,
  `src/styles/game.css`, `DESIGN.md`, `spec/heist.test.ts` (`cleared` has
  `comms` edges matching the messages sent), `spec/layout/hud.test.ts` (map
  visible, axe clean, summary names the busiest direction).
- **Tests first (red):** two callouts from seat 1 to seats 0 and 2 count 1
  each on `1>0` and `1>2`; a voice spurt counts once; counts reset next room.
- **Implementation (green):** triangle of the three players, arrow thickness
  by count, per-edge method breakdown on hover/focus, one-line summary.
- **Acceptance criteria:** tests green; never a message's content in the map or
  the log.
- **Depends on:** Task 28.

### Task 30: A new leaderboard edition, the old one kept (was overhaul Task 25)

- [x] **Done** on `auto/side-work` (overnight side session, 2026-10-29), ahead of Task 27: the room
  tabs come from `rooms/` at runtime, not a fixed nine; `/leaderboard.json`, the in-game panel and
  the room board on clear all read edition 2 through `topRuns`' default. Merge into
  `auto/escape-room` is the user's.

- **Description:** `edition` column and migration, `EDITION = 2`, filtering,
  the earlier-edition link and tabs; FR31.
- **Files touched:** `src/lib/schema.ts`, `drizzle/NNNN_*.sql` + meta
  (generated by `pnpm db:generate`), `src/lib/runs.ts` (+ test),
  `src/pages/leaderboard.astro`, `spec/leaderboard.test.ts`.
- **Tests first (red):** a run saved now has edition 2; `topRuns` defaults to
  edition 2 and returns edition-1 rows only when asked; existing rows read as
  edition 1 after migrating; the board has a tab for the full heist and each of
  the nine rooms and links to the earlier board.
- **Implementation (green):** as described.
- **Acceptance criteria:** tests green; migration committed; no rows deleted.
- **Depends on:** Task 27.

### Task 31: Wrap-up: CLAUDE.md, DESIGN.md, backlog, ADR 0017

- **Description:** Bring the harness docs in line with the code.
- **Files touched:** `CLAUDE.md`: the **Sensory parity** bullet gains the
  deliberate exceptions (earpiece and stethoscope sounds have no picture; UV
  ink and goggles sight have no sound) and "a new station sound goes in
  `parity.test.ts`"; the **Rooms** bullet says rooms are station puzzles
  linted by `lintPresence` and `lintClues`, introduce at most two new things (`pacing.test.ts`), and are cleared by perception-only bots (ADR 0018) (no lead beats), and that a room must pass
  `pnpm lint:rooms` and `spec/rooms.test.ts`; the **Shape of the app** bullet
  mentions stations and gear. `DESIGN.md` checked against the code;
  `specs/backlog.md` Decided lines; `doc/adr/0017-…` and `0018-…` status → `accepted`
  **only after the user says so**; DESIGN.md 4.6 and 4.8 checked (label cap, clue visuals); `PROCESS_LOG.md` entry for the phase's
  moments.
- **Tests first (red):** `spec/design.test.ts` green; `pnpm check:evidence`.
- **Implementation (green):** edits as listed.
- **Acceptance criteria:** `pnpm check` green.
- **Human review:** the user reads the CLAUDE.md diff and approves ADRs 0017 and 0018.
- **Depends on:** Tasks 28, 29, 30.

## 6. Phase Definition of Done

- [ ] Every task in §5 is complete and its tests pass
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start` then `pnpm check` passes
- [ ] Tasks 28 and 31 human reviews accepted; ADRs 0017 and 0018 accepted by the user (ADR 0020 is phase 14's)
- [ ] The overview's feature-level Definition of Done holds
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| Spec FR30 (credits and the cleared card) | Task 28 |
| Spec FR28, clues FR11 (side jobs) | phase 14 |
| Overhaul FR35 | Task 29 |
| Spec FR31 | Task 30 |
| Housekeeping, ADRs | Task 31 |

## 8. Risks / open questions

None.

## 9. Corrections log

<!-- one line per user redirect during execution -->

- 2026-11-02: expected side jobs in room 4 to pass `pacing.test.ts`; the user ruled a side job is loot with an owner and does not count as a new thing, so `sidejob` joins `EVERYWHERE` there. The plan had two requirements that contradicted (clues FR11 "from room 4" vs FR9/FR10 "two new things") and never said so.
