# Diorama look — Phase 8: the other six themes, the home feeds, and the wrap-up

- **Date:** 2026-11-07
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-07
- **Part of:** `plans/2026-11-07-diorama-look-00-overview.md`. Read it first: §2 (FR12, FR13, every
  NFR), §3, §4.3 (decor, exact) and §6 (feature DoD).
- **Depends on phases:** 7 (the decor engine and painters), and every earlier phase for the wrap-up.

## 1. Summary

The remaining six rooms get their themes. The home feeds show decor. DESIGN.md is rewritten end to
end for the diorama look. The final bench, the full check and the flake run close the feature, and
ADR 0026's acceptance is asked for.

## 2. Requirements (this phase)

### 2.1 Functional

- FR12: themes 01, 02, 03, 04, 06 and 07.
- FR13 in full.

### 2.2 Non-functional

- NFR-verify: the whole feature's screenshot set. NFR-perf: the final compare.

### 2.3 Out of scope for this phase

- Anything beyond the spec (overview §2.3).

### 2.4 Assumptions

- See overview §2.4.

## 3. Existing code context (verified 2026-11-07)

- `src/components/Feeds.tsx` draws room 01 (`roomText` from `rooms/01-first-steps.room?raw`,
  `room = parseRoom(roomText)`). A `Run` keeps `tiles` from the first tick's sighted view
  (`last.views[1].tiles ?? room.grid`). Its scene is built per seat and drawn by `draw(ctx, scene)`.
- Room ids: `01-first-steps`, `02-three-hands`, `03-watchers`, `04-the-safe`, `06-lights-out` and
  `07-night-shift`.
- `DESIGN.md` sections touched by this feature: §1 (the idea), §2 (tokens: shell, scale, world, dusk,
  HC), §3 (type), §4.1, §4.2, §4.5 (now "The start of a room"), §4.7 (the role frame), §4.8, a new
  "Decor" section, Components (`RoleReveal`, the feeds) and §5 (motion). `spec/design.test.ts` checks
  token names, component names, and that there is no hex.
- `specs/backlog.md`: the 2026-11-02 "too simple/cartoonish" line is already sorted under
  "Sorted on 2026-11-07" with a pointer to this spec.
- `doc/adr/0026-a-lit-diorama-world-and-a-dusk-shell.md`: `## Status proposed`.

### Interfaces from earlier phases (exact)

From Tasks 113 and 114:

```ts
// src/client/render/decor.ts
export type Theme = "pavilion" | "conservatory" | "watch" | "bank" | "gallery" | "backstage"
  | "service" | "salon" | "strongroom";
export const THEME_OF: Record<string, Theme>;
export const THEME_KINDS: Record<Theme, readonly DecorKind[]>;
export function decorFor(roomId: string, tiles: readonly string[], wires?: readonly Vec[][]): DecorItem[];
export function decorAt(items: readonly DecorItem[], x: number, y: number):
  { front?: DecorItem; top?: DecorItem };
// src/client/render/decor-paint.ts
export function paintDecor(c: CanvasRenderingContext2D, item: DecorItem, w: number, h: number): void;
// src/client/render/index.ts
// Scene.decor?: DecorItem[]
```

Also from earlier phases: `decor.test.ts` (placement, R2 anchors, banned names), `decor-paint.test.ts`
(clip, glow, no outline, HC, banned shapes), `spec/layout/decor.test.ts` (no floor pixel; takes a
room list), `/bench?room=&decor=`, and `pnpm bench:frame --compare`.

## 4. Approach

Themes and kinds (spec FR12), each a painter in `decor-paint.ts`:

| Room | Theme | Kinds |
| --- | --- | --- |
| 01 | pavilion | `ivy` (front, trailing leaves from the top edge, `mix(wallFront, codeGreen, .35)`), `planter` (top, a box with foliage) |
| 02 | conservatory | `trellis` (front, **diagonal** lattice only), `fern` (top) |
| 03 | watch | `banner` (front, a swallowtail in wall tones), `sconce` (front, **unlit**: no glow) |
| 04 | bank | `wainscot` (front, a lower panel with one rail: one horizontal line only), `certificate` (front, a framed card), `sconce` (front, `lit`) |
| 06 | backstage | `swag` (front), `sconce` (front, unlit) |
| 07 | service | `kickPanel` (front, steel with **vertical** seams), `cagedBulb` (front, `lit`) |

`ivy` leaves are small lens shapes, never a motif leaf: the leaf motif is a single large leaf with a
midrib. The banned-shape test gains: "no painter draws a single leaf shape wider than 0.2 × face".

## 5. Task breakdown

### Task 116: Painters and kinds for rooms 01, 02, 03, 04, 06 and 07 (FR12)

- **Description:** add the six themes' kinds to `THEME_KINDS` and their painters. Extend
  `spec/layout/decor.test.ts`'s room list to all nine rooms.
- **Files touched:** `src/client/render/decor.ts`, `src/client/render/decor-paint.ts`,
  `src/client/render/decor.test.ts`, `src/client/render/decor-paint.test.ts`,
  `spec/layout/decor.test.ts`.
- **Tests first (red):**
  - `decor-paint.test.ts`: every new kind passes the existing per-kind cases (clip, ≤ 0.35 glow, no
    outline, HC off, banned shapes), plus "an unlit sconce draws no gradient" and the leaf-size rule.
  - `decor.test.ts`: "every room's theme has at least one front kind"; R2 holds for all nine rooms.
  - `spec/layout/decor.test.ts` with nine rooms: red until the painters exist (no decor is drawn for
    rooms with empty kinds, and the test asserts that at least one wall pixel changed per room).
- **Implementation (green):** as described. Adjust `SALT` per room if R2 fails.
- **Acceptance criteria:** the tests pass.
- **Break check:** make the watch-house sconce `lit` (scripted). The unlit case goes red.
- **Depends on:** none in this phase.

### Task 117: Decor in the home feeds (FR13)

- **Description:** `Feeds.tsx` computes `decorFor(room.id, run.tiles)` once per run, and passes
  `decor` and `roomId` in each feed's scene.
- **Files touched:** `src/components/Feeds.tsx`, `spec/layout/home.test.ts`.
- **Tests first (red):** `spec/layout/home.test.ts`: "a sighted home feed draws room 1's decor"
  (`data-decor` count > 0 on the feed, set by `Feeds.tsx`, since the picture alone cannot be asked,
  as `data-labels` is in `Game.tsx`).
- **Implementation (green):** as described.
- **Acceptance criteria:** the test passes. Screenshots of the home page at 1280 and 375 are saved.
- **Break check:** pass `decor: []` (scripted). The case goes red.
- **Human review:** on a local build, the home page at 1280 and 375. A pass is: the feeds show room 1's
  ivy and planters and still read clearly as three roles' views.
- **Depends on:** Task 116.

### Task 118: DESIGN.md rewritten for the diorama look

- **Description:** rewrite the sections listed in this file's §3, replacing (not appending to) the old
  flat-shading text:
  - §1: dusk plum, light from the north-west everywhere, "information stays flat".
  - §2: every new token's job.
  - §4.1: materials and the atlas.
  - §4.5: the start of a room.
  - §4.7: the bezel.
  - Decor.
  - §5: the motion table and the reserved ring.

  Remove any "planned (Task N)" marker this feature built. Cite ADR 0026.
- **Files touched:** `DESIGN.md`.
- **Tests first (red):** `spec/design.test.ts` gains "DESIGN.md mentions no flat-shaded world" (no
  `flat-shaded`/`flat shading` outside a quoted ADR 0016 history line) and "it names the reserved
  ring". Red before the rewrite.
- **Acceptance criteria:** `spec/design.test.ts` is green, and the user has read the diff (part of
  Task 119's review).
- **Depends on:** Task 116.

### Task 119: Final bench, full check, flakes, screenshots and the process log

- **Description:**
  - Run `pnpm bench:frame --compare` and paste its JSON into the commit.
  - Run the full check (overview §3), then `pnpm check:flaky 3` over `spec/layout/`.
  - Take the full screenshot set `review/diorama/final-*.png`: home, lobby, the reveal (each role),
    the game in rooms 1, 4, 5, 8 and 9 (each sighted role and a spectator), cleared, HC and reduced
    motion, at 1280 and 375.
  - Append the qualifying moments to `PROCESS_LOG.md` in its header's format (the three planning
    rulings R1 to R3 at least, and any Corrections-log entries).
- **Files touched:** `review/diorama/*`, `PROCESS_LOG.md`.
- **Tests first (red):** none: verification.
- **Acceptance criteria:** the bench passes, the full check is green, and the flake run shows no
  flaky test.
- **Human review:** on a local build, the overview §6 manual walkthrough, plus the DESIGN.md diff. A
  pass is the user's explicit acceptance of the whole look.
- **Depends on:** Tasks 117 and 118.

### Task 120: Backlog, plan ticks, and ADR 0026's acceptance asked

- **Description:**
  - Add "built (plans/2026-11-07-diorama-look-*)" to the backlog's sorted line for 2026-11-02.
  - Tick overview §5 and §6.
  - Ask the user to accept ADR 0026. Only on their word, set `## Status accepted`, and change ADR
    0016's status line to "partly superseded by 0026 (flat shading)" in a **new** sentence: ADR 0016
    is accepted and never edited, so its status line is the one place that may change. Confirm with
    the user that this is how they handle a partial supersession.
  - Before asking, fix ADR 0026's own reference: it cites
    `doc/adr/0016-tilted-three-quarter-world.md`, but the file is
    `doc/adr/0016-tilted-three-quarter-view.md` (verified 2026-11-07). 0026 is still `proposed`, so it
    may be edited.
- **Files touched:** `specs/backlog.md`, `plans/2026-11-07-diorama-look-00-overview.md`,
  `doc/adr/0026-a-lit-diorama-world-and-a-dusk-shell.md` (on acceptance), `doc/adr/0016-*.md` (status
  line only, on acceptance).
- **Acceptance criteria:** `pnpm check:evidence` is green, and the backlog and plan ticks are
  committed.
- **Depends on:** Task 119.

## 6. Phase Definition of Done

- [x] Tasks 116 to 120 are complete and their tests pass. (ADR 0026's acceptance is queued, not given.)
- [x] `pnpm test:unit` passes.
- [x] The full check passes (overview §3). (One run green but for `door-pill` at 375, 5 of 5 alone.)
- [x] `pnpm bench:frame --compare` passes. p95 81.9 / 87.2 / 159.3 / 178.6 ms.
- [x] (review queued) The user has accepted the reviews for Tasks 117 and 119.
- [x] Tick phase 8 in overview §5, then the overview §6 boxes, and commit.

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR12 (01, 02, 03, 04, 06, 07) | Task 116 |
| FR13 | Task 117 |
| NFR-verify (DESIGN.md, screenshots) | Tasks 118, 119 |
| NFR-perf (final) | Task 119 |

## 8. Risks / open questions

None.

## Corrections log
