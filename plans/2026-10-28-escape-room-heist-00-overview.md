# Escape-room heist: plan overview

- **Date:** 2026-10-28
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-10-28 (spec
  `specs/2026-10-28-escape-room-heist.md`, approved in the brainstorm; layout,
  WIP commit and overhaul folding confirmed at planning)

## 0. How to use these plans

Files in the set:

| File | Phase |
| --- | --- |
| `plans/2026-10-28-escape-room-heist-00-overview.md` | this overview |
| `plans/2026-10-28-escape-room-heist-01-framework.md` | 01 framework: land WIP, stations, gear, team mechanics, linter |
| `plans/2026-10-28-escape-room-heist-02-client.md` | 02 drawing, sound, HUD and labels for the new objects |
| `plans/2026-10-28-escape-room-heist-03-gallery.md` | 03 room 2 The Gallery, and playtest 5 |
| `plans/2026-10-28-escape-room-heist-04-lights-vault.md` | 04 rooms 3 and 4 |
| `plans/2026-10-28-escape-room-heist-05-jobs-results.md` | 05 side jobs, credits, comms map, leaderboard edition, wrap-up |

A session reads this overview plus exactly one phase file. Task numbers are
global (Task 1…20 across files). Tick a phase in §5 only when its phase
Definition of Done is met. Run each phase with the `execute-plan` skill.

This plan supersedes, in `plans/2026-10-19-play-overhaul-06-rooms-results.md`,
Task 23 (cancelled) and takes over Tasks 24 and 25 (as Tasks 18 and 19 here).
Overhaul phase 07 (ambience, music, wrap-up) runs after this plan.

## 1. Summary

The heist's rooms 2 to 4 become escape-room puzzles. Each puzzle (a "station":
safe, wires, keypad, radio, switches, music box, vault) splits what tells you
the answer, where you act and how you know it worked across places and senses,
so the three players must spread out and talk across their missing channels.
Anyone can carry one piece of gear (earpiece, goggles, stethoscope, UV torch)
that changes what they perceive. Players can hold hands to tow each other,
signal with a bell and a lamp, and each gets a private side job. A wrong answer
splatters the team with a dye pack and sends everyone to the checkpoint. The
aim, from two playtests, is that no role is a passenger.

## 2. Requirements

The requirements are FR1 to FR31 and the non-functional requirements of
`specs/2026-10-28-escape-room-heist.md` §2, unchanged; they are not restated
here. Phase files cite them as "spec FRn". Two planning-time additions:

- **P1.** The uncommitted overhaul phase 06 work (labels, perception-only bots,
  mockup tool, room 1 swap, lead-beat lint) is committed green before anything
  else (user, 2026-10-28).
- **P2.** Overhaul Task 23 is marked cancelled and Tasks 24/25 marked moved, in
  the overhaul plan files; overhaul FR12/FR14 marked superseded in the overhaul
  spec; the ramp proposal marked superseded (user, 2026-10-28).

### 2.1 Functional requirements

Spec FR1 to FR31, plus P1 and P2.

### 2.2 Non-functional requirements

Spec §2.2, plus CLAUDE.md's invariants (layering, perception, parity,
logging, hygiene).

### 2.3 Out of scope

Spec §2.3. Also: ambience and music (overhaul phase 07); Task 28's open
attract-seed sweep (stays open as logged in the overhaul phase 06 Corrections
log).

### 2.4 Assumptions

Spec §2.4. The two unverified ones are tasks here: renderer/camera on hub
rooms and line-of-sight cost (Task 7, measured before any room is built).

## 3. Shared context & conventions

- **Stack:** Astro + one Node process (`server.ts`), TypeScript, vitest,
  biome, pnpm. Canvas 2D client.
- **Commands:**
  - `pnpm test:unit` (fast, `--project unit`)
  - `pnpm build && pnpm start` then, in another shell, `pnpm check`
    (typecheck, biome, `lint:rooms`, all tests; needs the app on
    `APP_URL`, default `http://localhost:8080`; restart the server between
    runs)
  - `pnpm lint:rooms`; `pnpm mockup:room rooms/NN-slug.room out.html`
  - `pnpm format` auto-fixes style
  - `pnpm check:flaky [n]` for a test that went red then green
- **Layering** (`src/layering.test.ts`): `src/game/` is pure and headless;
  `src/net/` and `src/client/` import it; client reaches net only via
  `net/protocol.ts`; only `src/game/rooms/load.ts` uses `node:fs` in game.
- **Perception:** `viewFor` in `src/game/perception.ts` is the one place that
  decides what a role knows; every new view field is gated there.
- **Parity:** every new `SoundCue["kind"]` needs a row in
  `src/game/parity.test.ts` (typed `Record`, so the typecheck fails without
  one).
- **Logging:** new socket events through `logGame` with the name added to
  `GameEvent` (`src/lib/gameLog.ts`); kinds only, never answers.
- **Tests:** unit tests beside the code; promises to users in
  `spec/<area>.test.ts`; browser checks one `spec/layout/<area>.test.ts` per
  area. Slow suites in their own file.
- **TDD:** logic tasks write the failing test first. Bug found: failing test
  first.
- **Commits:** one per task once `pnpm check` passes, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push or
  deploy without the user's go-ahead.
- **Human review:** a task with a `Human review:` line is done only on the
  user's explicit acceptance, on a local build at desktop (1280) and phone
  (375).
- **Process:** each user correction during execution gets a line in the
  phase file's Corrections log and an entry in `PROCESS_LOG.md`.

## 4. Shared design

### 4.1 Room format additions (`.room`)

New tile letters (parsed in `src/game/rooms/format.ts`), all numbered in
reading order unless noted:

| Letter | Kind | Notes |
| --- | --- | --- |
| `Q` | `station` | metadata says which station type and its parts |
| `g` | `gear` | metadata `item`: `earpiece`, `goggles`, `stethoscope`, `uv` |
| `H` | `hatch` | a wall tile with a sill: blocks bodies and sound, passes sight (like glass); gear and crates go through on the sill |
| `b` | `bell` | a rope tile |
| `l` | `lamp` | a switch tile |
| `j` | `sidejob` | metadata `owner`: `1`, `2` or `3` (spawn seat) |
| `u` | `ink` | a floor or wall-face tile carrying hidden UV text; metadata `text` |

A station is one `Q` object (its anchor) plus metadata naming its other tiles:

```json
"Q1": {"type": "dial", "pads": [[10,4],[12,4]], "back": [11,2],
       "digits": 2, "range": 10, "yields": "Q3"}
```

`yields` names the station whose clue this station's answer feeds (radio pips
a keypad digit, a wing station a vault symbol). Exact shapes per type are in
phase 01 §4.

### 4.2 Shared types (exact; created by Tasks 2 and 3, except `sideJob`, `sideJobsDone` and the `sidejob` event, which Task 17 wires; Task 3 declares them optional and unset)

In `src/game/sim/world.ts`:

```ts
export type StationType = "dial" | "wires" | "keypad" | "radio" | "switches" | "bells" | "vault" | "sync";
export type GearItem = "earpiece" | "goggles" | "stethoscope" | "uv";

export interface StationState {
  id: string;            // "Q1"
  type: StationType;
  answer: number[];      // the secret, re-drawn per attempt; never sent to a client as-is
  input: number[];       // what the team has entered so far (a dial setting, keys pressed, wires cut)
  solved: boolean;
}

export interface GearState {
  id: string;            // "g1"
  item: GearItem;
  at: Vec | null;        // tile it lies on; null while carried or on a hatch sill
  heldBy: Seat | null;
  sill: string | null;   // hatch id while it sits on one
}
```

`World` gains: `stations: Record<string, StationState>`, `gear: GearState[]`,
`holding: Partial<Record<Seat, Seat>>` (towed seat → leader), `seed: number`,
`attempt: number`, `dyedUntil: number`, `sideJobsDone: string[]`, and
`Snapshot` gains `gear: GearState[]` and `sideJobsDone: string[]`.

`PlayerInput` (`src/game/types.ts`) gains `gear?: boolean` (G pressed this
input, edge-triggered on the server like `act`).

`WorldEvent` gains:

```ts
| { kind: "station"; id: string; result: "turn" | "press" | "cut" | "solved" | "wrong"; n?: number; at: Vec }
| { kind: "gear"; id: string; action: "take" | "drop" | "give" | "sill"; seat: Seat; at: Vec }
| { kind: "hold"; seat: Seat; leader: Seat | null }
| { kind: "bell"; id: string; at: Vec }
| { kind: "lamp"; id: string; seat: Seat }
| { kind: "dye"; station: string }
| { kind: "sidejob"; id: string; seat: Seat }
```

`SoundCue["kind"]` gains: `"tick"`, `"tumbler"`, `"key"` (with `n` = pitch
index), `"snap"`, `"static"`, `"tone"`, `"pip"`, `"clunk"`, `"bellnote"` (`n`),
`"bell"`, `"dye"`, `"earpiece"` (`n` = pitch index), `"gear"`, `"solved"`.

`EntityView["kind"]` gains `"station"`, `"gear"`, `"hatch"`, `"bell"`,
`"lamp"`, `"ink"`, `"sidejob"`, `"uv"` (the pool: `polys`). `EntityView` gains
`station?: { type: StationType; shows: number[]; solved: boolean }` (only what
that viewer perceives: e.g. wire colours for the sighted, nothing for Can't
see), `item?: GearItem`, `heldBy?: Seat`, `text?: string` (ink, plaque),
`dyed?: boolean` (player), `holding?: Seat` (player).

`RoleView` gains `gear: GearItem | null` (own slot), `sideJob?: { id: string;
text: string; done: boolean }` (own only), `lamp?: { seat: Seat; tick: number }`
(sighted only), `act?: string` (the Act hint, phrased from perceived facts
only).

### 4.3 Randomness

`src/game/sim/rng.ts` (Task 2): `export function rng(seed: number): () =>
number` (mulberry32). `createWorld(room, seed = 1)` stores the seed; answers are
drawn from `rng(seed * 1000 + attempt)` at room start and on each `sendBack`,
for unsolved stations only. `src/net/game.ts` seeds each room with a fresh
`Date.now()`-derived number; tests pass fixed seeds. `step` stays
deterministic for a given world.

### 4.4 Wrong answer = caught

`findCatch` is unchanged; a station's wrong input pushes `{ kind: "dye" }` and
calls the existing `sendBack` path with a `caught` whose `hazard` is
`"station"` (`HazardKind` widened). `dyedUntil` is set ~1.2 s ahead so the
splatter shows before the reset completes.

## 5. Phases

| Phase | File | Tasks | Needs | Ends with | Done |
| --- | --- | --- | --- | --- | --- |
| 01 | `…-01-framework.md` | 1–6 | — | WIP committed; stations, gear, holding, hatch, bell, lamp, dye in the sim with perception, parity rows and logging; the presence linter replaces lead beats; docs superseded | [x] |
| 02 | `…-02-client.md` | 7–10 | 01 | measured camera/LoS on a hub room; every new object drawn, heard and labelled; HUD gear slot, Act hint, lamp, side-job chip; **human review** | [ ] |
| 03 | `…-03-gallery.md` | 11–13 | 01, 02 | room 2 The Gallery shipped, bots clear it; **human review**; **playtest 5** written up | [ ] |
| 04 | `…-04-lights-vault.md` | 14–16 | 03 | rooms 3 and 4 shipped, old rooms removed; **human review** of each | [ ] |
| 05 | `…-05-jobs-results.md` | 17–20 | 04 | side jobs, credited results, comms map, leaderboard edition, CLAUDE.md/DESIGN.md/backlog/ADR wrap-up; **human review** | [ ] |

## 6. Feature-level Definition of Done

- [ ] Every phase in §5 is ticked, and every task is complete with tests passing
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start` then `pnpm check` passes
- [ ] Manually verified on a local build, three tabs, desktop and phone: the
  spec's demo (safe by ear with the stethoscope; a wrong wire splatters and
  resets with the safe still open; goggles argued over in room 3; split wings
  and a hatch in room 4; credited results)
- [ ] Every requirement in §2 is covered (see §7)
- [ ] Every `Human review:` task explicitly accepted by the user
- [ ] ADR 0017 accepted by the user; CLAUDE.md and DESIGN.md match the code
- [ ] No item remains in §8

## 7. Requirements coverage check

| Requirement | Covered by |
| --- | --- |
| P1 | Task 1 |
| P2 | Task 6 |
| FR1 (presence linter) | Task 5 |
| FR2 (dependency triangle) | Tasks 12, 14, 15 (room design + lint rule in Task 5: ≥2 stations open at once) |
| FR3 (bots clear, read sim) | Task 4; Tasks 12, 14, 15 |
| FR4 (`leads` removed) | Task 5 |
| FR5 (seeded re-draw, solved stays) | Task 2 |
| FR6–FR12 (station types) | Task 2 (sim), Task 3 (perception), Task 8 (drawing), Task 9 (sound) |
| FR13 (vault meta-code) | Task 2, Task 15 |
| FR14 (sync lock) | Task 2 |
| FR15 (wrong = caught) | Task 2 |
| FR16–FR21 (gear) | Task 3 (sim + perception), Tasks 8–10 |
| FR22 (hold hands) | Task 3, Task 8 |
| FR23 (hatch) | Task 3, Task 8 |
| FR24–FR25 (bell, lamp) | Task 3, Tasks 8–10 |
| FR26 (four rooms) | Tasks 11, 12, 14, 15, 16 |
| FR27 (labels) | Task 10 |
| FR28 (side jobs) | Task 17 |
| FR29 (dye pack) | Task 2 (sim), Task 8 (drawing), Task 9 (sound) |
| FR30 (credited results) | Task 17 |
| FR31 (version bump) | Task 19 |
| NFR perception / Act hint | Task 3 (`act` in `viewFor`), Task 10 |
| NFR parity + exceptions | Tasks 2, 3 (rows), Task 20 (CLAUDE.md) |
| NFR audio, no speech | Task 9 |
| NFR performance | Task 7 |
| NFR accessibility | Tasks 8, 10 (human review) |
| NFR logging | Task 4 |
| Overhaul FR35 comms map | Task 18 |
| Housekeeping (backlog, PROCESS_LOG, DESIGN.md, ADR) | Tasks 6, 10, 20 |

## 8. Risks / open questions

None open. Accepted risks:

- Bots that read answers from the sim may still struggle with towing and
  hatches; Task 4 makes holding and hatch jobs explicit, and a room the bots
  cannot clear is not finished (stop and ask, never widen the bot's
  knowledge further).
- Authoring cost per station is real; phases ship whole rooms in order, so a
  short run ends with fewer rooms, not broken ones.
- Puzzle fun is not measurable: playtest 5 (Task 13) gates rooms 3 and 4.
