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

## Phase 04, Task 15: rooms 1 to 3 played (First Steps, Three Hands, Watchers)

- **Look at:** play rooms 1 to 3 in three tabs, each role at least once. Does each room teach its
  two things and nothing else feel unexplained? (1: plate and door, ends at a three-plate door;
  2: crate onto a plate, then Can't hear takes Can't see by the hand (Space beside them) to the three
  plates; 3: a camera seen through glass but not heard, a guard heard through a vent but not seen.)
  Never more than three label chips (two on a phone); nobody waits with nothing to do for more than
  about 20 s.
- **Start locally:** `pkill -f "node server.ts"; pnpm build && pnpm start`, open
  `http://localhost:8080` in three tabs (one at 375 px wide, or a phone on the LAN), create a lobby,
  join from the other two, Start, Ready. The heist plays rooms 1 to 3, then the old rooms 4 and 5.
  For one room alone: copy `rooms/0N-*.room` into an empty dir `D`, then `ROOMS_DIR=D PORT=8093 node server.ts`.
- **Screenshots** (start of each room; 375 = Can't hear on a phone, 1280 = Can't speak):
  `review/04-task15-first-steps-{1280,375}.png`, `review/04-task15-three-hands-{1280,375}.png`,
  `review/04-task15-watchers-{1280,375}.png`. Per-role mockups: `playtests/mockups/0{1,2,3}-*.html`.
- **Judged:** renders clean at both widths; chips capped and legible; HUD clear of the map. Bots
  clear each room in about 7 to 10 s in every rotation. Worth your eye: Watchers opens on an empty
  13-tile corridor (First Job's old crate bay, kept so the proven camera/guard layout is unchanged);
  room 1 ends at a three-plate door because the FR10 lint rule asks every station-free room for
  one (overnight decisions file). Not playtested by a person: that is this review.

## Play tweaks, Task 2: bot names (demo 2)

- **Look at:** the reveal's crew column with bots in seats 1 and 2. Bots are "Bot Ace" / "Bot Jinx"
  / "Bot Moss" by seat (0/1/2), and keep their name after roles rotate.
- **Start locally:** `pkill -f "node server.ts"; pnpm build && pnpm start`, open
  `http://localhost:8080`, Start a new team, Start alone.
- **Screenshots:** `review/play-tweaks-task2-bots-{1280,375}.png` (crew panel).
- **Judged:** names read as names, nothing like a role or a shape; fits at both widths.

## Play tweaks, Task 3: played roles in words (demo 1)

- **Look at:** the reveal's crew column before room 2. Each row reads "Played: <role names>" in
  words, muted, on its own line under the name; it wraps on a phone.
- **Start locally:** `pkill -f "node server.ts"; pnpm build && pnpm start`, three tabs at
  `http://localhost:8080` (one at 375 px), create, join, Start, Ready, clear room 1, press Next.
- **Screenshots:** `review/play-tweaks-task3-played-{1280,375}.png` (crew panel, room 2 reveal).
- **Judged:** clear and unclipped at both widths; the role shape stays only for the current role.

## Play tweaks, Task 5: room board on clear, leaderboard in the game (demo 6 and 7)

- **Look at:** the Room cleared card's "This room's best" (team, time, loot), with this team's row
  outlined and bold; a run outside the top 5 is a sixth "You" line with its rank; a room nobody
  cleared before says "First clear of this room". "Full leaderboard", and "See the leaderboard" on
  Heist complete, open the board as a panel in the game (tabs, Close, Escape); no navigation.
  Does it look like part of the game?
- **Start locally:** `pkill -f "node server.ts"; pnpm build && pnpm start`, three tabs at
  `http://localhost:8080` (one at 375 px), create, join, Start, Ready, clear room 1 (play it a few
  times, Restart room, to fill the board). For Heist complete quickly:
  `ROOMS_DIR=spec/fixtures/rooms PORT=8094 DATABASE_PATH=$(mktemp -d)/app.db node server.ts`
  (one tiny room) and play it at `http://localhost:8094`.
- **Screenshots:** `review/play-tweaks-task5-cleared-{1280,375}.png`,
  `review/play-tweaks-task5-panel-{1280,375}.png`,
  `review/play-tweaks-task5-heist-complete-{1280,375}.png`,
  `review/play-tweaks-task5-panel-heist-{1280,375}.png`.
- **Judged:** fixed two things the screenshots showed: the cleared card outgrew a phone's frame (it
  now scrolls, centred when it fits) and the panel's headers broke mid-word at 375. Worth your eye:
  the card is busy on a phone (three buttons, then the board); the "You" line has no loot. On the
  fixture server the panel still lists five room tabs (it reads `./rooms`, as `/leaderboard` does).

## Phase 05, Task 17: room 4 The Safe (teaching safe, then a real safe and the stethoscope)

- **Look at:** play room 4 in three tabs, each role at least once. Chamber 1: a small teaching safe
  (◀ 0 ▶ with a hollow lamp beside the face); turn it until the lamp lights, then Act on the face.
  The stethoscope lies on the way. Chamber 2 (past the flag): a real two-digit safe whose back is
  across a vent, at the end of the corridor beyond it. Can't see holds the stethoscope at the back and
  says "stop" when the tumbler sounds; Can't speak (who receives callouts) turns and enters on "stop";
  Can't hear leads Can't see by the hand round to the back. Questions: can each station's clue be
  found and understood; does the teaching safe teach the real one; does anyone wait with nothing to
  do for more than about 20 s (Can't hear, once Can't see is at the back, may)?
- **Start locally:** `lsof -ti tcp:8080 -sTCP:LISTEN | xargs kill; pnpm build && pnpm start`, open
  `http://localhost:8080` in three tabs (one at 375 px wide), create a lobby, join from the other two,
  Start, Ready: room 4 comes after rooms 1 to 3. Room 4 alone: `mkdir -p /tmp/r4 && cp
  rooms/04-the-safe.room /tmp/r4/ && ROOMS_DIR=/tmp/r4 PORT=8094 node server.ts`, then
  `http://localhost:8094`. Per-role perception: `playtests/mockups/04-the-safe.html`.
- **Screenshots** (room start; 1280 = Can't speak, 375 = Can't hear on a phone):
  `review/05-task17-the-safe-1280.png`, `review/05-task17-the-safe-375.png`.
- **Judged:** renders clean at 1280: teaching safe, lamp and stethoscope all legible. At 375 the two
  label chips (Safe, Gear) sit over the safe's face: the same phase 02 chip-placement issue queued
  under phase 03, not fixed here. Bots clear the room in 22 to 23 s in every rotation, never caught.
  Worth your eye: in the bots' rotation the real safe works only as Can't see listening and Can't
  speak turning (the channel table: Can't hear receives no callouts or text), so a crew whose Can't
  speak seat is at the back cannot pass the number on; and the old rooms are now 05 and 06.

## Phase 06, Task 19: room 5 The Gallery (teaching wires, then real wires and a keypad by ear)

- **Look at:** play room 5 in three tabs, each role at least once. Chamber 1: a teaching wire panel
  (three wires); its plaque is on the corridor wall just below the doorway (S at the corridor's
  west end), round the corner from the wires, because the presence lint forbids one sighted
  person seeing the plaque and the wires at once. A wrong cut there only re-draws the panel. Chamber
  2: the real four-wire panel; its plaque is on the north wall of chamber 3 (the keypad room), out of
  sight of the wires, so one person reads and another cuts (Can't hear can mark the wire for Can't
  speak). Chamber 3: a 3×3 keypad whose 3-key code chimes (n chimes = key n, reading order) from a
  closet behind the vent in the corridor's south wall (one count a key: a person hears "two,
  seven, five" as chimes). The exit door is in chamber 3's east wall. Questions: can each clue be
  found and understood (is "chimes = key number" learnable without being told?); does the teaching
  panel teach the real one; does the link "plaque in the other room" work out unaided; does anyone
  wait with nothing to do for more than about 20 s (Can't see, once the code is passed on, may)?
- **Start locally:** `lsof -ti tcp:8080 -sTCP:LISTEN | xargs kill; pnpm build && pnpm start`, open
  `http://localhost:8080` in three tabs (one at 375 px wide), create a lobby, join from the other two,
  Start, Ready: room 5 comes after rooms 1 to 4. Room 5 alone: `mkdir -p /tmp/r5 && cp
  rooms/05-the-gallery.room /tmp/r5/ && ROOMS_DIR=/tmp/r5 PORT=8095 node server.ts`, then
  `http://localhost:8095`. Per-role perception: `playtests/mockups/05-the-gallery.html`.
- **Screenshots** (room start; 1280 = Can't speak, 375 = Can't hear on a phone):
  `review/06-task19-the-gallery-1280.png`, `review/06-task19-the-gallery-375.png`.
- **Judged:** renders clean at both widths: the teaching panel's three wires (one striped, so not
  colour alone) and its chip read clearly. Bots clear the room in 27 to 28 s in every rotation,
  never caught. Worth your eye: the bots solve the keypad with no message at all (Can't speak hears
  the chimes and presses), so the room does not force Can't see to talk; a person at the keys must
  walk to the vent to hear the code. The old rooms are now 06 and 07.
