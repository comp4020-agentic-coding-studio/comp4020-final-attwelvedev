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
