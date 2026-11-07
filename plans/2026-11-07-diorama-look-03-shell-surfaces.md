# Diorama look — Phase 2: shell surfaces, buttons, the frame, the reveal and home

- **Date:** 2026-11-07
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-07
- **Part of:** `plans/2026-11-07-diorama-look-00-overview.md`. Read it first: §2 (FR3, FR4, FR6,
  FR7), §3 (test files: `spec/layout/frame.test.ts` and `spec/layout/backdrop.test.ts` are new) and
  §4.1.
- **Depends on phases:** 1 (tokens `--panel-hi`, `--r-lg`, `--sheen`, `--lift`, `--r: 8px`).

## 1. Summary

The shell gets the world's light: lit panels, wells, pill chips, lit buttons, and a recessed bezel with
a role tab and a 1 px role rim round the canvas. The reveal draws the room in dusk behind its card
instead of black, and the home page gets a dusk glow and framed feed windows.

## 2. Requirements (this phase)

### 2.1 Functional

- FR3 in full. FR4: buttons and pills. FR6 in full. FR7 in full.

### 2.2 Non-functional

- NFR-a11y: focus rings still 3 px `--ui` with a 2 px `--bg` gap. Targets ≥ 48 px. Axe passes
  (`spec/layout/axe.test.ts`).
- NFR-verify: screenshots at 1280 and 375 for each role, plus a spectator.

### 2.3 Out of scope for this phase

- The canvas world (phases 3 and 4). The decor in the home feeds (Task 117).

### 2.4 Assumptions

- See overview §2.4.
- The black reveal backdrop's cause is unknown. Task 102 reproduces it first and fixes that cause.

## 3. Existing code context (verified 2026-11-07)

- **Tokens from phase 1** (in `src/styles/tokens.css`): `--panel-hi`, `--r-lg: 14px`, `--sheen`,
  `--lift`, `--r: 8px`. HC sets `--sheen: none; --lift: none`.
- **Buttons** (`src/styles/pages.css`): `.btn` at line 40, `.btn:hover` 57, `.btn.primary` 61,
  `.btn.primary:hover` 66, `.btn.primary[aria-disabled="true"]` 164, `.btn:disabled` 407, `.btn.icon`
  501. In-game: `.hud-btn` (`game.css:388`), `.reveal .btn` (320), `.reveal-crew .btn.selected` (254).
- **HUD bar**: `.hud-top` (`game.css:358`), markup `<header class="hud-top">` in
  `src/components/Game.tsx:1015`. `.hud-crew li` (415) are its chips.
- **The frame** (`game.css:598–622`): `.frame { border: 4px solid var(--frame); background:
  var(--ink); }`, `.notch { top:-4px; left:-4px; width:32px; height:32px; background: var(--frame) }`.
  Markup `Game.tsx:1132`: `<div class="frame" ref={frame}><span class="notch" aria-hidden="true">
  <RoleShape role={role} size={20} mono /></span><canvas …/>…`. `--frame` is set on `.game` as
  `var(--role-${role})` (line 1011). The spectator: `.frame.spectator-frame { border: 4px dashed
  var(--ui-muted) }` (line 505), with a phone override at line 582.
- **Overlays sharing the frame's top-left corner**: `.top-stack` (the side-job chip and the braille
  card, `game.css:1595` "a chip at the frame's top-left, past the notch"). The tab's growth from 32 to
  36 px must keep the side-job chip clear of it.
- **The reveal** (`game.css:17–78`): `.reveal-frame { background: var(--ink) }`, `.reveal-canvas
  { filter: blur(6px) }`, `.reveal-scrim { background: var(--scrim) }`. It is drawn by
  `useDraw(rt.current, backdrop, stage, reveal.role, reveal.crew, true)` (`Game.tsx:502`). The loop
  `return`s while `rt.view` is null (`Game.tsx:183`), and `drawScene` paints `COLOR.ink` for Can't see
  or when `!scene.tiles` (`render/index.ts:245`). The black shot,
  `review/bp-02-task81-played-icons-1280.png`, is room 2 as Can't speak (sighted), so the black is a
  missing view or tiles, not the blind rule.
- **Dusk:** `setDusk(on, nowMs, instant)` in `src/client/tokens.ts`. `drawScene` calls
  `setDusk(!!scene.alarm, …)` every frame, so a dusk backdrop needs a new `Scene` field to ask for it.
- **Home:** `src/components/Home.tsx:96` `<section class="home-hero">`. Feeds in
  `src/components/Feeds.tsx:252` `<div class="feeds">`, each feed `.feed-screen`.
- **Existing layout specs to keep green:** `spec/layout/reveal.test.ts` (649 lines),
  `spec/layout/hud.test.ts`, `spec/layout/home.test.ts`, `spec/layout/spectator.test.ts`,
  `spec/layout/cache-chip.test.ts` (side-job chip position) and `spec/layout/buttons.test.ts`.

### Interfaces from earlier phases (exact)

From Task 98 (`src/styles/tokens.css`):

```css
--panel-hi: #261f35;
--r-lg: 14px;
--sheen: inset 0 1px 0 rgb(255 255 255 / 6%);
--lift: 0 1px 2px rgb(0 0 0 / 30%), 0 8px 24px rgb(0 0 0 / 28%);
--r: 8px;
/* :root[data-contrast="high"] */ --sheen: none; --lift: none;
```

From Task 98 (`src/client/tokens.ts`): `COLOR.panelHi: string`.

## 4. Approach

- **Surface recipe**, one CSS custom property so HC can drop it:
  `--surface: linear-gradient(135deg, var(--panel-hi), var(--panel));` (HC: `var(--panel)`). A panel is
  `background: var(--surface); box-shadow: var(--sheen), var(--lift); border-radius: var(--r-lg)`. A
  well (a nested row) is `background: color-mix(in srgb, var(--bg) 55%, var(--panel)); box-shadow:
  inset 0 1px 2px rgb(0 0 0 / 35%)` (HC: `--bg`, no shadow).
- **The bezel:** `.frame` loses its 4 px border. It gets `padding: 6px; background: var(--panel);
  border-radius: var(--r-lg); box-shadow: var(--lift), 0 0 0 1px var(--frame)` (the 1 px rim).
  Inside, a `.recess` wraps the canvas: `border-radius: calc(var(--r-lg) - 6px); overflow: hidden;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 8%), inset 0 2px 8px rgb(0 0 0 / 55%)`. The tab
  (`.notch`) is 36 × 36 at the bezel's top-left, `--frame` fill, the shape in `--bg`, with a short
  role line `::after` 64 px × 2 px along the top edge. The spectator: `outline: 2px dashed
  var(--ui-muted); outline-offset: -2px` on the bezel, with no rim or tab.
- **The dusk reveal:** a new `Scene.dusk?: boolean` makes `drawScene` call `setDusk(true, 0, true)`
  instead of following the alarm. The reveal's `useDraw(..., flat=true)` sets it. The `.reveal-canvas`
  blur goes from 6 to 3 px (FR7's "blurred", per the spec's mockup). Can't see's reveal keeps
  `--ink`, because `drawScene` already paints ink for blind.

## 5. Task breakdown

### Task 100: Lit panels, wells, pills, and buttons (FR3, FR4) [x] (review queued)

- **Description:**
  - Apply the surface recipe (this file's §4) to every shell panel: the home join panel, the lobby
    cards, the reveal card and crew, HUD menus and sheets, the cleared card, `LeaderboardPanel`, and
    `.hud-top`. Nested rows (the crew rows, the players, the board rows) become wells.
  - Status chips (`.hud-tag`, ready states, the connection light) become pills (`border-radius:
    999px`).
  - `.btn` gets the lit `--panel-hi` body, a 2 px `--ui-muted` outline, and `--ui` on hover.
    `.btn.primary` gets a `--ui` fill and `--bg` text. Disabled states keep their hatch.
  - DESIGN.md §2 Shell gains a "Surfaces" line naming `--sheen`, `--lift` and the well, and "Buttons"
    naming primary and secondary.
- **Files touched:** `src/styles/pages.css`, `src/styles/game.css`, `src/styles/shell.css`,
  `src/styles/tokens.css` (`--surface`), `DESIGN.md`, `spec/layout/buttons.test.ts`.
- **Tests first (red):** `spec/layout/buttons.test.ts`:
  - "a secondary button has a 2 px outline and a lit body; a primary has a --ui fill" (computed
    styles at 1280 and 375).
  - "in high contrast no panel has a box-shadow or gradient" (toggle the setting; read
    `getComputedStyle(panel).boxShadow === "none"` and `backgroundImage === "none"` for the reveal card,
    the lobby card and `.hud-top`).
- **Implementation (green):** CSS only.
- **Acceptance criteria:** both tests pass. `axe.test.ts` and `buttons.test.ts`'s existing 48 px
  checks are green.
- **Break check:** remove the HC `--surface` override (scripted). The HC case goes red.
- **Human review:** on a local build at 1280 and 375, look at the lobby, the reveal, the HUD and the
  cleared card. A pass is: panels read as lit from the upper left, buttons are clearly pressable and
  primary is obvious, and nothing looks embossed or heavy.
- **Depends on:** none in this phase (phase 1 tokens).

### Task 101: The bezel, role tab and 1 px rim (FR6) [x] (review queued)

- **Description:**
  - In `Game.tsx`, wrap the canvas and its overlays in `<div class="recess">` inside `.frame`. The
    `.notch` becomes the 36 px tab, with `RoleShape size={22}`.
  - CSS as in this file's §4, with the spectator variant in `Spectator.tsx`/`game.css:505`.
  - Move `.top-stack`'s left offset so it starts past the 36 px tab.
  - DESIGN.md §4.7 "The role frame" is rewritten: the bezel, recess, tab, role line and 1 px rim,
    with why (readable from a distance by the tab and the line; the rim keeps the role colour all
    round without a heavy border). The dashed spectator bezel.
- **Files touched:** `src/components/Game.tsx`, `src/components/Spectator.tsx`, `src/styles/game.css`,
  `DESIGN.md`, `spec/layout/frame.test.ts` (new).
- **Tests first (red):** `spec/layout/frame.test.ts`, for Can't hear, Can't speak, Can't see and a
  spectator, at 1280 and 375:
  - "the role tab is at least 36 px square at the frame's top-left, filled in the role colour";
  - "the frame has a 1 px rim in the role colour on all four sides" (computed `box-shadow`);
  - "the side-job chip's box never touches the role tab's box" (named neighbour: `.top-stack`);
  - "the spectator's frame is dashed and has no tab".
- **Implementation (green):** as described.
- **Acceptance criteria:** the new spec passes, and `spec/layout/cache-chip.test.ts`,
  `spec/layout/hud.test.ts` and `spec/layout/spectator.test.ts` are green.
- **Break check:** shrink `.notch` to 28 px (scripted). The 36 px case goes red.
- **Human review:** on a local build, with three tabs at 1280 and one phone at 375. A pass is: from
  across a room you can tell whose screen is whose by the tab, the canvas looks set into the panel,
  and nothing overlaps the tab.
- **Depends on:** Task 100 (the panel recipe the bezel uses).

### Task 102: A dusk reveal, its black backdrop fixed, and the home glow and windows (FR7)

- **Description:**
  1. **Reproduce the black backdrop first.** In `spec/layout/backdrop.test.ts` (new): "the reveal of
     room 2 draws the room behind the card for a sighted role": clear room 1, press Next, and at room
     2's reveal sample the `.reveal-canvas canvas` centre pixel. It must not be `--ink` or transparent.
     Run it and confirm red. Find the cause from what the test shows (candidates:
     `rt.view` is null because `early.view` belongs to the room before, as the blind-purpose FR3 fix
     filters by `roomRef`; or the tick-0 view for room 2 is never sent to a page that was already on
     the cleared screen). Fix that cause, test-first.
  2. **Dusk:** add `Scene.dusk?: boolean`. In `drawScene`, `setDusk(scene.dusk || !!scene.alarm, …,
     scene.dusk ? true : …)`. The reveal's flat draw sets `dusk: true`. Blur goes to 3 px. The dusk
     state must not leak into the game's first frame: the game's scene has no `dusk`, so `setDusk`
     eases back. Make it instant by having the game's first frame pass `instant` when it comes from
     the reveal.
  3. **Home:** `.home-hero` gets a still radial `background: radial-gradient(at 15% 0%,
     color-mix(in srgb, var(--role-mute) 18%, transparent), transparent 60%)` (HC: none). Each
     `.feed-screen` becomes a window: `--r-lg` radius, a `--panel` bezel with `--lift`, and the recess
     shadow (Task 101's `.recess`).
  4. DESIGN.md §1 (the dusk reveal), and the `RoleReveal` and `Feeds` entries.
- **Files touched:** `src/components/Game.tsx` (and the fix's file, if elsewhere), `src/client/render/index.ts`,
  `src/styles/game.css`, `src/styles/pages.css`, `src/components/Home.tsx`, `src/components/Feeds.tsx`,
  `DESIGN.md`, `spec/layout/backdrop.test.ts` (new), `src/client/render.test.ts` (one case).
- **Tests first (red):**
  - The backdrop spec (step 1), red before the fix.
  - `render.test.ts`: "a scene with dusk: true draws the wall top in the dusk wall colour, with no
    alarm".
  - `backdrop.test.ts`: "Can't see's reveal backdrop stays ink".
- **Implementation (green):** as described.
- **Acceptance criteria:** the three tests pass, and `spec/layout/reveal.test.ts` and
  `spec/layout/home.test.ts` are green. The commit names the root cause of the black backdrop.
- **Break check:** remove `dusk: true` from the reveal's scene (scripted). The render case goes red.
  Revert the fix. The backdrop spec goes red.
- **Human review:** on a local build at 1280 and 375. Look at the reveal for each role in rooms 1 and
  2, and at the home page. A pass is: the room shows dimly in dusk behind the card (never black for a
  sighted role), the home page has a soft corner glow, and the feeds look like windows.
- **Depends on:** Task 101 (the `.recess` style the feeds reuse).

## 6. Phase Definition of Done

- [ ] Tasks 100 to 102 are complete and their tests pass.
- [ ] `pnpm test:unit` passes.
- [ ] The full check passes (overview §3).
- [ ] Screenshots `review/diorama/p2-*.png` at 1280 and 375: home, lobby, the reveal (each role),
      the game (each role and a spectator), and the cleared card. The user has accepted the reviews
      for Tasks 100, 101 and 102.
- [ ] Tick phase 2 in overview §5 and commit.

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR3 | Task 100 |
| FR4 (buttons, pills) | Task 100 |
| FR6 | Task 101 |
| FR7 | Task 102 |

## 8. Risks / open questions

None.

## Corrections log
