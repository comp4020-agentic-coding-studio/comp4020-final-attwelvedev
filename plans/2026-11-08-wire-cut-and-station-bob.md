# Wire cut you can see, and no bob when a station comes back into view

- **Date:** 2026-11-08
- **Tier:** Slice
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-08, in conversation (G1: "snip and fade" combined with a spark; G3 as reported)
- **Comes from:** `overnight/playtest-2026-11-08-findings.md` (G1, G3)
- **Runs after:** the overnight lane (dl09 and its fixes). It edits `fx.ts`, `stations.ts` and `perception.ts`, which dl07 and dl08 touched. Refer to code by name.

## What you'll see

- Cutting a wire shows it: the swatch snaps apart with a small spark, then stays visibly cut (a gap and a hatch, never colour alone).
- A station that comes back into your line of sight (the radio, for one) just appears. It no longer dips as if you had set a part.

## Demo script

1. In a room with a wires panel, as a sighted seat standing where the panel is in view; a teammate cuts a wire → that swatch splits and lifts apart in 150 ms, one spark at the cut, and it settles into a cut state with a gap and a hatch.
2. Walk away so the panel is out of sight, then back → the cut wire is still drawn cut, with no snip and no spark replay.
3. Walk so the radio leaves your line of sight and comes back → no dip; it is simply there.
4. Reduced motion → steps 1 and 2 show only the final cut state.
5. A Can't hear seat that has no line of sight to the panel → no change (the `snap` sound is what it gets).

## Requirements

- R1 A cut wire's state reaches the seats that can see the panel's face, and only them (demo 1, 5) → Task 1.
- R2 A new cut starts a `snip` effect and one `spark` at that wire; a state you walk into starts none (demo 1, 2) → Task 2.
- R3 The panel draws a cut wire as a gap plus a hatch; the same final state for reduced motion and for a reload (demo 2, 4) → Task 3.
- R4 A station going from furniture-only to full, or back, starts no `part` dip (demo 3) → Task 4.
- R5 DESIGN.md §4.2/§4.3 and the motion table gain the `snip` row (Tasks 2, 3).

Today's facts, read from the code: `stationShows` returns `s.answer.slice(2)` for wires, which a cut never changes, and `station.input` is not in the view, so `detectFx` sees nothing change on a cut. The `snap` sound has a row in `parity.test.ts`, but nothing visual.

Default taken, to veto: the spark is tone `ui` (not goal or danger), since a cut can be right or wrong and the jam stutter already says wrong.

## Out of scope

- Any other station's motion; bots changing how they read the panel (they use `shows` and perception only, ADR 0018).
- Changing the `snap` sound.

## Tasks

Each new or changed assertion is shown red first, with a break script that asserts the text it replaces, and the commit says what was broken. `pnpm check` green against `PORT=8092 pnpm start:check`.

- [x] **Task 1: The cut wires in the sighted view**
  - Files: `src/game/perception.ts` (the `station` view type gains `cut?: number[]`, the indices of cut wires; set from `StationState.input` for wires in the same place `shows` is set, so a furniture-only view carries none), `src/net/protocol.ts` if the view is mirrored there.
  - Tests first, in `src/game/perception.test.ts`: after a wire is cut, a seat that sees the panel's face gets `cut` with that index; a seat that only sees the panel's parts (`furniture: true`) gets no `cut`; a Can't see seat gets no station state. Red against the current view.
  - Acceptance: demo 5. Checked against the role tables in `src/game/types.ts` (ADR 0007), and the `snap` row in `parity.test.ts` still holds.
  - Depends on: none.

- [x] **Task 2: The snip and its spark**
  - Files: `src/client/fx.ts` (`DURATION.snip: 150`; in `detectFx`, a wires station whose `cut` gained an index starts `snip` on that station and a `spark` at the wire's tile; neither starts when the old view was furniture-only or the station was not in the old view), `DESIGN.md` motion table.
  - Tests first, in `src/client/fx.test.ts`: a new cut starts one `snip` and one `spark`; the same cut seen again starts none; a station arriving with a wire already cut starts none; at most three sparks start in any second (check the existing flashing limit covers `spark`; if not, cap it there). Red against current `detectFx`.
  - Acceptance: demo 1 and 2.
  - Depends on: Task 1.

- [ ] **Task 3: Draw a cut wire**
  - Files: `src/client/render/stations.ts` (the wires panel's swatch loop: for a cut index draw the swatch in two halves with a 3 px gap and `hatch()` from `shared.ts`; during `snip` the halves lift apart by up to 3 px and settle; reduced motion draws the end state), `src/client/render/standing.test.ts` or a new `src/client/render/wires.test.ts`.
  - Test first: a recording-context test that a cut swatch draws two pieces and a hatch, an uncut one draws one piece, and reduced motion draws the same pieces as the settled frame. Red by drawing every swatch whole.
  - Acceptance: demo 1, 2 and 4, with a screenshot at 1280 and 375.
  - Depends on: Task 1 (the `cut` field).
  - Human review: the snip in a local build. A pass means it reads as a cut, not a glitch.

- [ ] **Task 4: No dip on re-entering line of sight**
  - Files: `src/client/fx.ts` (`detectFx`'s station branch: the "shows changed" test, `on(e, "part")`, is skipped when `old.station.furniture` or `e.station.furniture` is set).
  - Reproduce first: in `src/client/fx.test.ts`, `detectFx([furnitureOnlyRadio], [fullRadio])` where the full one has `shows: [3]`. Today it returns a `part`, because `st.shows.join() !== old.station.shows.join()` compares `""` with `"3"`. The test fails, which is the repro. If it passes, the bob comes from elsewhere (the radio's `shows` pip, or `motionT`): stop and say so in the commit; do not guess.
  - Acceptance: demo 3. A real change while both views are full still starts `part`.
  - Depends on: none.

## Human review

- **Task 3 on a local build** (`PORT=8092 pnpm start:check`): the snip at 1280 and 375. Your sign-off is needed.

## Corrections log

<!-- one line per user redirect during execution: date — what changed and why -->
