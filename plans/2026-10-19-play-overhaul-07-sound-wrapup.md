# Play overhaul — Phase 07: Ambience, music and wrap-up

- **Date:** 2026-10-19
- **Status:** Approved
- **Requirements confirmed by user:** yes — 2026-10-19
- **Part of:** `plans/2026-10-19-play-overhaul-00-overview.md`. Read it first,
  especially §2.2 (no bundled audio) and §3's parity rule.
- **Depends on phases:** 06.

## 1. Summary

Quiet synthesised ambience per room and a light music bed under the game cues,
off by setting and cuttable; then the documents catch up: README, backlog,
`CLAUDE.md` check, and a `PROCESS_LOG.md` entry.

## 2. Requirements (this phase)

### 2.1 Functional

FR37; A4 (final housekeeping).

### 2.2 Non-functional

No new files under `public/` (synthesised with Web Audio: `spec/credits.test.ts`
requires `public/sounds` to equal `CLIPS` exactly); ambience and music sit at
least 12 dB under the cues; never for Can't hear (no sound at all); a volume
slider applies to cues, clips, ambience and music (today it only feeds masking
noise).

### 2.3 Out of scope for this phase

Menu and button sounds (not helpful to play; stay in the backlog).

### 2.4 Assumptions

See overview §2.4.

## 3. Existing code context (verified 2026-10-19)

- `src/client/audio.ts` (287 lines): `GameAudio { resume(); play(sounds);
  playClip(id); setMaskNoise(on, volume); dispose() }`, `createAudio()`; every
  node goes straight to `ctx.destination` (no master bus); cues synthesised
  (`tick`, `ownStep`, `click`, `tone`, `rustle`, `progress`, `setHum`); clips as
  `new Audio('/sounds/<id>.mp3')`; brown-noise masking buffer.
- `src/client/settings.ts` (after Tasks 2, 3, 22): `Settings { captions; sound;
  speech; keepOpen; highContrast; maskNoiseOn; volume; quick; voiceMode;
  labels }`.
- `src/components/Settings.tsx`: checkboxes (captions, game sound, spoken
  lines, keepOpen, high contrast) and, for Can't hear, masking noise + volume.
- Room meta `hue` (Task 18) names each room's palette; ambience keys off the
  room id.
- `DESIGN.md` (Task 17) and the `CLAUDE.md` rule that a visual or sound
  change updates it.
- `README.md` (spec FR33 course-fixed), `specs/backlog.md`, `CLAUDE.md`,
  `PROCESS_LOG.md` (append-only format in its header comment).

### Interfaces from earlier phases (exact)

From Tasks 22–23: room ids `01-first-job`, `02-blackout`, `03-alarm`,
`04-chimes`. From Task 3: `Settings.voiceMode: "hold" | "toggle"`. From
Task 22: `Settings.labels: boolean`.

## 4. Approach

A master `GainNode` (the volume) feeds `destination`; cues, clips (through a
`MediaElementAudioSourceNode`) and the beds connect to it. `GameAudio` gains
`setAmbience(roomId: string | null)` and `setMusic(on: boolean)`. Ambience per
room from filtered noise and slow LFOs: first-job a soft room tone; blackout a
low hum and drips (random 2–6 s); alarm a distant air handler; chimes a faint
wind with a sparse pad. Music: a slow four-chord pad (sine + triangle,
lowpassed), 70 bpm, ducked by 6 dB for 400 ms when any cue plays. Both stop
under the alarm (it silences the rest, FR9). Settings gains `ambience: boolean`
(default true) and `music: boolean` (default false).

## 5. Task breakdown

### Task 26: Ambience and music beds, a master volume

- **Description:** As §4.
- **Files touched:** `src/client/audio.ts` (+ a new `audio.test.ts` with a
  fake `AudioContext` recording the graph), `src/client/settings.ts` (+ test),
  `src/components/Settings.tsx`, `src/components/Game.tsx`.
- **Tests first (red):** with a fake context: every source connects to the
  master gain, never to `destination` directly; `setAmbience("02-blackout")`
  starts one ambience graph and `setAmbience(null)` stops it; the alarm cue
  stops ambience and music; volume 0 sets the master gain to 0; the deaf HUD
  never calls `setAmbience` (unit on the `Game.tsx` helper that decides it).
- **Implementation (green):** §4.
- **Acceptance criteria:** tests green; `spec/credits.test.ts` green (no new `DESIGN.md` gains a short sound section (beds, levels, never for Can't hear).
  files).
- **Human review:** the user plays each room with sound on and judges the beds
  are pleasant, quiet under the cues and never hide a cue. If they aren't,
  the user may cut them (setting defaults off) — that is a pass too, recorded.
- **Depends on:** Task 23.

### Task 27: Wrap-up: README, backlog, CLAUDE.md, process log

- **Description:** README describes the overhaul (roles and the new table,
  lobby of six, line of sight, the four rooms, what was chosen not to build
  from spec §2.3); backlog items folded in are in Decided with where they went
  (pivoting camera and masking-noise options stay parked); `CLAUDE.md` checked
  against the code (shape of the app names methods and line of sight; rooms
  legend mentions `=`, `%`, `c`; sensory parity as amended); a
  `PROCESS_LOG.md` entry for the overhaul's key calls (line of sight as the
  root fix, A1–A3, the lead-role harness), citing commits.
- **Files touched:** `README.md`, `specs/backlog.md`, `CLAUDE.md`,
  `DESIGN.md` (final check against the code), `PROCESS_LOG.md`.
- **Tests first (red):** `spec/readme.test.ts` (existing) still passes;
  `pnpm check:evidence` passes for any cited commit.
- **Implementation (green):** as described.
- **Acceptance criteria:** `pnpm check` and `pnpm check:evidence` green.
- **Human review:** the user reads the README changes and the process-log
  entry; pass = user says they are in their voice and accurate.
- **Depends on:** Task 26.

## 6. Phase Definition of Done

- [ ] Every task in §5 is complete and its tests pass
- [ ] `pnpm test:unit` passes
- [ ] `pnpm build && pnpm start` then `pnpm check` passes
- [ ] Tasks 26 and 27 human reviews accepted
- [ ] Tick this phase in overview §5 and commit

## 7. Requirements coverage (this phase)

| Requirement | Covered by |
| --- | --- |
| FR37 | Task 26 |
| A4 (final) | Task 27 |

## 8. Risks / open questions

None.
