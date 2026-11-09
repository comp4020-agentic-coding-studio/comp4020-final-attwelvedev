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

### fm Task 4 (and the plan's "phone seat in room 1" look): the phone controls hint

- **Look at:** a touch phone seat in room 1: under the joystick, Go/Wheel and Act, "Stick moves · big
  button acts · hold Wheel to send" in the muted `.keys` style; the desktop seat keeps "WASD or
  arrows move · Space acts". Task 1's "Voice off (optional)…" and Can't see's "No map. Listen. Get to
  the exit with the others." show in the same shots.
- **How:** start a team on desktop, join from a phone (or devtools touch emulation at 375 × 812) and a
  third tab, Start, everyone presses I'm ready.
- **Screenshots:** `review/n7-fm-task4-phone-375.png`, `review/n7-fm-task4-desktop-1280.png`
- **My judgement:** the hint fits under the 150 px touch zone inside 812 px without pushing the
  frame; nothing reads as an error. Pass.

### fm2 Task 5: a calmer reveal, one sentence and "Who hears what" folded

- **Look at:** each role's reveal. Under "Get all three onto the exit." comes one sentence for the
  role, then a folded "▸ Who hears what" button. Press it: "You can send / You get" and the
  per-method receiver lines open below it. Press again: they fold. Open it, reach the next room (or
  reload): it starts open. Fold it, and the next reveal starts folded.
- **How:** `pnpm build && PORT=8092 pnpm start:check`, open `http://localhost:8092`, start a team,
  join two more tabs with the code, press Start.
- **Screenshots:** `review/n7-fm-task5-reveal-folded-{1280,375}.png` (Can't see, folded),
  `review/n7-fm-task5-reveal-open-{1280,375}.png` (Can't hear, open)
- **My judgement:** folded, the card is the goal, one sentence and the button, then Can't see's
  sounds and I'm ready, and it reads as calm. Open, the table fits at 375 with nothing clipped. Pass,
  pending your sign-off.

### fm2 Task 6: the room in the HUD

- **Look at:** the game's top bar at desktop: "1 · First Steps" in muted 14 px left of the timer. On a
  phone: "1/9" in the same place. Open the menu (≡): its first line reads "Room 1 of 9: First Steps".
- **How:** `pnpm build && PORT=8092 pnpm start:check`, open `http://localhost:8092`, start a team, join
  from a phone (or devtools touch at 375 × 812) and a third tab, Start, everyone presses I'm ready.
- **Screenshots:** `review/n7-fm-task6-hud-1280.png`, `review/n7-fm-task6-hud-375.png`,
  `review/n7-fm-task6-hud-menu-375.png`
- **My judgement:** legible and clear of the timer at both widths. On a phone the bar keeps its two
  lines (crew, label, clock and loot, then Live and the menu), with nothing clipped. Pass, pending
  your sign-off.

### fm2 Task 7: the favicon

- **Look at:** the browser tab on any page: a dark tile with three overlapping heads in orange, blue
  and purple. Open `/favicon.svg` large: each body bears its role shape (● ■ ▲).
- **How:** `pnpm build && PORT=8092 pnpm start:check`, open `http://localhost:8092` and
  `http://localhost:8092/favicon.svg`.
- **Screenshots:** `review/n7-fm-task7-favicon-16-32.png` (16 and 32 px, zoomed and actual size),
  `review/n7-fm-task7-favicon-large.png` (256 px)
- **My judgement:** at 32 px the three heads and the shapes read; at 16 px the shapes blur into the
  bodies, as planned, and it reads as three coloured people. I could not look at a real tab strip
  (unattended run): please check it there (queued for morning). The tile uses today's `--bg`
  (dusk plum), not the plan's older navy.
