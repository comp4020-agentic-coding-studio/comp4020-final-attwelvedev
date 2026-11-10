# Playtest 3 fixes: Phase 06, bot noise at people, the alert overlay's neighbours, the intro's framing

- **Status:** Approved (by the user, 2026-11-10, after the phase 05 review and their own room 4 playtest)
- **Tier:** bugs. The bigger issue, "bots don't play well with people" (room 4's safe is unplayable with two bots), is **out of scope**: it goes through `/brainstorm-feature` with the user. Don't change how a bot turns the dial, add bot pacing for people, or add new teaching texts here.
- **Overview:** `plans/2026-11-10-playtest-3-fixes-00-overview.md` (§1 run rules). Spec: `specs/2026-11-10-playtest-3-fixes.md`.
- **Findings source:** `overnight/reviews/p3b-verified.md` (the phase 05 review). Each finding is copied into its task below.

## Tasks

### Task 289: A bot guide stays put and quiet while a person listens at a safe — [x]

**What the user saw (room 4, them as Can't see, two bots):**
- The bot Can't hear led them to the back of the safe (the listen tile, `[23,1]` for Q2).
- They stood still, listening for the tumbler.
- The bot then **walked left and right non-stop and kept sending callouts**.

**Where to look:**
- `guideBlind` in `src/game/bots/brain.ts`. The `parked` case only covers the guide's own `WORK_KINDS` jobs. A Can't see seat that has *arrived* at a `listen` job's tile (`hints.jobs` `{"listen":"Q2","at":[23,1]}`) can still get `goalFor` goals, the edge tap, line-up taps, the stuck rule, and Task 282's backoff repeats.
- Also check the guide's own movement: what job does it alternate between (tow ↔ something) while the listener waits?

1. **Reproduce first, with a tick count.** Write a test in `brain.test.ts`, or `spec/bots-*.test.ts` if it needs the whole room. Use room 4, with the Can't see seat **human** (in `humans`) and standing on Q2's listen tile, holding the stethoscope. The two bots run. Over 20 s of ticks, count:
   - the guide's callouts and texts to the Can't see seat
   - the guide's position changes (back and forth)

   Name the cause from the numbers. If it doesn't reproduce, try Q3's listen tile `[24,7]` with the cache open. If it still doesn't, park with what you measured.
2. **Fix:** while the Can't see seat is on the tile of a `listen` job that's live (its safe isn't solved), the guide:
   - sends it **no** direction, tap or repeat
   - doesn't walk back and forth; it holds still or does its own real job

   Flavour lines keep their usual 10 s spacing. This applies to bot and human listeners alike, unless the bot listener needs something else (check `spec/rooms.test.ts`).
- **Test:** over 20 s at the listen tile, zero direction callouts and taps to the listener, and the guide's position changes at most once (it settles).
- **Acceptance:** the test passes. `spec/rooms.test.ts` clears every room in every rotation. `pnpm playtest --room 04` passes.
- **Break check:** remove the listen-tile guard by script; the test goes red.
- **Depends on:** none.

### Task 290: The bot keep-alive never reaches a person (review F1, MEDIUM) — [x]

**Finding:**
- `brain.ts` (about 1665–1674): when the Can't see seat is a bot, the guide re-sends the heading every `IDLE_MS / 2` (2.5 s).
- `route` (`src/game/channels.ts`) sends a callout to **every** seat whose role receives it, and `RECEIVES.mute` includes `callout`.
- So a person playing Can't speak with a bot Can't see hears the same direction every 2.5 s, which breaks FR10. Task 283's test used three bots only.

- **Test first (red):** copy the 30-tile corridor test (`brain.test.ts`, about 1855) with `humans` set to the Can't speak seat. Count callouts whose receivers include that seat; expect no more than the number of heading changes plus the backoff repeats FR11 allows.
- **Fix:** run the keep-alive only when no **person** receives callouts: no seat in `m.humans` has a role for which `canReceive(role, "callout")`.
- **Why that's safe:** the bot Can't see still holds on long runs when a human Can't speak is in the crew. The stuck rule recovers it at a time cost (F7's old behaviour). That's acceptable, because noise at a person is worse. Log this trade-off.
- **Acceptance:** the test passes. `spec/rooms.test.ts` passes. Task 283's three-bot test still passes.
- **Break check:** remove the human check by script; the new test goes red.
- **Depends on:** Task 289 (same file).

### Task 291: A nudge doesn't cut off the bot's last line (review F4) — [x]

**Finding:**
- The 2 s quiet window before a repeat looks only at `g.lastSentAt` and `m.lastFlavourAt`.
- A work text sent through `stamp` (which sets `m.lastSpokeAt`, read nowhere) doesn't count.
- So a due repeat can go out 50 ms after a digit text, and `speech.ts` (`SUPERSEDE_MS`) cuts the digit off on a person's client.

- **Test first (red), beside "a repeat waits until nothing has been sent for 2 s":** the guide sends a work text just before a repeat is due; expect no callout within 2 s of it.
- **Fix:** the quiet window uses `Math.max(g.lastSentAt, m.lastFlavourAt, m.lastSpokeAt)`. If `stamp` covers every send, use `m.lastSpokeAt` alone and drop the now-redundant fields from the check. Log which.
- **Acceptance:** the test passes, and so do `spec/rooms.test.ts` and Task 282's cadence test.
- **Break check:** drop `lastSpokeAt` from the window by script; the test goes red.
- **Depends on:** Task 290.

### Task 292: Alerts don't cover or block the cards under them (review F3) — [ ] (review queued)

**Finding:**
- `.hud-alerts` (`src/styles/game.css`, about 600–615) is a zero-height layer at `z-index: 5`, with no `pointer-events: none`.
- A wide alert covers `.vote-prompt` (z 3), `.cache-moment` (z 3), `.top-stack` with `.side-job` (z 3, clickable) and `.braille-card` (z 4), and takes their clicks.
- `spec/layout/restart.test.ts` names no neighbours, which breaks CLAUDE.md ("a new overlay that shares a corner … names that neighbour in its spec").

- **Test first (red), `spec/layout/restart.test.ts` or a new `spec/layout/alerts.test.ts`:** at 375 and 1280, for a sighted seat, show an alert ("Voice lagging" or a vote note, whichever a spec can trigger without timing games) **and** each neighbour in turn:
  - an open vote
  - the side-job chip
  - the braille card (Can't see)

  Assert their boxes don't intersect, and that the neighbour's control takes a click (`elementFromPoint` at its centre is it or inside it).
- **Fix:**
  - `pointer-events: none` on `.hud-alerts`, if no alert has a control; check every alert in `Game.tsx`.
  - Stack the alerts and the top-centre cards so they don't overlap. For example, put the alerts and `.vote-prompt`/`.cache-moment`/`.braille-card` in one column container at the frame's top, so they flow under each other inside the overlay. That keeps them **out of the frame's layout**, so Task 279's no-resize promise holds.
  - Update DESIGN.md.
- **Acceptance:**
  - the test passes for every role and both widths
  - `spec/layout/restart.test.ts` (Task 279's no-resize) still passes
  - screenshots `review/p3-292-alert-vote-{1280,375}.png`
  - `pnpm check:flaky 4` method on the new spec file is green

  **Human review:** that the stacked alert and vote read well.
- **Break check:** remove the stacking by script; the overlap assertion goes red.
- **Depends on:** none.

### Task 293: The phone's top bar never grows mid-game (review F2, UNCLEAR: measure first) — [x]

**Finding (not confirmed from source):**
- `.hud-goal` has `flex: 1 1 0`, so it shrinks and wraps on its row instead of moving to a new one.
- `.hud-top` wraps with only a `min-height`.
- Items that can appear mid-game on that row: `LampLight`, `Connection` ("Weak N ms" / "Offline. Retrying…"), and the "N watching" button. With those showing, the goal line could wrap to three lines (about 50 px), growing the bar and so resizing the map, which is the same jolt as B4.

1. **Measure:** at 375×812 for both sighted roles, take `.hud-top`'s height with a quiet bar. Then show the lamp, force the connection to "Offline. Retrying…" (a spec can drop the socket), add one watcher, and measure again.
2. **If it grows:**
   - Test first: a layout spec asserting the bar's height and the map frame's height don't change between the quiet and the busy bar, at 375 and 1280.
   - Fix: the goal line keeps a fixed height, ellipsis and a full `title`/sr-only text, or a reserved row. Its text must never be clipped silently; if you ellipsize, the full line must be reachable (sr-only plus `title`).
   - Screenshot `review/p3-293-busy-bar-375.png`.
3. **If it doesn't grow:** keep the measurement test anyway as the guard (it can be shown to fail by forcing the goal line to `flex: 0 0 auto` and a long text), and log the numbers.
- **Acceptance:** the test passes, and `spec/layout/restart.test.ts` passes.
- **Break check:** as above.
- **Depends on:** Task 292 (same CSS area).

### Task 294: The intro never starts with the team under the HUD — [ ] (parked)

**What the user saw:** "when the room is not wide enough, the room starts zoomed in, so the game HUD fades in over the players, obscuring them. The animation then zooms out and pans to the players."

**Where to look (read before measuring):**
- The intro's swoop starts from `fitCamera(scene, scene.introFit)` (`src/client/render/project.ts`).
- `introFit` is the reveal backdrop's rectangle (`introScene`, `Game.tsx`). The backdrop fills the **whole window**, including where the HUD's bars and bezel will fade in.
- `fitCamera`'s scale is `min(box.w / roomW, box.h / projected)`. For a room that's narrow for the window, that can be **larger** than the follow camera's scale (`scene.w / VIEW_TILES`), so the intro starts zoomed in and then zooms **out**.
- Meanwhile the players, in the middle of a whole-window fit, can sit under the top bar or bezel as the HUD fades in (`hud-in`/`bezel-in`, `game.css`).

1. **Reproduce on a real canvas:**
   - For every room at 1280×800, 1024×768 and 375×812, compute or capture the first intro frame's camera against the follow camera.
   - For each player figure, find its screen box at the moment the HUD reaches full opacity (the cover's end, `coverTiming`), and whether it intersects `.hud-top`, the bezel, or any HUD overlay's box.
   - Save the worst case as `review/p3-294-before-<room>-<w>.png`.
   - If no case puts a figure under the HUD, park with the table.
2. **Test first (red):** a unit test on the camera maths, no browser.
   - For every room and each of the three sizes, the intro's starting scale is ≤ the follow camera's scale: it never zooms out to land.
   - The starting frame's figures land inside the **frame's** rectangle (the map area, not the window).
   - Add a layout spec only if the HUD's boxes are needed, and keep it small.
3. **Fix (the user's preferred direction, from the discussion):** fit the reveal's backdrop, and so `introFit`, to the rectangle the map frame will occupy, not the whole window. Then nothing of the room sits under the HUD when it fades in, and the intro still starts from exactly what was on screen (R1). Cap the start scale at the follow scale, so the intro only ever zooms in. Keep:
   - reduced motion as it is (cross-fade)
   - the first-start case and the restart case
   - the existing intro specs (search `spec/layout/` for `intro`/`reveal`/`flat-camera`)

   Update DESIGN.md if it describes the backdrop.
- **Acceptance:**
  - the tests pass, and the existing intro and reveal specs pass
  - `review/p3-294-after-<room>-{1280,375}.png` for the worst room shows the team inside the map as the HUD fades in
  - `pnpm check:flaky 4` method on any new browser spec

  **Human review:** the user watches room 1 and the worst room start at their usual window size, and on a restart.
- **Break check:** put the whole-window `introFit` back by script; the unit test goes red.
- **Depends on:** none.

### Task 295: The reveal flake is fixed at its cause (review F5) — [x]

**Finding:**
- Task 284 was committed with `pnpm check` red on `spec/layout/reveal.test.ts` "…the game's canvas is visible within 1.5 s". It passed 4/4 alone.
- CLAUDE.md says never commit red, and fix a flaky test's cause, never its timeout.

1. Run `pnpm check:flaky 4` against a **fresh** `pnpm start:check` server, restarting the server between runs if the backlog's server-degradation line still holds. Log which tests fail in some runs.
2. For the reveal test: find why the reveal is still in the DOM at 1.5 s under load. Is it waiting on a view, a font, the backdrop's first draw, or the vitest worker being starved? Fix the cause. If the spec measures a stand-in (wall-clock under load) rather than the promise, rewrite it to measure the promise, and say why in the commit. Don't raise the 1.5 s.
3. If `check:flaky` shows the server degradation (backlog, p3fix05) is real and the cause is findable in one honest attempt (lobbies, sockets or games kept after a spec disconnects), fix it with a unit test. Otherwise, leave the backlog line and add the measurement.
- **Acceptance:** `pnpm check:flaky 4` is green on a fresh server, and the plan's `## p3fix` log names the cause.
- **Break check:** if the fix is in app code, reintroduce the cause by script and show the reveal test fails in every run (a bug) or some (the flake), as before.
- **Depends on:** none. Run it **last**, because it needs the whole tree settled.

## Order

Run them in this order: 289, 290, 291, 292, 293, 294, 295. 289–291 share `brain.ts`; 292–293 share the HUD CSS. If one parks, carry on.

## Phase Definition of Done

- Every task is ticked, or parked with a line under `## p3fix`.
- Every human review is appended to `review/QUEUE-p3.md` under `## Phase 06`.
- `pnpm check` is green on the tip, and the overview's phase map and coverage table have row 06.
- Then commit `Unit done: p3fix06`.

## Corrections log

(empty)
