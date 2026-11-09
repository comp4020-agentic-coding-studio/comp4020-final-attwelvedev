# Playtest 3 fixes: morning review

Start any of these locally, from the worktree `wt-p3` (branch `auto/playtest-3`):

```sh
pnpm install && pnpm build && pnpm start      # http://localhost:8080
```

Open three tabs (or a phone and two tabs), create a lobby in one, join with the code in the others, Start.

## Task 269: the checkpoint label (T1), wording

- **Look at:** the chip over room 1's flag: "Checkpoint: caught after this, you start here".
- **Screenshots:** `review/p3-269-checkpoint-1280.png`, `review/p3-269-checkpoint-375.png` (the real renderer on the `/bench` page, room 1, with the chip passed in as the game passes it; the bench's figure is not at the flag, so the leader line there does not point at it. Live, walk Can't hear or Can't speak toward the flag in room 1 and the chip appears within 9 tiles).
- **A pass:** the wording says what the flag does in words a first-time player gets, and the chip reads whole at both widths.
- **What I judged:** the chip wraps to two lines at both widths, unclipped. The copy is the spec's, verbatim.

## Task 268: phone movement (B5), on a real phone

- **Look at:** moving left and right with the touch stick in room 02, on a real phone.
- **How:** `pnpm build && pnpm start` on this machine, open `http://<this machine's LAN address>:8080` on the phone, join a lobby made on the desktop (bots fill), Start; the phone gets whichever seat the rotation gives it in room 02 (play room 1 through, or restart into room 02).
- **Screenshots:** none: the triage changed no code.
- **A pass:** the figure moves left and right as the stick is pushed, every time.
- **What I judged:** six single-room `pnpm playtest` runs at 375 (rooms 02 and 03, three each) showed no Move left/right finding, so it's the harness under a full run's load (details under `## p3fix` in `plans/2026-11-07-overnight.md`; a backlog line names the harness faults seen).

## Parked

### Task 271: the goal line for the sighted (T3)

- **Branch:** `auto/playtest-3-parked-p3fix01-task271` (one commit, the line, its HUD spec, DESIGN.md).
- **Why:** the line takes ~30 px of the phone frame, and the phone's comms wheel (its 48 px floor) then overflows the frame: `spec/layout/wheel.test.ts` "keeps the plate and page labels inside the frame" goes red for Can't hear at 375 (plate bottom 541.5 > frame 533.9).
- **What it needs from you:** where the sighted line goes on the phone (e.g. beside "Live" in the top bar, taking no frame height), or a phone wheel that fits a shorter frame (B1's side treatment). Desktop screenshots of the built line are on that branch: `review/p3-271-goal-{mute-1280,deaf-375,blind-1280}.png`.

## Task 272: the radio counts from 1 (FR7–FR9), ticks at phone size

- **Look at:** the radio's face: ten ticks along the band, and a small chip under the needle with the tick's number, 1 (leftmost, where the knob starts) to 10.
- **How:** `BENCH=1 pnpm build && BENCH=1 node server.ts`, open `http://localhost:8080/bench?room=06&still=1` (room 6's teaching radio, top left). Live: `pnpm build && pnpm start`, three tabs, play to room 6; Can't see reads the plate ("band N") and the turner sets the needle on the chip reading N.
- **Screenshots:** `review/p3-272-radio-1280.png`, `review/p3-272-radio-375.png` (room 6's teaching radio Q1, band set to position 4, so the chip reads 4; the bench masks tiles to the spawn's view, so the plated radio Q3 further right isn't drawn there, but it uses the same face).
- **A pass:** the ticks and the chip's number read at 375, and "band N" on the plate obviously means the chip reading N.
- **What I judged:** ten labelled ticks don't fit the band at the 11 px floor, so only the needle's tick is numbered (logged under `## p3fix`). Ticks read at both widths; I looked at 1, 4 and 10.

## ADR 0030: holding hands is felt, not seen (accept?)

- **Look at:** `doc/adr/0030-holding-hands-is-felt-not-seen.md`, still `proposed`. Phase 03 (Tasks 274–277) is built on it. Accept it, or say what to change.

## Task 275: Can't see feels the hand (FR1, FR4, FR5)

- **Look at:** Can't see's black frame while holding hands: the same link the sighted see (2 px arc, a bead at each end, an arrowhead toward the leader), from their own figure to one tile toward the other hand. Towed: the arrow points away from you. Leading: it points at you. In a tug of war the line is taut and thick with strain ticks. The beads meet when hands join and draw back when they let go.
- **How:** `pnpm build && pnpm start`, three tabs, Start. In room 2, the seat that can't see walks next to a teammate and presses Space (or the teammate does). Screenshots are the real renderer on the bench: `BENCH=1 pnpm build && BENCH=1 node server.ts`, open `http://localhost:8080/bench?room=02&still=1`, then in the console `__still(false, { role: "blind", seat: 0, tiles: null, entities: [], self: null, seen: undefined, own: { facing: { x: 0, y: 1 }, moving: false, blocked: false }, hand: { dir: { x: 1, y: 0 }, leads: false, pulling: false } })`.
- **Screenshots:** `review/p3-275-touch-towed-1280.png`, `review/p3-275-touch-towed-375.png`, `review/p3-275-touch-leading-1280.png`, `review/p3-275-touch-leading-375.png`, `review/p3-275-touch-pulling-1280.png`, `review/p3-275-touch-pulling-375.png`.
- **A pass:** it reads as touch, the link matches what the sighted see, and nothing (HUD, caption, crew list) names the partner.
- **What I judged:** all six read clearly. The far bead floats on black with no figure, which is the point. The server sends no seat (Task 274's test), so nothing can name the partner.

## Task 276: grip and release, for the pair only (FR3), listening

- **Listen to:** `review/p3-276-grip.wav` (a hand taken), `review/p3-276-release.wav` (a hand let go), and `review/p3-276-step-grip-step-release.wav` (an approximate own step, the grip, a step, the release, for level). These are offline renders of the same tones `src/client/audio.ts` plays (sine slides 330→440 + 440→494 Hz at 0.1/0.07; 440→300 Hz at 0.08), not a recording of the browser.
- **Live:** `pnpm build && pnpm start`, three tabs, room 2: take hands with Space beside a teammate. The two holding hear it and see the captions "hand taken" / "hand let go"; the third seat gets nothing.
- **A pass:** both feel like touch, soft, clearly quieter than footsteps, and neither is mistaken for a station or alarm.
- **What I judged:** they read as soft and short. The level beside a step is a guess from the code, so it's worth hearing in a real game.

## Task 277: "Space: hold hands" in reach (FR6), placement

- **Look at:** the chip over a free teammate within hand reach (1.5 tiles), when you are free too: "Space: hold hands" on desktop, "Hold hands" on a phone. The older "Hold hands: press Act next to a teammate" chip on a pair is unchanged.
- **How:** `pnpm build && pnpm start`, three tabs, room 2: walk a sighted seat next to a teammate. Bench: `BENCH=1 pnpm build && BENCH=1 node server.ts`, `http://localhost:8080/bench?room=02&still=1`.
- **Screenshots:** `review/p3-277-hold-1280.png`, `review/p3-277-hold-375.png` (bench, room 2, Can't speak moved beside Can't hear, the chip passed in as the game passes it).
- **A pass:** the chip sits clearly on the teammate, doesn't cover either face badly, and plays well against the other chips.
- **What I judged:** it reads whole at both widths. The chip's tail sits on the teammate's head and overlaps the edge of your own figure's hat at this distance (they are one tile apart), which is the label renderer's usual placement; acceptable, but worth your eye.
