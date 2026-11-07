# Line of sight: things cut where they should not be

- **Date:** 2026-11-08
- **Tier:** Slice (investigate first: Task 1 decides which of Tasks 2 to 4 apply)
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-08, in conversation (the seven symptoms and the two stated expectations: veil starts after the corner; a diagonal cut in front of glass)
- **Comes from:** `overnight/playtest-2026-11-08-findings.md` (L1 to L7); screenshots 122 to 130 in `overnight/playtest-2026-11-08-shots/`
- **Runs:** first of the four follow-up plans. L4 and L6 may be a perception bug, which matters for play more than the look does.

## What you'll see

- A figure or object you can see is never cut off, or dropped, while any part of it is in the cone.
- A figure at a corner does not vanish when a teammate moves; the gear does not blink out as you step aside.
- Behind glass nothing is veiled until the corner; what stands in front of glass is cut by the cone's diagonal, not a vertical line.
- The music box shows whole when you can see it, and not through gaps at certain angles.

## Demo script

Run locally: `pnpm build && PORT=8092 pnpm start:check`, then the three-tab setup in `pnpm mockup:room`'s notes.

1. L1 (122, 123): Can't see stands at a corner; the Can't speak seat moves left → the figure's top is cut by the cone's edge but it stays drawn until its whole footprint is out of the light.
2. L2 (124): look along a glass wall → no mist on the glass before the corner.
3. L3 (125): stand so the checkpoint's top is in the cone → it is drawn whole.
4. L4, L6 (126, 129): the music box → whole whenever any of it is in sight, at every angle; nothing is shown that `visibleFrom` does not allow.
5. L5 (127, 128): move slightly right of the gear → it stays until it is fully out of the light.
6. L7 (130): a station in front of glass, the cone's edge crossing the glass behind it → a diagonal cut across the station.

## Requirements

- R1 Each symptom has a failing test that reproduces it, and a finding naming its cause, and says whether it also reproduces at the `auto/escape-room` tip (demo 1–6) → Task 1.
- R2 What stands is dropped only when its whole footprint is out of the light (demo 1, 3, 5) → Task 2.
- R3 Glass is not veiled before the corner; what stands in front of glass takes the diagonal cut. DESIGN.md §4.4 changes to say so (demo 2, 6) → Task 3.
- R4 A station in sight is drawn whole and shows its state where it shows it, with no new information sent to a seat that cannot perceive it (demo 4) → Task 4.

Default taken, to veto: R3's diagonal applies in front of glass only. What stands in front of a wall's face keeps the wall's vertical cut, as DESIGN.md §4.4 says today.

## Out of scope

- The veil's look, the mist stipple, wall tops, cameras and guards' cones.
- Anything the Task 1 finding does not tie to one of the three causes below: it goes back to the user, not into this plan.

## Tasks

Each new or changed assertion is shown red first with a break script (CLAUDE.md), and the commit says what was broken. A render bug that will not reproduce from the model is reproduced by drawing the real scene on a real canvas and looking, before any fix. `pnpm check` green against `PORT=8092 pnpm start:check`.

- [ ] **Task 1: Reproduce all seven, find the causes**
  - Files: `src/client/render/sight.test.ts` and `src/client/render/standing.test.ts` (one failing test per symptom, from a scene captured from its screenshot: the room is identified from the picture; the rooms with glass are `rooms/03-watchers.room`, `06-lights-out.room` and `08-music-room.room`), a throwaway worktree on `auto/escape-room` to run the same checks there, and `review/los-repro-2026-11-08.md` (new: per symptom, the failing test, the cause, new or old).
  - The three causes the code points at, to be confirmed or refuted here: (a) `litEntities` in `src/client/render/sight.ts` drops a `STANDS` thing, or another player, whose own tile the light does not touch, though its sprite reaches up into the cone (L1, L3, L5); (b) the vertical cut that DESIGN.md §4.4 gives glass, and gives a station over a wall's front (L2, L7); (c) `cutToSight` and the view's `furniture` split in `src/game/perception.ts` (the `shown` and `furniture` branches), which draw a station's number from its display tile while its body needs a part tile in `seen` (L4, L6).
  - Acceptance: seven failing tests, one finding file. If a symptom fits none of (a) to (c), stop and ask the user.
  - Depends on: none.

- [ ] **Task 2: Drop a thing only when its footprint is fully dark** (if the finding says (a))
  - Files: `src/client/render/sight.ts` (`litEntities`: keep a `STANDS` thing or player when any tile of its drawn footprint is touched, using `tileTouched` over the sprite's tile extent; the exact-light clip still cuts what is dark), `src/client/render/sight.test.ts`.
  - Tests first: the Task 1 tests for L1, L3 and L5 go green; a thing wholly in the dark is still dropped (it must stay red if `litEntities` keeps everything). Break: restore the own-tile test.
  - Depends on: Task 1.

- [ ] **Task 3: Glass veil and the diagonal in front of glass** (if (b))
  - Files: `src/client/render/column.ts` (`darkOfGlass` and `splitOfWall`'s overlap rule: no veil on glass before the corner; a station over glass takes the cone's diagonal), `DESIGN.md` §4.4 (the sentence about glass being cut the same way and about a station over a wall's front).
  - Tests first: the Task 1 tests for L2 and L7 go green; a station over a wall's front still takes the vertical cut (it must stay red if the rule is applied to walls too). Break: restore the vertical cut.
  - Depends on: Task 1.
  - Human review: screenshots of 124 and 130's scenes at 1280 and 375, after. A pass means the glass reads as glass and the cut reads as light.

- [ ] **Task 4: A music box in sight is drawn whole** (if (c))
  - Files: `src/client/render/sight.ts` (`cutToSight`) and/or `src/game/perception.ts`, whichever Task 1 names. If the fix is in perception, a test in `src/game/perception.test.ts` shows a seat that can see the box gets it whole, a seat that cannot gets nothing, and `parity.test.ts` still holds (ADR 0007, 0012).
  - Tests first: the Task 1 tests for L4 and L6 go green; the existing furniture test (`perception.test.ts`, "the buttons are furniture and drawn, the lamps' state…") stays green.
  - Acceptance: demo 4. If it needs a new field on the wire, stop and ask: that is an ADR question.
  - Depends on: Task 1.

## Human review

- **Task 3 on a local build**: screenshots at both widths. Your sign-off is needed.

## Corrections log

<!-- one line per user redirect during execution: date — what changed and why -->
