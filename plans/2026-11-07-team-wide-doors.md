# A door opening is heard and seen by the whole team

- **Date:** 2026-11-07
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-07 (`specs/2026-11-07-team-wide-doors.md`, approved in
  the brainstorm)
- **Tier:** Architecture (ADR 0025, proposed).
- **Comes after:** `plans/2026-11-07-bots-help-caches.md` (Tasks 83 to 87). Task numbers continue
  from 87.

## 1. Summary

Today an ordinary door opening is local:
- its click carries 8 tiles and stops at walls
- a sighted seat that cannot see the door is sent it as `closed`, whatever is true

This plan makes it team-wide:
- every hearing seat hears a new synthesised "unlock" from anywhere, panned toward the door
- every sighted seat is sent the door's true state, so it is drawn open and stays open
- the opening ring plays wherever the door is
- a door off screen gets an edge pill pointing at it

A cache's secret and vault doors are unchanged.

## 2. Requirements

### 2.1 Functional requirements

From the spec, `specs/2026-11-07-team-wide-doors.md`, FR1 to FR9:

1. **FR1** It covers plate, station and sequence doors. Secret doors are unchanged.
2. **FR2** The `door` cue goes to every hearing seat with gain 1, pan and `dir`, whatever the distance,
   walls or glass between. The alarm still silences it.
3. **FR3** The `door` voice is an unlock: a bolt and a thunk, synthesised. Its caption is "door unlocked",
   with its direction.
4. **FR4** Every sighted seat gets every ordinary door's true state.
5. **FR5** The ring plays at the door wherever it is. A door off screen gets a door pill for 4 s.
6. **FR6** The door is drawn open from then on (doors latch already).
7. **FR7** Several doors in one tick each give their own unlock and pill.
8. **FR8** The parity row is rewritten, and CLAUDE.md's team-wide list gains "door".
9. **FR9** Bots still clear every room.

### 2.2 Non-functional requirements

- No new socket message or view field.
- The pill is checked by a layout spec at 1280 and 375, for Can't hear and Can't speak, against its
  neighbours (the face and mark pills, and the caption strip). The spec goes in `spec/layout/sight.test.ts`,
  where the edge pills' spec already is.
- `prefers-reduced-motion`: the pill fades without sliding (it already does not slide).
- DESIGN.md is updated in the same commit as the look.
- Every new test is shown red first, by a scripted break.

### 2.3 Out of scope

- Cache doors.
- Doors that close.
- Menu sounds.

### 2.4 Assumptions

None open. Doors latch (`updateDoors` in `src/game/sim/step.ts`: "once opened a door stays open"),
including through `sendBack`, which does not touch `doorOpen` for ordinary doors.

## 3. Existing code context (verified 2026-11-07)

- **`src/game/sim/step.ts` `updateDoors(world)`:** on an open, it pushes
  `{ kind: "door", id, open, at: tileCentre(first) }`. The event type is in `src/game/sim/world.ts`:
  `| { kind: "door"; id: string; open: boolean; at: Vec }`. Secret doors are opened by
  `syncCacheDoors` without an event.
- **`src/game/perception.ts`:**
  - Sounds, about line 632: `if (e.kind === "door" && e.open) { const c = cue(world, "door", e.at, me); if (c) out.push(c); }`.
    `cue(world, kind, source, listener): SoundCue | null` applies `RANGE[kind] ?? HEARING_RANGE` (12;
    `door` has no entry, so 12) and `soundReaches` (walls and glass stop it). `loot` is built directly:
    `{ kind: "loot", pan: panOf(e.at, me), gain: 1, ...dirTo(e.at, me) }`.
  - The sight filter, about line 983: `} else if (e.kind === "door" && !e.secret) { out.push({ ...e, state: "closed" }); }`,
    with the comment about the outline popping.
  - `entitiesFor` sends every door listed in `visibleTo`, with its true state. Closed secret doors are
    skipped.
  - The alarm silences cues for hearing seats (`view.alarm`, `world.tick < world.alarmUntil`).
- **`src/client/fx.ts` `detectFx(prev, next, seenBefore?)`:** a door closed→open gives
  `{ kind: "ring", pos, tone: "ui" }` only if `!seenBefore || seenBefore.has(tile)`. It is called in
  `src/components/Game.tsx` around line 346 as `detectFx(rt.prevEntities, view.entities, rt.prevSeen)`,
  with a comment explaining `prevSeen`.
- **`src/client/audio.ts`:** `click(c, cue)` (a square at 1400 Hz, 60 ms) and
  `for (const s of sounds) if (s.kind === "door") click(c, s);`. A family comment lists `door` under
  "object clicks".
- **`src/client/hud.ts`:** `CUE_WORD.door = "door click"`. `cueCaptions` adds the direction from `dir`.
  `STAMP_FACE.door = "Door"`.
- **Edge pills:**
  - `src/client/render/pops.ts` `drawEdgePills(ctx, scene, cam)` draws every `scene.pops` entry with
    `from` and `name` whose target is off screen (for a mark) or whose sender is not in the entities.
  - `drawPill` draws a glass rounded rect stroked in `ROLE_COLOR[scene.roles[pop.seat]]`, the role shape,
    the name and the glyph.
  - `FacePop { seat; img?; fade; from?; name?; mark?; alone? }` is in `src/client/render/index.ts`.
  - `Game.tsx` builds `pops` from `rt.pops` (`{ seat; id; at; from?; name?; mark? }`), using `PILL_MS = 4000`.
- **Tests that pin today's behaviour, which change here:**
  - `src/game/perception.test.ts` §"viewFor: a door out of sight is sent, as closed" (about line 1866)
  - `src/client/fx.test.ts` (about line 24)
  - `src/game/parity.test.ts` `PARITY.door` (about line 486), whose listener stands within reach
  - `src/client/hud.test.ts` line 124 uses a door cue
- **Bots** read doors in `observe` (`known.doorOpen[e.id] = e.state === "open"`).
  - `lookAtDoor` walks to look at a door the bot believes closed. With true state, it simply finds the
    path open.
  - `muteClip` reads closed doors between the bot and Can't see. It now sees the truth.

  No bot logic relies on a false "closed".

## 4. Approach

**Server.**
- The door sound is built like `loot`, skipping `cue()`, but only for a non-secret door. Secret doors
  push no `door` event, so this needs no check.
- The sight filter's door branch sends `e` untouched for non-secret doors.

**Client.**
- `detectFx` drops the `seenBefore` door condition. Its parameter stays for the other kinds, if any use
  it; if none does, it is removed, along with `rt.prevSeen`.
- For the pill, a door that opened this view and lies off screen pushes an `rt.pops` entry:
  `{ seat: -1 (none), id: "door", at: now, from: door.pos, mark: "door", name: "Door" }`.
  `drawEdgePills` draws a pill with no `seat` in `--w-door` (`WORLD.door`), with no role shape. This
  reuses `exitPoint`, the fade and `PILL_MS`.
  - `FacePop.seat` becomes `Seat | null`. The Game loop maps it.
  - Whether it is off screen is decided in `drawEdgePills`, as for marks. An on-screen door just shows
    its ring.
- **Unlock voice:** a short noise burst through a band-pass (the bolt, about 120 ms), then a sine thunk
  at about 90 Hz over 180 ms, both through `panner(c, cue.pan)`, at gain 1. It reuses `burst` and
  `tone`.

## 5. Task breakdown

### Task 88: Every ordinary door's state and sound reach the whole team (FR1, FR2, FR4, FR6, FR8, FR9) [done]

- **Description:** `perception.ts`:
  - the door sound is built like `loot`
  - the sight filter sends ordinary doors with their true state; the comment is rewritten to cite
    ADR 0025

  Rewrite `PARITY.door` in `parity.test.ts`: the listener stands more than 12 tiles away behind a wall,
  and Can't hear stands out of sight of the door. Rewrite the perception test as "a door out of sight is
  sent with its true state", and add "a secret door out of sight is still not sent while closed". Add a
  perception test, "the door cue reaches a hearing seat behind a wall at any distance, gain 1, and not
  while the alarm is on".
- **Files touched:** `src/game/perception.ts`, `src/game/perception.test.ts`, `src/game/parity.test.ts`.
- **Tests first (red):** the three perception cases and the rewritten parity row. All fail on today's
  code.
- **Acceptance criteria:**
  - These tests pass.
  - `spec/rooms.test.ts` and `spec/caches.test.ts` are green (FR9).
  - The rest of `parity.test.ts` is green.
- **Break check:** restore the `state: "closed"` line with a script, and watch "true state" go red.
- **Depends on:** none (Task 87 is only the ordering).

### Task 89: The ring anywhere, and a door pill off screen (FR5, FR7) [done]

- **Description:**
  - `detectFx` rings on every ordinary door closed→open. The `seenBefore` door condition is removed, and
    the parameter and `rt.prevSeen` too if nothing else reads them.
  - `Game.tsx` pushes a door pop for each door that opened in this view (from the same closed→open
    comparison; one per door, so FR7 holds).
  - `FacePop.seat` becomes `Seat | null`. Its readers are `drawPop` and `drawPill` in `pops.ts`,
    `Game.tsx` around line 197, and `src/components/Feeds.tsx` around line 155 (the home feeds, which
    never make a door pop and only need to typecheck).
  - `drawEdgePills` draws a seat-less pill: stroked in `WORLD.door`, the `STAMP_FACE.door` glyph, no
    role shape, no name text.
  - DESIGN.md "Edge pills" gains: "A door that opens off screen: a pill in the door's colour with
    'Door', 4 s (ADR 0025)."
- **Files touched:** `src/client/fx.ts`, `src/client/fx.test.ts`, `src/components/Game.tsx`,
  `src/client/render/pops.ts`, `src/client/render/index.ts`, `src/client/render.test.ts`,
  `src/components/Feeds.tsx`, `DESIGN.md`,
  `spec/layout/sight.test.ts`.
- **Tests first (red):**
  - `fx.test.ts`: "a door that opens out of sight rings" (replacing the old out-of-sight case), and "two
    doors in one view ring twice".
  - `render.test.ts`: "an off-screen door pop draws one pill at the screen edge on its side; on screen,
    none".
  - `spec/layout/sight.test.ts`: "a door opening off screen shows a pill at the edge toward it, at least
    48 px from the face pill's slot and clear of the caption strip". This covers Can't hear and Can't
    speak, at 1280 and 375. It names its neighbours, as CLAUDE.md asks.
- **Acceptance criteria:**
  - The tests pass.
  - Screenshots at 1280 and 375 for both sighted roles show the pill, with no clipped text.
- **Break check:** skip door pops in `drawEdgePills`, and watch the render and layout cases go red.
- **Human review:** on a local build, three tabs in room 4. The person at the far end sees the door pill
  and the door open. A pass is: readable at a glance, and it does not collide with a face pill.
- **Depends on:** Task 88.

### Task 90: The unlock voice and its caption (FR3)

- **Description:**
  - `audio.ts` replaces `click` for `door` with `unlock(c, cue)` and moves `door` in the family comment
    to "team progress".
  - `hud.ts` sets `CUE_WORD.door = "door unlocked"`, and `hud.test.ts` is updated.
  - DESIGN.md's sound section, if it lists the door click, follows.
- **Files touched:** `src/client/audio.ts`, `src/client/hud.ts`, `src/client/hud.test.ts`, `DESIGN.md`.
- **Tests first (red):** `hud.test.ts`, "a door cue is captioned 'door unlocked' with its direction".
- **Acceptance criteria:**
  - The caption test passes.
  - `spec/design.test.ts` is green.
- **Human review:** on a local build, as Can't see. Open a door from across the room. A pass is that the
  sound reads as a heavy unlock (not a click, not a chime), is clearly panned, and is not unpleasant when
  room 7's doors open in a chain.
- **Depends on:** Task 88.

### Task 91: Invariants, docs, backlog and check

- **Description:**
  - CLAUDE.md "Sensory parity": add "door (an ordinary door's unlock)" to the team-wide list.
  - `PROCESS_LOG.md`: an entry if the user redirects anything in the Human reviews.
  - The backlog's 2026-11-07 Parked line is removed.
  - `pnpm check` is green, then commit, with the spec and ADR 0025.
  - ADR 0025 stays `proposed` until the user accepts it.
- **Files touched:** `CLAUDE.md`, `PROCESS_LOG.md`, `specs/backlog.md`, `doc/adr/0025-…md`.
- **Acceptance criteria:** `pnpm check` is green.
- **Human review:** the user accepts ADR 0025, after a three-tab playtest of rooms 4 and 7.
- **Depends on:** Tasks 89 and 90.

## 6. Definition of Done

- [ ] Tasks 88 to 91 ticked.
- [ ] The Human reviews in Tasks 89, 90 and 91 accepted.
- [ ] `pnpm check` is green.
- [ ] ADR 0025 accepted.

## 7. Coverage

| Requirement | Tasks |
| --- | --- |
| FR1 | 88 (the secret-door test) |
| FR2 | 88 |
| FR3 | 90 |
| FR4 | 88 |
| FR5 | 89 |
| FR6 | 88 (true state; doors latch) |
| FR7 | 89 |
| FR8 | 88 (parity row), 91 (CLAUDE.md) |
| FR9 | 88 |
| NFRs | 89 (layout spec, DESIGN.md), every task's break check |

## 8. Risks and open questions

None open. One known risk: dropping `prevSeen` changes the ring for doors that come into view already
open. They now ring only on the closed→open tick itself, which is the truth. The fx test pins it.

## 9. Corrections log

<!-- one line per user redirect during execution -->
