# Why the reveal's room and the first intro frame did not line up (2026-11-08)

Measured by `spec/layout/intro.test.ts` ("the first intro frame draws the room where the reveal's
backdrop drew it"), its own app with a 1500 ms hold, room 1, at the first frame the game canvas
draws. Tile (0, 0)'s corner in viewport px, and a tile's width:

| Role, viewport      | Backdrop (x, y, tile) | Game canvas, first frame (x, y, tile) |
| ------------------- | --------------------- | ------------------------------------- |
| Can't speak, 1280×800 | 0, 264.6, 49.23     | 18, 250.5, 47.85                      |
| Can't hear, 375×812   | 0, 366.3, 14.42     | 18, 355.9, 13.04                      |

Can't see draws no room on either canvas (ink), so there is nothing to line up.

**Cause (the hypothesis, confirmed):** the backdrop canvas fills the whole `.reveal-frame` (the
window), while the game canvas sits inside the HUD: the top bar above it, the frame's margin and
6 px bezel around it, the tray below. Both fit the same flat plan to their own canvas
(`fitCamera`), so the room was drawn at two sizes: 1.4 px a tile smaller and 18 px to the right in
the game, which at 48 tiles across is a whole-room shift of up to 66 px. The colour was a second,
separate difference (the backdrop is dusk, the game is not), which Task 4 takes.

**Fix (Task 2):** the backdrop does not move (the reveal's card and its layout stay as they are);
the game's intro camera fits the room inside the backdrop's rectangle instead, read relative to the
game canvas once, at the intro's first frame (`Scene.introFit`). The swoop then flies from there to
the follow camera. After it: the same spec measures within 1 px for both roles.

**Races found under load (fixed in the same commit):** with a full `pnpm check` running, the first
fix still missed by 2 to 49 px. Three causes: the backdrop's camera was eased by the spring, so a
small change of its height trailed the fit; the backdrop drew a frame at its old size when the cover
turned `position: fixed` (the ResizeObserver reports a frame late); and the first game frame could
land in the tilt (the 300 ms hold is shorter than the HUD's mount on a loaded machine). The backdrop
now takes its camera outright and resizes in the frame its box changes; the fit is re-read every
intro frame; the spec measures the first frame with `data-rise` 0, on its own app with the timeline
stretched 3× (`INTRO_MS=7200`).
