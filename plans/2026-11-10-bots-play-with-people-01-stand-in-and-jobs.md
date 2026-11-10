# Bots and people: Phase 01, the stand-in person and jobs a person can do

- **Status:** Approved
- **Tier:** Architecture
- **Overview:** `plans/2026-11-10-bots-play-with-people-00-overview.md` (§1 rules, §4 types). Spec: `specs/2026-11-10-bots-play-with-people.md` BG1 and BJ1.

## What you'll see

- A new test file that plays every room with a scripted "person" in each seat. It starts with a list of the combinations that don't clear yet, and each entry says why.
- A person playing Can't hear is never again assigned the room 4 safe, the room 6 plated radio or the room 7 plated wires.

## Context (read this turn)

- `solveRoom(room, roles, budgetS = 600, opts: { humans?, uncoverWhenReached? })` is in `src/game/bots/solve.ts`. It builds `bots[seat] = { memory: createBotMemory(seat, humans, roles), inbox: [] }` for each non-human seat and calls `botsAct(...)` each tick. A human seat today gets **no** input at all, so it stands still.
- `botsAct` is in `src/game/bots/crew.ts`. Each bot calls `think(room, view, inbox, memory, now)`, which returns a `BotTurn { input, send }`. Sends go through `route(...)`, and each receiver's message is pushed to `bots[receiver]?.inbox`.
- `BotMemory.humans` (`brain.ts:70`) is passed into `claimJobs` through `queuesOf` (`brain.ts:651-669`). The guide's human-pace logic keys off `blindIsBot = !m.humans.has(b)`.
- `claimJobs(room, jobs, seats: SeatInfo[])` and the private `eligible(role, job)` are in `src/game/bots/jobs.ts` (about lines 355–457). `eligible` has no idea which signal a job needs. `SeatInfo = { seat, role, human, pos? }`. `JobTarget` kinds: `plate`, `flag`, `tile`, `exit`, `push`, `station` (`at?`, `hearing?`), `listen`, `watch` (`hearing?`), `take`, `give`, `sill`, `tow`, `keepsake`, `read`.
- `spec/rooms.test.ts` (68 lines) has `clearEveryRotation` and a `NOT_YET` map. Copy its assertions: cleared, within budget, `caught === 0`, every checkpoint set, `refused === 0`, no lever left on.
- What each station needs from a person comes from the survey in the spec's §3:
  - the dial needs a `stop` callout from blind
  - plated radio, wires and keypad, and the earpiece, need a single-digit text from blind
  - switches and bells need `x` marks
  - sync needs a "1" text or the count

## Tasks

### Task 296: The stand-in person (BG1 harness) — [ ]

- **Behaviour:** a stand-in seat is the bot brain with person limits. Its memory is built with **every stand-in seat included in `humans`**, so the bots and the stand-ins' own job claims treat it as a person.
  - It sees and acts only through its own role's view, as any bot does.
  - **Delay.** It acts on a received message (a callout, a text, a mark) only `STANDIN_DELAY_TICKS` (20 ticks, about 1 s) after it arrived. To do this, it holds its inbox in a delay queue before calling `think`.
  - **Sends only when asked.** It never sends a signal a bot convention expects (a `stop` callout at a safe, a digit text, an `x` mark, a sync count) unless a live ask for that kind targets it. That uses the `you.asks` field from Task 300: until phase 02 lands, the stand-in **never** sends those signals, which is a person who has never been told. Its directions to a blind bot (as a human Can't hear) are allowed: steering is the obvious use of the Talk page, and BJ3 adds the ask for it later. Write the list of suppressed signals as a named constant with one line per entry giving the reason, so later phases can see it.
  - **Delays its own key work too.** A press that reacts to a signal it received (entering the dial on "stop", pressing a marked button) waits for the same delay.
- **Files:** a new `src/game/bots/standin.ts` (`createStandIn`, `STANDIN_DELAY_TICKS`); `src/game/bots/solve.ts` (`opts.standIns`: those seats get `createStandIn` and are in `humans`); `crew.ts` only if the delay queue needs a hook. Keep `botsAct`'s signature.
- **Tests first (red), `src/game/bots/standin.test.ts`, with tick counts:**
  - a stand-in Can't see guided by a bot acts on a direction callout 20 ticks after it was sent, not at once
  - a stand-in Can't see at room 4's safe back, hearing the tumbler, sends no `stop` (no ask yet)
  - a stand-in never sends a digit text when it reads a plate (no ask yet)
- **Acceptance:** the tests pass. `solveRoom` with no `standIns` behaves exactly as before: `spec/rooms.test.ts` is green, with the same tick counts for two sample rooms (assert them).
- **Break check:** set the delay to 0 by script; the first test goes red.
- **Depends on:** none.

### Task 297: `spec/rooms-people.test.ts` and its known-failing list (BG1) — [ ]

- **Behaviour:** for every shipped room, every rotation, and each seat in turn as the single stand-in, `solveRoom(room, roles, budgetS, { standIns: new Set([seat]) })` must pass the same assertions as `spec/rooms.test.ts`. The test title names the room, the rotation and the stand-in's role.
- **First, measure:** run every combination on today's code. Each failure becomes a `NOT_YET` entry, keyed `"<room>|<rotation>|<role>"`. Each entry has its measured cause (not cleared after N s, caught N times, or stalled at job X) and the phase expected to fix it (02, 03 or 04), mapped from the spec's §3 table. Log the count.
- **Files:** a new `spec/rooms-people.test.ts`. Its own file, so it runs in parallel with `spec/rooms.test.ts`.
- **Acceptance:** the file is green, with the measured `NOT_YET` list as skips. Its run time is logged next to `spec/rooms.test.ts`'s. The room 4 safe with a stand-in Can't see **is** on the list, which confirms the harness reproduces the user's playtest.
- **Break check:** remove one entry by script; that combination goes red.
- **Depends on:** Task 296.

### Task 298: A person only gets jobs whose signals they can receive (BJ1) — [ ]

- **Behaviour:** `needs(job, room): Signal[]` names what a seat doing a job must **receive**:
  - a dial station, or a dial's `listen` job: the turner needs the listener's `callout`
  - a plated radio, wires or keypad, or an earpiece keypad: `text`
  - `watch` jobs' presses (switches, bells): `mark`
  - sync: `text` for whoever turns on a counted "1"
  - everything else: `none`

  Read the station's params as the decoders do (`o.params.type`, plated stations via the plate rules in `src/game/sim/braille.ts`). In `claimJobs`, a **human** seat gets a job only if `needs(job).every((s) => s === "none" || canReceive(role, s))`. Bots are unchanged, since a bot that can't receive a signal isn't eligible today either. Check that.
- **Files:** `src/game/bots/jobs.ts` (`needs`, and the human branch of `claimJobs`).
- **Tests first (red), `jobs.test.ts`:** for rooms 04, 06 and 07, in every rotation, with a human Can't hear seat, the human's queue holds no job whose `needs` includes `text` or `callout`. Also check, for each of those rooms, that some bot holds the job instead.
- **Acceptance:** the tests pass. `spec/rooms.test.ts` is green. The `NOT_YET` entries whose cause was "human Can't hear assigned an unreceivable job" are removed, if they now clear. Log any that still fail for another reason, and re-point them at the phase that handles that reason.
- **Break check:** drop the `needs` check by script; the jobs test goes red.
- **Depends on:** Task 297 (to update its list).

## Phase Definition of Done

Tasks 296–298 are ticked or parked, `pnpm check` is green, and the `NOT_YET` list is measured and logged. Then commit `Unit done: bp01`.

## Corrections log

(empty)
