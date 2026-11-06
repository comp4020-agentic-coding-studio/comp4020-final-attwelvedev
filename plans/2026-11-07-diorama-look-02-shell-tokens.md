# Diorama look — Phase 1: shell retint and radii (tokens only)

- **Date:** 2026-11-07
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-07
- **Part of:** `plans/2026-11-07-diorama-look-00-overview.md`. Read it first: §2 (FR2, FR4, FR5,
  NFR-a11y), §2.4 (a failing contrast pair is fixed by nudging the token), §3 and §4.1.
- **Depends on phases:** none.

## 1. Summary

The shell's colours move from cold navy to night plum. New surface tokens exist (`--panel-hi`,
`--r-lg`, `--sheen`, `--lift`). `--r` goes to 8 px. The display face is trimmed to the four big lines.
A test proves every text pair passes AA. The layouts and component structure don't change. Surfaces
and the frame are phase 2.

## 2. Requirements (this phase)

### 2.1 Functional

- FR2 in full.
- FR4: the tokens only (`--r` 8 px, `--r-lg`). Buttons and pills are phase 2.
- FR5 in full (it is a CSS change at the existing selectors).

### 2.2 Non-functional

- NFR-a11y: the AA test over every text pair on the shell surfaces.
- NFR-verify: screenshots of home, lobby, reveal, the game HUD and the cleared card at 1280 and 375.

### 2.3 Out of scope for this phase

- Gradients, `--sheen` or `--lift` in use, the bezel, the reveal backdrop (phase 2).

### 2.4 Assumptions

- See overview §2.4.

## 3. Existing code context (verified 2026-11-07)

- `src/styles/tokens.css` `:root`: `--bg: #0b1220; --panel: #141e36; --ui: #e8eef9; --ui-muted:
  #9aa7c2; --glass: rgb(20 30 54 / 88%); --scrim: rgb(11 18 32 / 62%); --r: 4px;`. The HC block sets
  `--bg/--panel: #000000`, `--glass: rgb(0 0 0 / 92%)`, and `--scrim: rgb(0 0 0 / 70%)`.
  `--hatch` uses `rgb(154 167 194 / 35%)` (the old `--ui-muted`).
- `src/client/tokens.ts` `NORMAL: ColorTokens` mirrors `bg`, `panel`, `ink`, `ui`, `uiMuted`,
  `danger`, `goal` and `cameraLight`. `tokens.test.ts` compares each with `tokens.css`.
- Hard-coded copies of the old navy to replace with tokens: `src/styles/game.css` `.overlay {
  background: rgb(11 18 32 / 85%); }` (line ~628). Search `rgb(11 18 32`, `rgb(20 30 54`, `#0b1220`
  and `#141e36` in `src/` (CSS and TSX) and replace each with a token or a `color-mix` of one.
- `--r` is used 34× in `game.css`, 14× in `pages.css`, and 0× in `shell.css`. 61 `border-radius`
  declarations exist in all, some literal (`3px`, `999px`, `50%`).
- The display face (`font-stretch: 125%; font-weight: 900`) is at `game.css:117`, `game.css:709`,
  `pages.css:150, 277, 351, 366, 444` and `shell.css:23, 81`. Each selector must be read and kept only
  if it is one of FR5's four (home hero, lobby code, reveal role line, cleared title and time).
- Canvas uses of `--r`: `src/client/render/labels.ts` and `pops.ts` draw `roundRect` with literal
  radii. Search `roundRect(` in `src/client/render/` and mirror the 8 px where it is the shell's chip
  radius (`MAP`/a new `SHELL.r = 8` in `tokens.ts`).

### Interfaces from earlier phases (exact)

None.

## 4. Approach

The AA test (`src/client/contrast.test.ts`, a new unit file) parses `tokens.css` and composites each
`rgb(… / a%)` over `--bg`. It checks this table, in normal mode and in HC:

| Text | On | Min |
| --- | --- | --- |
| `--ui`, `--ui-muted` | `--bg`, `--panel`, `--panel-hi`, `--glass`/`--bg` | 4.5 |
| `--danger`, `--goal`, `--role-*` | `--bg`, `--panel`, `--panel-hi` | 4.5 |
| `--bg` (primary button text) | `--ui` | 4.5 |
| `--ui` | `--scrim` over `--w-floor` and over the **dusk** floor | 4.5 |

The worst case on paper is danger on `--panel-hi`, at 4.54. If a pair fails, nudge that token's
lightness, log it in the Corrections log, and update overview §2.1 FR2.

## 5. Task breakdown

### Task 98: Plum tokens, surface tokens, radii, and the AA test (FR2, FR4 tokens, NFR-a11y)

- **Description:**
  - Set the FR2 values in `tokens.css` and mirror them in `tokens.ts` `NORMAL`. Add `panelHi` to
    `ColorTokens` (HC `#000000`).
  - Add `--panel-hi`, `--r-lg: 14px`, `--sheen` and `--lift` (overview §4.1), with HC `--sheen: none;
    --lift: none`.
  - Set `--r: 8px`, and recompute `--hatch` from the new `--ui-muted` (`rgb(171 161 192 / 35%)`).
  - Write `src/client/contrast.test.ts` (this file's §4).
- **Files touched:** `src/styles/tokens.css`, `src/client/tokens.ts`, `src/client/tokens.test.ts`,
  `src/client/contrast.test.ts` (new), `DESIGN.md` (§2 Shell table: `--panel-hi`; Scale: `--r-lg`,
  `--sheen`, `--lift`).
- **Tests first (red):** `contrast.test.ts` (the table, both modes). `tokens.test.ts`: "--panel-hi
  matches tokens.css". Both fail before the tokens exist.
- **Implementation (green):** the token edits.
- **Acceptance criteria:** both test files are green, and `spec/design.test.ts` is green.
- **Break check:** set `--ui-muted` to `#6f6785` with a script. The contrast test goes red with the
  failing pair named.
- **Depends on:** none.

### Task 99: The retint applied across the shell, and the display face trimmed (FR2, FR5)

- **Description:**
  - Replace each hard-coded navy (this file's §3) with its token.
  - Literal radii that are the shell's corner become `var(--r)`. Pills stay `999px`, circles `50%`.
  - Every display-face selector not in FR5's four drops to `font-stretch: 100%; font-weight: 800`.
  - The canvas chips' `roundRect` radius reads `SHELL.r`.
  - DESIGN.md §3 Type: the "Expanded, black" line lists exactly FR5's four, and headings are
    "100 %, 800". §1: "night-glass" becomes "dusk plum", with the reason (it matches the world's
    dusk, not a cold navy).
- **Files touched:** `src/styles/game.css`, `src/styles/pages.css`, `src/styles/shell.css`, any
  `src/components/*.tsx` with an inline colour, `src/client/render/labels.ts`,
  `src/client/render/pops.ts`, `src/client/tokens.ts`, `DESIGN.md`,
  `spec/layout/home.test.ts` (one new case).
- **Tests first (red):**
  - A grep test in `spec/design.test.ts`: "no shell CSS or component holds the old navy (`#0b1220`,
    `#141e36`, `rgb(11 18 32`, `rgb(20 30 54`)". Red today.
  - `spec/layout/home.test.ts`: "only the hero uses the 125 % display face on the home page". It
    reads `getComputedStyle(...).fontStretch` for every heading.
- **Implementation (green):** as described.
- **Acceptance criteria:** both tests pass. The full check is green (layout specs that measured old
  radii or sizes are fixed only where they measured the radius itself, never by loosening a promise).
- **Break check:** restore one `rgb(11 18 32 / 85%)` with a script. The grep test goes red.
- **Human review:** on a local build at 1280 and 375, compare the home, lobby, reveal, game HUD and
  cleared card against the `review/` shots from before. A pass is: the shell reads as warm dusk plum
  that belongs with the pastel world, the text is as legible, and the headings are calmer, with the
  four big lines still bold.
- **Depends on:** Task 98.

## 6. Phase Definition of Done

- [ ] Tasks 98 and 99 are complete and their tests pass.
- [ ] `pnpm test:unit` passes.
- [ ] The full check passes (overview §3).
- [ ] Screenshots `review/diorama/p1-<page>-<1280|375>.png` exist for home, lobby, reveal, game and
      cleared. The user has accepted Task 99's review.
- [ ] Tick phase 1 in overview §5 and commit.

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR2 | Tasks 98, 99 |
| FR4 (tokens) | Task 98 |
| FR5 | Task 99 |
| NFR-a11y (AA) | Task 98 |

## 8. Risks / open questions

None.

## Corrections log
