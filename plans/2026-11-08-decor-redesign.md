# Decor redesign: real-world things with a job, in every room

- **Date:** 2026-11-08
- **Tier:** Architecture-lite (one file, six tasks, one area: the decor engine and its painters)
- **Status:** Approved (rules and scope confirmed; the item lists below are proposals, gated by the human review in Task 3)
- **Requirements confirmed by user:** yes, 2026-11-08, in conversation: relax the ban in DESIGN.md §4.9; richer detail in every room; each item either has a believable job (a light, a candle, a lamp) or fits the room's theme; decor must still never read as a clue; anything else is excluded
- **Comes from:** the user's playthrough, 2026-11-08 (room 1's pots on a wall's top "make no sense", the ivy is better but needs detail; room 7's rectangles are unreadable; room 8's wall thing and notes are unclear)
- **Runs after:** the overnight lane (dl09 is still editing decor and DESIGN.md §4.9). Refer to code by name: line numbers will have moved.

## What you'll see

- Each room's walls carry things you could name: a lantern on a bracket, a breaker cabinet, a violin hung by its scroll, a framed painting under its light.
- Nothing stands on a wall's top that couldn't (no pots, ferns or planters); a top carries only flush things, such as stone coping.
- Lights are small, still and wall-mounted. No beams, rays, flicker or glow on the floor.
- None of it can be read as a clue, a door, glass, a bell, a dial or an exit.

## The rules (replace §4.9's "Never" list)

1. **A job or a theme.** Every item lights, holds, hangs, covers or supports something, or belongs to the room's theme. Nothing is there only to fill a wall.
2. **Never a clue.** No text, numerals, note heads or the motif shapes (moon, star, wave, key, eye, a single large leaf), and no pattern or colour that encodes a code.
3. **Never a game object.** Nothing that reads as a door, hatch, glass pane, vent with slats, bell, dial, wheel or gauge face, clock, keypad, camera or eye, a cone or beam, a lamp with rays, hazard stripes, or an exit or flag.
4. **Light is quiet.** Static, wall-mounted, one small source; the glow is clipped to its own face (as today), never on the floor, never animated.
5. **Windows are opaque-looking:** shutters, curtains or a night-blue pane with muntins. Never translucent, no sheen band or glints, no dark outline (that is glass's look). If Task 3's review prefers no windows, drop them.
6. **No outline in `WORLD.line`** (the game's mark for solid or interactive things). Depth comes from fills, a north-west highlight and a south-east shade, as the world is lit.
7. **High contrast draws no decor** (unchanged). Placement rules are unchanged (fronts 1 in 6, 3 apart, nothing within a tile of a door, hatch, glass, vent, night or wire, nothing beside a station, plaque, camera or ink).

## Proposed items (the user strikes or swaps these at Task 3)

| Room (theme) | Fronts | Tops |
|---|---|---|
| 01 pavilion | ivy on a lattice (stems, leaf clusters in three sizes, a few small blossoms), a hanging lantern on a bracket (lit), a hanging basket on a hook | stone coping joints, moss (replaces planter) |
| 02 conservatory | flowering vine on an iron-and-wood trellis, a plant shelf on brackets with three pots, a hanging fern basket, a gooseneck wall lamp (lit) | coping, a glazing-bar cresting (replaces fern) |
| 03 watch house | pennant banner on a pole with tassels, a hooded lantern (lit), crossed staves on pegs, a rope coil on a hook | coping |
| 04 bank | raised-panel wainscot with one dado rail, a framed engraving (no text), a banker's wall lamp (lit), a brass coat-hook strip | coping |
| 05 gallery | gilt moulded frames in several sizes holding a landscape and a still life (muted, no portraits: a figure reads as a role shape), a plain label card under each (no text), a picture light (lit) | coping |
| 06 backstage | curtain with folds, tieback and tassel, a dressing-mirror frame with a row of bulbs (unlit), rope and sandbag on hooks, an unlit sconce | coping |
| 07 service | a breaker cabinet (hinged lid, latch, a plain label plate), a conduit run with clips, a pipe with flanged joints, a tool pegboard (spanner and hammer silhouettes), a caged bulb (lit) | coping |
| 08 salon | a violin and a lute hung by their scrolls (wood shading, strings), a framed manuscript (bar lines and a clef, never a note head), a candle sconce (lit), a curtain swag with tieback | coping |
| 09 strongroom | riveted steel plates with weld seams and bolt heads, hinge straps, a cable tray, an I-beam stub, a caged sconce (lit) | rivet row |

Excluded on purpose, from the rules: valve wheels and gauges (dial), spotlights (a cone), louvres (a vent), deposit-box grids with keyholes or numbers (a key, a keypad), spyglasses (an eye or a camera), wall clocks, hazard stripes.

## Out of scope

- Floor decor, props that stand in the room, anything animated, anything inside the game's rules (stations, plates, doors).
- Decor in high contrast.
- Bots and the server: decor is client-only (`decorFor` reads only the layout the client already has).

## Requirements

- R1 The rules above are DESIGN.md §4.9 and ADR 0029 (`proposed`), and the guards enforce them → Task 1.
- R2 The painters live in one file per theme group, with the same behaviour, so the new detail has room → Task 2.
- R3 Rooms 1 and 2 are redrawn and the user accepts the style bar; planters and ferns leave wall tops → Task 3.
- R4 Rooms 3 to 5, 6 to 8 and 9 are redrawn to the same bar, with rooms 7 and 8's named complaints fixed → Tasks 4, 5, 6.
- R5 Decor never paints a floor pixel, still clipped to its face, in every room at both widths; the frame bench stays within its baseline → every task, closed out in Task 6.

## Tasks

Each new or changed assertion that guards a promise is shown red first, with a break script that asserts the text it replaces (CLAUDE.md), and the commit says what was broken. A visual change is verified by a screenshot at 1280 and 375. `pnpm check` green against `PORT=8092 pnpm start:check`.

- [ ] **Task 1: The rules, the ADR and the guards**
  - Files: `doc/adr/0029-decor-may-show-real-things-with-a-job.md` (new, `proposed`; check the next free number first: the overnight run queued ADRs up to 0028; ADR 0026's decor bullets stay as history, 0029 narrows them), `DESIGN.md` §4.9 (the "Never" bullet becomes the seven rules; the theme list becomes the table), `src/client/render/decor-paint.test.ts` (the "banned shapes" tests: replace the circle-size, two-lines, leaf-width and trellis rules with tests for rules 2 to 6: no text or `fillText` call, no stroke in `WORLD.line`, a lit item's glow is clipped to its face and stays at or under 0.35 alpha, a window painter draws no glass sheen, nothing translucent above 0.9 alpha except a glow), `src/client/render/decor.test.ts` ("no theme kind is named as a banned thing": update the banned names to rule 3's list).
  - Tests first: the new guards run against today's painters. Break: add `fillText` to one painter, a `WORLD.line` stroke to another, a translucent window to a third; each goes red.
  - Acceptance: `pnpm check` green; the old banned-shape tests are gone, not weakened (the replaced ones guard rules that no longer exist, and each is replaced by a stricter one on the same file).
  - Depends on: none.

- [ ] **Task 2: Split the painters and build the contact sheet**
  - Files: `src/client/render/decor-paint.ts` becomes the shared helpers (`glow`, `bulb`, `dark`, `paintDecor`, `LOOKS`, `PAINTERS`) plus one file per theme group in `src/client/render/decor-paint/` (`garden.ts` for 01 and 02, `civic.ts` for 03 to 05, `stage.ts` for 06 and 08, `works.ts` for 07 and 09); `scripts/decor-sheet.ts` (new: draws every kind of a room, at its looks, on a wall face in the room's tint at 1×, 2× and 3×, through the real renderer in headless Chromium, to `review/decor/<room>.png`), `src/client/render/atlas.ts` (read `CAP = 64`: each wall tile with decor is an atlas tile named by its looks, so more looks may exceed the cap; Task 2 measures how many distinct wall tiles a room uses and raises `CAP` only if the bench says so).
  - Test first: a move with no look change: `decor-paint.test.ts` and `spec/layout/decor.test.ts` stay green, and `decorTile` names are unchanged. Break: drop one painter from `PAINTERS`; "every theme kind has a painter" goes red.
  - Acceptance: the contact sheet renders for all nine rooms; `pnpm bench:frame --compare` is unchanged.
  - Depends on: Task 1.

- [ ] **Task 3: Rooms 1 and 2, and the style bar**
  - Files: `src/client/render/decor.ts` (`DecorKind`, `THEME_KINDS`, `KIND_FACES`, `LIT`: add the kinds in the table; `planter` and `fern` leave `KIND_FACES`' tops, and tops get `coping`), `src/client/render/decor-paint/garden.ts` (the painters), `LOOKS`, `DESIGN.md` §4.9.
  - Tests first: `decor.test.ts` (every theme kind has a painter and a face, no front kind is placed on a top, a top gets only `coping` or `moss`), `spec/layout/decor.test.ts` stays green for rooms 01 and 02 (decor changes only wall-face pixels). Red by putting `planter` back on a top.
  - Acceptance: the contact sheet and in-game screenshots of rooms 1 and 2 at both widths.
  - Human review: **the style bar.** Look at `review/decor/01-first-steps.png` and `02-three-hands.png`, and the same rooms in a local build. A pass means each item can be named at a glance, looks like part of this world (lit from the north-west, no outline), and none can be mistaken for a signal. Strike or swap items here. The later rooms are drawn to the bar you accept.
  - Depends on: Task 2.

- [ ] **Task 4: Rooms 3, 4 and 5**
  - Files: `src/client/render/decor-paint/civic.ts`, `decor.ts`, `LOOKS`, `DESIGN.md`.
  - Tests first: as Task 3 for the new kinds; the gallery's paintings still use code colours only mixed at least 70 % toward the wall, so no fixed code pattern survives (a test over the painting painter's fills). Red by painting one at full code colour.
  - Acceptance: screenshots of 03, 04 and 05 at both widths; `spec/layout/decor.test.ts` green for them.
  - Depends on: Task 3.

- [ ] **Task 5: Rooms 6, 7 and 8**
  - Files: `src/client/render/decor-paint/stage.ts`, `works.ts`, `decor.ts`, `LOOKS`, `DESIGN.md`. Rooms 7 and 8 have dark zones (`flips` of kind `dark` in their room files): if the client already has those zones, a lit item is not placed within 1 tile of one (add it to `excluded` in `decor.ts` and a test in `decor.test.ts`). If it does not, say so in the commit and make rooms 7 and 8's lit items sit on the far side of a wall from every dark zone's tiles; do not add a field to the wire for this.
  - Tests first: as Task 3; the manuscript painter draws bar lines and a clef and no filled ellipse (no note head). Red by adding a filled ellipse.
  - Acceptance: room 7's breaker cabinet and pegboard, and room 8's violin, lute and manuscript, each nameable at a glance in a screenshot at both widths.
  - Human review: rooms 7 and 8 specifically, since they were the named complaints. A pass means you can say what each thing is.
  - Depends on: Task 3.

- [ ] **Task 6: Room 9, and the whole-set check**
  - Files: `src/client/render/decor-paint/works.ts`, `decor.ts`, `LOOKS`, `DESIGN.md` §4.9 (final), `PROCESS_LOG.md` (the user's correction to decor and the rule it became).
  - Tests: `spec/layout/decor.test.ts` for all nine rooms at both widths; the full `pnpm check`; `pnpm bench:frame --compare` within the baseline in `review/diorama/bench-baseline.json`.
  - Acceptance: the contact sheet for all nine rooms is in `review/decor/`; the bench is green on a quiet machine (load under 6; a run under load is not a result).
  - Depends on: Tasks 4 and 5.
  - Human review: the nine-room sheet.

## Human review

- **Task 3 (the style bar), Task 5 (rooms 7 and 8) and Task 6 (the whole sheet), on a local build** (`PORT=8092 pnpm start:check`). Your sign-off is needed on each; green tests are not enough.

## Corrections log

<!-- one line per user redirect during execution: date — what changed and why -->
