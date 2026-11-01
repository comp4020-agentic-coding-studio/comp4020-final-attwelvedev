# Escape-room heist: Phase 13, fixes from the human review of phase 12

- **Date:** 2026-11-01
- **Status:** Approved
- **Tier:** Slice batch, split into four session files (chimes, render, room 7, bots and harness)
- **Requirements confirmed by user:** yes, 2026-11-01 (review notes plus four rulings: radio challenge parked,
  room 6 gets a longer gap only, bots act like a human teammate, one phase 13 plan)
- **Part of:** `plans/2026-10-28-escape-room-heist-00-overview.md` (add a §5 row for phase 13, unticked).
  Depends on phase 12. Tasks 41 to 50.
- **Commits:** one per task once `pnpm check` is green, ending with
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never push or deploy without the user's go-ahead.
- **Review mode:** as the phase 12 correction of 2026-10-31: build and commit as checks go green, review all
  `Human review:` items together at the end of the phase.

## 1. What you'll see

- Chimes heard through a vent climb and give the full count, like the keypad and bells. Room 6's repeats are easy to tell apart.
- Practice mode plays the real chime for the key or bell you press.
- Room 7: the ink is just the wire number, fits on its wall, shows wherever the torch reaches, has no dotted ring, and the torch is
  far from it. The switches and lamps are behind a door that only the right wire cut opens.
- The room 4 wire goes to the second safe only; the bells wire meets the middle of the bells.
- The cut-wire rules in rooms 5 and 9 no longer start "Otherwise". A success ring plays once, not each time it comes back into view.
- Bots help after you let go of their hand. Flaky wheel and reveal specs are fixed at the cause.
  CLAUDE.md gains a "break it and watch it go red" rule.

## 2. Demo script

1. Eyes closed beside a vent in rooms 5, 6 and 8, key 7 → a group of eight rising chimes, a clear gap, the next group. Count matches.
2. Room 6, eyes closed → every repeat of the key is separated by a gap clearly longer than the gaps between groups.
3. Room 8, flip the lever, press key 5 and a bell → each plays its real chime (five or the bell's note), the lever
   still shows practice (keys dimmed) and nothing counts.
4. Room 7, torch on the ink → the ink is one number ("2"), wholly on the wall's face, never cut by the left wall, no dashed ring on the
   light. Walk right → the ink stays in whatever part of the light reaches it. Cut that wire, whatever its colour → the door opens.
5. Room 7: the torch lies well away from either ink. Walk to the switches without cutting the wire → a door blocks you.
   Cut the right wire → it opens and stays open.
6. Room 4: a dotted wire runs from the second safe's dial to its audio box through the wall; the first safe has none.
   Room 8: the bells wire ends in the middle of the bells.
7. Rooms 5 and 9 wire plaques → no sentence starts "Otherwise" (room 7's plaques are a number, step 4).
8. Solve a station, walk out of sight and back → no second ring.
9. Room 5 to 8 with a person leading then letting go of a bot's hand → the bot walks to its next job.
   Send a callout or mark the bot can act on → it answers it.
10. `pnpm check:flaky 6` → no wheel or reveal failure.

## 3. Requirements and out of scope

Requirements 1 to 10 are the demo steps; each task names its step. Out of scope: a radio challenge (a
`specs/backlog.md` line, Task 50), a new chime format for room 6 beyond the longer gap, a visible chime pip, rooms 1 to 4's bots.

## 4. Phase map

Each session loads this overview plus one file. Ordered by real dependency.

- [x] `2026-11-01-escape-room-heist-13-01-chimes.md`: Tasks 41, 42 (vent chimes, practice sound). Ends green with chimes countable by ear.
- [ ] `2026-11-01-escape-room-heist-13-02-render.md`: Tasks 43, 46, 47 (UV ink, success ring once, link wires). Ends green with screenshots.
- [ ] `2026-11-01-escape-room-heist-13-03-room-seven.md`: Tasks 44, 45 (room 7 door and torch, wire wording). Ends green with room 7 cleared by bots.
- [ ] `2026-11-01-escape-room-heist-13-04-bots-harness.md`: Tasks 48, 49, 50 (bots, flaky specs, CLAUDE.md rule, backlog). Depends on 41 and 44. Ends with `pnpm check:flaky 6` clean.

Add a §5 row for phase 13 to `plans/2026-10-28-escape-room-heist-00-overview.md` when the first file is started.

## 5. Phase Definition of Done

- [ ] Tasks 41 to 50 done, one commit each; `pnpm test:unit` and `pnpm check` green on a fresh `pnpm start:check` server.
- [ ] `pnpm check:flaky 6` run once at the end: no wheel or reveal failure.
- [ ] Demo script 1 to 10 played on a local build, three tabs, 1280 and 375.
- [ ] CLAUDE.md invariants hold: every new or changed cue has a `parity.test.ts` row, `viewFor` gates new fields (`n`, `of` on practice), log lines kinds only,
      `DESIGN.md` updated with the UV rim and link changes.
- [ ] Every `Human review:` task accepted explicitly by the user. Overview §5 row ticked.

## 6. Requirements coverage

| Demo | Task |
| --- | --- |
| 1, 2 | 41 |
| 3 | 42 |
| 4 | 43 (render half done; the number, and the bot reading it, to do) |
| 5 | 44 |
| 6 | 47 |
| 7 | 45 (rooms 5 and 9; room 7 is Task 43) |
| 8 | 46 |
| 9 | 48 |
| 10 | 49 |
| (harness, backlog) | 50 |

## 7. Corrections log

(execution appends one line per user redirect and mirrors it into `PROCESS_LOG.md`)

- 2026-11-01, Task 43: plan said shorten room 7's ink to "Wire 2" via `plaqueText`; user wanted just the number, no "Wire" text.
  The plan assumed the ink text was free copy, but it carries the `WIRE_RULES` sentence that players and bots decode.
- 2026-11-01, Task 43: plan said "no dashed ring" on the UV light; user meant keep the ring and drop the dashed line from its centre
  to the left side (the polygon's torch point, stroked as two spokes). I removed the whole ring (e1968b3). Fixed by tracing the ring from the rays only.
- 2026-11-01, Task 43: I ran `prettier --write src/game` (the project uses Biome), reformatting 60 files outside the task. The
  user had me restore them. Harness fix: a CLAUDE.md Hygiene rule (format with `pnpm format` only).
- 2026-11-01, Tasks 43, 45, 48: re-planned. Ink is only the wire number, for room 7 only (`"numbered":true`; colours stay drawn as decoys); the digit
  decoder moves into Task 43; Task 45 covers rooms 5 and 9; Task 48 only runs against it. The user is also considering riddle plaques (backlog, not built).
