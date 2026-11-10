# Bots that play well with people: overview

- **Date:** 2026-11-10
- **Status:** Approved
- **Tier:** Architecture (phased set)
- **Spec:** `specs/2026-11-10-bots-play-with-people.md`, approved by the user on 2026-11-10. Read it first: BP, BT, BS, BJ and BG are its requirement ids, and its §3 holds the room-by-room survey.
- **ADR:** `doc/adr/0031-bots-play-at-a-persons-pace-and-teach-what-they-need.md`, accepted on 2026-11-10. ADR 0018 (bots are perception-only), ADR 0007 (perception) and ADR 0011 (channels) still bind.
- **Branch:** `auto/playtest-3`, in worktree `wt-p3`, **after p3fix06's `Unit done: p3fix06`**. Phase 06 changes `brain.ts` (the guide at the listen tile, the keep-alive and the quiet window), so build on its result.

## 1. Rules for every unit

The playtest-3 overview's §1 rules all apply (`plans/2026-11-10-playtest-3-fixes-00-overview.md`):
- test first
- break checks by script
- `pnpm check` green before each commit, against `pnpm start:check`
- one commit per task
- park instead of weakening a test
- queue human reviews in `review/QUEUE-p3.md` under `## Bots and people`

Two rules are added:
1. **The known-failing list.** Task 297 creates `spec/rooms-people.test.ts` with a `NOT_YET` map of the stand-in combinations that don't clear yet. Each entry gives the reason and the phase expected to fix it, the same pattern as `spec/rooms.test.ts`'s `NOT_YET`, which the user ruled on in 2026-10. A task that makes a combination clear **removes its entry in the same commit**. An entry is never added after Task 297, except by a later task that writes down why its measurement found a new failure. The list must be empty at the feature's Definition of Done.
2. **The all-bot runs never go red.** `spec/rooms.test.ts` must clear every room in every rotation after every task. Stricter signal handling (BS1) is the likeliest way to break it. If it can't be kept green, park the task.

## 2. Requirements

The spec is the source; here are the requirements in one line each:
- **BP1:** person pace where a bot waits on a person (the safe at about 2 s a notch with about 1 s of late credit; the sync count; anything else the audit finds).
- **BP2:** a late Stop counts only after the ask, at the spot.
- **BT1:** an ask (what is needed, and how to send it) goes to one person, in a form they receive.
- **BT2:** a chip on the asking bot for the person asked. It says what to do and how, never game information.
- **BT3:** re-asks at 8 s, 16 s, then every 30 s while there is no progress. Progress is measured on the station. The re-ask holds while the person is at the spot, and never comes within 2 s of a perceived message. Marks are re-sent the same way.
- **BS1:** a digit or word counts only from the asked seat, after the ask, and since the last send-back.
- **BS2:** the bot acts 2 s after the last digit, and the ask states the order.
- **BS3:** digits two people text each other never feed a bot's station.
- **BJ1:** a person is assigned only jobs whose signals they can receive.
- **BJ2:** a bot takes over a person's job after about 60 s with no progress.
- **BJ3:** the Can't see bot asks to be steered.
- **BG1:** the stand-in person in the rooms spec: one stand-in with two bots (every seat and rotation), and two stand-ins with one bot (the bot in each seat, one rotation).

Non-functional requirements: the spec's §2.2 (perception-only, no new channel, chips carry no information, test time, accessibility). Out of scope: the spec's §2.3 (voice, softer penalties, new wheel options, phase 06's fixes, and turn-taking unless the user says yes).

## 3. Shared conventions and commands

- These are the same as the playtest-3 overview's §2. Bot unit tests use tick counts and no clock: 50 ms ticks (`TICK_MS`, `src/game/sim/world.ts`).
- `pnpm vitest run spec/rooms.test.ts spec/rooms-people.test.ts` after every bot change.
- Time each of those two files with `--reporter=json` when a task adds runs, and log the numbers. If `rooms-people` becomes the slowest file in `pnpm check`, split it by room (CLAUDE.md "Tests").

## 4. Shared types (the cross-phase contract)

These are produced in phase 01 and phase 02 and copied verbatim into later phases' "Interfaces" lists.

```ts
// src/game/bots/solve.ts (Task 296): the stand-in seats, alongside opts.humans
export function solveRoom(room: Room, roles: readonly [Role, Role, Role], budgetS?: number,
  opts?: { humans?: ReadonlySet<Seat>; standIns?: ReadonlySet<Seat>; uncoverWhenReached?: true | number }): SolveResult;

// src/game/bots/standin.ts (Task 296)
export const STANDIN_DELAY_TICKS = 20; // about 1 s: how late a person reacts
export function createStandIn(seat: Seat, humans: ReadonlySet<Seat>, roles: readonly [Role, Role, Role]): BotSeat;

// src/game/bots/jobs.ts (Task 298)
export type Signal = "callout" | "text" | "mark" | "none";
export function needs(job: Job, room: Room): Signal[]; // the signals a seat doing this job must receive

// src/game/asks.ts (Task 299): pure and shared by server, bots and client
export type AskKind = "stop-on-click" | "read-plate" | "plate-first" | "steer-me" | "press-marked" | "strike-marked" | "count-turn" | "taking-over";
export interface Ask { kind: AskKind; from: Seat; to: Seat; station?: string }
export const ASK_COPY: Record<AskKind, { say: string; chip: string }>; // fixed copy: never game information
export const REASK_MS: readonly [8000, 16000, 30000];
export const ASK_QUIET_MS = 2000;
export interface AskClock { firstAt: number; lastAt: number; count: number; progressAt: number }
export function reaskDue(c: AskClock, now: number, lastHeardAt: number, atSpot: boolean): boolean;

// src/game/bots/brain.ts (Task 299)
export interface BotTurn { input: PlayerInput; send: Outgoing | null; ask?: Ask | null }

// src/game/perception.ts (Task 300): the asked seat's own view only
//   RoleView.you.asks?: { from: Seat; kind: AskKind; saidAt: number }[]  (Task 300 adds from/kind; Task 301 adds saidAt)
```

## 5. Phase map

| phase | file | tasks | ends with | depends on |
| --- | --- | --- | --- | --- |
| [x] 01 | `-01-stand-in-and-jobs.md` | 296–298 (BG1 harness and known-failing list, BJ1) | `Unit done: bp01` | p3fix06 done |
| [x] 02 (reviews queued) | `-02-asks.md` | 299–301 (BT1–BT3, the chip, spoken asks) | `Unit done: bp02` | 01 |
| [x] 03 (review queued; 35 NOT_YET entries still undiagnosed, see the overnight log) | `-03-signals-and-pace.md` | 302–304 (BS1–BS3, BP1–BP2, each station's ask, BJ3) | `Unit done: bp03` | 02 |
| [x] 04 (task 306 parked in part: NOT_YET has 29 one-person and 18 two-person entries, see the overnight log bp04/306; reviews queued) | `-04-takeover-and-two-people.md` | 305–306 (BJ2, the two-stand-in runs, empty `NOT_YET`, docs) | `Unit done: bp04` | 03 |
| [x] 05 (task 308 parked, NOT_YET 19 and NOT_YET_TWO 15 remain with diagnosed causes; reviews queued) | `-05-tow-first-and-gear.md` | 307-311 (tow a Can't-see person, room 7 gear by role, empty NOT_YET, a fair takeover clock, asks and callouts for Can't see) | `Unit done: bp05` | 04 |

## 6. Definition of Done (feature)

- Tasks 296–311 are ticked, or parked with a line under `## bots-people` in `plans/2026-11-07-overnight.md`. (After phase 05: 308 is parked; `NOT_YET` has 19 one-person and 15 two-person entries, each with a diagnosed cause; the spec stays `Approved`.)
- `pnpm check` is green. `spec/rooms-people.test.ts` has an **empty** `NOT_YET`. `spec/rooms.test.ts` is green in every rotation.
- Every human review is queued under `## Bots and people` in `review/QUEUE-p3.md`.
- CLAUDE.md's Rooms invariant names the new rule: a station a person may work needs an ask, and the stand-in must clear it. DESIGN.md describes the ask chip.

## 7. Coverage

| requirement | task(s) |
| --- | --- |
| BG1 one stand-in with two bots | 296, 297 |
| BG1 two stand-ins with one bot | 306 |
| BJ1 | 298 |
| BT1, BT3 (clock) | 299 |
| BT1 delivery, BT2 | 300, 301 |
| BS1–BS3 | 302 |
| BP1–BP2 | 303 |
| BT1 per station, BT3 marks re-sent, BJ3 | 304 |
| BJ2 | 305 |

## 8. Risks

None open. Two hazards were accepted when the user approved the design:
- **The stand-in is a proxy for a person, not a person.** It is the bot brain with person limits: a 1 s delay, and it sends only what an ask requested. Phase 04 asks for a real playtest to check it.
- **Stricter signal handling may break the all-bot clears.** That is guarded by overview §1 rule 2.
