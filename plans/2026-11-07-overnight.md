# Overnight run 2026-11-07: decisions

## bp04

- bp04/78: room 6's plate needed a place in the job order → I split the "keypad" beat into "The plate", "The radio" and "The keypad" (6 beats, the plate read and a `tow` of Can't see in beat 3, Q3 in beat 4 with Can't speak as the turner, Q4 in beat 5), because with the old order the guide parked on Q3 and never led Can't see to the plate, and Can't hear cannot receive the texted band (RECEIVES), so the radio went to Can't speak. Reversible by restoring `rooms/06-lights-out.room` from the commit before Task 78.
- bp04/77: rooms 5, 7, 8 and 9 each needed a tow-then-read pair in a beat of their own before the plated station, for the same reason as room 6 (the guide parks on any station job) → I added beats "The braille plate" (and in room 7 a "Spread out" beat sending Can't speak and Can't hear apart so the hand-take picks Can't see), moved the plated wire (room 7 Q3) to Can't speak and put it before the Q4 watch (its door D2 hides Q4's nook), because Can't hear cannot receive texts. Reversible by restoring each `rooms/NN-*.room` from the commit before Task 77.
- bp04/77: a plated numbered-wire panel's ink is blank, so the torch holder's `inkPost` waiting spot skipped it too (`brain.ts`) → I made `inkPost` ignore plated panels, because otherwise the torch bot waited at blank ink forever. Reversible by removing that `continue`.
- bp04/77: `lintPlates`' old keypad check (tune plays the carried key unless the slot rests there) became wrong once the sim itself rests a plated keypad's key → I made the keypad check pass (the sim guarantees it; `stations.test.ts` guards it), and made the wires check meaningful for a rule-sign panel (rule and colours name the cut) instead of the numbered ink the sim now blanks. Reversible by editing `lint.ts` `plateLeak`.
- bp04/78: the manual three-tab run of room 6 (a decoy tones and pips but the door stays shut) → bots clear the room in all rotations and `stations.test.ts` shows decoys never solve; the three-tab run is queued in `review/QUEUE.md` (queued for morning).

## bp05

- bp05/79: the numbered-ink phrasings in the plan example ("N-1 wires stay before the cut") read as bare arithmetic and "1 wires" is ungrammatical at n=2 → I wrote three phrasings ("Cut the wire that has N-1 before it.", "Step past N-1; the next one bleeds.", "The knife waits at the Nth wire from the left."), because each states the number unambiguously with only ±1. Reversible by editing `NUMBER_RIDDLES` in `src/game/sim/stations.ts`.
- bp05/79: the human review of the riddle wording → built, committed and queued in `review/QUEUE.md` (review queued), because the user is asleep. Reversible by editing the pools.
- bp05/82: the five backlog lines were already under "Decided" as "undecided" → I rewrote their tails to point at the plan's tasks that built them (the brute-force line to Task 71, the jam), and added the parked braille-cache-hints line. Reversible by `git revert` of the backlog commit.
- bp05/82: ADR 0023 stays `proposed`; acceptance requested in `review/QUEUE.md`.

## caches

- caches/85: the harness uncover trigger ("a seat in the beat the chamber hangs off") would fire at the start of beat 3 (x 13), before the stethoscope has changed hands, and the cache's `tow` and `listen` jobs would be active before the guide had done its beat → I trigger when any seat reaches the chamber's columns (x of the chamber rect), because a person finds the motif tile on the way there. Reversible by editing `uncoverWhenReached` in `src/game/bots/solve.ts`.
- caches/84: a tile or tow job is only "done" while standing on its tile, so a finished cache job came back and the bot oscillated between cache and beat jobs → I made a finished cache job sticky (`BotMemory.cacheDone`, cleared on a send-back), and left cache jobs out of the "a later job is done" rule. Reversible by removing `cacheDone`.
- caches/85: a Can't-see bot at a cache safe's back says "stop" and the room's own dial (Q2) took the same word as its number, so Can't speak entered a wrong Q2 answer and the team was caught → while a cache is open and unsolved, `stop` callouts are hidden from non-cache decoders. Reversible by removing `aside` in `readStations`.
- caches/85: a bot owner needs an Act to take the keepsake, but `thinkBlind` only pressed Act for a braille plate → added the take (`view.cache.state === "vault"` and the act hint starts "Take the") to the same Act path. Reversible by removing `take` in `thinkBlind`.
- caches/85: room 4's cache jobs: the plan names `take` of g1 only if the stethoscope is not with Can't see → I omitted it (the beat-1/2 jobs already hand it over before the cache is reachable). Reversible by adding a cache `take` job.
- caches/85: the human review → built, committed and queued in `review/QUEUE.md` (review queued), because the user is asleep.
- caches/86: `uncoverWhenReached` takes a column per room (`true` = the chamber's columns) → each room uncovers where a person would find its moon tile (rooms 5 to 9: x 13, 17, 8, 3, 14), because the chamber's columns are past the beat's gear and doors in rooms 6 to 9. Reversible by editing `CASES` in `spec/bots-caches.test.ts`.
- caches/86: a cache job whose beat is later than the seat's current beat job waited for it (`currentJob`), because a cache uncovered early (room 7, x 8) otherwise sent bots into a chamber before the doors and gear it needs were in play. Reversible by removing the `j.beat > beat` test.
- caches/86: cache jobs are claimed in a pool of their own per beat (`claimJobs`), because otherwise they competed with the beat's jobs for a seat (room 9's `take` for g1 never reached the right bot). Reversible by removing `pools`.
- caches/86: room 9's cache jobs sit in beats 6 and 8 (the `take` in 6, the rest in 8), because the cache's gear take has to come before the plate beat's tow of Can't see and the vault job has to come after the beat that frees the seat. Reversible by editing `rooms/09-the-vault.room`.
- caches/86: found while proving the rooms, each its own regression test or room case: (a) a keypad took the chimes of another keypad's clue as its own code (room 5: Q3 and the cache's Q4 sound from the same vent) → each keypad now keeps only the chimes whose bearing names its own clue; (b) the switches watcher's `markedFor` was keyed by lamps alone, so a second watch of the same lamps never marked (room 6) → keyed by station too; (c) `lookAtDoor` stopped before a door it believed open (a cache's vault door) so the guide jittered at the vault; (d) the guide treated its Can't-see seat walking out of sight and back into view as a send-back → compares against the reckoned position; (e) `besideOf` could pick a cache's motif tile as the spot to stand to take a hand or hand gear on, which uncovered a cache in room 9 by accident (FR1) → it never picks a motif or decoy tile. Reversible by `git revert` of the Task 86 commit.
- caches/86: the break check on room 9's `listen` job (3 of 18 cases went red; restored) and on (e) (the all-bot "uncover nothing" case went red; restored).
- caches/87: ADR 0024 stays `proposed` and 0020 is not edited (accepted ADR) → acceptance queued in `review/QUEUE.md`. The PROCESS_LOG entry cites 17df77d and 542f479 (committed). Reversible by `git revert` of the Task 87 commit.

## doors

- doors/89: where does the door-pill layout spec live (the plan says `spec/layout/sight.test.ts`)? → a new `spec/layout/door-pill.test.ts` with its own fixture room `spec/fixtures/rooms-door`, because sight.test.ts's wall room has no door far enough off screen and a second fixture app per file is that suite's pattern. Reversible by moving the case into sight.test.ts with a longer fixture.
- doors/89: a multi-tile door is one entity per tile with one id → `openedDoors` dedupes by id so FR7's "one pill per door" holds (the first screenshot showed three stacked pills).

## sounds

- sounds/92: the plan puts the `uiSound` unlock on "the first pointer or key event" → I register one `once` pointerdown/keydown `resume()` when the context is first made, and also resume a suspended context on each press, because a context created before any gesture stays suspended in Chrome. Reversible by editing `getContext`/`uiSound` in `src/client/uiSound.ts`.
- sounds/93: the plan's seam test is "first and last 10 ms differ by less than a threshold" → I made it a level comparison over six seeds plus a step-size check, because with the plain first-10ms rule alone the break check (removing the crossfade) stayed green; the level comparison over several seeds goes red. Reversible by editing `maskBeds.test.ts`.
- sounds/93: the human listening review of Rain and Café → built, committed and queued in `review/QUEUE.md` with WAV loops, because the user is asleep. Reversible by editing the recipes in `maskBeds.ts`.
- sounds/94: `installUiSounds(getSettings)` reads settings from localStorage (`savedSettings`) instead of each island's React state → because every island saves on change, and a press must see the latest value even in a different island. Reversible by passing each island's state.
- sounds/94: the ready pulse and reveal sting keyed on `readySeats` growth, with `seat<N>` as the crew row key, and the reveal sting is skipped for a page loaded mid-game (a reload with tick above 0) → because that page has no reveal. Reversible by editing the effect in `Game.tsx`.
- sounds/94: the human review (three tabs) → built, committed and queued; the `ready`/`reveal`/`all-ready` kinds were seen by script, not asserted in a spec.
- sounds/95: the full check showed `spec/layout/door-pill.test.ts` failing once (the pill not drawn within 3.5 s on the first case) while it passed in the Task 92 full check and in two of three solo runs afterwards → I treated it as an existing flake of the doors unit (it times a 4 s pill against a 150 ms keypress and does not touch menu sounds) and did not touch it, because it is outside this unit's scope. It needs a look in the morning: `pnpm check:flaky` on that file. Reversible by nothing (no change made).


## dl01

- dl01/97: the spec reads a pixel via `data-camera` in `spec/layout/game.test.ts` → a new `spec/layout/hue.test.ts` with its own app on fixture `spec/fixtures/rooms-teal` (room 02 can't be reached cheaply from the shared app), counting exact `HUE_WALLS.teal.wallFront` pixels and asserting zero rose. Reversible by moving the case into game.test.ts.
- dl01/97: the alarm-dusk screenshot of room 03 → not taken (needs a live alarm); the dusk blend is asserted in `tokens.test.ts`. Reversible by taking it by hand.
- dl01/97: the full check showed `spec/layout/door-pill.test.ts` red once (the pill's box); solo it passed 2 of 3 runs with this unit's changes → the same existing flake logged under sounds/95, not touched (outside scope). Needs `pnpm check:flaky` on that file in the morning. Reversible by nothing.

## dl02

- dl02/99: `spec/layout/door-pill.test.ts` ("a door opening off screen, drawn as an edge pill") went red once in the full check and about 1 run in 3 alone → I did not touch it and ran it against the unchanged baseline commit 44354bf in a detached worktree: it fails there too (3 of 8 runs, "Can't hear at 1280: the door pill is drawn"), so it is an existing flake (a 4 s pill polled role by role), not caused by the retint; I recorded it here and went on, because the plan forbids retries to hide a flake and the fix is outside Task 99's scope. Reversible by n/a (no change). Fix later with `pnpm check:flaky`.
- dl02/99: the plan names the cleared "title and time" as display-face lines → I kept `.cleared-head h2` and the first `.cleared-stats dd` (Time) at 125%/900 and gave every other heading 100%/800, because the Time is the first stat in `RoomCleared.tsx`. Reversible by editing those two rules in `game.css`.
- dl02/99: the reveal's `.reveal-title` stays at 125%/900 as the role line; the lobby `.code` and the home `h1` too. `.code-input`, `.player-row .place`, `.feed figcaption b`, `.brand`, `h1/h2` base and `.lobby-solo > h1.share` dropped to 100%/800. The 28px joystick field and 3px vote bar radii are not the shell's corner, so they stay literal. Reversible by editing the same CSS rules.
- dl02/99: canvas chips' glass is now `SHELL.glass` in `tokens.ts` (rgba(34, 28, 48, 0.9)), because the canvas cannot read an rgba token; `SHELL.r = 8` drives the label and pop chips.
- dl02/99: human review of the plum retint → built, committed and queued in `review/QUEUE.md` (review queued), because the user is asleep.

