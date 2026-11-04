# Braille, riddles and fixes — Phase 01: bugs and the room-id guard

- **Date:** 2026-11-05
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-05
- **Part of:** `plans/2026-11-05-blind-purpose-00-overview.md`. Read it first: §2 (FR1 to FR3, FR15),
  §2.4 (the suspected causes), §3 (commands, test discipline).
- **Depends on phases:** none.

## 1. Summary

This phase makes four fixes, each starting with a failing test:

- a player can no longer enter the next room without readying (FR3)
- figures stop bobbing on the cleared screen (FR2)
- the landing Can't see feed draws the walking figure (FR1)
- a snapshot test guards every room's ids before any room is edited (FR15)

It ends green and committed, one commit per task.

## 2. Requirements (this phase)

### 2.1 Functional

FR1, FR2, FR3, FR15 (overview §2.1).

### 2.2 Non-functional

- No visual change apart from FR1's figure. FR1's figure follows DESIGN.md §4.2 Figures as it
  stands: `drawOwnBlind` is reused unchanged, so DESIGN.md needs no edit.

### 2.3 Out of scope for this phase

- Everything braille, the jam, riddles and played icons (phases 02 to 05).

### 2.4 Assumptions

See overview §2.4. The causes named there are suspicions; each task's first test decides.

## 3. Existing code context (verified 2026-11-05)

- **`src/components/Lobby.tsx`:**
  - `const early = useRef<{ view: RoleView | null; ready: Seat[] }>({ view: null, ready: [] });`
    (line 50)
  - `socket.on("view", (m) => { early.current.view = m.view; })` (line ~86)
  - `socket.on("reveal", (m) => setReveal((old) => revealOf(m, old)))` (line 94)
  - `<Game early={early.current} key={reveal.index} …/>` (line ~281)
- **`src/components/Game.tsx` (~437–463)**, the mount effect:

  ```ts
  if (early.view && rt.current.view === null) {
    onView(rt.current, early.view, audio.current, seatNames(crewRef.current));
    if (early.view.tick > 0) start(false);
  }
  const off = socket.on("view", (m) => {
    const sawReveal = rt.current.view?.tick === 0;
    if (audio.current) onView(rt.current, m.view, audio.current, seatNames(crewRef.current));
    if (m.view.tick > 0) start(sawReveal);
  });
  ```

  `RoleView.room: string` (the room id) is on every view (`src/game/perception.ts:203`).
  `reveal.room` is the new room's id (`src/client/reveal.ts` `revealOf`).
- **Server order on Next** (`src/net/attach.ts:919–931`): `advanceRoom` → `running.full = new
  Set([0,1,2])` → `announceRoom(code)`. That sends, in order: the lobby broadcast, `reveal` per seat,
  watcher reveals, `ready`, then `sendRevealViews` (a tick-0 `view` per seat).
  - Between `cleared` and Next, the old room keeps ticking. Its `view`s (tick > 0) keep landing in
    `early.current.view`.
- **Lobby deletion paths:**
  - `removeLobby` (`src/net/lobbies.ts:173`), called from leave paths
  - `expireIdle` (`:321`), when no person is `connected` for `ttlMs`

  A solo player's page that errors or leaves would delete the lobby. The test checks this path.
- **`src/components/Game.tsx` input loop (~958–973)**:
  - `if (!online || rt.view?.status === "cleared") return;` runs before the `else rt.walking = {
    moving: false, blocked: false }` reset.
  - `ownMotion(rt, role)` (line 320) feeds `Scene.own`.
- **`src/client/render/figures.ts`:**
  - `figure(...)` line 77: `const moving = animated(scene) && pose.moving;` (bob `lift`)
  - line 276: `if (animated(scene) && moving && !blocked) dust(...)`
  - `playerLook(e, scene)` (184) takes `moving` from `scene.own` for self, else from `e.moving`
  - `export function drawOwnBlind(ctx, scene: Scene, own: Motion)` (293)
- **`src/client/render/index.ts`:**
  - `export interface Motion { facing: Vec; moving: boolean; blocked: boolean; }` (88)
  - `Scene.own?: Motion` (60)
  - `drawScene` (229–249): blind or no tiles → if `scene.own`, `drawOwnBlind`; else the ring
    (`MAP.blindRingTiles`)
- **`src/components/Feeds.tsx` `paint()` (~111–150)** builds a `Scene` with no `own`, and
  `tiles`/`self` null for the blind seat.
  - The run's views come from `createAttract(...).next()`, which returns `views: [RoleView,
    RoleView, RoleView]`.
  - Each view has `you.motion?: { moving: boolean; blocked: boolean }` and the blind seat's player
    entity has `facing?: Vec`.
- **`src/game/rooms/format.ts`:**
  - `parseRoom(text): Room`
  - `Room.objects: RoomObject[]` with `id`, `kind`, `tiles: Vec[]`
  - `loadRooms(dir)` (used in `src/net/attach.ts:117` as `loadRooms(process.env.ROOMS_DIR ??
    "./rooms")`)
- **Test helpers:**
  - `spec/play.ts`: `startedGame(baseUrl)`, `ready(players)`, `nextTick`, `noTick(socket, ms)`
  - `spec/heistPlay.ts`: `clearRoomOne(players)`, `clearTinyRoom(players)` (for
    `spec/fixtures/rooms/01-tiny.room`, used via `ROOMS_DIR`)
  - `spec/layout/game.test.ts:328` `"after a room is cleared"` opens real pages with `openAs(player,
    nickname, code)`.
- **Snapshots:** the repo has no snapshot tests. vitest 5's `toMatchFileSnapshot` writes a file
  beside the test.

### Interfaces from earlier phases (exact)

None.

## 4. Approach

- **FR3:** a view belongs to a room. The fix is to make a newly mounted `Game` ignore any early view
  whose `room` is not `reveal.room`. Two alternatives were weighed: clearing `early.current.view` on
  a reveal for a new index, or checking `view.room`. Prefer the check: it is local to `Game`, and it
  also guards a late live `view` from the old room arriving after the re-mount.
  - Also check that the live `socket.on("view")` handler drops views whose `room` differs from
    `reveal.room`.
- **FR2:** the render decides. Pass `status` into `Scene`, add `cleared?: true` to `Scene`, and have
  `figure()` and `dust` treat a cleared scene as not animated for motion (no lift, no dust). This
  covers own and other figures and spectators in one place, whatever stale `moving` reached it.
- **FR1:** the feed passes `own` for the blind seat, built from that seat's view:
  `{ facing: entity.facing ?? {x:0,y:1}, moving: view.you.motion?.moving ?? false, blocked:
  view.you.motion?.blocked ?? false }`.
- **FR15:** one unit test, `src/game/rooms/ids.test.ts`, maps each shipped room (`./rooms`) to
  `{ [id]: "x,y" }` (first tile; doors list all tiles) and compares it with
  `src/game/rooms/__ids__/NN-slug.json`, using `expect(json).toMatchFileSnapshot(path)`.
  - Updating needs `-u`, which is deliberate.
  - The file states this in a header comment and points at CLAUDE.md's rooms rule.

## 5. Task breakdown

### Task 67: The next room never starts without its reveal (FR3) [x]

- **Description:** after the host presses Next, every seat sees the role screen, and the room starts
  only once all three ready. A solo lobby survives.
- **Files touched:**
  - `src/components/Game.tsx`
  - possibly `src/components/Lobby.tsx`
  - a new `spec/layout/next-room.test.ts` (the browser test; `game.test.ts` is 368 lines, but a new
    area file keeps it out of the slow file)
- **Tests first (red):**
  1. `spec/layout/next-room.test.ts`, "a page shows the next room's role screen after Next, even
     while the cleared room kept ticking":
     - `startedGame(baseUrl)` with `ROOMS_DIR` unset (room 1)
     - open seat 1's page with the `openAs` pattern (copied locally, ~15 lines)
     - `ready`, then `clearRoomOne(players)`
     - wait at least 500 ms of cleared ticks, polled on `nextTick` with status `cleared`
     - host sends `{ t: "next" }`
     - expect the page to show the reveal (`getByRole("button", { name: "I'm ready" })` visible) and
       `.frame canvas` to be under the role screen (`.reveal-frame` present)
     - expect `noTick(seat socket, 700)`: the server holds tick 0
  2. In the same file, "a solo player's lobby survives Next":
     - one person plus bots (`lobby.create`, `lobby.start`)
     - clear `spec/fixtures/rooms/01-tiny.room` through a server started with
       `ROOMS_DIR=spec/fixtures/rooms`. If the shared check server can't take a per-file
       `ROOMS_DIR`, start one the way `spec/layout/leaderboard.test.ts:205` does.
     - Next, then expect the page to show the reveal and the lobby to still exist (`GET /lobby/<code>`
       does not say "No lobby").
  - Run both. Record what actually happens (the suspected cause, or another) in the commit message.
- **Implementation (green):**
  - In `Game.tsx`'s mount effect, apply `early.view` only if `early.view.room === reveal.room`.
  - In the live handler, ignore `m.view.room !== reveal.room`.
  - If the solo test shows a different cause (for example an error path that sends `lobby.leave`),
    fix that cause and add a unit test beside it.
- **Refactor:** none expected.
- **Acceptance criteria:**
  - both new tests fail on the old code and pass on the new
  - `spec/ready.test.ts` and `spec/heist.test.ts` stay green
  - the commit says what was reverted to show red
- **Depends on:** none.

### Task 68: Nothing bobs on the cleared screen (FR2) [x]

- **Description:** once the room is cleared, no figure (own, teammate, spectator view) is drawn
  lifted or with dust.
- **Files touched:**
  - `src/client/render/index.ts` (`Scene`)
  - `src/client/render/figures.ts`
  - `src/components/Game.tsx` (pass `cleared`)
  - `src/components/Spectator.tsx` (pass `cleared` where it builds a `Scene`)
  - `src/client/render/standing.test.ts` or a new `src/client/render/still.test.ts`
- **Tests first (red):** `still.test.ts`, "a cleared scene draws every figure at rest":
  - Build a `Scene` with two player entities `moving: true`, `own: { moving: true, … }`,
    `nowMs: 250` (mid-hop), and `cleared: true`.
  - Draw it on a recording 2D context stub, using the stub pattern already in
    `src/client/render.test.ts`; copy its helper if it isn't exported.
  - Compare the figure pixels or recorded `pill` y with `nowMs: 0`: they must be equal.
  - Repeat with `role: "blind"` and `own` (the `drawOwnBlind` path).
  - Red because `cleared` doesn't exist yet: first the type error, then the lift.
- **Implementation (green):**
  - `Scene` gains `cleared?: boolean`.
  - In `figure()`: `const moving = animated(scene) && !scene.cleared && pose.moving;`
  - The same guard on `dust` (line 276).
  - `Game.tsx` sets `cleared: view.status === "cleared"` in the scene it builds (~line 238).
  - Spectator likewise.
  - Also reset `rt.walking` when the view becomes cleared (in `onView`), so the own motion state is
    honest too.
- **Acceptance criteria:**
  - the test is red with the guard removed and green with it
  - `src/client/render.test.ts` and `src/client/render/standing.test.ts` stay green
- **Depends on:** none.

### Task 69: Room ids cannot move silently (FR15)

- **Description:** a snapshot of every shipped room's id-to-position map. Run it before any room is
  edited in phases 03 to 05.
- **Files touched:**
  - `src/game/rooms/ids.test.ts` (new)
  - `src/game/rooms/__ids__/*.json` (generated, committed)
- **Tests first (red):**
  1. Write the test.
  2. Run it once with `-u` to create the files. Check one by hand against its room (for example
     room 4's `Q1` at `5,1`, the first pad: the anchor is the `Q` tile, so read it from the grid).
  3. Then show red: in a scratch copy, swap two `Q` letters in a copy of a room loaded through a
     temporary path. Simplest: temporarily move a `Q` in `rooms/04-the-safe.room` before its sibling,
     run, see red, and restore with `git checkout rooms/04-the-safe.room`.
- **Implementation (green):** the test is the implementation.
- **Acceptance criteria:**
  - one JSON per room in `rooms/`
  - the test fails when a room's ids are renumbered, and passes on the committed rooms
  - the header comment says that updating with `-u` is a deliberate act and must be checked
- **Depends on:** none.

### Task 70: The landing Can't see feed walks (FR1)

- **Description:** the home page's Can't see feed shows the dim figure, bobbing and kicking up dust
  while its bot walks, and still otherwise.
- **Files touched:**
  - `src/components/Feeds.tsx`
  - `spec/layout/home.test.ts` (one check)
- **Tests first (red):** in `spec/layout/home.test.ts`, "the Can't see feed draws its figure, not
  the ring":
  - Load `/` at 1280.
  - Read the blind feed canvas's pixels in a 40×40 px box at the figure's spot: the canvas centre,
    offset `MAP.phoneTilePx * 2 * BODY_H * 0.5`. Use the existing page-evaluate pixel-probe
    approach, or `settledHash`'s canvas readback.
  - Expect `ROLE_COLOR.blind`-ish pixels (alpha > 0) inside the box, and **no** ring pixels at
    radius `MAP.blindRingTiles * MAP.phoneTilePx` from the centre.
  - Red on today's ring.
- **Implementation (green):** in `paint()`, for the blind seat, pass `own` built from
  `run.last.views[seat]` per this file's §4, and `nowMs: now` so the bob animates. `calm`
  (`reducedMotion`) already stops the animation.
- **Acceptance criteria:**
  - the check is red before the change and green after
  - with reduced motion the figure is drawn still
- **Human review:** at 1280 and 375 on a local build (`pnpm build && pnpm start`, then open `/`),
  the Can't see feed shows a dim walking figure that matches the in-game Can't see screen. Pass =
  the user says it looks like the game.
- **Depends on:** Task 68: `Scene.cleared` exists, and the feed's cleared hold should set
  `cleared: run.clearedAt !== null` so its figure stops too.

## 6. Phase Definition of Done

- [ ] Tasks 67 to 70 complete, each shown red then green.
- [ ] `pnpm test:unit` passes.
- [ ] The full check passes (overview §3 recipe).
- [ ] The user has accepted Task 70's human review.
- [ ] Tick phase 01 in overview §5 and commit.

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR1 | Task 70 |
| FR2 | Task 68 |
| FR3 | Task 67 |
| FR15 | Task 69 |

## 8. Risks / open questions

None.

## Corrections log

(empty)
