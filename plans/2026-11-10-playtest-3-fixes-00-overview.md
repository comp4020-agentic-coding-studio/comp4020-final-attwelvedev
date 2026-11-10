# Playtest 3 fixes: overview

- **Date:** 2026-11-10
- **Status:** Approved
- **Spec:** `specs/2026-11-10-playtest-3-fixes.md`, approved by the user on 2026-11-10 in `/brainstorm-feature`. Read it first: it holds FR1–FR11, B1–B5 and T1–T3, the demo script and the reasons.
- **ADR:** `doc/adr/0030-holding-hands-is-felt-not-seen.md`, accepted by the user on 2026-11-10.
- **Tier:** mixed:
  - phase 03 (touch) is Architecture
  - phases 02 and 04 are Slices
  - phase 01 is bugs and tweaks
- **Branch:** start from `main` once PR 3 (`auto/overnight` → `main`) is merged and deployed. Work on a new branch `auto/playtest-3`, which becomes PR 4. If PR 3 is not merged when the run starts, **stop**: run nothing, and log it.
- **Deadline:** all units done by Wed 2026-11-11 08:00. The user merges and deploys by 09:00.

## 1. Rules for every unit (unattended run)

1. **Read `CLAUDE.md` first.** Its rules beat this plan. In particular:
   - a bug fix starts with a failing test, and every new guard is shown to fail first by a break script that asserts the text it replaces
   - render bugs are reproduced on a real canvas
   - any visual change gets a screenshot at 1280×800 and 375×812 under `review/`
   - `pnpm check` is green before each commit, run against `pnpm start:check`
   - never retry a test to make it green
2. **One commit per task,** whose message says what was broken in the break check. At the end of a unit, commit `Unit done: <id>`.
3. **Stop and park.** If a task can't meet its acceptance after two honest attempts, or needs a decision this plan doesn't make:
   - commit nothing for that task
   - append a dated line under `## p3fix` in `plans/2026-11-07-overnight.md`, saying the decision, what you tried and what you'd need
   - leave the task unticked and go on to the next task that doesn't depend on it
   - never weaken, skip or delete a test to get past it
4. **Human review is queued, not given.** A task with a `Human review:` line is built, committed and listed in `review/QUEUE-p3.md`, with the screenshot paths and what a pass looks like. Leave its box unticked: the user ticks it in the morning.
5. **Decisions** the plan leaves to the implementer are logged in `plans/2026-11-07-overnight.md` under `## p3fix`, in that file's format (`- unit/task: question → choice, because …. Reversible by ….`).
6. **Scope.** Build only what the spec lists. A new idea goes to `specs/backlog.md` as one dated line.

## 2. Commands

- `pnpm start:check` (throwaway DB; `INTRO_MS=0`), then in another shell `pnpm check`
- Unit tests only: `pnpm test:unit`. One file: `pnpm vitest run <path>`.
- `pnpm lint:rooms`, and `pnpm vitest run spec/rooms.test.ts`, after anything touching rooms, bots or stations.
- `pnpm check:flaky 4` before calling a browser spec done.
- `pnpm playtest --room NN [--width 375]` for a three-tab run of one room.

## 3. Phase map

| phase | file | tasks | ends with | depends on |
| --- | --- | --- | --- | --- |
| [x] 01 (reviews queued; task 271 parked) | `-01-bugs-and-copy.md` | 265–271 (B1, B2, B3, B5, T1, T2, T3) | `Unit done: p3fix01` | PR 3 merged |
| [x] 02 (review queued: 272) | `-02-radio-and-callouts.md` | 272–273 (FR7–FR9, FR10–FR11) | `Unit done: p3fix02` | none (runs after 01 only to keep commits ordered) |
| [x] 03 (reviews queued: 275, 276, 277; ADR 0030 to accept) | `-03-touch.md` | 274–277 (FR1–FR6) | `Unit done: p3fix03` | none |
| [x] 04 (task 278 parked: did not reproduce) | `-04-intro-jerk.md` | 278 (B4) | `Unit done: p3fix04` | none; last, because it may only reproduce and park |
| [x] 05 (reviews queued: 279, 280, 285, 288) | `-05-review-findings.md` | 279–288 (B4 restart, T3, F1–F9) | `Unit done: p3fix05` | none (the user's rulings of 2026-11-10) |
| [x] 06 (review queued: 292; task 294 parked) | `-06-bot-noise-and-overlays.md` | 289–295 (bot noise, F1–F5) | `Unit done: p3fix06` | none |

Each phase stands alone, so if one parks, the others still run. Units run in this order: 01, 02, 03, 04.

## 4. Definition of Done (feature)

- Every task ticked, or parked with a line in `plans/2026-11-07-overnight.md`.
- `pnpm check` green on the branch tip, and `pnpm check:flaky 4` green for any new browser spec.
- `review/QUEUE-p3.md` lists every human review, with screenshots.
- The playtest-3 table (`playtests/2026-11-08-playtest-03.md`) still matches: a parked task's row says "parked" with the log line's date.
- `PROCESS_LOG.md` has one entry for the run, citing its commits. ADR 0030 is accepted (2026-11-10).

## 5. Coverage

| requirement | task |
| --- | --- |
| B1 wheel tabs at 1280×560 | 265 |
| B2 no bot line after the room ends | 266 |
| B3 edge pill faces the sender | 267 |
| B5 phone movement (triage) | 268 |
| T1 checkpoint label | 269 |
| T2 earplugs copy | 270 |
| T3 goal line for the sighted | 271 |
| FR7–FR9 radio counts from 1 | 272 |
| FR10–FR11 one direction, one nudge | 273 |
| FR2 no identity in the hand field | 274 |
| FR1, FR4 the link on Can't see's frame | 275 |
| FR3 grip and release sounds | 276 |
| FR5 nothing names the holder | 274 (the perception test), 275 (no HUD text) |
| FR6 "Space: hold hands" in reach | 277 |
| B4 the intro's jerk | 278 (parked), 279 (the restart path: fixed) |
| T3 goal line, in the phone's top bar | 280 |
| F1 the edge tap repeating forever | 281 |
| F3 / FR11 (changed) repeat nudges with backoff | 282 |
| F7 a bot Can't see held on long runs | 283 |
| F2 right-click side wheel off the frame | 284 |
| F5 the radio's own range of ticks | 285 |
| F6 a plated radio reading 10 | 286 |
| F4 the hold-hands chip follows the act hint; F8 the identity test's reach | 287 |
| F9 / FR4 a spectator following Can't see | 288 |
| Phase 06: a bot guide's noise at a person listening at a safe | 289 |
| Phase 06: the keep-alive reaching a person (F1); a nudge cutting off a digit (F4) | 290, 291 |
| Phase 06: alerts over their neighbours (F3); the phone bar growing mid-game (F2) | 292, 293 |
| Phase 06: the intro starting zoomed in under the HUD | 294 (parked: did not reproduce) |
| Phase 06: the reveal flake (F5) | 295 |

## 6. Risks

None open. Two things may legitimately end in a park, and that is an outcome, not a gap:
- B4 if the frames show no jerk
- B5 if the failure is only in the test harness
