# Review queue (fm lane)

## Overnight run 2026-11-07 (fm lane)

Start locally for any of these: `pnpm install && pnpm build && PORT=8092 pnpm start:check`, then
open `http://localhost:8092` (three tabs, or one tab and bots).

### fm Task 2: the goal line on every role's reveal

- **Look at:** each role's reveal card. "Get all three onto the exit." sits directly under "You can't
  see / hear / speak" and above "You can send", 18 px bold, a sentence not a heading.
- **How:** start a team, join two more tabs with the code, press Start.
- **Screenshots:** `review/n7-fm-task2-reveal-{blind,deaf,mute}-{1280,375}.png`
- **My judgement:** reads before the methods table at both widths; on a phone it sits under the
  wrapped role line with no crowding. Nothing reads as an error. Pass, pending your sign-off.

### fm Task 3: the lobby, with Start under the code

- **Look at:** the host's lobby with 1 and with 4 people, and a guest's. Left column: code, Copy / Show
  QR, then **Start (2 bots fill)** and "1 of 3 here. Bots take the rest." (a guest sees "Waiting for
  the host to start." there). Right column: "1 here · 3 play each room", "Up to 6 take turns; the
  rest watch.", and while fewer than four are here "Bots fill empty seats. With more than three, you
  take turns: whoever sits out watches and plays a later room."
- **How:** start a team; join more tabs with the code (four for the second look).
- **Screenshots:** `review/n7-fm-task3-lobby-{1,4,guest}-{1280,375}.png`
- **My judgement:** at 1280 Start is the first thing after the code and well inside 800 px; on a
  phone it is now just under the code instead of at the very bottom. On a phone the people list
  still comes after the rotation (unchanged order). `pages.css` needed no change: the existing
  `.start` and column gap place it. Pass, pending your sign-off.
