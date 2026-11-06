# Diorama look — Phase 0: room tints

- **Date:** 2026-11-07
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-07
- **Part of:** `plans/2026-11-07-diorama-look-00-overview.md`. Read it first: §2 (FR1), §3
  (commands, tokens rule), §4.1 (token table) and §4.2 (the hue switch, exact).
- **Depends on phases:** none.

## 1. Summary

Each room's walls take the colour its `hue` meta names. Today every room draws rose because nothing
reads `hue`. At the end of this phase the five hues have day, dusk and high-contrast wall sets. The hue
reaches the client on the reveal and the full view, and `wall()` draws with it. DESIGN.md's "built"
claim becomes true.

## 2. Requirements (this phase)

### 2.1 Functional

- FR1, in full.

### 2.2 Non-functional

- NFR-parity: `hue` is room layout sent with `tiles`, so no perception rule changes. `parity.test.ts`
  stays green untouched.
- NFR-verify: screenshots at 1280 and 375 of rooms 01, 02, 03, 06 and 07 (one per hue).

### 2.3 Out of scope for this phase

- Wall gradients and materials (phase 3, Task 104). This phase changes flat colours only.

### 2.4 Assumptions

- See overview §2.4. The rose set equals today's `--w-wall-*`, so room 01 must look exactly as before.

## 3. Existing code context (verified 2026-11-07)

- `rooms/*.room` line 1 JSON meta carries `"hue"`: 01 rose, 02 teal, 03 amber, 04 amber, 05 teal,
  06 violet, 07 indigo, 08 teal, 09 amber. `parseRoom` keeps the raw JSON on `Room.meta: Record<string,
  unknown>` (`src/game/rooms/format.ts:80`).
- `src/client/tokens.ts`:
  - `WorldTokens` has `wallTop`, `wallFront`, `wallShade`.
  - `WORLD_NORMAL`, `WORLD_HIGH`, and `DUSK: Partial<WorldTokens>` hold `wallTop: "#4a5068"`,
    `wallFront: "#353a4f"` and `wallShade: "#2a2e40"`.
  - `paintWorld()` is private. It caches on `shown`, assigns `WORLD_NORMAL`, then mixes toward `DUSK`.
    `setContrast(on)` resets `shown = -1` and repaints.
- `src/styles/tokens.css`: `--w-wall-top: #f4b9c3; --w-wall-front: #dc8fa6; --w-wall-shade: #b9708f`.
  HC: `#ffffff / #bdbdbd / #7a7a7a`. Dusk: `--dusk-wall-top/-front/-shade`.
- `src/client/tokens.test.ts`: `cssTokens(name)` reads every `--name: #hex` in file order. Index 0 is
  base, index 1 is high contrast. Each `WORLD` key must match `--w-<kebab>` at both.
- `src/client/render/blocks.ts`: `wall(ctx, cam, x, y, southOpen)` draws
  `block(..., WORLD.wallTop, WORLD.wallFront)` and a 3 px `WORLD.wallShade` foot.
- Reveal message: `src/net/attach.ts` around line 186 builds `{ t: "reveal", room, name, index, … }`.
  Its type is in `src/net/protocol.ts:86`.
- Full view: `src/game/perception.ts` around line 1209, `if (full) { const grid = maskCache(...);
  view.tiles = ... }`. The spectator path is at line 1258, `if (full) view.tiles = maskCache(...)`.
- Clients that draw a room: `src/components/Game.tsx` (from the reveal and views),
  `src/components/Spectator.tsx`, and `src/components/Feeds.tsx` (parses `rooms/01-first-steps.room`
  itself, so room 01 is rose).

### Interfaces from earlier phases (exact)

None.

## 4. Approach

Five hue sets. Rose is today's values. The others keep the same lightness steps (top, then front about
18 % darker, then shade) at another hue, never lilac (DESIGN.md §2). Proposed values, measured by
Task 96's test, which needs front against floor at 1.3:1 or more so a wall still reads off the floor:

| Hue | top | front | shade | dusk top / front / shade |
| --- | --- | --- | --- | --- |
| rose | `#f4b9c3` | `#dc8fa6` | `#b9708f` | `#4a5068` / `#353a4f` / `#2a2e40` (today's) |
| teal | `#a9ddd3` | `#7fbfb6` | `#5f9c98` | `#3f5560` / `#2f4049` / `#243239` |
| amber | `#f2cf9a` | `#d9a96e` | `#b78653` | `#56505a` / `#403b45` / `#312d36` |
| violet | `#cdb9ec` | `#a991d4` | `#8670b3` | `#4b4568` / `#37324f` / `#2a2640` |
| indigo | `#b3bde8` | `#8a97cf` | `#6b77ae` | `#3f4870` / `#2f3656` / `#242a44` |

High contrast stays white, `#bdbdbd` and `#7a7a7a` for every hue (HC is one look). The base
`--w-wall-*` stay as rose, so `tokens.test.ts`'s existing checks hold. The per-hue tokens are extra
names.

`setHue` keeps the hue in module state, and `paintWorld` copies `HUE_WALLS[hue]` over the three wall
keys after `WORLD_NORMAL`, using `HUE_DUSK[hue]` as the dusk target for those keys. `setHue` sets
`shown = -1` and repaints.

## 5. Task breakdown

### Task 96: Hue token sets, `setHue`, and the hue on the wire (FR1)

- **Description:**
  - Add the per-hue CSS tokens (overview §4.1) to `tokens.css`'s `:root`. The HC block gets the same
    names with the HC wall values, so `cssTokens(name)[1]` exists for each.
  - In `tokens.ts`, add `Hue`, `HUES`, `HUE_WALLS: Record<Hue, Pick<WorldTokens,"wallTop"|"wallFront"|"wallShade">>`,
    `HUE_DUSK` (same shape), `setHue`, and `currentHue` (overview §4.2). `paintWorld` applies them.
  - Add `hue?: string` to the `reveal` ServerMsg and to `RoleView`. Set it from
    `typeof room.meta.hue === "string"` in `attach.ts`'s reveal builder and in both `full` branches of
    `perception.ts`.
- **Files touched:** `src/styles/tokens.css`, `src/client/tokens.ts`, `src/client/tokens.test.ts`,
  `src/net/protocol.ts`, `src/net/attach.ts`, `src/game/perception.ts`, `src/game/perception.test.ts`.
- **Tests first (red):**
  - `tokens.test.ts`: "every hue's wall set has --w-wall-*-<hue> with the same base and HC value";
    "setHue('teal') paints WORLD's walls teal, and setHue(undefined) is rose"; "dusk blends the hue's
    walls toward its own dusk set"; "high contrast ignores the hue"; "each hue's wall front stands
    1.3:1 off the floor, day and dusk".
  - `perception.test.ts`: "a full view carries the room's hue; a delta view does not".
- **Implementation (green):** as described.
- **Refactor:** none expected.
- **Acceptance criteria:** the new tests pass. `tokens.test.ts`, `design.test.ts` and `parity.test.ts`
  are green.
- **Break check:** make `paintWorld` skip the hue copy (scripted). The `setHue('teal')` case goes red.
- **Depends on:** none.

### Task 97: Walls drawn in their room's hue (FR1)

- **Description:** `Game.tsx` calls `setHue(reveal.hue)` when the reveal arrives and `setHue(view.hue)`
  on a full view. `Spectator.tsx` does the same from its views. `Feeds.tsx` calls
  `setHue(room.meta.hue as string)` before drawing (rose). On unmount the game resets to rose, so the
  home page never inherits a room's hue. DESIGN.md §2 World: the "Wall hue varies by room" line drops
  any doubt and names `setHue`. The wall row of the table lists the per-hue names.
- **Files touched:** `src/components/Game.tsx`, `src/components/Spectator.tsx`,
  `src/components/Feeds.tsx`, `DESIGN.md`, `spec/layout/game.test.ts`.
- **Tests first (red):** `spec/layout/game.test.ts`: "room 2's wall front is drawn in the teal front
  colour". It reads one pixel of a wall front tile, using `data-camera` to find it, after `settledHash`.
- **Implementation (green):** as described.
- **Acceptance criteria:**
  - The spec passes.
  - Screenshots at 1280 and 375 of rooms 01 (rose, unchanged from before), 02 (teal), 03 (amber),
    06 (violet) and 07 (indigo), plus room 03 with the alarm on (dusk amber), are saved to
    `review/diorama/p0-*.png`.
- **Break check:** remove the `setHue` call in `Game.tsx` (scripted). The spec goes red.
- **Human review:** on a local build, look at the five hue screenshots and one live room each of teal
  and violet. A pass is: each room's walls read as a different, calm pastel, none lilac, and room 01
  looks exactly as it did.
- **Depends on:** Task 96.

## 6. Phase Definition of Done

- [ ] Tasks 96 and 97 are complete and their tests pass.
- [ ] `pnpm test:unit` passes.
- [ ] The full check passes (overview §3).
- [ ] The screenshots are in `review/diorama/`, and the user has accepted Task 97's review.
- [ ] Tick phase 0 in overview §5 and commit.

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR1 | Tasks 96, 97 |

## 8. Risks / open questions

None.

## Corrections log
