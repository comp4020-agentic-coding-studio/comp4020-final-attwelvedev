# Escape-room heist: Phase 02, the client

- **Date:** 2026-10-28
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-10-28
- **Part of:** `plans/2026-10-28-escape-room-heist-00-overview.md`. Read it
  first, especially §3 (commands, human review on a local build) and §4.2
  (view fields this phase draws).
- **Depends on phases:** 01.

## 1. Summary

Measures the camera and line-of-sight cost on a hub-shaped room, then draws,
voices and labels everything phase 01 added: stations, gear, the UV pool and
ink, goggles, hatch, held hands, bell, lamp, dye pack; and adds the HUD gear
slot, Act hint, lamp light and the side-job chip slot (filled in phase 05).
Ends with the `00-stations-draft` fixture playable in three tabs, looking and
sounding like the agreed design.

## 2. Requirements (this phase)

### 2.1 Functional

Spec FR6–FR12, FR17–FR19, FR22–FR25, FR27, FR29 (client side: drawing,
sound, labels, HUD).

### 2.2 Non-functional

Spec §2.2 performance (measured here), accessibility, audio (no speech, no new
files), perception (Act hint shows `view.act` only).

### 2.3 Out of scope for this phase

Real rooms (phases 03, 04); side-job content and results (phase 05).

### 2.4 Assumptions

See overview §2.4. This phase verifies the two unverified ones (Task 7).

## 3. Existing code context (verified 2026-10-28)

- `src/client/render/index.ts` — `export interface Scene { w; h; role; seat;
  roles; tiles: string[] | null; entities: EntityView[]; self: Vec | null;
  layout: "fit" | "follow"; pops?; fx?; alarm?; nowMs?; reducedMotion?;
  spectator?; noSelf?; own?: Motion; rise?; cam?: Camera; seen?: string[];
  bots?; labels?: { text: string; at: Vec }[] }`; `export function draw(ctx,
  scene): void`. Split modules: `blocks.ts` (325), `figures.ts` (291),
  `hazards.ts` (274), `sight.ts` (308, the ray-cast mist and `lightPolygon`),
  `pops.ts`, `labels.ts`, `project.ts` (`camera`, `easeCamera`, `toScreen`,
  `fromScreen`; follow camera ≈18 tiles desktop, ≈7 phone).
- `src/client/fx.ts` — `FX_MS = 600`, `FX_MAX = 24`, `FxTone = "goal" |
  "danger" | "ui" | "muted"`, `detectFx(prev: EntityView[], next: EntityView[]): Fx[]`.
- `src/client/hud.ts` — `CUE_WORD: Record<SoundCue["kind"], string>` (typed, so
  every new sound needs a caption word), `cueCaptions(sounds)`, `Dir8`,
  `dirOf`.
- `src/client/labels.ts` — `LABEL_COPY: Record<string, string>`, `KIND_OF:
  Partial<Record<EntityView["kind"], string>>`, `labelsFor(entities, tiles,
  near, enabled = true, visible = () => true): Label[]`.
- `src/client/audio.ts` — `GameAudio { resume; play(sounds: SoundCue[]);
  playClip; setMaskNoise; dispose }`, synthesis helpers `tone(c, s, type, f0,
  f1, dur, gain)`, `progress(c, s, freqs, type)`, `click`, `rustle`; the
  dispatch is an `if (s.kind === …)` chain around lines 218–282.
- `src/client/input.ts` — `read()` returns `{ seq, move, act }`; Task 3 adds
  `gear`.
- Tokens: `src/styles/tokens.css` mirrored in `src/client/tokens.ts`;
  `src/client/tokens.test.ts` checks the mirror and contrast; `DESIGN.md`
  (§2 tokens, §4 world, Components) with `spec/design.test.ts` checking the
  names it lists exist.
- Components: `src/components/Game.tsx` (HUD composition), `Feeds.tsx`,
  `Settings.tsx`; touch controls in `Game.tsx`/`TouchControls`.
- Layout specs: `spec/layout/hud.test.ts`, `spec/layout/sight.test.ts`; canvas
  checks use `settledHash(page)` from `spec/playUi.ts` (never one frame).

### Interfaces from earlier phases (exact)

From overview §4.2 (created by Tasks 2 and 3):

```ts
export type StationType = "dial" | "wires" | "keypad" | "radio" | "switches" | "bells" | "vault" | "sync";
export type GearItem = "earpiece" | "goggles" | "stethoscope" | "uv";
// EntityView kinds added: "station" | "gear" | "hatch" | "bell" | "lamp" | "ink" | "sidejob" | "uv"
// EntityView fields added:
station?: { type: StationType; shows: number[]; solved: boolean;
            parts: { key: StationPartKey; at: Vec[] }[]; furniture?: true }; // parts, furniture added in Task 8 (ruled 2026-10-28; furniture = parts in sight, state not)
// StationPartKey = "anchor" | "pads" | "back" | "wires" | "keys" | "buttons" | "lamps" | "bells" | "tune" | "sockets"
item?: GearItem; heldBy?: Seat; text?: string; dyed?: boolean; holding?: Seat;
// RoleView fields added:
gear: GearItem | null; sideJob?: { id: string; text: string; done: boolean };
lamp?: { seat: Seat; tick: number }; act?: string;
// SoundCue kinds added:
"tick" | "tumbler" | "key" | "snap" | "static" | "tone" | "pip" | "clunk" | "bellnote" | "bell" | "dye" | "earpiece" | "gear" | "solved"
// PlayerInput: gear?: boolean
```

Fixture: `spec/fixtures/drafts/00-stations-draft.room` (Task 4), every object type.

## 4. Approach

The look is the spec's §4.1 (from the design pass, with the user's changes):
gallery furniture in the 3/4 world; the object is the readout; six code
colours each with a fixed pattern (red plain, blue stripe, yellow bands, green
dots, white hatch, black chevrons); the UV pool is the one bold effect
(blue-violet wash at 30% with a dashed rim, ink in `--w-uv-ink` with a plum
outline, clipped to pool ∩ sight); goggles tint green-grey with 8% grain at
12 fps (static stipple under reduced motion); dye pack: pastel cloud puff,
blotch shapes on every figure while `dyed`, banner "Wrong wire. Back to the
flag." (copy varies by station type: "Wrong code.", "Wrong note."). New tokens
and components are listed in spec §4.1 and land in `DESIGN.md` in the task
that adds them.

New drawing goes in new modules, not the 300-line files: `render/stations.ts`,
`render/gear.ts` (gear on floor and on figures, hold arc, UV pool, goggles
tint), `render/signals.ts` (bell, lamp, hatch), `render/dye.ts`.

Audio: each new cue is synthesised in `audio.ts` from existing helpers: tick =
short click; tumbler = a lower, duller click; key `n` = one of 9 pentatonic
pitches; snap = noise burst; static = band-passed noise loop while present;
tone = steady sine; pip = 880 Hz blip; clunk = low square; bellnote `n` = sine
+ partials; bell = longer bell; dye = soft filtered noise "pomf"; earpiece `n`
= pitch, panned centre; gear = two-click; solved = rising triad.

## 5. Task breakdown

### Task 7: Measure the camera and line-of-sight cost on a hub room ✅

- **Description:** Before any room is built: a 60×30 hub-and-chambers
  fixture (`spec/fixtures/perf/00-hub-size.room`: its own folder, a measuring
  stick that need not lint or be bot-clearable; ruled 2026-10-28), drawn at both viewports,
  and per-tick `viewFor` cost for three seats with a UV pool active.
- **Files touched:** new fixture; new `src/game/perf.test.ts` (unit, writes the
  measured ms beside its threshold); `src/client/render/project.ts` only if
  the follow camera mis-frames non-strip rooms (with a `render.test.ts` case).
- **Tests first (red):** `perf.test.ts`: 3 × `viewFor` + `step` on the hub
  fixture averages under 2 ms per tick over 400 ticks (20 Hz × 10 lobbies =
  200 ticks/s budget of 1000 ms, leaving headroom); `render.test.ts`: follow
  camera keeps self in frame at a chamber corner of the hub.
- **Implementation (green):** fix whatever the measurement shows (cache
  `visibleFrom` per seat per tick if needed).
- **Acceptance criteria:** numbers recorded in the test and in this file's
  Corrections log; if the budget cannot be met, stop and ask (room size is
  then capped, which changes phases 03–04).
- **Depends on:** Task 3.

### Task 8: Draw stations, gear, UV, goggles, hatch, held hands, bell, lamp, dye

- **Description:** Every new entity and state drawn per this file's §4 and
  spec §4.1, including reduced-motion and high-contrast variants.
- **Files touched:** new `src/client/render/stations.ts`, `gear.ts`,
  `signals.ts`, `dye.ts`; `src/client/render/index.ts` (call them; `Scene`
  gains nothing new: everything is in `entities`); `src/game/perception.ts` +
  `perception.test.ts` (the station entity carries its `parts` tiles, furniture
  only; for the sighted it is sent when any part or display tile is in sight,
  with `shows` empty unless a display tile is in sight; ruled 2026-10-28); `render/figures.ts` (gear on
  figure, shoulder badge on phone scale, dye blotches, eyes toward leader);
  `render/sight.ts` (UV pool polygon reuse, goggles tint); `src/client/fx.ts`
  (`detectFx`: station solved ring, gear hand-over arc, bell swing);
  `src/styles/tokens.css`, `src/client/tokens.ts` (+ `tokens.test.ts`):
  `--w-code-red/blue/yellow/green/white/black`, `--w-steel`,
  `--w-steel-front`, `--w-brass`, `--w-lamp`, `--w-uv`, `--w-uv-ink`,
  `--w-nv`, `--w-card`, with high-contrast values; `DESIGN.md` (§2 tokens,
  §4 new subsections, Components: canvas helpers `turnPad`, `codeSwatch`,
  `symbolGlyph`, `splat`); `src/net/protocol.ts` + `src/net/attach.ts`
  (`caught` gains optional `station?: StationType`, team-wide) and
  `caughtText` in `src/client/hud.ts` for the per-type dye banner copy
  (ruled 2026-10-28).
- **Tests first (red):** `perception.test.ts`: a sighted viewer at the switch
  buttons with the lamps out of sight gets the station with its parts and empty
  `shows`; Can't see gets no station; `render.test.ts`: each new entity kind draws without
  throwing at both scales and under reduced motion and high contrast; ink is
  clipped to the pool polygon (asserted on the recorder: every ink fill sits
  inside a `save`→`clip` on the pool ∩ sight path; ruled 2026-10-28);
  `fx.test.ts`: a station flipping to solved yields a `goal` fx; `tokens.test.ts`:
  new tokens mirrored and every code colour's fill or its outline ≥3:1
  against `--w-floor` in both themes (WCAG 1.4.11; ruled 2026-10-28);
  `spec/design.test.ts` passes with the new names.
- **Implementation (green):** as described.
- **Acceptance criteria:** tests green; no colour-only state (each code colour
  carries its pattern; lamps lit vs hollow; keys numbered); each station carries
  a brass name plate on the object (its kind in words: "Safe", "Radio", "Wires",
  "Keypad", "Switches", "Lamps", "Music box", "Vault", "Keys") and readouts large
  enough to read at phone scale (ruled 2026-10-28 after the first review: nothing
  said what an object was).
- **Human review:** on a local build with `00-stations-draft` as the only room
  (`ROOMS_DIR=spec/fixtures/drafts` or equivalent), three tabs, desktop 1280
  and phone 375: the stations read as gallery furniture and look natural in the
  world; the UV pool is striking but legible; goggles read as night vision;
  the dye pack is funny, not alarming. Pass = the user says so. **Held jointly
  with Task 10's review, after Task 10 lands** (ruled 2026-10-28): the drawing
  cannot be judged before the labels and Act hint say what each thing is.
- **Depends on:** Tasks 3, 7.

### Task 9: Synthesised sounds and captions for every new cue

- **Description:** Per this file's §4; no speech, no new files.
- **Files touched:** `src/client/audio.ts`, `src/client/hud.ts` (`CUE_WORD`
  rows: "Tick", "Tumbler", "Key", "Snap", "Static", "Tone", "Pip", "Clunk",
  "Bell note", "Bell", "Dye pack", "Earpiece", "Gear", "Solved"),
  `src/client/hud.test.ts`, `src/game/cues.ts` (`BriefingCue` gains `"tick"`,
  `"tumbler"`, `"static"`, `"bell"` for the reveal's sound briefing, matched on
  station type for stations: dial → tick, tumbler; radio → static; bell object → bell) +
  `cues.test.ts`.
- **Tests first (red):** `hud.test.ts`: every new kind has a caption with no
  direction words; `cues.test.ts`: a room with a dial briefs `tick`.
- **Implementation (green):** as described.
- **Acceptance criteria:** tests green; `grep -n "speechSynthesis" src/client`
  still only in `speech.ts`.
- **Human review:** the same local build: each sound is distinguishable by ear
  (tick vs tumbler, static vs tone, the 9 key pitches) with eyes closed. Pass
  = the user says so.
- **Depends on:** Task 3.

### Task 10: HUD gear slot, Act hint, lamp light, side-job chip, labels

- **Description:** HUD additions from spec §4.1 and the new first-seen
  labels.
- **Files touched:** new `src/components/GearSlot.tsx`, `ActHint.tsx`,
  `LampLight.tsx`, `SideJob.tsx` (renders `view.sideJob` when present; empty
  until phase 05), `GearGlyph.tsx`; `src/components/Game.tsx` (crew row gear
  glyphs from entities' `item`/`heldBy`; phone: gear slot 48 px tap sends
  `gear` (via a `[data-gear]` handler in `src/client/input.ts`, like `[data-act]`), Act button label = `view.act`); `src/styles/game.css`;
  `src/client/labels.ts` (+ test: `LABEL_COPY` rows from spec §4.1 for
  station types, gear, hatch, bell, lamp, ink, hold hands; `KIND_OF` maps the
  new kinds); `DESIGN.md` Components; `spec/layout/escape-hud.test.ts` (its own app
  on the drafts: the shared server's rooms have no gear; CLAUDE.md: one slow file per area) (gear slot,
  Act hint, lamp: visible, ≥48 px on phone, no overlap with the joystick or
  Act, axe clean, at both viewports and every role).
- **Tests first (red):** `labels.test.ts`: a `station` entity of type `dial`
  yields the safe label; `spec/layout/hud.test.ts` as listed; a Can't see
  page's Act hint never contains a colour word.
- **Implementation (green):** as described.
- **Acceptance criteria:** tests green.
- **Human review:** the same local build at both viewports: the HUD stays out
  of the way of the world; the Act hint says what Act will do. Pass = the user
  says so.
- **Depends on:** Tasks 3, 8.

## 6. Phase Definition of Done

- [ ] Every task in §5 is complete and its tests pass
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start` then `pnpm check` passes
- [ ] Task 7's numbers recorded; Tasks 8–10 human reviews accepted
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| NFR performance | Task 7 |
| FR6–FR12, FR17–FR19, FR22–FR25, FR29 (drawing) | Task 8 |
| FR6–FR12, FR17, FR20, FR24, FR29 (sound) | Task 9 |
| FR16 (phone gear tap), FR25 (lamp HUD), FR27, NFR Act hint | Task 10 |

## 8. Risks / open questions

None.

## 9. Corrections log

<!-- one line per user redirect during execution -->

- 2026-10-28, Phase 1 review: four plan gaps ruled by the user (hub fixture in
  `spec/fixtures/perf/`, contrast on fill-or-outline, `caught` carries the
  station type, ink clip asserted on recorder ops). The plan had named paths and
  checks without checking them against existing assertions (`drafts/` is
  bot-cleared; a pixel check with no pixel canvas).
- 2026-10-28, Task 7 numbers: step + 3 × viewFor on the 60×30 hub with a lit UV
  torch = 0.30 ms a tick (budget 2 ms; 400 ticks, players walking, the pool seen
  by Can't speak in 394 of 440 ticks). No `visibleFrom` cache needed. The follow
  camera keeps self in frame at all four chamber corners at 375 and 1280
  (`render.test.ts`; mutating the clamp fails it) and frames the hub in the real
  app at both widths, so `project.ts` is unchanged. Both tests were green on
  first run: nothing to fix, verified by probing the workload and mutating the
  clamp. Full check baseline: 228 s.
- 2026-10-28, Task 8 start: the station entity had no part tiles (the grid
  blanks `Q`, and the entity is sent only while a display tile is in sight), so
  no wire, key, pad or button could be placed. The user ruled to add `parts` to
  the station entity (furniture only, `shows` gated on display sight). The
  Phase 1 review checked field names against the code but not whether the
  fields could draw the spec's mockups.
- 2026-10-28, Task 8 review: expected a verdict on the look; the user said nothing
  was clear: what each object is or what to do with it. Missed because the plan
  reviews the drawing (Task 8) before the labels and Act hint that explain it
  (Task 10), and nothing on screen named the new objects or showed `view.act`.
- 2026-10-28, Task 10: tried one chip on a phone to stop chips piling up; it broke
  DESIGN.md 4.6's promise (a chip for every kind in sight, `spec/layout/hud.test.ts`).
  Removed it: the new nearest-free-spot placement already keeps chips apart.
- 2026-10-28, joint review of Tasks 8-10 (stopped): the user could not solve any
  station: the safe's clicks sound alike, the music box gives no bell-to-note link,
  and nothing says which wire, code or switches. Traced: several clues never reach
  a human (plaque text never drawn; no switches target; vault answer random, not fed
  by the wings; radio `yields` a keypad whose clue is a chime). Bots clear the
  draft by reading answers from the sim, which hid it. The user also judged one room
  with every station type too much to learn at once. Handed back to
  brainstorm-feature: the clue chain (what tells a human each answer, how stations
  link) and pacing (fewer types per room). Work kept on branch
  `wip/escape-room-02-client`, uncommitted to main.
