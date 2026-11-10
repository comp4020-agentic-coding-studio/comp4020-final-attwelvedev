# Playtest 3 fixes: Phase 05, the morning review's findings, the goal line, and the restart jerk

- **Status:** Approved (by the user, 2026-11-10, after reading `overnight/reviews/p3-verified.md`)
- **Tier:** bugs, plus two spec changes the user ruled on (FR11 → backoff nudges; FR4 → spectator sees Can't see's frame)
- **Overview:** `plans/2026-11-10-playtest-3-fixes-00-overview.md` (§1 run rules). Spec: `specs/2026-11-10-playtest-3-fixes.md`.
- **Findings source:** the final review's verified findings, copied into each task below. You don't need the file outside the repo.

## The user's rulings (2026-11-10, after the overnight run)

1. **Task 271 (T3), the goal line for the sighted:** on the phone it goes **in the top bar** (`.hud-top`), taking no frame height. On desktop it stays where the parked branch put it (the `.hud-hint` under the bar), unless the HUD layout spec shows a reason not to. Log the choice.
2. **Task 278 (B4), the jerk:** the user saw it on their Mac in Chrome, **locally and deployed**, for **every sighted seat in every room**. **The first intro is smooth. The jump happens when the room is restarted by a vote and the intro plays again. The whole view jumps.**
3. **F3 / FR11:** replace "one nudge" with a **backoff**: nudge at 3 s, 6 s and 12 s, then every 12 s while still stuck. Any progress or a new direction resets it to 3 s. A nudge also waits until nothing has been sent for 2 s.
4. **F9 / FR4:** a spectator following Can't see gets **Can't see's frame**: black, the dimmed own figure, and the hand link (option b). The full room view stays for spectators following a sighted seat or nobody.
5. Every confirmed finding is fixed, F4–F7 included. F8 was refuted, but the test gap it found is closed cheaply (Task 287).

## Before Task 279

The driver (`overnight/run20.sh`) rebases `auto/playtest-3` onto `origin/main` before this unit starts, which picks up `09d9348` (it deletes a flaky desktop HUD check). If `git log origin/main..HEAD` doesn't show this branch's commits on top of `09d9348`, the rebase was skipped. That's fine; carry on.

## Tasks

### Task 279: The restart jerk (B4, re-opened) — [ ] (review queued)

**Leading hypothesis (from reading the code; confirm it by measuring, don't assume it):**
- A passed vote's `vote.end` handler (`src/components/Game.tsx`, the restart-vote `useEffect`, about line 1000) calls `setVoteNote(outcomeText(...))` and clears it after **3000 ms**.
- The note renders as `<p class="hud-alert">` (about line 1311) **in the HUD's flex column**, with `flex: none` (`src/styles/game.css` `.hud-alert`). So while it shows, the map frame is shorter by the alert's height (~30 px plus margin).
- The server sends the restarted room's views, then `intro` at once (`src/net/attach.ts` `finishVote` → `sendRevealViews` → `runIfReady`). So the 2.4 s intro runs while the note is up, and the note goes **~0.6 s after the swoop lands**.
- The frame then grows in one frame. The canvas resizes, and `followCamera`'s scale (`scene.w / VIEW_TILES`) and window jump, so the whole view jumps.
- The first start has no vote and so no note, which explains why it is smooth. The parked unit (p3fix04) measured the first start only.

The same shape applies to any `.hud-alert` that appears or goes mid-game (lag, gone, host note). Check whether those also shift the frame, but fix only what the measurement shows.

1. **Reproduce on a real canvas, the restart path.** Use the real intro (start the server **without** `INTRO_MS`). With three tabs, play room 1 at 1280×800 for a sighted seat, propose a room restart, and have all vote yes. Reuse `spec/playUi.ts` and the parked branch's `scripts/capture-intro.ts`: `git show auto/playtest-3-parked-p3fix04-task278:scripts/capture-intro.ts`, and copy what you need. Sample per rAF from `vote.end` to +4 s:
   - `data-camera`
   - the canvas's `clientHeight`
   - the `.frame` box
   - whether a `.hud-alert` is in the DOM
2. **Name the cause** from the numbers: the frame and value that jump, and when. If it isn't the vote note, follow the numbers. If nothing jumps in headless Chromium, park (§1 rule 3), as p3fix04 did, with the restart measurements.
3. **Test first (red).** A layout spec, `spec/layout/restart.test.ts` or the existing HUD layout spec's file: after a passed restart vote, the game canvas's height (or the `.frame` box) never changes between the intro's end and +4 s. Place figures; never walk them. Wait with `nextTick`'s default. Keep the vote-note timing from the code (3000 ms), not a short timeout of your own.
4. **Fix.** The likely fix is to keep transient HUD alerts out of the layout flow, so they overlay the top of the frame (absolute, over the map, under the top bar). Then nothing that comes or goes resizes the canvas. Keep them readable and keep `role="status"`. If DESIGN.md describes `.hud-alert`, update it. Check that any layout spec naming the alert's neighbours still holds.
5. Save `review/p3-279-restart-{1280,375}.png` with the note showing over the frame.

- **Acceptance:** the test passes. A re-capture of the restart shows no change in canvas size or camera scale from the end of the swoop to +4 s. `pnpm check` is green, and `pnpm check:flaky 4` is green on the new spec (run its method on just that file, as p3fix01 did). **Human review:** the user restarts a room by vote on their Mac in Chrome and watches the intro.
- **Break check:** by script, put `.hud-alert` back in the flow; the spec goes red.
- **Depends on:** none.

### Task 280: The goal line for the sighted, in the phone's top bar (T3, un-parked) — [ ] (review queued)

- **Start from the parked commit:** `git cherry-pick 41ba3d4` from `auto/playtest-3-parked-p3fix01-task271`, with `-n`, since you'll amend it. Drop its `PARKED` wording and its `review/QUEUE-p3.md` hunk if it conflicts.
- **The change:** on a phone width (< 720 px, the same breakpoint the HUD uses), render the sighted line inside `.hud-top`, not as `.hud-hint` under it, so the map frame loses no height. On desktop, keep the `.hud-hint`. Can't see's line is unchanged everywhere.
  - Text: "Get all three onto the exit."
  - At 375 px the bar is busy. If the full line doesn't fit beside the crew, clock and loot without clipping, let it take its own row **inside** the bar. The row must not exceed the height the bar already has at 375; measure it. If it can't fit without growing the bar, use the shortest honest wording ("All three onto the exit") and log the choice.
- **Tests:**
  - The parked commit's HUD spec stays green.
  - `spec/layout/wheel.test.ts` "keeps the plate and page labels inside the frame" passes for Can't hear at 375. This was the park's failure, and it is the guard.
  - Add a layout check that the line's text isn't clipped (`scrollWidth <= clientWidth`, `scrollHeight <= clientHeight`) at 375 and 1280, for both sighted roles.
- **Acceptance:** `pnpm check` is green. Screenshots `review/p3-280-goal-{mute-1280,deaf-375,mute-375}.png`. Update DESIGN.md if the top bar's contents are described there. **Human review:** whether the line reads in the phone's top bar.
- **Break check:** by script, move the phone line back under the bar; the wheel spec goes red at 375.
- **Depends on:** none.

### Task 281: The edge "Tap" never repeats forever (F1) — [x]

**Finding (confirmed, MEDIUM):**
- When the guide can't see the player, `brain.ts` (about 1520) sets `p = est` while `g.moving` is false, and nothing changes `est`.
- A tap sets only `tapAt` and `nextTick = stepTick + 16`; it never moves `g.est`.
- So once `edgeWord(p, tile)` finds the estimate more than 0.3 from the tile's middle, the same "Tap …" fires every `max(16 ticks, TAP_MS)` without end.
- The same happens when the guide is `parked` (`goal = tile`).

- **Test first (red), `src/game/bots/brain.test.ts`, with a tick count:**
  - Set up a human Can't see seat out of the guide's sight, stopped, with its estimate 0.4 off the middle of its goal tile.
  - Step the guide for 100 ticks; expect at most one `Tap` text. Today it gives about 4.
- **Fix:** require sight for the edge tap (`const edge = seen && step === "wait" && …`). Check the `needsLineUp` tap branch for the same shape (out of sight and nothing moves `est`); if it's there, guard it the same way, with its own test.
- **Acceptance:** the test passes, and `spec/rooms.test.ts` clears every room in every rotation.
- **Break check:** remove the `seen &&` guard by script; the test goes red.
- **Depends on:** none.

### Task 282: Repeat nudges with backoff (F3, FR11 changed by the user) — [x]

**Finding (confirmed, MEDIUM):**
- The stuck rule needs `blindIsBot || seen?.blocked || progress >= PROGRESS`, so a person standing still on open floor never triggers it.
- The nudge (`brain.ts`, the block after "a direction is said once (FR10)") fires once (`g.nudged = true`), and only a new direction resets it.
- So a person who missed a direction and its one nudge is never told again. Speech can lose a line: `src/client/speech.ts` `SUPERSEDE_MS = 300` cancels a line that started less than 300 ms before the next one.

- **Spec first:** in the same commit, edit FR11 in `specs/2026-11-10-playtest-3-fixes.md` to this: "If the guided player has made no progress along a direction, the bot repeats it after about 3 s, then 6 s, then 12 s, then every 12 s while they're still stuck. Any progress, or a new direction, resets it to 3 s. A repeat waits until the bot has sent nothing for 2 s. Every room still clears with bots in every rotation." Add a dated note that the user changed it on 2026-11-10 after the review.
- **Tests first (red), `brain.test.ts`, tick counts only:**
  - A human Can't see seat in sight never moves after a direction. Over 40 s, the guide repeats it at about 3 s, 9 s, 21 s and 33 s after the first (gaps 3, 6, 12, 12), ± one step. That's exactly 4 repeats, so it's not spam: no two repeats are less than 3 s apart.
  - The seat moves 1 tile along the direction, then stops. The next repeat comes about 3 s after the progress stopped, so the backoff reset.
  - A new heading resets the backoff and is said at once.
  - A repeat is held while anything (a tap, a callout or flavour text) was sent in the last 2 s.
- **Implementation:**
  - Replace `nudged: boolean` with `nudges: number` (0 = none yet) and a `progressAt` mark.
  - The gap before the next repeat is `NUDGE_MS * 2 ** min(nudges, 2)`, which gives 3 s, 6 s, 12 s, 12 s.
  - Measure it from the later of `g.lastSentAt` and the last progress. Add `NUDGE_QUIET_MS = 2000`: no repeat while anything was sent less than that long ago.
  - Progress means `progress(g, p)` grew by at least `PROGRESS` since the last mark. Reset `nudges` and move the mark then.
  - Keep the bot-blind case as it is (the stuck rule handles bots); F7 is separate.
- **Acceptance:** the tests pass. `spec/rooms.test.ts` clears every room in every rotation. `pnpm playtest --room 01` passes.
- **Break check:** by script, make the gap constant at `NUDGE_MS * 4` and cap `nudges` at 1 (the old one-nudge shape); the cadence test goes red.
- **Depends on:** Task 281 (same file, run it first).

### Task 283: A bot Can't see isn't left holding on long runs (F7) — [x]

**Finding (confirmed, LOW):**
- `brain.ts` (about 309): a moving blind bot with no callout for more than `IDLE_MS` (5000 ms) sets `holding`.
- `lastCalloutAt` is set only by an incoming callout. On a straight run nothing is sent (FR10), so a run of 20 tiles or more at 4 tiles/s trips the hold.
- The guide's stuck rule then says "stop" and later "go", which costs time.

- **Test first (red), `brain.test.ts` (or `spec/bots-*.test.ts` if it needs a room):** a bot blind seat guided down a straight corridor of 25 or more tiles reaches the end with `holding` never set and `g.still` never reaching `STUCK_TICKS`.
- **Fix:** while a guide's `blindIsBot` and `g.moving`, it re-sends the same heading callout every `IDLE_MS / 2` since `g.lastSentAt`. This is bot-to-bot keep-alive; it doesn't apply to people, so FR10 still holds for people. Don't touch `IDLE_MS`'s meaning, because a lost guide must still make a bot hold.
- **Acceptance:** the test passes. `spec/rooms.test.ts` clears every room in every rotation, and isn't noticeably slower (compare wall time before and after; log both).
- **Break check:** remove the keep-alive by script; the test goes red.
- **Depends on:** Task 282 (same function).

### Task 284: Right-click opens the side wheel inside the frame (F2) — [x]

**Finding (confirmed, MEDIUM):**
- `src/components/CommsWheel.tsx` (about 316–327) clamps a mouse-opened centre using only the outline's `halfW*k` (and `halfH*k + 40`).
- With `placement === "side"`, the tabs sit at `x = -(widestHalf + SIDE_GAP + SIDE_TAB_W/2)` (`src/client/wheel.ts` about 120) and the plate reaches `SIDE_GAP + SIDE_PLATE_W` to the right.
- `wheelExtent(p, mode, "side")` already knows the full width. A centre clamped to `halfW` puts the tabs at negative x.

- **Test first (red):** a unit test of the clamp. Extract it into a pure function in `src/client/wheelLayout.ts` (or `wheel.ts`) if it's inline, so it can be tested without a browser. On a 1280×337 frame with side placement and a mouse open at x = 5, expect `centre.x − tabLeftEdge·k ≥ 0` and `centre.x + plateRight·k ≤ w`. Add the same case for y near the top and bottom.
- **Fix:** in the mouse branch, clamp with the placement's real extent. For side, the left half is the outline's half plus the gap and tab width; the right half is the outline's half plus the gap and plate width. Those differ, so clamp each side separately rather than using `wheelExtent().width/2`. Stacked keeps its current clamp.
- **Then** add the right-click case to `spec/layout/wheel.test.ts`'s short-window (1280×560) test: right-click near the left edge, and the tabs and plate are inside the frame.
- **Acceptance:** the tests pass, and `pnpm check` is green. Screenshot `review/p3-284-wheel-rightclick-1280.png` at 1280×560 with a right-click at x = 20.
- **Break check:** put back the outline-only clamp by script; the unit test goes red.
- **Depends on:** none.

### Task 285: The radio draws its own range of ticks (F5) — [ ] (review queued)

**Finding (confirmed, LOW):**
- `src/client/render/stations.ts` (about 797) has `const range = 10;` and builds the ticks and `tickX` from it.
- The station view never carries `range`.
- Room 6 has Q1 at `"range":6` and Q3 at `"range":8`. The sim wraps at `num(p.range, 10)`, so on Q3 ticks 9 and 10 are never reached.

- **Perception first:** add `range` to the radio's station view in `src/game/perception.ts`. It's room layout and the same for every role, so a row in the perception tables is enough, but check `src/game/types.ts`'s role tables (CLAUDE.md, Perception). Can't see doesn't get station faces, so confirm what it receives today and keep it the same.
- **Tests first (red):**
  - `perception.test.ts`: a radio with range 8 has `range: 8` in a sighted view.
  - `render.test.ts` (or the stations render test): a radio with range 8 draws 8 tick strokes; with no range it draws 10.
- **Fix:** draw `range` ticks. Task 272 numbered only the needle's tick because 10 numbers didn't fit at the 11 px floor. Work out whether 6 or 8 numbers fit; if they do, number every tick for those ranges and log it. Otherwise keep the needle chip.
- **Acceptance:** the tests pass. `pnpm lint:rooms` is clean, and `spec/rooms.test.ts` is green. Screenshots `review/p3-285-radio-{1280,375}.png` of room 6's Q1 (range 6) via the bench page, the same as Task 272's queue entry. **Human review:** the ticks at 375.
- **Break check:** put back `const range = 10` by script; the render test goes red.
- **Depends on:** none.

### Task 286: A plated radio can't read 10 (F6, latent) — [ ]

**Finding (confirmed, LOW, latent):**
- `platedRadio` can pick a setting up to `range − 1`, which is 9 at range 10. The plate shows that +1, so it can read 10.
- The blind bot texts it digit by digit, and `readNumber` accepts only `^\d$`. `radioPad` then aims at −1 forever.
- Only room 6's Q3 (range 8) is plated today.

- **Test first (red), `src/game/rooms/lint.test.ts`:** a room with a plated radio at range 10 produces a lint issue.
- **Fix:** `lintPlates` rejects a plated radio whose range is above 9, with a message saying the plate must read a single digit. Also cap `platedRadio`'s settings at 8 (positions 0–8, which read 1–9), so a future room can't hit it either. Test that too, in `src/game/sim/stations.test.ts` (seeded, every seed in a small range).
- **Acceptance:** the tests pass, `pnpm lint:rooms` is clean, and `spec/rooms.test.ts` is green.
- **Break check:** remove the lint rule by script; the lint test goes red.
- **Depends on:** none.

### Task 287: "Space: hold hands" only when Space would hold hands (F4), and the identity test's reach (F8) — [ ]

**Finding F4 (confirmed, LOW):**
- `src/client/labels.ts` (about 171) shows the chip when both of you are free, within reach and visible.
- But `actOn` in `src/game/sim/gear.ts` runs only when no station took the press. It then tries gear underfoot, then a sill, and only then hold hands.
- The server's own hint (`view.act === "Hold hands"`, `perception.ts` `actHint`) already knows which action Space will take.

- **Test first (red), `labels.test.ts`:** you stand on gear with an empty slot, and a free teammate is in reach. Expect no `canhold` chip.
- **Fix:** pass `view.act` into `labelsFor` (via the existing options argument that carries `seat`/`phone`), and show the chip only when `act === "Hold hands"`. Keep the server as the one source of truth, and remove any client re-derivation that's now redundant.
- **F8 (refuted, but a real gap):** widen the "no identity" test in `src/game/perception.test.ts`. Today its regex covers only `hand`, `holding`, `heldBy`, `partner` and `leader`. Make it check that **no** field anywhere under Can't see's `you` (walk the object) holds the partner's seat number in a field that wasn't there before ADR 0030. Use an allowlist of `you`'s known keys, so a new field such as `with: 1` fails the test until someone adds it on purpose.
- **Acceptance:** the tests pass, `pnpm check` is green, and the hold-hands chip screenshot from Task 277 still shows the chip when it should (`review/p3-287-hold-1280.png`).
- **Break check:** drop the `act` gate by script; the F4 test goes red. Add a `with: seat` field to Can't see's `you` by script; the F8 test goes red.
- **Depends on:** none.

### Task 288: A spectator following Can't see sees Can't see's frame (F9, FR4, option b) — [ ]

**Finding (confirmed, LOW):**
- `spectatorView` (`perception.ts` about 1331) never sets `you.hand`.
- `Spectator.tsx`'s scene sets neither `own` nor `hand`.
- `render/index.ts` (about 289) draws the blind frame only when `!scene.spectator`, so a spectator always gets the full room.
- FR4 says "A spectator following Can't see sees what Can't see sees, link included". The user chose option b: build it.

- **Perception:** when a spectator follows a Can't see seat, `spectatorView` also carries that seat's `hand` (the same touch shape: `dir`, `leads`, `pulling`, no identity) and its `motion`. Check ADR 0030 and the spectator rules (spec §4.1). A spectator is a watcher, not a seat, so sending what Can't see feels is within FR4. The room stays sent as it is today, so switching who you follow is instant.
- **Tests first (red):**
  - `perception.test.ts`: `spectatorView` following a held Can't see seat has `hand` with exactly `["dir","leads","pulling"]`. Following a sighted seat, or nobody, it has no `hand`.
  - A render test: a spectator scene following Can't see draws the blind frame (`drawOwnBlind`) with the link; following a sighted seat, it draws the room.
- **Client:** `Spectator.tsx` passes `own` and `hand` into the scene when the followed seat is Can't see. `render/index.ts` draws the blind frame for a spectator when the followed seat's role is blind. Keep the spectator chrome (grey, dashed, no wheel) and the "following X" label as they are.
- **Spec:** FR4 already says this; no edit is needed. Note in the commit that this closes FR4, which commit `ebed47b` claimed.
- **Acceptance:** the tests pass. `pnpm check` is green. Screenshots `review/p3-288-spectator-blind-{1280,375}.png` (spectator following a held Can't see). **Human review:** whether watching Can't see this way reads well.
- **Break check:** put back `!scene.spectator` by script; the render test goes red.
- **Depends on:** none.

## Order

Run them in this order: 279, 280, 281, 282, 283, 284, 285, 286, 287, 288. 281–283 share `brain.ts`, so keep them in that order. The rest are independent: if one parks, carry on.

## Phase Definition of Done

- Every task is ticked, or parked with a line under `## p3fix`.
- Every human review is appended to `review/QUEUE-p3.md` under a heading `## Phase 05`.
- `pnpm check` is green on the tip.
- Also update the overview's phase map and coverage table: add row 05 and the F-findings.
- Then commit `Unit done: p3fix05`.

## Corrections log

(empty)
