# Braille, riddles and fixes — Phase 02: played icons and the jam

- **Date:** 2026-11-05
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-11-05
- **Part of:** `plans/2026-11-05-blind-purpose-00-overview.md`. Read it first: §2 (FR4, FR13), §4.2
  (the jam), §4.3 (sounds), §3.
- **Depends on phases:** 01 (the id snapshot exists; nothing else is used).

## 1. Summary

This phase delivers two things:

- the role screen shows the roles each person has already played as small outline icons (FR4)
- teaching stations and caches jam for 3 s after a wrong answer, so they can't be brute-forced
  (FR13)

It ends green and committed. The icons are human-reviewed.

## 2. Requirements (this phase)

### 2.1 Functional

FR4, FR13.

### 2.2 Non-functional

- axe passes on the role screen at both viewports.
- `jam` has a parity row.
- DESIGN.md is updated for the `RoleShape` outline option and the jammed look.
- `logGame` logs a jam as kind only.

### 2.3 Out of scope for this phase

Braille (phase 03), riddles (phase 05).

### 2.4 Assumptions

See overview §2.4. The user ruled that a person with nothing played shows no Played group (spec A4).

## 3. Existing code context (verified 2026-11-05)

- **`src/components/RoleShape.tsx`:**

  ```ts
  export function RoleShape({ role, size = 28, mono = false }: { role: Role; size?: number; mono?: boolean; })
  ```

  It renders an `svg.role-shape`, `aria-hidden`, `fill={mono ? "currentColor" : var(--role-…)}`,
  with blind a circle r 11, deaf a rect 22, mute a triangle.
- **`src/components/RoleReveal.tsx:204–208`:**

  ```tsx
  {r.played.length > 0 && (
    <span class="played">
      Played: {r.played.map((p) => ROLE_LABEL[p]).join(", ")}
    </span>
  )}
  ```

  `r` comes from `crewRows` (`src/client/reveal.ts`), whose `CrewRow` has `played: Role[]`.
  `played` is "roles played this heist, in order" (`src/net/lobbies.ts:21`). The current room's
  role is pushed when the room first ticks (`markPlayed`, `src/net/game.ts:195`), so at a reveal the
  list does not yet hold the current role. The spec at `spec/layout/reveal.test.ts:564` confirms it.
- **CSS:** `src/styles/game.css:234` `.reveal-crew .played { flex-basis: 100%; … }`, and
  `.reveal-crew .crew-who { flex: 1 1 6rem; min-width: 0; display: grid; }`.
- **Specs that pin the old text:**
  - `spec/layout/reveal.test.ts:202`: `.reveal-crew .played` count 0 before the first room. Keep the
    promise and update the selector.
  - `:338–340`: `expect(await played.innerText()).toMatch(/^Played: (Can't see|Can't hear|Can't
    speak)$/)`. This changes to the aria label.
  - `:565`: no `.played` beside Di. Keep it.
- **Stations** (`src/game/sim/stations.ts`):
  - `act(world, o, tile, seat, wrong)`, with
    `const fail = () => { say("wrong"); if (p.teach || cache) redrawOne(world, o, s); else wrong.w ??= { id: o.id, seat }; };`
  - `say(result: "turn" | "press" | "cut" | "solved" | "wrong", n?)` pushes `{ kind: "station", id,
    result, n?, at }`.
  - `World` is in `src/game/sim/world.ts:85–119`. Per-station tick maps already exist (`syncAt`), and
    so does `dyedUntil: number`.
  - `createWorld(room, seed = 1)` is at `world.ts:168`. Initialise new fields there, and check
    `Snapshot` (the checkpoint) to see whether jams should reset on a send-back. Decision: they do.
    Clear `jammedUntil` when the world restores a snapshot.
- **Station world event** (`world.ts:136`): `{ kind: "station"; id; result: "turn" | "press" | "cut"
  | "solved" | "wrong"; n?; practice?: true; at: Vec }`.
- **Sounds:**
  - `SoundCue["kind"]` union (`src/game/perception.ts:146–191`); `RANGE` (254–273).
  - `stationSound(world, seat, e, out)` (~703) returns early on `"wrong"`. Add the `jam` branch
    there.
  - `PARITY: Record<SoundCue["kind"], Scenario>` (`src/game/parity.test.ts:122`). Helpers in that
    file: `stationAt(params)`, `place(world, seat, at)`, `actBy(world, seat, tile)`, `go(world)`,
    `PADS`, `BLIND`/`MUTE`.
  - Captions: `cueCaptions` (`src/client/hud.ts`). Audio: `src/client/audio.ts`.
- **View:** `EntityView.station` (`perception.ts` ~120–133) has `teach?: true` and `practice?: true`.
  Add `jammed?: true`. Effects: `detectFx(prev, next, seenBefore?)` (`src/client/fx.ts:53`).
- **Logging:** `GameEvent` includes `"station"` (`src/lib/gameLog.ts`). Find where a station
  `wrong` is logged in `src/net/attach.ts` (search `"station"`) and log `detail: { kind: "jam" }`
  beside it.
- **Bots:** `src/game/bots/brain.ts` `stationStep` (~859). A jammed station ignores presses, so the
  bot must not count a press made while jammed. Simplest: the bot sees `station.jammed` in its view
  and returns an idle input for that station that tick.

### Interfaces from earlier phases (exact)

- `Scene.cleared?: boolean` (Task 68, `src/client/render/index.ts`). Not used here.
- Room-id snapshot test `src/game/rooms/ids.test.ts` (Task 69). No room is edited in this phase.

## 4. Approach

- **Played icons:** per overview §2.1 FR4 and spec §4.1 B:
  - `RoleShape` gains `outline?: boolean`: `fill="none"`, `stroke="currentColor"`, `stroke-width`
    2.5 in the 28 viewBox.
  - The row renders `<span class="played" role="img" aria-label="Already played: …"
    title="Already played: …"><span aria-hidden="true">Played</span>{shapes at 14 px,
    outline}</span>`, inside `.crew-who` after `.crew-role`.
  - It renders only when `r.played.length > 0` (A4).
- **Jam:** per overview §4.2.

## 5. Task breakdown

### Task 81: Played roles as outline icons on the role screen (FR4) [x] (review queued)

- **Description:** each crew row shows the roles that person played earlier this heist as small
  outline shapes behind the word "Played", labelled "Already played: …".
- **Files touched:**
  - `src/components/RoleShape.tsx`
  - `src/components/RoleReveal.tsx`
  - `src/styles/game.css`
  - `spec/layout/reveal.test.ts`
  - `DESIGN.md` (the RoleShape entry, plus the crew row's "colour means now, outline means history")
- **Tests first (red):** in `spec/layout/reveal.test.ts`, change the check at `:338–340` to:
  - `played.getAttribute("aria-label")` matches `/^Already played: (Can't see|Can't hear|Can't
    speak)(, …)*$/`
  - `played.locator("svg.role-shape")` count equals the number of roles named
  - each svg has `fill="none"`
  - `played` has no `flex-basis: 100%` (computed style), so it sits inside `.crew-who`

  It is red on the text line. Keep the `:202` and `:565` promises as they are.
- **Implementation (green):** per this file's §4. Delete the old `.reveal-crew .played` rule and add
  a row-internal style (`display: inline-flex; gap: var(--s-1); color: var(--ui-muted); font-size:
  var(--t-14)`).
- **Acceptance criteria:**
  - the reveal specs are green
  - `spec/layout/axe.test.ts` passes
  - `spec/design.test.ts` passes
- **Human review:** a local build at 1280 and 375. Play room 1 with 4 people, Next, and look at the
  room-2 role screen: every row (yours, others', sitting-out) shows the hollow shapes after "Played",
  clearly different from the coloured "now" shape. A long nickname wraps without clipping. Pass =
  the user accepts.
- **Depends on:** none.

### Task 71: A wrong answer jams a teaching station or cache for 3 s (FR13) [x]

- **Description:** after a wrong answer on a teaching station or cache, that station ignores input
  for 3 s, looks jammed, and sounds `jam`. Its redraw still happens.
- **Files touched:**
  - `src/game/sim/world.ts`
  - `src/game/sim/stations.ts`
  - `src/game/sim/step.ts` (snapshot restore)
  - `src/game/perception.ts`
  - `src/game/parity.test.ts`
  - `src/game/sim/stations.test.ts`
  - `src/client/hud.ts`, `src/client/audio.ts` (caption and sound)
  - `src/client/render/stations.ts` (jammed look)
  - `src/game/bots/brain.ts`
  - `src/net/attach.ts` (log)
  - `DESIGN.md`
- **Tests first (red):**
  1. `stations.test.ts`, "a teaching dial ignores turns for 3 s after a wrong answer": press the
     anchor on the wrong digit, then turn a pad at tick+1 and expect the input unchanged. At tick +
     `JAM_TICKS` a turn works.
  2. Same for a cache station.
  3. "an ordinary station is not jammed": a non-teach wrong answer still dyes and has no
     `jammedUntil`.
  4. `parity.test.ts` row `jam`, which the type forces once the kind exists. A sighted role in sight
     sees `station.jammed`, and the hearing hear it.
  5. `perception.test.ts`: `station.jammed` is true while jammed.
- **Implementation (green):** per overview §4.2:
  - `export const JAM_TICKS = Math.round(3000 / 50);` in `stations.ts`
  - `jammedUntil: {}` in `createWorld`, cleared on snapshot restore
  - the guard at the top of `act`
  - `say("jam")` pushed with the wrong answer (`result` union gains `"jam"`)
  - `stationSound` emits `jam` (`RANGE.jam = 6`)
  - caption "Jammed"
  - a synthesised short buzz in `audio.ts`, matching the existing synthesised cues (no new asset)
  - render: the station's face greys and shows a small hatched bar while `jammed`
  - bot: skip input to a jammed station
- **Acceptance criteria:**
  - every new test was shown red: remove the guard, and remove the `jammedUntil` set
  - `spec/rooms.test.ts` passes in every rotation (bots never get jammed in normal play: they answer
    correctly)
  - `pnpm test:unit` is green
- **Depends on:** none.

## 6. Phase Definition of Done

- [x] Tasks 81 and 71 complete, shown red then green.
- [x] `pnpm test:unit` passes.
- [x] `pnpm lint:rooms` passes, and `spec/rooms.test.ts` passes.
- [x] The full check passes (overview §3 recipe).
- [x] The user accepted Task 81. (review queued)
- [x] Tick phase 02 in overview §5 and commit.

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR4 | Task 81 |
| FR13 | Task 71 |

## 8. Risks / open questions

None.

## Corrections log

(empty)
