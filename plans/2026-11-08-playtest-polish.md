# Playtest polish: centred phone hint, "Who perceives what", figure sheens, crew favicon

- **Date:** 2026-11-08
- **Tier:** Slice
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-08, in conversation (G2 and R1 from the playtest list; G4, F1 and R1 as proposed and confirmed)
- **Comes from:** `overnight/playtest-2026-11-08-findings.md` (G2, G4, R1, F1)
- **Runs after:** the overnight lane (dl09 and its fixes). It edits `RoleReveal.tsx`, `Game.tsx`, `figures.ts` and `materials.ts`, which that lane is still changing. Refer to code by name: line numbers will have moved.

## What you'll see

- The phone's controls line sits centred under the stick and the big button.
- The reveal's fold-out reads "Who perceives what" (sight is a perception too).
- Each hat's sheen stays inside its shape: a short arc on the dome, a straight line on the cone, an L on the box.
- The browser tab shows the three crew figures as they look in the game: pill bodies with a dome, box and cone hat.

## Demo script

Run locally on a free port: `pnpm build && PORT=8092 pnpm start:check`, then `http://localhost:8092`.

1. Phone seat (375 px, touch), in a room → "Stick moves · big button acts · hold Wheel to send" is centred under the controls. A desktop seat's "WASD or arrows move · Space acts" is unchanged.
2. Any role's reveal → the button reads "Who perceives what"; pressing it opens the same lines as before. "Who hears what" appears nowhere on the page.
3. The three hats, zoomed 300 % in a screenshot → an arc, a line and an L, each inside its outline and clear of the edge. High contrast: no sheen.
4. The tab icon at 16 and 32 px → three figures, each with its hat, in the three role colours on the dark.

## Requirements

- R1 The phone hint is centred, the desktop line is not touched (demo 1) → Task 1.
- R2 The disclosure is named "Who perceives what" everywhere a person or a test sees it. The storage key `heist.reveal` stays (demo 2) → Task 1.
- R3 `paintHatSheen` takes the hat's shape and draws one stroke inset from its upper-left contour, entirely inside the shape (demo 3) → Task 2.
- R4 `public/favicon.svg` draws the crew as in-game figures; `public/favicon-32.png` is regenerated from it (demo 4) → Task 3.
- R5 DESIGN.md is updated in the same commits: §4.2 (the sheen rule), §7 (the reveal copy), the favicon paragraph (Tasks 1–3).

Defaults taken, to veto before running: the desktop hint stays left as it is (the finding was about the phone); the favicon keeps the face disc and drops gradients, eyes and sheen, which do not survive 16 px.

## Out of scope

- Centring any other line; renaming other "hears" wording (`channels.test.ts`, bot comments, `wheel.ts`: those are about sound).
- An Apple touch icon or web manifest.
- The Can't hear sheen question beyond the L: if the L looks busy in Task 2's render, fall back to a short top-left stroke and say so.

## Tasks

Each new or changed assertion that guards a promise is shown red first, with a break script that asserts the text it replaces (CLAUDE.md), and the commit says what was broken. `pnpm check` must be green against `PORT=8092 pnpm start:check` with `APP_URL=http://localhost:8092`.

- [x] **Task 1: Centre the phone hint; rename the disclosure**
  - Files: `src/components/Game.tsx` (the touch branch's `<p class="keys">` gets `keys keys-touch`), `src/styles/game.css` (`.keys-touch { text-align: center }`, its comment), `src/components/RoleReveal.tsx` (the button label, the comment above it), `src/styles/game.css` (the disclosure's comment), `src/client/revealPrefs.ts` and `.test.ts` (comments and describe title), `spec/layout/reveal.test.ts` (every `getByRole("button", { name: "Who hears what" })` and the test titles), `DESIGN.md` §7 (the `RoleReveal` line).
  - Tests first (red, then green): in `spec/layout/game.test.ts`, the phone-hint test also asserts the hint's text is centred (its box's centre within 2 px of the `.game` frame's centre, at 375). In `spec/layout/reveal.test.ts`, the buttons match `Who perceives what` and a new assertion checks that no element on the reveal has the text "Who hears what". Break: remove `keys-touch`; restore the old label.
  - Acceptance: demo steps 1 and 2. `grep -rn "Who hears what" src spec DESIGN.md` finds nothing.
  - Depends on: none.

- [x] **Task 2: A sheen that follows the hat**
  - Files: `src/client/render/materials.ts` (`paintHatSheen` gains the shape: `paintHatSheen(c, cx, cy, r, shape)`; one stroke, 40 % white, inset about 0.25 r from the upper-left contour: the existing arc for a circle; a line parallel to the cone's left edge, trimmed 20 % at each end; an L (top edge and left edge, each trimmed) for a square), `src/client/render/figures.ts` (the one call passes `ROLE_SHAPE[who.role]`), `DESIGN.md` §4.2 ("The hat has a sheen arc" becomes the per-shape rule).
  - Test first, in `src/client/render/materials.test.ts`: for each of the three shapes, record the stroke's points and assert every point lies strictly inside `shapePath`'s outline (a point-in-polygon check; the triangle's apex is `cy - r`, its base is `cy + 0.85 r`, per `shapePath` in `shared.ts`), and that high contrast draws nothing. Red by passing `"circle"` for every shape.
  - Acceptance: demo step 3.
  - Depends on: none.
  - Human review: the three hats at 1×, 2× and 3× in a local build screenshot. A pass means the L on the box reads as light on a corner, not as clutter.

- [ ] **Task 3: The crew favicon**
  - Files: `public/favicon.svg` (three pill bodies with a dome, a box and a cone hat in `#f2a93b`, `#4db3ff`, `#9b7ee0` on `#15121f`; outline and face disc only), `scripts/favicon-png.ts` (new: loads the SVG in headless Chromium through the `playwright` already in devDependencies and writes the 32 px PNG; no new dependency, since the machine has no `rsvg-convert` or ImageMagick), `public/favicon-32.png` (generated by that script, never hand-edited), `spec/favicon.test.ts`, `DESIGN.md` (the favicon paragraph).
  - Test first, in `spec/favicon.test.ts`: the SVG has, per role colour, a rounded body and a hat of the right element (a `<circle>`, a `<rect>` and a `<path>` triangle), the PNG's IHDR says 32×32, and it still links from every page. Red against today's SVG, whose heads are all circles.
  - Acceptance: demo step 4.
  - Depends on: none.
  - Human review: the icon at 16 and 32 px on a light and a dark tab bar. A pass means three distinct figures, not a smudge.

## Human review

- **Tasks 2 and 3, on a local build.** Screenshots of the hats and of the icon at the sizes above. Your sign-off is needed; green tests are not enough.

## Corrections log

<!-- one line per user redirect during execution: date — what changed and why -->
