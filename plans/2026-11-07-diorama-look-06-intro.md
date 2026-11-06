# Diorama look — Phase 5: the start-of-room sequence and the server hold

- **Date:** 2026-11-07
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-07
- **Part of:** `plans/2026-11-07-diorama-look-00-overview.md`. Read it first: §2 (FR14, NFR-parity),
  §2.4 **R3** (the `INTRO_MS` env seam, and why CI runs the real hold), §3 (logging rules from
  CLAUDE.md), and §4.4 (the atlas is skipped while the projection is not settled).
- **Depends on phases:** 3 (`clearAtlas`, and the atlas's live path while `LIVE.wall < TILT.wall`).

## 1. Summary

When all three are ready, the server sends `intro` and holds its first tick for `INTRO_MS` (2400 ms).
Meanwhile every client plays the staged start: the flat plan for 300 ms, a visible tilt with walls
growing north to south for 900 ms, a camera swoop from the whole room to your start for 900 ms, and a
landing for 300 ms (a hop and a small ring at your feet). Input is locked until it ends, and the
clock, guards and bots start when it does. A restart replays it. This replaces DESIGN.md §4.5 "The
world rises".

## 2. Requirements (this phase)

### 2.1 Functional

- FR14 in full. FR16: the "you landed" ring (the second reserved trigger; the test that reserves it is
  Task 112).

### 2.2 Non-functional

- NFR-parity: the view is unchanged. Only *when* the first tick arrives changes. `parity.test.ts`
  stays green.
- NFR-a11y: reduced motion gets the 300 ms hold, then a 300 ms cross-fade. No flashes.
- Logging: the hold is not a discrete user event, and no new `GameEvent` is needed (`room.start` is
  already logged).

### 2.3 Out of scope for this phase

- Object motion and the ring test (phase 6).

### 2.4 Assumptions

- See overview §2.4, R3.

## 3. Existing code context (verified 2026-11-07)

**Server, `src/net/attach.ts`:**
- `function runIfReady(code: string, running: Running): void` (line 288). It returns if
  `ready.size < 3 || running.timer`, or if status is not `playing`. Then `markPlayed(...)` and
  `running.timer = setInterval(() => tick(code), TICK_MS)`.
- `interface Running { game; full; timer; pauseTimer; voteTimer; heist }` (line 103).
- Called at: the `ready` case (line ~891), the paused-for-ready path (~880), and after a passed room
  restart in `endVote` (line 516, after `restartGame` and `running.full = new Set([0,1,2])`).
- `stopGame(running)` (line 414) clears `timer`, `pauseTimer` and `voteTimer`.
- `sendRevealViews(code)` (line 268) sends tick-0 views. It runs only while `world.tick === 0`.
- `VOTE_FOR = Number(process.env.VOTE_MS) > 0 ? Number(process.env.VOTE_MS) : VOTE_MS` (line 474) is
  the env seam precedent.
- `game.startedAt` (`src/net/game.ts`) is set at room creation, `restartGame` and the heist reset. It is
  used for the `room.clear` log `ms` only. The leaderboard time is `world.tick * TICK_MS`, so the hold
  never counts toward a team's time.

**Protocol, `src/net/protocol.ts`:** `ServerMsg` is a union (lines ~80–168) and `{ t: "ready"; seats }`
is the model. `parseClientMsg` validates client messages only.

**Client, `src/components/Game.tsx`:**
- `Runtime.rise: { at: number; reduced: boolean } | null` (line 121). `RISE_MS = 900`, `FADE_MS = 300`
  (134–135).
- `riseNow(rt, now)` (316) gives an ease-out cubic of `(now - r.at) / RISE_MS`, or 1 if absent or
  reduced.
- `start(sawReveal)` (450): it sets `rt.rise` and `setCovering("rise" | "fade")`, then
  `setPlaying(true)`. It is called when a view with `tick > 0` arrives.
- The reveal is the covering element (`.reveal-frame.covering`, `data-rise`). CSS animations
  `reveal-clear`/`reveal-out` run 900 ms (`game.css:51–78`).
- The scene sets `layout: "follow"` and `rise: flat ? 0 : riseNow(rt, now)`.
- `onView` (329): when the tick goes backwards (a restart), it resets prediction.
- Input is sent by the input loop (`if (!online || rt.view?.status === "cleared") return;`).

**Render:**
- `camera(scene)` (`project.ts`): if `rise < 1`, it mixes `fitCamera` to `followCamera` by `rise`.
- `setRise(r)`: `LIVE.depth = 1 + (TILT.depth-1) r`, `LIVE.wall = TILT.wall r`,
  `LIVE.block = TILT.block r`.
- `drawOwnBlind` fades in over the first 400 ms of the rise (DESIGN.md §4.5).
- `Spectator.tsx` draws with its own loop (line ~211–241). It has no rise today.

**Specs:**
- `spec/play.ts`: `nextTick(socket, timeoutMs = 2000)` and `noTick(socket, ms = 700)`.
- `spec/playUi.ts:43–44` clicks I'm ready, then waits for `.frame canvas`.
- `spec/layout/reveal.test.ts:126–170` records `data-rise` values ("rise", "fade").
- `src/client/render.test.ts:1138` has the "world rises (FR25)" unit tests.
- 28 spec files start a room. CI (`.github/workflows/checks.yml`, course-fixed) runs the app without
  `INTRO_MS`.

### Interfaces from earlier phases (exact)

From Task 104 (`src/client/render/atlas.ts`):

```ts
export function clearAtlas(): void;
```

The atlas is skipped (tiles drawn live) whenever `LIVE.wall < TILT.wall`, so the tilt needs nothing
more from it.

## 4. Approach

**The timeline** (`src/client/intro.ts`, new, pure):

```ts
export const INTRO = { hold: 300, tilt: 900, swoop: 900, land: 300 } as const; // sum 2400
export const INTRO_TOTAL = 2400;
export interface IntroFrame {
  rise: number;      // 0 during hold, 0→1 over tilt (ease in-out), 1 after
  swoop: number;     // 0 until the tilt ends, then 0→1 over swoop (ease in-out), 1 after
  land: number;      // 0 until swoop ends, then 0→1 over land; ≥1 is done
  rowStagger: number; // seconds of tilt by which row y lags row 0: TILT_STAGGER * y / rows
  done: boolean;
}
export function introAt(elapsedMs: number, reduced: boolean): IntroFrame;
```

Reduced: `rise = swoop = 1` from the start. The cover cross-fades over 300 ms after the hold, and
`done` comes at 600 ms.

**Walls grow north to south.** `setRise` stays global for depth. A new per-row `riseRow(y)` scales a
wall's height: `clamp((rise × (1 + S)) - S × y/rows, 0, 1)` with `S = 0.5`. So row 0 finishes at 2/3
of the tilt and the last row at its end. `wall()`, `glass`, `vent`, `drawHatch` and the closed door
read `LIVE.wall × riseRow(y)`. `LIVE` gains `rowRise?: (y: number) => number`, set by `setRise` when
a stagger is wanted and cleared otherwise.

**The camera.** `camera(scene)` takes `scene.swoop` (0–1). The projection's depth follows `rise`, and
the camera mixes `fit → follow` by `swoop` (not by `rise`), so the board tips first, then the camera
moves. A spectator's follow target is `fit` itself, so their swoop is a no-op beyond the tilt.

**The land.** For the 300 ms land, `scene.landing = land` (0–1). `drawPlayer` for your own seat adds
`hop(land, 0.25)`. `drawFx` draws one small ring at your feet. This ring is one of the two that FR16
allows: a new `Fx` of kind `ring`, `tone: "ui"`, `big: false`, pushed once by Game.tsx when the land
begins, with `targetId: "landed"`.

**The server hold.** `runIfReady` sends `{ t: "intro", ms: INTRO_FOR }` to the seats' humans and
watchers, then `running.timer = setTimeout(() => { running.timer = setInterval(tick, TICK_MS) },
INTRO_FOR)`. A `Running.introTimer` is cleared by `stopGame`, and `timer` stays null until it fires,
so the `running.timer` guard still stops double starts. Mark `running.intro = true` during the hold,
so a second `runIfReady` returns.

`INTRO_FOR = Number(process.env.INTRO_MS) >= 0 && process.env.INTRO_MS !== undefined ?
Number(process.env.INTRO_MS) : INTRO_TOTAL`. The server imports `INTRO_TOTAL` from
`src/game/intro.ts` (pure, so `net/` and `client/` share it: `client/intro.ts` re-exports the timing
from it).

**The client trigger.** `socket.on("intro", m => start(true, m.ms))` replaces "start on the first
`tick > 0` view". A page that loads mid-game still starts on `tick > 0`, with no intro. `rt.rise`
becomes `rt.intro: { at: number; ms: number; reduced: boolean } | null`. The timeline is scaled by
`ms / INTRO_TOTAL`, so `INTRO_MS=0` makes it instant and done. Input is gated while `!introDone`.
`playing` and the HUD appear when `intro` arrives, and the reveal cover fades over the tilt as it does
today (its CSS duration becomes `var(--intro-cover, 900ms)`).

**Restart.** In `endVote`, a passed room restart: `runIfReady` sends `intro` again. Clients get
`intro` and restart the sequence from the flat plan (`rt.intro` reset). `onView` already resets
prediction on a backwards tick.

**Can't see.** The screen is black throughout, and their figure fades in over the land (not the first
400 ms of the rise).

**Spec helpers** (R3). `nextTick`'s default timeout becomes `INTRO_TOTAL + 2000`.
`spec/playUi.ts` waits for `data-intro="done"` on `.game` (a new attribute) after ready.

## 5. Task breakdown

### Task 109: The staged start on the client (FR14 client, FR16 land ring)

- **Description:**
  - Write `src/game/intro.ts` (`INTRO_TOTAL`, the four durations) and `src/client/intro.ts`
    (`introAt`).
  - `project.ts` gains `riseRow` and a swoop-driven `camera`.
  - `Scene` gains `swoop?: number` and `landing?: number`.
  - `Game.tsx` replaces `rise` with `intro`, starts on the `intro` message, gates input until done,
    sets `data-intro="playing" | "done"` on `.game`, and pushes the landed ring.
  - `Spectator.tsx` plays the tilt and a whole-room swoop on `intro`.
  - `drawOwnBlind` fades in over `landing`.
  - Reduced motion: the hold, then a 300 ms cross-fade.
  - DESIGN.md §4.5 is rewritten as "The start of a room", and the §5 row "World rises" is replaced.
- **Files touched:** `src/game/intro.ts` (new), `src/client/intro.ts` (new), `src/client/intro.test.ts`
  (new), `src/client/render/project.ts`, `src/client/render/index.ts`, `src/client/render/blocks.ts`,
  `src/client/render/signals.ts` (`drawHatch` height), `src/client/render/figures.ts`,
  `src/client/fx.ts` (`Fx` gains `targetId?: string`),
  `src/client/render.test.ts` (the FR25 block is updated to the new timeline),
  `src/components/Game.tsx`, `src/components/Spectator.tsx`, `src/styles/game.css`,
  `src/net/protocol.ts` (the `intro` ServerMsg type, needed by the client), `DESIGN.md`,
  `spec/layout/intro.test.ts` (new), `spec/layout/reveal.test.ts` (its rise cases now expect the
  intro).
- **Tests first (red):**
  - `intro.test.ts`:
    - "hold: rise 0 for the first 300 ms"
    - "the tilt finishes at 1200 ms; the swoop has not begun before it"
    - "the swoop runs 1200–2100, the land 2100–2400, done at 2400"
    - "reduced: rise and swoop are 1 at once, done at 600"
    - "ms = 0 is done at once"
  - `render.test.ts`:
    - "during the tilt, a wall in row 0 is taller than one in the last row"
    - "at swoop 0 the camera is fit and at swoop 1 follow, whatever the rise"
  - `spec/layout/intro.test.ts` (three tabs at 1280 and one at 375, against the check app with
    `INTRO_MS=0`, which plays the sequence instantly; the timing itself is unit-tested):
    - "after ready, .game reaches data-intro=done and Act works"
    - "an arrow key held during the intro does not move you" (sent before `intro` → done, with the
      position unchanged)
- **Implementation (green):** as described.
- **Acceptance criteria:** the tests pass, and `reveal.test.ts`, `spectator.test.ts`, `game.test.ts`
  and `sight.test.ts` are green.
- **Break check:** let `camera` mix by `rise` again (scripted). The swoop case goes red.
- **Human review:** on a local build **started with `INTRO_MS` unset** (the real 2.4 s), three tabs in
  room 1 at 1280 and one at 375, plus a spectator tab, then one with reduced motion on. A pass is: the
  board clearly tips from a flat plan into 2.5D, the camera then flies to you, you land with a small
  hop and ring, and it feels like a start, not a delay.
- **Depends on:** none in this phase (phase 3's live path).

### Task 110: The server holds its first tick for INTRO_MS; restart replays (FR14 server)

- **Description:**
  - In `attach.ts`: `INTRO_FOR` (the env seam), `Running.introTimer`, the `intro` send, and the
    delayed `setInterval` in `runIfReady`. `stopGame` clears `introTimer`.
  - `package.json` `start:check` becomes `INTRO_MS=0 DATABASE_PATH=... node server.ts`.
  - `spec/play.ts` `nextTick` defaults to `INTRO_TOTAL + 2000`, and `spec/playUi.ts` waits on
    `data-intro="done"`.
  - CLAUDE.md "Before pushing" names `INTRO_MS=0` in `start:check`, and why CI runs the real hold.
- **Files touched:** `src/net/attach.ts`, `package.json`, `spec/play.ts`, `spec/playUi.ts`,
  `spec/intro.test.ts` (new), `CLAUDE.md`, `src/net/protocol.test.ts` (the `intro` shape, if
  ServerMsg shapes are tested there).
- **Tests first (red):** `spec/intro.test.ts` **runs its own app** with `INTRO_MS=1500` (spawned as
  in `spec/leaderboard.test.ts:63`):
  - "after all are ready, every seat gets intro { ms: 1500 }, then no tick before 1400 ms, then a tick"
  - "the first tick's elapsedMs is under 200: the clock started after the hold"
  - "a passed room restart sends intro again and holds again"
  - "a guard does not move during the hold" (room 03: the guard's position at the first tick equals its
    spawn)
- **Implementation (green):** as described.
- **Acceptance criteria:**
  - The spec passes, and `parity.test.ts`, `spec/ready.test.ts`, `spec/vote.test.ts`,
    `spec/game.test.ts`, `spec/rooms.test.ts` and `spec/caches.test.ts` are green.
  - Once: a full `pnpm check` against an app started **without** `INTRO_MS` (as CI runs it) is green.
    Its wall time is recorded in the commit message beside the usual run's.
- **Break check:** make `runIfReady` start the interval at once (scripted). "No tick before 1400 ms"
  goes red.
- **Depends on:** Task 109 (the client must handle `intro`, or the specs that wait on `data-intro`
  hang).

## 6. Phase Definition of Done

- [ ] Tasks 109 and 110 are complete and their tests pass.
- [ ] `pnpm test:unit` passes.
- [ ] The full check passes (overview §3; `start:check` now sets `INTRO_MS=0`).
- [ ] The full check also passes once with the real hold (Task 110).
- [ ] `pnpm check:flaky 3` on `spec/layout/intro.test.ts` and `spec/intro.test.ts` shows no flake.
- [ ] The user has accepted Task 109's review.
- [ ] Tick phase 5 in overview §5 and commit.

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR14 (client sequence, spectators, Can't see, reduced motion) | Task 109 |
| FR14 (input lock) | Task 109 |
| FR14 (server hold, restarts) | Task 110 |
| FR16 (the land's ring) | Task 109 |
| NFR-parity | Task 110 |

## 8. Risks / open questions

None.

## Corrections log
