# Review fixes A: bots, lints and the door ring

- **Date:** 2026-11-07
- **Status:** Draft (not yet approved to run)
- **Requirements confirmed by user:** no. They come from three cold, read-only code reviews of the units
  bp04, bp05, caches, doors, sounds, dl01, dl02 and dl03. This plan is half of a split: the other half is
  ``plans/2026-11-07-review-fixes-b.md` (Tasks 135 to 137, Sonnet)`.
- **Tier:** Slice (no new ADR; no new dependency).
- **Model:** Opus 5.5. The driver sets it for the whole unit; the plan does not switch models.
- **Comes after:** `plans/2026-11-07-diorama-look-04-world-atlas.md` and the door-pill spec fix (commit "The door-pill spec: one table per size …"), which Task 134 needs on the branch. Comes before dl05, because it edits files that dl05 to dl09 also edit. Task
  numbers are those of the original single plan (132 to 138).

## 1. Summary

Four fixes to the game's logic and its checks. Task 132 is the most important: an uncovered cache can leave a
bot parked for good and hang a mixed human and bot room. Task 133 restores two checks CLAUDE.md says must be
able to fail. Each task starts with a test that fails on today's code, shows it red by breaking the guarded
code on purpose, then fixes it. No test is weakened.

The findings come from the reviewers' reading of the code. When this was drafted, I had re-read the code
for these and they match the reviewers' description: the cache job in `currentJob` (it has no give-up
rule), `plateLeak`'s keypad branch (it returns `null`), `drawFx`'s `inSight` skip, the `.reveal-frame`
high-contrast rule against `.covering`, `.notch`'s `z-index: 4`, and `uiSound`'s `SILENT` list. These were
NOT re-read and are the reviewers' word only: the room 8 digit order (`decode.ts`), the `thinkBlind` hint
match, the `--lift: none` shadow invalidation, `SHELL.glass`, the `Lobby.tsx` diff, and the `GearSlot`
ticks. The `uiSound` suspended-context queueing is only partly confirmed: the code calls `resume()` and then
schedules the note straight away, and whether notes pile up depends on the browser. Each task therefore
begins by reproducing its finding; one that will not reproduce is not fixed. Each task starts
with a test that fails on today's code (CLAUDE.md: a bug fix starts with a failing test), shows it red by
breaking the guarded code on purpose, then fixes it. No test is weakened. Tasks 132 and 133 are the most
important: one can hang a room, the other restores a check CLAUDE.md says must stay.

## 2. Requirements

1. **FR1 (room can finish).** A room played by humans and bots can always be finished: an uncovered cache
   never blocks a seat's beat jobs or another station's `stop` callout for good.
2. **FR2 (lints that can fail).** The plate lint's keypad and numbered-wire checks, and the decoy-pips unit
   test, each go red when the thing they guard is broken.
3. **FR3 (door ring).** An ordinary door's ring is drawn wherever the door is, for every sighted seat
   (ADR 0025 FR5), and the door pill never overlaps a mark pill on the same edge.
7. **FR7 (bots).** The keypad bot enters a plated earpiece code in the right order whenever the earpiece
   digits are texted before the plate's digit, and a Can't see bot picks up the keepsake and not floor gear.

## 3. Tasks

### Task 132: An uncovered cache cannot block a room (FR1) — [x] done

- **Description:** `src/game/bots/brain.ts` `currentJob`: an active cache job ends only when `isDone` is
  true, so a human who does not do their part leaves the bot parked on it, and while any cache is open and
  unsolved `readStations` drops every `stop` callout for the other stations. Give a cache job a way to be
  given up (a number of ticks with no progress is the obvious one) after which the seat returns to its
  beat job, and stop `readStations` from dropping other stations' callouts once that job is given up. A bot
  stays perception-only (ADR 0018): the rule uses only the view and the inbox.
- **Files touched:** `src/game/bots/brain.ts`, a unit test beside it, `spec/bots-caches.test.ts` (header
  comment: it says the uncover happens on the first tick any seat is in the beat; the code uncovers at a
  column per room, decisions caches/85 and caches/86). The two decisions get a ruling in the overnight log.
- **Tests first (red):** in room 4, one human seat that never does its cache part, two bots: the room is
  not cleared after N ticks on today's code. And a unit test: with the cache open and unsolved, a `stop`
  callout for Q2 still reaches Q2's decoder.
- **Acceptance criteria:**
  - The mixed-crew test clears the room; the all-bot cache runs in `spec/bots-caches.test.ts` still pass.
  - `pnpm check` green.
- **Break check:** remove the give-up rule with a script that asserts the text it replaces; the mixed test
  goes red; restore.
- **Depends on:** none.

### Task 133: Restore the checks that were made unable to fail (FR2)

- **Description:**
  - `src/game/rooms/lint.ts` `plateLeak`: the keypad branch returns `null` and the numbered-wire branch
    cannot fire (`plaqueText` is `undefined` for a plated panel). Replace each with a check that reads the
    thing the sim claims (for the keypad, what `tuneOf` rests at the plate's key; for a numbered panel,
    what the view shows), so a future second clue that gives the number away fails `pnpm lint:rooms`.
  - `src/game/rooms/lint.test.ts`: the case "a keypad whose tune plays the carried key fails" was rewritten
    to expect `[]`; make it a real failing case again.
  - `src/game/bots/decode.test.ts` "ignores a decoy's pips": it asserts on a third call made without the
    plate. Assert on the plated and solved call.
- **Files touched:** the three files above. Log the ruling on decision bp04/77.
- **Tests first (red):** the restored lint case and the repaired decode assertion, each shown red against
  a deliberately broken `tuneOf` and a deliberately broken plated-solved branch.
- **Acceptance criteria:** the real rooms still pass `pnpm lint:rooms`; all three tests pass; breaking the
  guarded code makes each go red.
- **Break check:** both, with scripts that assert the text they replace.
- **Depends on:** none.

### Task 134: The door ring off sight, and a door pill clear of a mark pill (FR3)

- **Description:** `src/client/render/index.ts` `drawFx` skips every effect whose tile is not in sight
  (`if (!inSight(seen, f.pos)) continue;`), so the ring `detectFx` now emits for every door is dropped for a
  door behind a wall, and Can't hear sees nothing. Keep the skip for every other effect (a cache's secret
  door still must not tell you where it is) and exempt the ordinary door's ring. Extend
  `spec/layout/door-pill.test.ts`, which only checks `.captions` and `.hud-top`: with a mark stamped near the
  far door, the door pill and the mark pill are at least 48 px apart (plan 2026-11-07-team-wide-doors).
- **Files touched:** `src/client/render/index.ts`, `src/client/render.test.ts`,
  `spec/layout/door-pill.test.ts`, and `src/client/render/pops.ts` if the two pills need to be spread.
- **Tests first (red):** a render test that draws a door ring at a tile outside `scene.seen` and finds its
  pixels; a layout case with a mark near the door.
- **Acceptance criteria:** both pass; a secret-door fx at an unseen tile is still not drawn.
- **Break check:** restore the unconditional skip; the ring test goes red.
- **Depends on:** the door-pill spec fix being on the branch.

### Task 138: Two bot slips (FR7)

- **Description:** both start by reproducing, in a unit test, before any change; if one will not reproduce,
  it is not fixed and goes to `specs/backlog.md` as a dated line instead.
  - `src/game/bots/decode.ts` (keypad, plated earpiece branch, about l.244 to 251): it takes
    `numbers.slice(-len)` and treats the first as the plate digit. In room 8 a human Can't see can text the
    tune before the plate's digit, giving `[t1, t2, plate]` and an entry of `[t2, t1, plate]`.
  - `src/game/bots/brain.ts` `thinkBlind` (about l.304): `take` matches any hint starting `Take the`, so a
    Can't see bot with an open vault and empty hands, towed over floor gear, picks it up. Match the
    keepsake's hint, or require standing on `vault.item`.
- **Files touched:** those two files and the tests beside them.
- **Tests first (red):** a decode test that feeds the digits in the order above; a brain test with floor
  gear under the bot.
- **Acceptance criteria:** both pass; `spec/bots-caches.test.ts` and the room bot specs stay green.
- **Break check:** revert each fix; the test goes red.
- **Depends on:** Task 132 (same file, `brain.ts`).

## 4. Closing the unit

`pnpm check` green, `pnpm check:flaky` once on the spec files this unit touched, the plan ticked, and the
marker commit `Unit done: fixesA`. No human review: nothing here changes how the game looks.

## 5. Left for the user

1. **The decoy band's parity (bp04):** hearing seats hear static turn to a steady tone the moment the knob
   lands on a decoy, while sighted seats see nothing until the next pip, up to 2 s later. A spec-level
   choice (a new `detectFx` effect with a sound row, or accept the delay): one backlog line, not fixed here.
2. **Masking beds about 3.5 dB louder than the old brown noise** (`TARGET_RMS = 0.3`, against about 0.2) and
   the **door bolt at 50 ms, not the 120 ms the plan says**: both need a listen. Queued, not fixed.
3. **The wrong-order and test-claim notes:** the commit message of Task 88 claims all three perception
   tests fail on old code; one cannot. A note, no change.
