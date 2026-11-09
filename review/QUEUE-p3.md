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
