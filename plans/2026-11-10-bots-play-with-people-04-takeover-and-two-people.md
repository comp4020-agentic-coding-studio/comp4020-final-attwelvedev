# Bots and people: Phase 04, takeover, two people with one bot, and the guard is complete

- **Status:** Approved
- **Tier:** Architecture
- **Overview:** `plans/2026-11-10-bots-play-with-people-00-overview.md` (§1 rules, §4 types). Spec: BJ2, and BG1 for two people.

## What you'll see

- If a person ignores a job they own, the asks repeat. After about 60 s with no progress, a bot that can do it takes over and says so.
- Two people with one bot can clear every room. Bot asks go to the right person, and the people's own texts don't confuse the bot.
- The stand-in test's known-failing list is empty.

## Interfaces from earlier phases (exact)

```ts
export function solveRoom(room: Room, roles: readonly [Role, Role, Role], budgetS?: number,
  opts?: { humans?: ReadonlySet<Seat>; standIns?: ReadonlySet<Seat>; uncoverWhenReached?: true | number }): SolveResult;
export function createStandIn(seat: Seat, humans: ReadonlySet<Seat>, roles: readonly [Role, Role, Role]): BotSeat;
export type Signal = "callout" | "text" | "mark" | "none";
export function needs(job: Job, room: Room): Signal[];
export type AskKind = "stop-on-click" | "read-plate" | "plate-first" | "steer-me" | "press-marked" | "strike-marked" | "count-turn" | "taking-over";
export interface Ask { kind: AskKind; from: Seat; to: Seat; station?: string }
export const ASK_COPY: Record<AskKind, { say: string; chip: string }>;
export interface AskClock { firstAt: number; lastAt: number; count: number; progressAt: number }
//   brain.ts: askFor(m, kind, to, station, now, atSpot, progressed): Ask | null  (memory: m.asks)
//   RoleView.you.asks?: { from: Seat; kind: AskKind; saidAt: number }[]
```

## Context (read this turn)

- **Claims are cached:** `queuesOf` (`brain.ts` about 651–669) caches `claimJobs` once per room in `m.queues`. Every bot computes the same split from the same inputs, which is how they agree without talking.
- **The only give-up today** is for caches: `CACHE_GIVE_UP_TICKS = 1200` (`brain.ts:157`), in `giveUpCaches` (about 585–598), via `m.cacheGaveUp`. Use it as the model.
- **`isDone(...)` and `isOpen(job, known)`** are in `jobs.ts`. Use them for "no progress": the job isn't done, and the station's belief hasn't changed.
- **Today's `spec/rooms-people.test.ts`** (Task 297) runs single stand-ins.

## Tasks

### Task 305: A bot takes over a person's idle job (BJ2) — [x]

- **Behaviour:** each bot tracks, for each job a **person** owns (from `m.queues`), when it was first asked for (the ask clock's `firstAt`, or when the job became current) and the last progress (the same progress signal as Task 304).
  - **Takeover:** after `TAKEOVER_TICKS = 1200` (60 s) with no progress, the job is re-claimed **deterministically**: the eligible bot with the lowest seat, using `eligible` and `needs` for bots. Every bot computes the same answer from what it perceives. If they could disagree, because one bot hasn't seen the station, log it and make the rule depend only on shared events (the ask's `firstAt` is the bot's own; prefer the job becoming current, which every bot computes the same).
  - **Saying so:** the new owner says so once, with a new `AskKind`-like notice `"taking-over"`: copy "I'll do this one." on the same delivery path. If one person is asked, it goes to that person.
  - **No eligible bot:** the asks just continue.
  - **The person comes back:** a takeover isn't undone if the person starts later. The bot finishes it, and the person's progress still counts as station progress.
- **Files:** `src/game/bots/brain.ts`; `src/game/asks.ts` (the `taking-over` copy; the kind is already in overview §4. Phase 02 defines `ASK_COPY` for it as a placeholder, which this task fills in).
- **Tests first (red), `brain.test.ts`:**
  - a person who owns room 6's switches and never moves: after 60 s a bot claims it, the takeover notice goes to that person, and the room's station is then solved
  - a person who makes progress at 50 s resets the clock
- **Acceptance:** the tests pass, `spec/rooms.test.ts` is green, and remove the `NOT_YET` entries this clears.
- **Break check:** set `TAKEOVER_TICKS` to infinity by script; the test goes red.
- **Depends on:** phase 03.

### Task 306: Two people with one bot; the guard complete; docs (BG1) — [ ]

- **Behaviour:** `spec/rooms-people.test.ts` adds two stand-ins with one bot. The bot is in each seat in turn, in one rotation (`rolesFor(0)`). The assertions are the same.
  - Add a unit test that two stand-ins' digit texts to each other don't feed the bot (BS3). This is already guarded by Task 302; this run checks it in context.
  - **Measure first.** Each failure is fixed if it's in this feature's scope (asks routing to the right person, progress counted on the station), or else parked with a logged reason.
  - **Finish the guard:** every `NOT_YET` entry is gone.
  - **Docs:**
    - CLAUDE.md "Rooms" gains one line: a station type a person may work needs an ask kind, and `spec/rooms-people.test.ts` must clear it.
    - DESIGN.md has the ask chip (from Task 301): check that it's current.
    - The spec's status becomes `Built`.
- **Files:** `spec/rooms-people.test.ts`, CLAUDE.md, DESIGN.md, and any fix in `brain.ts` or `decode.ts`.
- **Acceptance:**
  - `NOT_YET` is empty, and `pnpm check` is green
  - both rooms files' times are logged; split `rooms-people` by room if it's the slowest file

  **Human review:** a real playtest of rooms 4, 6 and 8 with you and two bots, and with two people and one bot. The stand-in is a proxy; this is the check.
- **Break check:** by script, make the bot's ask go to both people; a two-person run goes red, or the perception test from Task 300 does.
- **Depends on:** Task 305.

## Phase Definition of Done

Tasks 305–306 are ticked or parked, `pnpm check` is green, `NOT_YET` is empty, and human reviews are queued. Then commit `Unit done: bp04`.

## Corrections log

(empty)
