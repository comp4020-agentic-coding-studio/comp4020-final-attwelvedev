# Playtest 3 fixes: Phase 04, the jerk after the intro

- **Status:** Approved
- **Tier:** bug
- **Overview:** `plans/2026-11-10-playtest-3-fixes-00-overview.md` (§1 run rules). Spec: `specs/2026-11-10-playtest-3-fixes.md` B4.

## What the user sees

After the swoop and the hop (which are fine), something happens for a split second: a quick tilt, and the room's window darkens. Only then does the timer run.

## Context (read this turn)

- **The timeline:** `INTRO = { hold: 300, tilt: 900, swoop: 900, land: 300 }` (`src/game/intro.ts`). `introAt(elapsedMs, reduced, ms)` is in `src/client/intro.ts`.
- **When the intro ends,** `introScene` (`src/components/Game.tsx:370-398`) returns `{}`. Rise, swoop, landing, `introFit` and `sunrise` all drop in the same frame. If `sunrise` < 1 or the camera's last intro framing isn't the settled camera, that frame snaps.
- **The server** holds the first tick for `INTRO_FOR` (`src/net/attach.ts:296-310`), so the first view after the intro arrives at about the same moment. A camera or `seen` change on that first tick can also show.
- **Backlog 2026-11-08 (pf01):** the tile atlas is off during the intro. The first settled frame turns it on, a different drawing path.

## Task 278: Find and fix the jerk (B4) — [ ] (parked: did not reproduce; see `plans/2026-11-07-overnight.md` p3fix04/278)

1. **Reproduce on a real canvas** (`CLAUDE.md`). With `pnpm start:check` (but `INTRO_MS` unset, so the real 2.4 s intro runs), capture frames in headless Chrome from 2.2 s to 2.8 s after `intro` arrives, every 16 ms, for one seat at 1280×800. The repo's `scripts/` has bench and playtest helpers that open real tabs; reuse them. For each frame, measure:
   - the camera's tilt (`rise`) and position
   - the mean luminance of the frame
   - whether the atlas path is on (log from the draw, behind a test-only flag, or compare the frames)
2. **Name the cause** from the numbers: which frame differs, and which value jumps. Save the frames to `review/p3-278-frames/`, and write the measurements into the task's commit or the park line.
3. **Test first (red):** a unit test of the cause, for example:
   - "the last intro frame and the first settled frame have the same camera and sunrise = 1" in `src/client/intro.test.ts` / `render.test.ts`
   - or "the atlas draws the same luminance as the non-atlas path for the same scene"

   Then the fix.
4. **Stop and park** (§1 rule 3) if the frames show no jump. Record the measurements. Don't guess at a fix.

- **Acceptance:** the test passes, and a re-capture shows no frame-to-frame jump in tilt or luminance at the handover beyond the swoop's own easing. **Human review:** the user watches room 1 start at 1280 and on a phone.
- **Break check:** by script, put back the cause; the test goes red.
- **Depends on:** none.

## Phase Definition of Done

Task 278 is ticked or parked with measurements, `pnpm check` is green, then commit `Unit done: p3fix04`.
