# Escape-room heist: plan overview

- **Date:** 2026-10-28 (re-planned 2026-10-28 after the first stations playtest)
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-10-28 (spec
  `specs/2026-10-28-escape-room-heist.md`, partly superseded by
  `specs/2026-10-28-escape-room-clues-and-pacing.md`, both approved in brainstorms; ADRs 0017 and
  0018 proposed)

## 0. How to use these plans

Files in the set:

| File | Phase |
| --- | --- |
| `plans/2026-10-28-escape-room-heist-00-overview.md` | this overview |
| `…-01-framework.md` | 01 framework: stations, gear, team mechanics in the sim (done) |
| `…-02-client.md` | 02 drawing, sounds, labels and HUD for the new objects |
| `…-03-clues.md` | 03 clue paths, the clue-path linter, perception-only bots |
| `…-04-basics.md` | 04 rooms 1 to 3: the basics, two new things a room |
| `…-05-safe.md` | 05 room 4 The Safe (safe, stethoscope) |
| `…-06-gallery.md` | 06 room 5 The Gallery (wires and plaque, keypad) |
| `…-07-lights-out.md` | 07 room 6 Lights Out (radio, switches) |
| `…-08-night-shift.md` | 08 room 7 Night Shift (UV torch, goggles) |
| `…-09-music-room.md` | 09 room 8 Music Room (music box, earpiece) |
| `…-10-vault.md` | 10 room 9 The Vault (vault, sync lock) |
| `…-11-wrap-up.md` | 11 side jobs, credited results, comms map, leaderboard edition, docs |
| `…-12-review-fixes.md` | 12 fixes from the human review of phases 02 to 10 |

A session reads this overview plus exactly one phase file. Task numbers are global (Task 1 to 31
across files). Tick a phase in §5 only when its phase Definition of Done is met. Run each phase
with the `execute-plan` skill.

**Re-plan, 2026-10-28.** The first playtest of the stations draft (phase 02's joint review) found
that no person could solve a station and that one room taught too much. Phases 03 to 05 of the
first plan (The Gallery, Lights Out and The Vault, side jobs) are replaced by phases 03 to 11 here;
their task numbers 11 to 20 are reused for new tasks. Phase 02 keeps its tasks with added scope.

This plan supersedes, in `plans/2026-10-19-play-overhaul-06-rooms-results.md`, Task 23 (cancelled)
and takes over Tasks 24 and 25 (Tasks 29 and 30 here). Overhaul phase 07 (ambience, music, wrap-up)
runs after this plan.

## 1. Summary

The heist becomes nine short rooms, each introducing at most two new things. Rooms 1 to 3 teach
the basics; rooms 4 to 9 add escape-room stations (safe, wires, keypad, radio, switches, music
box, vault, sync lock) and gear (stethoscope, UV torch, goggles, earpiece), each met first as a
forgiving teaching version. Every station has a clue a person can perceive and decode, and the
links between stations are found through a shared drawn motif rather than spelled out. Bots solve
only from what their role perceives, so "bots clear the room" proves a person could; a clue-path
linter catches a missing clue before anyone plays.

## 2. Requirements

The requirements are the approved specs: `specs/2026-10-28-escape-room-heist.md` FR1 to FR31 and
§2 non-functionals, **as amended by** `specs/2026-10-28-escape-room-clues-and-pacing.md` FR1 to
FR12 (cited "clues FRn" in the phase files; the first spec's are "spec FRn"). Superseded parts of
the first spec: FR3, the clue parts of FR6 to FR14, FR26, FR27, FR28's rooms. Planning-time
additions:

- **P1.** The uncommitted overhaul phase 06 work was committed first (done, phase 01).
- **P2.** Overhaul Task 23 cancelled, Tasks 24/25 moved, overhaul FR12/FR14 superseded (done).
- **P3.** Bots pass answers as a mark on the tile (wire, key, button, bell, socket) and as short
  fixed text between the roles that can send and read text ("5", "stop"); no change to the
  channel table (user, 2026-10-28, at re-planning).

### 2.1 Functional requirements

Spec FR1, FR2, FR4 to FR25, FR28 (from room 4), FR29 to FR31, P1 to P3, and clues FR1 to FR12.

### 2.2 Non-functional requirements

Spec §2.2 and clues §2.2 (the tick and tumbler, static and tone, and the nine key pitches told
apart by ear), plus CLAUDE.md's invariants (layering, perception, parity, logging, hygiene).

### 2.3 Out of scope

Spec §2.3 and clues §2.3 (procedural rooms, a tutorial mode, timed hints, a start-from-room-4
option). Also: ambience and music (overhaul phase 07); the open attract-seed sweep (overhaul phase
06 Corrections log).

### 2.4 Assumptions

Spec §2.4 and clues §2.4. Task 7 measured the hub-room cost (0.30 ms a tick): nine short rooms are
within it.

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

### 4.2 Shared types (exact; created by Tasks 2 and 3, except `sideJob`, `sideJobsDone` and the `sidejob` event, which Task 28 wires (was Task 17 before the re-plan); Task 3 declares them optional and unset)

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

### 4.5 Clues, motifs, teaching and bot messages (re-plan; created by Tasks 11 and 13)

Room format, station metadata (parsed in `src/game/rooms/format.ts`, all optional):

```json
"Q1": {"type": "dial", ..., "teach": true}          // a teaching station (clues FR7)
"Q3": {"type": "radio", ..., "yields": "Q5", "motif": "moon"}   // the motif drawn at both ends
"Q5": {"type": "keypad", ..., "slot": {"from": "Q3", "at": 0}} // key position fed by Q3's digit
"S1": {"text": "..."}                                // a sign's plate text is drawn (Task 11)
"T1": {"of": "Q8"}                                   // letter `t`: the switches' target card
"Q2": {"type": "vault", "from": ["Q6","Q4"], "symbols": "Y1"} // Y1: the vault's order clue
```

New tile letters: `t` (`card`: a switches target card, metadata `of`) and `Y` (`order`: the
vault's order clue). `Motif = "moon" | "star" | "wave" | "key" | "eye" | "leaf"`, drawn by the
client's `symbolGlyph` family.

Answers that feed (clues FR3): a solved station with `yields` fixes the fed station's slot to its
digit (radio → keypad `slot.at`); a vault's `answer[i]` is the symbol revealed by `from[i]` once
solved, so the vault is no longer random.

`EntityView` gains (Task 11, gated in `viewFor`):

```ts
kind: ... | "card" | "order";
station?: { ...; teach?: true; motif?: Motif; reveal?: number };  // reveal: a solved wing's symbol
card?: number[];          // a target card's lit (1) / hollow (0) lamps, sighted only
text?: string;            // already present; signs and plaques now drawn with it
```

`SoundCue["kind"]` gains nothing; the teaching safe's lamp is in `station.shows` (`shows[1] = 1`
while the dial sits on the right number of a `teach` station).

Bots (Task 13): `Hidden` and `hiddenOf` are removed from `src/game/bots/brain.ts`, and `think`
loses its `hidden` parameter:

```ts
export function think(room: Room, view: RoleView, inbox: ChannelMessage[], memory: BotMemory,
  now: number): BotTurn;
```

A bot's `Known` gains `stations: Record<string, StationBelief>` built from its own view and
inbox (no sim read), and a decoder per station type (Tasks 13, 15, 17, ...):

```ts
export interface StationBelief {
  answer: (number | null)[];   // what this bot has worked out of the answer so far
  solved: boolean;              // seen solved, or heard "solved"
  told: Set<number>;            // positions it has passed on
}
export type Decoder = (view: RoleView, inbox: ChannelMessage[], belief: StationBelief,
  o: RoomObject, now: number) => void;
export const DECODERS: Partial<Record<StationType, Decoder>>; // in src/game/bots/decode.ts
```

Bot messages (P3): a spatial answer is a `mark` with `id: "x"` on the tile; a number is `text`
matching `/^\d$/`, or `"stop"` as a callout for a dial; bots read only those two text forms.

## 5. Phases

| Phase | File | Tasks | Needs | Ends with | Done |
| --- | --- | --- | --- | --- | --- |
| 01 | `…-01-framework.md` | 1–6 | — | stations, gear, holding, hatch, bell, lamp, dye in the sim; presence linter | [x] |
| 02 | `…-02-client.md` | 7–10 | 01 | every new object drawn, heard and labelled (label cap); HUD; reviewed on fixtures | [x] |
| 03 | `…-03-clues.md` | 11–13 | 02 | clue paths and motifs in sim and view; clue-path linter; perception-only bot core, existing rooms still cleared | [x] |
| 04 | `…-04-basics.md` | 14–15 | 03 | rooms 1 to 3 replace First Job; **human review** | [x] |
| 05 | `…-05-safe.md` | 16–17 | 04 | safe decoder; room 4 The Safe; **human review** | [x] |
| 06 | `…-06-gallery.md` | 18–19 | 05 | wires and keypad decoders; room 5; **human review** | [x] |
| 07 | `…-07-lights-out.md` | 20–21 | 06 | radio and switches decoders; room 6; **human review** | [x] |
| 08 | `…-08-night-shift.md` | 22–23 | 07 | UV and goggles bot use; room 7; **human review** | [x] |
| 09 | `…-09-music-room.md` | 24–25 | 08 | music box and earpiece decoders; room 8; **human review** | [x] |
| 10 | `…-10-vault.md` | 26–27 | 09 | vault and sync decoders; room 9; old rooms removed; **human review** | [x] |
| 11 | `…-11-wrap-up.md` | 28–31 | 10 | credits and the cleared card (28), comms map, edition 2, docs, ADRs (31); floor-item side jobs replaced by phase 14; **human review** | [x] (reviews queued) |
| 12 | `…-12-review-fixes.md` | 32–40 | 10 | fixes from the human review of phases 02 to 10 (G, crate plate, labels, links, chimes, room 7, practice lever, HUD, hand-holding); **human review** | [ ] |
| 13 | `2026-11-01-escape-room-heist-13-00-overview.md` | 41–50 | 12 | fixes from the human review of phase 12 (vent chimes, practice sound, UV ink, room 7 door, link wires, bots, flaky specs); **human review** | [x] |
| 14 | `2026-11-02-escape-room-heist-14-00-overview.md` | 51–60 | 11 (28–30), 12, 13 | side jobs as hidden caches: sim and view, server, client, six caches, docs and ADR 0020; **human review** | [x] |

## 6. Feature-level Definition of Done

- [ ] Every phase in §5 is ticked, and every task is complete with tests passing
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start` then `pnpm check` passes
- [ ] Manually verified on a local build, three tabs, desktop and phone: the clues spec's demo
  (rooms 1 to 3 teach two things each; the teaching then real safe; a plaque read across rooms; a
  radio digit found in the keypad by its motif; the vault fed by its wings)
- [ ] Every requirement in §2 is covered (see §7)
- [ ] Every `Human review:` task explicitly accepted by the user
- [ ] ADRs 0017 and 0018 accepted by the user; CLAUDE.md and DESIGN.md match the code
- [ ] No item remains in §8

## 7. Requirements coverage check

| Requirement | Covered by |
| --- | --- |
| P1, P2 | Tasks 1, 6 (done) |
| P3 (bot messages) | Task 13 |
| Spec FR1 (presence linter), FR2 (two open at once) | Task 5 (done); every room task |
| Spec FR4 (`leads` removed), FR5 (seeded re-draw) | Tasks 2, 5 (done) |
| Spec FR6–FR14 control and feedback, FR15 wrong = caught | Task 2 (done) |
| Spec FR16–FR25 gear, holding, hatch, bell, lamp | Task 3 (done); Tasks 8–10 (client) |
| Spec FR28 side jobs (from room 4): replaced by caches | Phase 14 (Tasks 51–60, `specs/2026-11-02-escape-room-caches.md`) |
| Spec FR30 credits | Task 28 (the cleared card and credits) |
| Spec FR29 dye pack | Task 2 (sim, done), Tasks 8, 9 |
| Spec FR31 version bump / edition | Task 30 |
| Clues FR1, FR2 (clue per station type) | Task 11 (sim and view), Tasks 8–10 (drawing), each room's decoder task |
| Clues FR3 (implicit links, motifs) | Task 11; Tasks 20, 26 (rooms that link) |
| Clues FR4 (clue-path linter) | Task 12 |
| Clues FR5, FR6 (perception-only bots) | Task 13 (core); Tasks 16, 18, 20, 22, 24, 26 (decoders) |
| Clues FR7, FR8 (teaching then real) | Task 11 (sim); every station room task |
| Clues FR9, FR10 (nine rooms, two new a room) | Task 14 (rooms 1–3), Tasks 17, 19, 21, 23, 25, 27 |
| Clues FR11 (side jobs from room 4) | Tasks 58, 59 (caches in rooms 4 to 9) |
| Clues FR12 (label cap) | Task 10 |
| NFR audio (told apart by ear) | Task 9 (human review) |
| NFR perception, parity | Tasks 3, 11 (rows), Task 31 (CLAUDE.md) |
| NFR performance | Task 7 (done) |
| NFR accessibility | Tasks 8, 10, 11 |
| NFR logging | Task 4 (done), Task 54 |
| Overhaul FR35 comms map | Task 29 |
| Housekeeping (CLAUDE.md, DESIGN.md, ADRs, backlog, PROCESS_LOG) | Task 31 |

## 8. Risks / open questions

None open. Accepted risks:

- Perception-only bots are the largest cost: each station type's decoder must solve from what its
  role perceives and what teammates send (marks, short text). A room the bots cannot clear is not
  finished: stop and ask, never give bots sim knowledge back.
- Nine rooms is a lot of authoring; phases ship whole rooms in order, so a short run ends with
  fewer rooms, not broken ones.
- Puzzle fun and clue clarity are not measurable: every room has a human review where the user
  plays it.
