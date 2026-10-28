# Human review queue (overnight run, branch auto/escape-room)

## Phase 02, Tasks 8, 9, 10: stations, gear, UV, sounds, HUD, labels (look, sound, HUD only)

- **Look at:** (T8) stations read as gallery furniture with brass name plates; the UV pool, goggles
  tint, dye pack. (T9) each new sound told apart by ear with eyes closed: tick vs tumbler, static vs
  tone, the nine key pitches. (T10) gear slot, Act hint, lamp light stay out of the world's way; at
  most three label chips on desktop, two on a phone. Puzzles are not solvable yet (phase 03).
- **Start locally:**
  `pnpm build && ROOMS_DIR=spec/fixtures/drafts pnpm start`, then open `http://localhost:8080` in
  three tabs (one at 375 px wide) and start a heist.
- **Screenshots:** `review/02-task8-10-draft-1280.png`, `review/02-task8-10-draft-375.png`
  (Can't speak seat at the spawn: keys station, bell and gear chips, Act hint "Hold hands", empty gear slot).
- **Judged:** the capped chips don't overlap and stay in frame at both widths; HUD clear of the world.
  Sounds and the UV pool/goggles/dye look were not heard or seen in these shots (spawn view only):
  judge those by playing.

## Phase 03, Task 11: clues drawn (plaque text, target card, motifs, teaching lamp, wing symbol)

- **Look at:** a sign's text on a brass plaque on the wall; the switches' target card (lit lamps with
  rays, hollow outlined); the moon motif disc on both linked stations; the teaching safe's small lamp
  by its face (hollow until the right number). No `Human review:` line in the plan; queued because it is visual.
- **Start locally:** write the showcase room from `review/03-task11-show.room` into a fresh dir `D`,
  then `pnpm build && ROOMS_DIR=D PORT=8091 node server.ts`, open `http://localhost:8091` in three tabs, start.
- **Screenshots:** `review/03-task11-clues-1280.png` (Can't speak, desktop), `review/03-task11-clues-375.png` (Can't hear, phone).
- **Judged:** all four new pieces render and the plaque is legible at 375. The phase 02 label chip
  ("Plaque: a rule for another room...") sits over the plaque's text at both widths: worth a look; the
  chip placement is phase 02's. The lamp board overlapping the switches plate is the showcase room's layout.
