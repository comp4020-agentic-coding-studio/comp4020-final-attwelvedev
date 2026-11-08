# Playtest fixes: landing margins, crate shadow, doors, comms wording, soundboard, restart freeze, intro lag

- **Date:** 2026-11-08
- **Tier:** Slice (a batch of small slices and three investigations; one file because it is one playthrough's list and the tasks are small)
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-08, in conversation; the spec is `specs/2026-11-08-playtest-fixes.md` (approved the same day, copy table and scope settled there)
- **Comes from:** the user's playthrough, 2026-11-08
- **Base and order:** runs on `auto/overnight` after `fix/los-combined` is merged, which waits for unit `pt01` to finish. Do not start while `pt01` is running; do not touch `wt-night`. Task order is the spec's: landing and crate first, then the copy, then the three investigations.

## What you'll see

- The landing page's headline and feeds sit inside the gradient with space on the left and top.
- A crate's shadow is a rectangle, not a circle.
- Every door in a room plays its opening animation on both of its tiles, not only the top one.
- The role screen and the comms wheel name the comm for each teammate ("Ana hears you talk · Bo can't"), and "clips" reads "soundboard" everywhere a player sees it.
- A restart after a vote starts the room again every time, and the room-start intro plays without long stalls.

## Demo script

Run locally: `pnpm build && PORT=8092 pnpm start:check`, three tabs (Can't see, Can't hear, Can't speak), as in `pnpm mockup:room`'s notes.

1. Open the landing page at 1280 and 375 → the headline and the feeds have space to the left and top inside the gradient, not against its edge.
2. Room 1, push a crate → its shadow under it is a rectangle matching the box.
3. Rooms 1 and 2, open each door → both tiles of every door part and sink, not only the top tile.
4. On the role screen, open "Who perceives what" → under Talk: "Ana hears you talk · Bo can't"; under Faces: "sees your faces"; under Soundboard: "hears your sounds"; under Marks: "sees your marks". Can't speak's line reads "You see and hear everything. Use the soundboard, faces and marks."
5. In game, open the wheel (Q) → the plate uses the same words, the page tab reads "Soundboard" and fits at 375, and sending on a page you can't use reads "You can't use the soundboard. Ana and Cy can."
6. All three vote to restart the room, repeated 20 times → every time the intro plays, the clock runs and all three seats can move.
7. On a quiet machine, play a room start → the cover fades, the board tips and the camera swoops without a stall longer than the frame bench's budget.

## Requirements

- R1 Landing margins (demo 1) → Task 1.
- R2 Crate shadow is a rectangle (demo 2) → Task 2.
- R3 Role screen and wheel wording, wheel tab and refusal, role line, DESIGN.md (demo 4, 5) → Tasks 3 and 4.
- R4 Every door tile animates (demo 3) → Task 5.
- R5 A restart after a vote always resumes (demo 6) → Task 6.
- R6 The intro plays without long stalls (demo 7) → Task 7.

## Out of scope

- Internal names: page id `clips`, method `clip`, `CLIPS`, `clip.ts`, the canvas `clip()`.
- Sound labels ("Air horn", "Truth"), the `/stats` column headers, the "reads this" verb for text.
- Old specs and accepted ADRs, which say "clips" and stay as written.
- Any new screen, component or design pass.

## Tasks

Each new or changed assertion is shown red first with a break script that asserts the text it replaces, and the commit says what was broken. A bug fix starts with a failing test that reproduces it. `pnpm check` green against `PORT=8092 pnpm start:check` before each commit, on a quiet machine. A format run is `pnpm format`, then `git status`.

- [ ] **Task 1: Landing margins**
  - Files: `src/styles/pages.css` (`.home`, line 96: the radial gradient is on `.home`, so the headline `.home h1` and `.feeds` start at its edge; give the content padding, keeping the gradient full bleed; the 880 px layout at line 751 keeps its two columns), `DESIGN.md` if it states the home layout.
  - Verified by: demo 1, screenshots at 1280 and 375. No unit test (pure presentation).
  - Acceptance: left and top space is at least `var(--s-4)` at both widths; no horizontal scroll at 375; high contrast (`data-contrast="high"`, gradient off) is unchanged.
  - Depends on: none.
  - Human review: the two screenshots, in a local build. A pass means the headline and feeds sit comfortably inside the glow.

- [ ] **Task 2: Crate shadow is a rectangle**
  - Files: `src/client/render/materials.ts` (`paintCrateShadow`, line 217: draw a rounded rectangle from the same centre and half-extents instead of `ellipse`; keep `globalAlpha *= 0.18`, the 0.08 tile offset and the high-contrast early return), `src/client/render/materials.test.ts` (lines 240 to 246 and 270 look for an `ellipse` op: they pin today's circle, so change them to look for the rectangle op and its extents), `DESIGN.md` if it names the shadow.
  - Tests first: a test that the shadow's path spans `2 * rx` by `2 * ry` (a rectangle, not an ellipse) and goes red against today's code; high contrast still draws none. Break: put the `ellipse` back.
  - Acceptance: demo 2, a screenshot at 1280 and 375 of a crate. Frame bench unchanged.
  - Depends on: none.

- [ ] **Task 3: The copy: role screen, wheel, rename**
  - Files: `src/components/ReceiverLine.tsx` (the line names the comm: Talk `hears you talk`, Faces `sees your faces`, Soundboard `hears your sounds`, Marks `sees your marks`, `can't` unchanged; `ReceiverLine` is shared with `CommsWheel.tsx:678`, so the wheel's plate changes too), `src/client/wheel.ts` (`PAGE_LABEL.clips` to "Soundboard"; `VERB`/`verbFor` at lines 225 to 238 give way to a per-method phrase; text keeps "reads this"), `src/components/CommsWheel.tsx` (`NOUN.clip` at line 52 carries the whole refusal phrase, because "send soundboard" does not parse: "You can't use the soundboard." at lines 227 and 682; the comment at line 87), `src/components/RoleReveal.tsx` (`ROLE_LINE.mute` at line 32: "You see and hear everything. Use the soundboard, faces and marks."), `DESIGN.md` lines 431, 436 and 441 in the same commit.
  - Tests first: `src/client/wheel.test.ts` lines 225 to 228 pin the old verbs: change them to the new phrases and watch them go red against today's code; add a phrase check per method. Then `spec/layout/reveal.test.ts` (line 72 and lines 110 to 114) and `spec/layout/wheel.test.ts` (lines 107, 307 to 314, 398 to 400: the `Clips` tab text, the "You can't send clips" toast and the `hears this` / `sees this` matches) change to the new words and go red first. Break: put the old verb back.
  - Acceptance: demo 4 and 5. A screen reader hears the same words as the visible line. The "Soundboard" tab fits at 375 (a layout assertion on the tab's box, and a screenshot). `spec/design.test.ts` green.
  - Depends on: none.
  - Human review: the printed list of every changed string, read aloud, then the role screen and the wheel at 1280 and 375. A pass means each sentence reads naturally and nothing says "clips" to a player.

- [ ] **Task 4: A sweep for any "clip" a player still reads**
  - Files: a grep of `src/components`, `src/pages`, `src/client` (not `render/`), `public/` and the captions for the word "clip" in visible text, with every remaining hit either changed or listed as internal.
  - Tests first: none new; the list is the artifact. Captions such as `[Air horn]` (`src/client/hud.ts:69`) come from `CLIPS` labels and stay.
  - Acceptance: a short list in the commit message of each remaining "clip" and why it is internal.
  - Depends on: Task 3.

- [ ] **Task 5: Every tile of a door animates**
  - Cause, read from the code and not yet proven: a door is one entity per tile with one id (rooms 1 and 2 have two-tile doors at `12,1`/`12,2` and `22,1`/`22,2`). `detectFx` (`src/client/fx.ts:203`) makes one `door` fx per door at the first tile it meets ("one per door, however many tiles") and `drawDoorOpening` (`blocks.ts:359`) draws one position, so the other tile's leaves never move. `fx.test.ts` lines 63 to 80 pin "a door of three tiles moves once", so that test pins the bug if this is the cause.
  - Files: `src/client/fx.test.ts` (a red test first: a two-tile door that opens gives an effect for each tile, or one effect that draws both), then `src/client/fx.ts` (`detectFx`, and `openedDoors` if its one-pill-per-door rule is kept) and `src/client/render/blocks.ts` / `index.ts:699` as the red test points. A door's off-screen pill (`Game.tsx:442`) stays one per door.
  - Tests first: reproduce on rooms 1 and 2's real door tiles drawn through `draw()` with `sc.cam` pinned (a test that draws the real scene on a canvas, as `standing.test.ts` does), and show that only one tile's leaves move. If it passes, the cause is elsewhere: stop and say so.
  - Acceptance: demo 3, with a screenshot of a door mid-opening at 1280 and 375. Break: restore the first-tile-only rule.
  - Depends on: none.

- [ ] **Task 6: Restart after a vote never freezes**
  - Reproduce first. The server path is already covered by `spec/intro.test.ts:95` and `:117` ("a passed room restart sends intro again and holds again" and the tick-0 view), so the server is correct as far as those go. The unproven suspect is the client: in `Game.tsx:568` `start()` computes `first = r.intro === null && ...`, and after a restart `r.intro` is already set, so the cover and swoop may not run again; `restarted()` (`Game.tsx:1070`) resets `lastSent` and the summary but not `r.intro`. This is a hypothesis from reading, not a cause.
  - Files: a new `spec/restart-resume.test.ts` (a file for its area, per the slow-test rule): vote to restart 20 times in a row on one lobby, and after each assert an `intro`, then a tick, `elapsedMs` advancing and a seat's input moving it; then `src/components/Game.tsx` and `src/net/attach.ts` as the failing run points. A client-side check (a layout spec or a unit test on `start()`/`restarted()`) for the second play.
  - If it cannot be reproduced after the 20 runs and a client-side check: do not claim a fix. Add one `game` log line through `logGame` (`src/lib/gameLog.ts`, its name added to `GameEvent`, no nickname or code in `detail`) when a restarted room has not ticked within `INTRO_FOR` plus a margin, and a guard that restarts the tick loop in that case, and say plainly in the commit that the cause was not found.
  - Tests first: the 20-restart spec goes red if the freeze reproduces; otherwise the guard gets its own test (a restarted room whose tick loop was stopped resumes). Break: remove the guard.
  - Acceptance: demo 6. `pnpm check:flaky` on the new spec shows no flake.
  - Depends on: none (do it before Task 7, since a fix here may change the lag measurement).

- [ ] **Task 7: The room-start intro without long stalls**
  - Investigation, on a quiet machine (not while `pt01` or another unit is running): the frame bench (`pnpm bench:frame`) draws a room in a loop but has no intro mode (`src/bench/bench.astro` has no rise or swoop), so first add a bench mode that draws the intro's frames (`rise` 0 to 1 and `swoop` 0 to 1, through `camera()`), at the bench's throttled CPU setting. Record p50 and p95 for the intro and the longest single frame, on desktop and phone width.
  - Files: `src/bench/bench.astro` and `scripts/bench-frame.ts` (an intro row), then whatever the measurement points at in `src/client/render/` or `Game.tsx`'s cover and rise code (`setCovering`, `coverTiming`).
  - Tests first: the target is set from the measurement, not before. If the intro frames are within the existing budget and the lag is only machine load, change no code and say so in the commit. Otherwise a bench assertion that goes red on the slow frame, then the fix.
  - Acceptance: demo 7, numbers in the commit message; the existing bench rows unchanged.
  - Depends on: Task 6.

## Human review

- **Task 1:** screenshots of the landing page at 1280 and 375. Your sign-off is needed.
- **Task 3:** the printed list of changed strings, then the role screen and the wheel at both widths. Your sign-off is needed.

## Corrections log

<!-- one line per user redirect during execution: date — what changed and why -->
