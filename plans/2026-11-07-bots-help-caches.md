# Bots help work a cache once people uncover it

- **Date:** 2026-11-07
- **Status:** Built overnight 2026-11-07; human reviews queued
- **Requirements confirmed by user:** yes, 2026-11-07 (`specs/2026-11-07-bots-help-caches.md`, approved in
  the brainstorm). Two rulings were given in planning on the same day (§2.4).
- **Tier:** Architecture (ADR 0024, proposed).
- **Comes after:** `plans/2026-11-05-blind-purpose-*` (its open Tasks 76 to 80 and 82). Task numbers
  continue from 82.

## 1. Summary

Today bots never work a cache (caches FR8, ADR 0020). A person playing with two bots therefore cannot
finish a cache that needs two seats at once. Room 4's dial is the example: one seat listens at the
back with the stethoscope, the other turns the dial.

This plan lets bots help once a person has uncovered the cache:
- A room's hint jobs may name a cache, but only on jobs marked `"cache"`.
- On the tick a bot perceives the uncover, it parks its beat job, works the cache, then goes back.
- A bot owner walks into the vault and takes its own keepsake.
- Bots still never uncover a cache.
- Rooms 4 to 9 each get a set of cache jobs, proven by a headless run in which the harness opens the
  chamber the way a person would.

## 2. Requirements

### 2.1 Functional requirements

From the spec, `specs/2026-11-07-bots-help-caches.md`:

1. **FR1** Uncovering stays human. No bot job leads a bot to Act on a cache's motif tile, and a crew of
   only bots opens no cache. The existing all-bot clear in `spec/caches.test.ts` ("bots that ignore
   every cache") keeps passing unchanged.
2. **FR2** A hint job may carry `"cache": "<station id>"`. Only such a job may:
   - name a cache's station (`station`, `listen`, `watch`)
   - have a tile inside a chamber
   - be a `keepsake` job

   `cache` must name a cache. A cache job is active only while that cache is uncovered and not yet
   done.
3. **FR3** On perceiving an uncover, a bot leaves its beat job for its cache jobs, and returns to the
   beat job when they are done. A send-back that shuts the chamber ends its cache jobs and returns it
   to the beat. A send-back that keeps the chamber open lets them carry on.
4. **FR4** A bot works a cache with its type's existing decoder, from what it perceives and what
   teammates send. A jam is waited out (this is already in `press`).
5. **FR5** A `keepsake` job sends the owner seat's bot to the vault's item tile once the vault is open,
   and Acts there. It goes only to the owner seat, and only when that seat is a bot.
6. **FR6** Cache jobs are shared by `claimJobs`' existing rules: humans first, then `prefer`, then
   fewest jobs. Its `eligible` rules apply, so Can't hear never listens.
7. **FR7** Rooms 4 to 9 carry cache jobs that let three bots, in every rotation of roles, solve the
   cache and take the keepsake once it is uncovered. The room must still clear within its budget, with
   no catches.

### 2.2 Non-functional requirements

- No new sound, view field or socket message. Bots read only `RoleView` and their inbox (ADR 0018).
  `src/layering.test.ts` must stay green.
- The new headless proofs go in a new file, `spec/bots-caches.test.ts`: 6 rooms × 3 rotations. They
  must not go into `spec/rooms.test.ts` or `spec/caches.test.ts`, which are already slow.
- Every new test that guards a promise is shown red first, by breaking its code on purpose through a
  script that asserts the text it replaces. The commit says what was broken.

### 2.3 Out of scope

- Bots uncovering a cache.
- ADR 0021's reveals: this plan works against today's motif-tile uncover, by the user's ruling (§2.4).
- Bots asking people for help.
- Any change to a cache's riddle, chamber, reward or credits.

### 2.4 Assumptions

Resolved with the user on 2026-11-07, in planning:

- **Uncovering stays the motif tile.** ADR 0021 (reveals) is accepted but not built. B is planned
  against today's code. When ADR 0021 is built, its plan changes the harness helper (Task 85) and adds a
  guard that a bot never completes a reveal by chance.
- **The proof is three bots plus the harness.** The spec's "one person scripted to uncover and nothing
  else" cannot work. `claimJobs` gives people their beat jobs first, so a do-nothing person stalls the
  room. Instead, the harness performs the uncover (the same world change `uncover()` makes) on the first
  tick any seat stands in the beat the chamber hangs off. To the bots this is the same `cacheEvent` and
  re-sent map a person's uncover gives. People-first claiming of cache jobs is proven by a unit test of
  `claimJobs` instead.

## 3. Existing code context (verified 2026-11-07)

- **`src/game/bots/jobs.ts`:**
  - `export type JobTarget = | { kind: "plate"; ... } | { kind: "station"; id: string; at?: Vec; hearing?: true } | { kind: "listen"; station: string; tile: Vec } | { kind: "watch"; station: string; tile: Vec; read?: Vec; hearing?: true } | { kind: "take"; gear: string } | { kind: "give"; gear: string; to: Role } | { kind: "tow"; role: Role; to: Vec } | ...`
  - `export interface Job { index: number; beat: number; target: JobTarget; prefer?: Role; until?: string; after?: string; all: boolean; }`
  - `export function parseJob(room: Room, j: unknown, index: number): Job | string`. Two FR8 checks sit at
    the top: a job tile inside a chamber gives "...inside the chamber of cache X: bots never go in", and
    `station`/`listen`/`watch` on a cache gives "...which is a cache: bots never work a cache".
  - `export function hintsOf(room: Room): Job[]` (drops strings)
  - `export function claimJobs(room: Room, jobs: Job[], seats: SeatInfo[]): Record<Seat, Job[]>`: per
    beat, humans then bots. `eligible(role, job)` bars Can't hear from `listen`/`hearing` jobs and Can't
    see from `SIGHTED_ONLY`.
  - `export function isDone(room, job, known, at, seat?): boolean`, a switch on `job.target.kind`
  - `export function jobTile(room: Room, job: Job, seat: Seat): Vec`
  - `Known { stations; gear; holding; roles?; doorOpen; pressed; crates; checkpoint; seq; seenHazards; clues; read? }`
- **`src/game/bots/brain.ts`:**
  - `BotMemory` has `ptr: [number, number, number]` (each seat's place in its queue) and
    `queues: Record<Seat, Job[]> | null`
  - `queuesOf(room, m, own)` memoises `claimJobs(room, hintsOf(room), seats)`
  - `goalFor(...)` advances `m.ptr[seat]` past done jobs and returns `{ goal, job }`
  - `press`, `workSend` and others read `queuesOf(...)[m.seat][m.ptr[m.seat]]` as the current job (five
    places: lines ~1027, 1083, 1116, 1336 and `goalFor`)
  - `workGoal` and `pressFor` switch on the target kind
  - `observe(room, view, inbox, m)` updates `Known` from `view.entities`
  - `thinkSighted` treats a position jump over 1.5 tiles as a send-back, and wipes stale station beliefs
  - Can't see's `thinkBlind` calls `stop` on a `tumbler` while holding the stethoscope
- **The view:**
  - `RoleView.cacheEvent?: { result: "uncover" | "solved" | "taken"; at: Vec; owner: Seat; item?: ItemId }`
    goes to every role in the tick of the event
  - `RoleView.cache` (the owner's own) has `state: "hidden" | "open" | "vault" | "taken"`
  - a closed secret door is absent from `entities` (`secretClosed`), and an open one is a `door` entity
    with `secret: true`
  - a solved cache's item stands as a `keepsake` entity for the sighted
- **The sim:**
  - `uncover(world, tile, seat)` is private in `src/game/sim/stations.ts`. It pushes the id to
    `world.cacheUncovered`, calls `syncCacheDoors(world)` (exported from `src/game/sim/cache.ts`) and
    pushes `{ kind: "cache", id, result: "uncover", seat, at }`.
  - `takeKeepsake(world, seat)` needs the owner on `chamber.vault.item` with an Act.
  - `sendBack` restores `cacheUncovered`, `cacheBy` and `cacheTaken` from the checkpoint snapshot.
- **`src/game/bots/solve.ts`:** `solveRoom(room, roles, budgetS = 600, humans = new Set())` returns
  `SolveResult { world; cleared; ticks; caught; refused; messages; sentBy }`. It loops `botsAct`, then
  `step`.
- **`src/game/rooms/format.ts`:** `cacheOf(o): CacheSpec | null`, `inRect(r, t)`, `secretDoors(room)`.
  `CacheSpec { owner; motif; riddle; item; tiles; chamber: { rect; door; vault: { rect; door; item } } }`.
- **The caches:**

  | Room | Cache | Type | Owner seat |
  | --- | --- | --- | --- |
  | 04 | Q3 | dial | 1 |
  | 05 | Q4 | keypad (clue c1) | 2 |
  | 06 | Q5 | switches | 3 |
  | 07 | Q7 | wires (numbered) | 1 |
  | 08 | Q4 | bells | 2 |
  | 09 | Q8 | dial | 3 |

- **Tests:**
  - `src/game/bots/jobs.test.ts` §"a job that names a cache (phase 14, Task 53)" pins both FR8 errors.
    Its expectations change in Task 83.
  - `spec/caches.test.ts` "the whole heist with bots that ignore every cache (Task 59)".
  - Commands: `pnpm vitest run <file>`, `pnpm lint:rooms`, `pnpm check` (needs `pnpm start:check`
    running).

## 4. Approach

**Two queues in one.** `claimJobs` puts cache jobs in the same per-seat queue, sorted after the beat's
jobs (they carry the chamber's beat). The brain then treats them specially:
- A cache job is **skipped** while its cache is not perceived as uncovered.
- While one is **active** and not done, it is **taken first**, before the job at `m.ptr`.

The plan does this with one helper, `currentJob(room, m, known, own, seat): Job | null`. It returns the
first active, not-done cache job, else the queue's job at `ptr` (skipping cache jobs). All five readers
of `queue[m.ptr[...]]` call it, so "parking" the beat job needs no state: when the cache jobs end, the
job at `ptr` is current again.

**What a bot knows of a cache.** This is perceived, never read from the simulation:
- **uncovered**: a `cacheEvent` with `result: "uncover"` for that cache was seen, or a `door` entity
  with `secret: true` at the chamber's door tile is open
- **solved**: `known.stations[id].solved`, or a `cacheEvent` `solved`
- **taken**: a `cacheEvent` `taken`

A send-back (the jump `thinkSighted` already detects; for Can't see, the same 1.5-tile test on
`view.you.pos`) clears the perceived uncover. The bot re-learns it from the chamber door it sees, or
from what the owner's view says (`view.cache?.state`, owner only). A bot that can neither see the door
nor own the cache returns to its beat after a send-back. That is acceptable: a person re-opens it, and
the next `uncover` event brings the bot back.

`cacheEvent.at` for an uncover is the chamber door's centre, so the bot maps the event to a cache by the
chamber door tile, using `secretDoors(room)`.

Considered and rejected: a second queue in `BotMemory` with explicit park and resume state. It is more
state to keep in step across send-backs, for no behaviour `currentJob` lacks.

## 5. Task breakdown

### Task 83: Cache jobs parse, lint and claim (FR2, FR5 parse, FR6) ✅

- **Description:**
  - `Job` gains `cache?: string`.
  - `JobTarget` gains `| { kind: "keepsake"; cache: string; tile: Vec }`, where `tile` is the vault's
    item tile, from `CacheSpec.chamber.vault.item`.
  - `parseJob`:
    - reads `j.cache` and rejects it unless it names an object for which `cacheOf` is non-null ("hint
      job N names cache X, which is not a cache")
    - lets a job carrying `cache` pass the two FR8 checks. Their messages gain ": only a cache job may"
      so a room author knows the fix.
    - parses `"keepsake": "<id>"` (must be a cache, and the job must carry `cache` equal to it)
  - `isDone` gains `keepsake`: done when `known.cachesTaken?.[cache] === true`.
  - `jobTile` gains `keepsake`, which returns `target.tile`.
  - `eligible`: a keepsake job is never offered to a human.
  - `claimJobs`: a keepsake job goes only to the owner seat (`cacheOf(...).owner - 1`), and only if that
    seat is a bot. Otherwise it is dropped from every queue.
  - `Known` gains `cachesOpen?: Record<string, true>` and `cachesTaken?: Record<string, true>`.
  - `lint.ts` already reports `parseJob`'s strings, so no change there.
- **Files touched:** `src/game/bots/jobs.ts`, `src/game/bots/jobs.test.ts`.
- **Tests first (red)**, in `jobs.test.ts` §"a job that names a cache":
  - "a cache job may work the cache and stand in its chamber"
  - "a job without `cache` still may not" (the two old cases, kept)
  - "`cache` naming a non-cache is an error"
  - "a keepsake job goes to the owner seat's bot, and to nobody when the owner is a person"
  - "a person chooses a cache job before a bot" (claimJobs with `human: true` on one seat)
  - "Can't hear is never given a cache `listen`"
- **Implementation (green):** as described.
- **Acceptance criteria:**
  - The six tests pass.
  - `pnpm lint:rooms` is green (no room has cache jobs yet).
  - `spec/rooms.test.ts` is unchanged and green.
- **Break check:** delete the `cache` exemption from the station-name check (a script asserting the
  line), watch "may work the cache" go red, then restore.
- **Depends on:** none.

### Task 84: Bots perceive a cache's state and take cache jobs first (FR1, FR3, FR4, FR5) ✅

- **Description:** in `brain.ts`:
  - `observe` records `known.cachesOpen` and `known.cachesTaken` from `view.cacheEvent` (mapping `at`
    to a cache by its chamber door tile), from secret `door` entities seen open, and from the owner's
    `view.cache.state`.
  - On a send-back jump (sighted and blind paths), `cachesOpen` is cleared, and stays clear unless
    re-perceived.
  - A new `currentJob(room, m, known, own, seat): Job | null` returns:
    - the first job in the seat's queue with `cache` set, `known.cachesOpen[cache]`, not done and not
      `taken`
    - else the job at `m.ptr[seat]`, with `ptr` advanced past cache jobs, as `goalFor` advances past
      done jobs
  - `goalFor`, `press`, `workSend` and the two other readers of `queue[m.ptr[...]]` use `currentJob`.
  - `workGoal` gains `keepsake`: the tile once `known.stations[cache].solved` and the vault door is
    believed open, else null.
  - `pressFor` gains `keepsake`, which returns `"act"`.
- **Files touched:** `src/game/bots/brain.ts`, `src/game/bots/brain.test.ts`.
- **Tests first (red)**, in `brain.test.ts`, in a new `describe("cache jobs (ADR 0024)")` on a small
  fixture room (a dial cache built with `withChamber(grid, x?)` from `src/game/sim/testing.ts`, as
  `src/game/parity.test.ts`'s `cacheWorld` does):
  - "a bot ignores its cache job until it perceives the uncover"
  - "on the uncover event it leaves its beat job for the cache job, and returns after the solve"
  - "a send-back that shuts the chamber returns it to its beat job"
  - "a bot owner Acts on the keepsake once the vault is open; a bot that is not the owner never steps
    on the item tile"
  - "a bot never Acts on a motif tile" (FR1): run room 4 with three bots for its budget and assert no
    `cache` `uncover` event
- **Implementation (green):** as described. No sim or view change.
- **Acceptance criteria:**
  - The five tests pass.
  - `src/layering.test.ts` is green.
  - `spec/rooms.test.ts` and `spec/caches.test.ts` are green and no slower than before (measured with
    `--reporter=json`).
- **Break check:** make `currentJob` ignore `cachesOpen` (always skip cache jobs), watch "leaves its
  beat job" go red, then restore.
- **Depends on:** Task 83.

### Task 85: Room 4's cache jobs, proven headless (FR7 room 4) ✅ (review queued)

- **Description:**
  - **Harness.** `solveRoom`'s fourth parameter (`humans`, which no caller passes today: checked in
    `spec/rooms.test.ts`, `spec/caches.test.ts` and `src/game/bots/solve.test.ts`) becomes
    `opts: { humans?: ReadonlySet<Seat>; uncoverWhenReached?: true } = {}`. When
    `uncoverWhenReached` is set, on the first tick any player's tile x lies in the x range of the
    beat whose range holds the chamber's door, the harness performs the uncover: it pushes the id to
    `world.cacheUncovered`, calls `syncCacheDoors(world)`, and pushes the same `cache` `uncover` event
    `uncover()` pushes, with the nearest seat. To do this without copying `uncover()`, export a
    `forceUncover(world, id, seat)` from `src/game/sim/stations.ts`, used by `uncover()` itself.
  - **Room.** `rooms/04-the-safe.room` gains cache jobs for Q3: `take` of g1 if the stethoscope is not
    already with Can't see, a `tow` of blind into the chamber to the back `[24,7]`, a `listen` at
    `[24,7]` for blind, a `station` Q3 for mute or deaf (whoever can see the dial), and a `keepsake` for
    Q3. Each carries `"cache": "Q3"` and the beat of the chamber's door.
- **Files touched:** `src/game/bots/solve.ts`, `src/game/sim/stations.ts`, `rooms/04-the-safe.room`,
  `spec/bots-caches.test.ts` (new).
- **Tests first (red):** `spec/bots-caches.test.ts`, "04-the-safe with <roles> (seats 1-3): bots solve
  the uncovered cache and the owner takes the keepsake". For each of the 3 rotations it asserts:
  - `cleared`, within `budgetS`, with `caught === 0`
  - `world.cacheBy.Q3 !== undefined`
  - `world.cacheTaken.Q3 === owner`

  It is red before the room has its jobs.
- **Implementation (green):** the room's jobs, plus the harness option.
- **Acceptance criteria:**
  - The three cases pass.
  - `pnpm lint:rooms`, `spec/rooms.test.ts` and `src/game/rooms/ids.test.ts` are green, and the id
    snapshot is unchanged (only hints change).
  - The all-bot heist in `spec/caches.test.ts` still shows no cache opened.
- **Break check:** remove the room's `listen` job (a script asserting it), watch the case go red (not
  solved), then restore. The commit says so.
- **Human review:** on a local build (`pnpm build && pnpm start`), play room 4 as Can't hear with two
  bots. Uncover the cache and watch:
  - the bots go in
  - the bot Can't see listens at the back
  - the dial gets entered on its "stop"
  - the vault opens

  A pass is a cache solved without you touching the dial. Then play it as Can't speak: you turn, the bot
  listens.
- **Depends on:** Task 84.

### Task 86: Rooms 5 to 9's cache jobs (FR7) ✅

- **Description:** cache jobs for 05 Q4 (keypad), 06 Q5 (switches), 07 Q7 (numbered wires), 08 Q4
  (bells) and 09 Q8 (dial), written from each room's existing beat jobs for the same station type. They
  follow the pattern of the room's main station of that type: who reads, who listens, who presses.
  `spec/bots-caches.test.ts` grows a row per room. Each room is done one at a time: add its row and see
  it red, add its jobs and see it green, run `pnpm lint:rooms`, `spec/rooms.test.ts` for that room, and
  `ids.test.ts`.
- **Files touched:** `rooms/05-the-gallery.room`, `rooms/06-lights-out.room`,
  `rooms/07-night-shift.room`, `rooms/08-music-room.room`, `rooms/09-the-vault.room`,
  `spec/bots-caches.test.ts`.
- **Tests first (red):** the per-room cases, as in Task 85.
- **Acceptance criteria:**
  - All 18 cases in `spec/bots-caches.test.ts` pass.
  - The full `spec/rooms.test.ts` and `spec/caches.test.ts` pass.
  - Id snapshots are unchanged.
  - The file's time, measured per file, is reported in the commit.
  - If a room cannot be solved by bots for a reason in the room's design (a clue only a role the bots
    cannot use perceives), stop and ask. Don't edit the room's layout.
- **Break check:** for one room, remove one job and watch its case go red.
- **Depends on:** Task 85.

### Task 87: Docs, ADR status, backlog and check ✅ (review queued)

- **Description:**
  - `PROCESS_LOG.md`: an entry for the rulings in §2.4 (the harness proof, and planning against today's
    uncover).
  - The caches spec's FR8 gets a one-line pointer: "Superseded for working a cache by
    `specs/2026-11-07-bots-help-caches.md`".
  - CLAUDE.md "Rooms" gains: "A cache's bot jobs carry `"cache"`; prove them in
    `spec/bots-caches.test.ts`."
  - The backlog's 2026-11-05 Parked line is removed (its Decided line already points here).
  - `pnpm check` is green, then commit, including the spec, ADR 0024, and the backlog and
    `PROCESS_LOG.md` changes from the brainstorm.
  - ADR 0024 stays `proposed` until the user accepts it. On acceptance, ADR 0020's status gains "its
    bots clause superseded by 0024".
- **Files touched:** `PROCESS_LOG.md`, `specs/2026-11-02-escape-room-caches.md`, `CLAUDE.md`,
  `specs/backlog.md`, `doc/adr/0024-…md`, `doc/adr/0020-…md` (status only, on acceptance).
- **Acceptance criteria:** `pnpm check` is green, and `pnpm check:evidence` passes once commits are cited.
- **Human review:** the user accepts ADR 0024.
- **Depends on:** Task 86.

## 6. Definition of Done

- [x] Tasks 83 to 87 ticked.
- [x] The Task 85 Human review was played and accepted by the user (2026-11-11).
- [x] `pnpm check` is green.
- [x] ADR 0024 accepted, and 0020's status updated (2026-11-11).

## 7. Coverage

| Requirement | Tasks |
| --- | --- |
| FR1 | 84 (no motif Act), 85 and 86 (the all-bot heist unchanged) |
| FR2 | 83 |
| FR3 | 84 |
| FR4 | 84, 85, 86 |
| FR5 | 83, 84, 85 |
| FR6 | 83 |
| FR7 | 85, 86 |
| NFRs | 84 (layering), 85 and 86 (new file, timing), every task's break check |

## 8. Risks and open questions

None open. Known risks, accepted:
- A bot that cannot see the chamber door and does not own the cache forgets it after a send-back until
  the next uncover (§4).
- If ADR 0021 is built later, Task 85's harness helper and FR1's guard need updating (§2.4).

## 9. Corrections log

<!-- one line per user redirect during execution -->
