# Playtest 3 fixes: Phase 03, holding hands is felt, not seen

- **Status:** Approved
- **Tier:** Architecture (ADR 0030, proposed)
- **Overview:** `plans/2026-11-10-playtest-3-fixes-00-overview.md` (§1 run rules). Spec: `specs/2026-11-10-playtest-3-fixes.md` FR1–FR6. ADR: `doc/adr/0030-holding-hands-is-felt-not-seen.md`.

## Codebase context (read this turn, exact)

- **`RoleView.you`** in `src/game/perception.ts:221`:
  ```ts
  you: {
    seat: Seat;
    pos?: Vec;
    motion?: { moving: boolean; blocked: boolean };
    hand?: Seat;
  };
  ```
  `hand` is set for **every role** from `partner(world, seat)` (`perception.ts:1242-1243`, comment "FR22: Can't see's own screen says who"). **That sends Can't see the holder's seat, which ADR 0030 forbids.** No client reads the value. The bots only test `view.you.hand !== undefined` (`src/game/bots/brain.ts:333, 1176, 1310`).
- **Pairs:** `world.holding: Partial<Record<Seat, Seat>>` (towed → leader). `partner(world, seat): Seat | undefined` is in `src/game/sim/gear.ts:47`. A hold pushes the event `{ kind: "hold", seat: free, leader: seat }` (`gear.ts:104`).
- **Sighted entities** carry `heldBy?: Seat` and `holding?: Seat` (`src/game/types.ts:148-149`) and `pulling?: boolean` (line 123). Seats are already visible on the sighted map, so these stay.
- **Can't see** gets no `entities` (`perception.ts:1259`, `if (role !== "blind")`).
- **The link:** `drawHold(ctx, cam, towed: Vec, leader: Vec, pulling = false, motion: { join?: number; nowMs?: number } = {})` in `src/client/render/gear.ts:140`. It's drawn per towed figure in `src/client/render/index.ts:573-583`, with `motionT(scene, f.id, "join")`.
- **`detectFx(prev: EntityView[], next: EntityView[]): Fx[]`** (`src/client/fx.ts:206`) emits `join` and `unjoin` from `heldBy` changes (lines 298-303).
- **Sounds:** `SoundCue` (`perception.ts:154`). Private cues push straight into `out`, e.g. the earpiece at `perception.ts:802-805`. Every cue kind needs a row in `src/game/parity.test.ts`. Exceptions carry an `exempt:` string, as `earpiece` does (around line 326).
- **Act hint:** `actHint` (`perception.ts:1398`) returns "Let go" when towed.

## Interface this phase produces

```ts
// src/game/perception.ts, RoleView.you (replaces `hand?: Seat`)
hand?: { dir: Vec; leads: boolean; pulling: boolean }; // dir: a unit step toward the other hand
```

## Tasks

### Task 274: The hand is sent as touch, with no identity (FR2, FR5) — [x]

- **Tests first (red), in `src/game/perception.test.ts`:**
  - (a) For each role, while held (towed and leading), `view.you.hand` is `{ dir, leads, pulling }`, where `dir` is the unit step from your figure toward your partner's. The serialised message contains no seat or id of the partner in `you`. Assert on `JSON.stringify(view.you)` with no `"seat":<partner>` beyond your own, and no player id.
  - (b) Can't see's whole view, serialised, never contains the partner's seat number in a hand-related field.
  - (c) Not held → no `hand`.
- **Implementation:** build `hand` from `partner()` and both positions. Round `dir` to the 8-way unit step. Set `leads` from `world.holding[seat] === undefined`. Set `pulling` from the same rule the entity's `pulling` uses. The three bot reads keep working: they only test for presence. Update the comment to cite ADR 0030, not FR22.
- **Acceptance:** the tests pass. `pnpm vitest run spec/perception.test.ts spec/rooms.test.ts` is green, since bots use `you.hand`. `pnpm typecheck` is green.
- **Break check:** by script, add `seat: mate` back into `hand`; test (a) goes red.
- **Depends on:** none.

### Task 275: Can't see sees the link (FR1, FR4, FR5) — [ ] (review queued)

- **Behaviour:** on Can't see's frame (no tiles, no entities), while `view.you.hand` is set, draw `drawHold` from your own figure to `pos + dir` (one tile), with the arrow toward the leader:
  - towed: from yourself to the far point
  - leading: from the far point to yourself

  `pulling` passes through. The `join` and `unjoin` motion comes from `you.hand` appearing and disappearing, as a new branch in the client's fx detection for your own seat. Leave `detectFx`'s entity branch alone.

  A spectator following Can't see gets the same view, so the same drawing. Nothing in the HUD, captions or crew list names the partner.
- **Files:** `src/client/render/index.ts` (call `drawHold` for the self link), `src/components/Game.tsx` (pass `you.hand` into the `Scene`; add `hand?: { dir: Vec; leads: boolean; pulling: boolean }` to `Scene`), `src/client/render.test.ts`.
- **Tests first (red):** in `src/client/render.test.ts`, a Can't see scene with `hand` draws the link's ops (the arc and two beads) between your figure and one tile in `dir`. Without `hand`, it draws none. With `pulling`, it draws the tremor (via `nowMs`).
- **Acceptance:** the tests pass. Real-canvas screenshots of Can't see towed and leading at 1280 and 375: `review/p3-275-touch-*.png`. **Human review:** it reads as touch; the link is the same as the sighted see; nothing identifies the partner.
- **Depends on:** Task 274.

### Task 276: Grip and release sounds for the pair only (FR3) — [ ]

- **Behaviour:**
  - On the tick a hold starts, the two seats in the pair each get a `grip` cue (pan 0, gain 1). On the tick it ends, a `release` cue.
  - Only the two in the pair get it, whatever their role. That means a Can't-hear holder gets none and sees the link.
  - Add `"grip" | "release"` to `SoundCue.kind`.
  - Detect both from the existing `hold` event: `{ kind: "hold", seat, leader: Seat }` starts a hold (`gear.ts:104`) and `{ kind: "hold", seat, leader: null }` ends it (`release()`, `gear.ts:58-61`). No new event is needed.
  - The client plays two short soft sounds in `src/client/audio.ts`, quieter than footsteps, with captions "hand taken" / "hand let go" in the cue caption list like every other sound.
- **Tests first (red):**
  - `src/game/parity.test.ts`: rows `grip` and `release`, each with `exempt: "Touch is felt only by the two holding hands (ADR 0030): no other seat hears or sees it."`
  - `src/game/perception.test.ts`: the pair's seats get the cue on that tick; the third seat doesn't, even standing next to them.
- **Acceptance:** the tests pass, and `pnpm typecheck` passes (parity rows are type-checked). **Human review:** the two sounds' feel (`review/QUEUE-p3.md`; attach WAVs as the earlier listening reviews did).
- **Break check:** by script, send `grip` to every seat; the perception test goes red.
- **Depends on:** Task 274 (shares the file and the pair helpers).

### Task 277: "Space: hold hands" in reach (FR6) — [ ]

- **Behaviour:** for a sighted seat that isn't in a pair, a teammate figure within hand reach (the rule `beside(world, seat)` uses in `gear.ts`) that isn't in a pair gets the label `Space: hold hands` on desktop and `Hold hands` on phone. It obeys the label cap and range. The existing `hands` chip for a figure already holding (`labels.ts:115`) is unchanged.
- **Files:** `src/client/labels.ts` (a new kind, e.g. `canhold`, with copy in `LABEL_COPY` and added to `ESCAPE_KINDS` if it should show beyond room 1), `src/client/labels.test.ts`, and `Game.tsx` if `labelsFor` needs your own position or pair state, which it has (`near`).
- **Reach on the client:** `beside` (`src/game/sim/gear.ts:36`) is a plain distance `≤ REACH` between figure positions. The client imports `REACH` (exporting it if needed; `src/game/` is pure and allowed by layering) and uses the same `Math.hypot` test, with a unit test against `beside` on the same positions so the two can't drift.
- **Tests first (red):**
  - `labelsFor` gives the chip for a free teammate within reach, and none beyond reach
  - none when you or they are in a pair
  - the shared reach helper agrees with `beside` on a grid of positions
- **Acceptance:** the tests pass, with screenshots at 1280 and 375 of a teammate in reach. **Human review:** placement against the existing chips.
- **Depends on:** none.

## Phase Definition of Done

Tasks 274–277 are ticked or parked, `pnpm check` is green, `review/QUEUE-p3.md` lists the reviews for 275, 276 and 277 and the acceptance of ADR 0030, then commit `Unit done: p3fix03`.

## Coverage (this phase)

FR1 → 275 · FR2 → 274 · FR3 → 276 · FR4 → 275 · FR5 → 274, 275 · FR6 → 277
