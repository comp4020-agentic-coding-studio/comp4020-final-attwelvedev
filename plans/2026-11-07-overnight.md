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
