# Escape-room heist: Phase 13 (bots and harness)

- **Status:** Approved
- **Part of:** `plans/2026-11-01-escape-room-heist-13-00-overview.md` (read it first: requirements, demo script, conventions, coverage).
  Depends on phase 12. Task numbers are global.
- **Commits:** one per task once `pnpm check` is green, ending with
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never push or deploy without the user's go-ahead.
- **Review mode:** build and commit as checks go green; `Human review:` items are reviewed together at the end of phase 13 (overview §5).

## Interfaces from earlier phases (exact)

From phase 01: `chimePlan` accepts `"clue"`, so a vent's `n` can exceed 3 (the bot decoder in `src/game/bots/decode.ts` must read it). From phase 03: room 7 has doors `D5`, `D6` that bots must path through. From phase 02, Task 43: room 7's wire plaques are a one-digit ink (`numbered`), and the `wires` decoder in `src/game/bots/decode.ts` reads it as the wire to cut (`b.answer = [Number(text) - 1]`); Task 48's room 7 cases run with that in place and must not re-add a rule-matching path for it.

## Tasks

### Task 48: Bots collaborate in rooms 5 to 8  [ ]  (demo 9)

The user saw bots wander after a hand-hold was released and ignore players. ADR 0018 stands: a bot acts only on what it perceives and what teammates send.

- **Red first (reproduce, do not guess):** `src/game/bots/brain.test.ts` cases built from the real room files, run for the three roles in rooms 5, 6, 7 and 8:
  (a) a sighted bot towed by a person for ten ticks, released, then reaches its next job's tile within a budget; (b) a Can't-see bot released stands still or walks to
  the station its teammate called out; (c) a bot answers a `callout` or `mark` aimed at it (a mark on a switch or a key is pressed by the deaf bot, `ignores a mark` is a red). Print the bot's chosen job each tick on failure
  so the cause (stale `led`, `known.holding` never cleared, a job waiting on gear a person holds) is read, not guessed. `brain.ts:288` and `:908` keep `led` while `view.you.hand` is set; check the first
  tick after release.
- **Green:** fix what the failures show, in `src/game/bots/brain.ts` (or `jobs.ts`/`decode.ts`), never by giving a bot the simulation's state. Add the missing decoder for any new station
  (the vent clue's count, the practice lever) in `decode.ts`. The wires decoder's digit reading is Task 43's, not this task's.
- **Done when:** new unit tests and `spec/rooms.test.ts` (bots clear every room in every rotation) pass.
  **Human review:** three tabs, rooms 5 to 8: hold a bot's hand, let go, it works; send it a mark, it answers.

### Task 49: Find the root cause of the flaky wheel and reveal specs  [ ]  (demo 10)

`PROCESS_LOG.md` records wheel cases passing 25/25 isolated but failing in the full run, and `spec/layout/reveal.test.ts` is flaky in
`pnpm check`. Both sit in `spec/layout/`, which runs at most 3 files at once (`maxWorkers`).

- **Reproduce first:** `pnpm check:flaky 6` on a fresh server; record which cases fail and how often in `PROCESS_LOG.md`. Then run each file alone, then
  with the other layout files, to separate a test-order cause from a load cause.
  Read each failure's message: `wheel.test.ts` shares one `table` for the file (`playRoom` in `beforeAll`), so a case that leaves the wheel open or a cooldown running
  would fail a later case; `reveal.test.ts` builds a lobby per case against the shared server's 40-lobby cap. Suspect those two before any timeout.
- **Green:** fix the cause: reset the shared table between cases, wait for the thing (`expect.poll`, not `waitForTimeout`), `settledHash` not `canvasHash`.
  Never raise a timeout. If the shape can be grepped, add it to `spec/flaky-patterns.test.ts`.
- **Done when:** `pnpm check:flaky 6` shows neither file failing in any run. Say plainly if it does not and what remains.

### Task 50: Harness: "break it and watch it go red"; radio backlog  [ ]

- **CLAUDE.md:** under "Corrections go into the harness" add a rule: every new test or spec that guards a promise is shown to fail first, by
  deliberately breaking the code it guards (reverting the line, flipping the flag, putting a layout back) and watching it go red, then restoring. The plan or
  commit says what was broken. A test that cannot be made to fail is deleted. Cites phase 12's Task 38 and Task 39 where it caught a vacuous test.
- **specs/backlog.md:** one dated line: radios are only "dial until the static clears"; needs a brainstorm for a real challenge (a hidden target, a clue held by a teammate, or a narrow drifting lock).
- **PROCESS_LOG.md:** log this review's corrections (the user's findings and the rulings above) in the file's format.
- **Done when:** `pnpm check` green (the CLAUDE.md edit is covered by `spec/` docs checks if any; grep first).

## Phase Definition of Done

- [ ] Tasks 48, 49 and 50 committed, \`pnpm check\` green, \`pnpm check:flaky 6\` run once with no wheel or reveal failure.
- [ ] Covers demo 9, 10 and the harness items.
