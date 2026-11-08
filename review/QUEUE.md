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
  (three wires); its plaque is on the corridor's south wall near its west end (x=4), round the
  corner from the wires, because the presence lint forbids one sighted
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

## Phase 07, Task 21: room 6 Lights Out (teaching radio and switches, then a radio that fills a keypad's gap)

- **Look at:** play room 6 in three tabs, each role at least once. Room A (start): a teaching radio
  (turn ◀/▶ until the static clears to a tone, which opens its part of the door) and a teaching row of
  three switches; their three lamps are in a glassed nook to the east, seen only from the corridor's
  bay below, and the target card (lit/hollow lamps) is in an alcove at the corridor's far west end,
  round a corner from both. Corridor door D2 opens when both are done. Beat 2, past the flag: a real
  radio (moon motif) in the room north of the corridor; once tuned it gives its digit as pips (a light
  on its face, and a sound). The keypad (moon motif, 4-key code) is in the east room; its code chimes
  from the closet behind the vent in the corridor's south wall, with a **rest** where the third key
  goes: that key is the radio's digit. The exit door is in the keypad room's east wall. Questions: can
  each clue be found and understood; does the teaching radio teach the real one (it pips its digit once
  tuned too, but that digit feeds nothing); does the moon link (radio digit → the rest in the tune) work out
  unaided, or does the rest need a stronger tell; is the three-switch lights-out learnable from the
  card alone; does anyone wait with nothing to do for more than about 20 s (Can't see in beat 1 may)?
- **Start locally:** `lsof -ti tcp:8080 -sTCP:LISTEN | xargs kill; pnpm build && pnpm start`, open
  `http://localhost:8080` in three tabs (one at 375 px wide), create a lobby, join from the other two,
  Start, Ready: room 6 comes after rooms 1 to 5. Room 6 alone: `mkdir -p /tmp/r6 && cp
  rooms/06-lights-out.room /tmp/r6/ && ROOMS_DIR=/tmp/r6 PORT=8096 node server.ts`, then
  `http://localhost:8096`. Per-role perception: `playtests/mockups/06-lights-out.html`.
- **Screenshots** (room start; 1280 = Can't speak, 375 = Can't hear on a phone):
  `review/07-task21-lights-out-1280.png`, `review/07-task21-lights-out-375.png`.
- **Judged:** renders clean at both widths: the radio's pads and face, switches 1 to 3 and the
  numbered lamps behind glass read clearly (the first draft had the switches one row lower, half
  hidden behind the glass wall face; moved up a row). Bots clear the room in about 28 s in every
  rotation, never caught: Can't hear texts the radio's digit and marks each switch for Can't speak.
  Worth your eye: the keypad tune's rest is a sim change (the slot's note is silent) made so the radio
  is needed at all; and the old rooms are now 07 and 08.

## Phase 08, Task 23: room 7 Night Shift (UV ink and goggles, taught small, then used for real)

- **Look at:** play room 7 in three tabs, each role at least once. Room A (start): a UV torch and
  goggles on the floor; a teaching wire panel (three wires) whose rule plaque is **UV ink** on the
  corridor's south wall at the far west end (seen only in the torch's light); and a teaching row of
  three switches whose lamps sit in a **dark** glassed nook to the east, seen from the corridor only
  through the goggles; their card (lit/hollow lamps) is on the corridor's south wall. Door D2 opens
  when both are done. Room B, past the flag: a real four-wire panel whose ink plaque is under the
  flag's corridor wall, and a real 2×3 switches panel whose six lamps are in a second dark nook to the
  east, with its card on the north wall of the switches room. The exit door opens when both are done.
  Questions: does anyone know to pick up the torch and goggles before being told; is the ink found
  without a hint (it is on a wall, not by the panel); is "look into the dark with the goggles"
  understood; does the teaching pair teach the real pair; does Can't see wait with nothing to do for
  more than about 20 s (likely: it has no job but listening in this room; worth your call)?
- **Start locally:** `lsof -ti tcp:8080 -sTCP:LISTEN | xargs kill; pnpm build && pnpm start`, open
  `http://localhost:8080` in three tabs (one at 375 px wide), create a lobby, join from the other two,
  Start, Ready: room 7 comes after rooms 1 to 6. Room 7 alone: `mkdir -p /tmp/r7 && cp
  rooms/07-night-shift.room /tmp/r7/ && ROOMS_DIR=/tmp/r7 PORT=8097 node server.ts`, then
  `http://localhost:8097`. Per-role perception: `playtests/mockups/07-night-shift.html`.
- **Screenshots** (room start; 1280 = Can't speak, 375 = Can't hear on a phone):
  `review/08-task23-night-shift-1280.png`, `review/08-task23-night-shift-375.png`.
- **Judged:** renders clean at both widths: torch and goggles icons, the teaching wires with their
  label, and the card down the corridor read clearly. Bots clear the room in about 28 s in every
  rotation, never caught: Can't hear takes the torch, lights the ink and cuts; Can't speak wears the
  goggles, reads each card and marks the switches for Can't hear. Worth your eye: Task 22 found and
  fixed a perception bug (a sighted player without goggles was sent the state of lamps in the dark);
  the room has no sound clue, so Can't see only listens for snips and clunks; and the old rooms are
  now 08 and 09.

## Flaky: comms wheel spec under load (found in phase 09, not fixed)

- `spec/layout/wheel.test.ts` failed 4 tests in one full `pnpm check` (axe `color-contrast: .is-centre > .wheel-label`, then 3 timeouts) and passed `pnpm check:flaky 3 spec/layout/wheel.test.ts` 3/3. Phase 09 touched no client code. Likely cause: the centre slot's label is on `--glass` (translucent) over the live canvas, so axe's contrast depends on what is drawn underneath at that moment. Needs a fix per CLAUDE.md's flaky rules (an opaque centre, or axe run on a settled frame).

## Phase 09, Task 25: room 8 Music Room (a teaching music box and the earpiece, then a real music box)

- **Look at:** play room 8 in three tabs, each role at least once. Room A (start): an earpiece and
  goggles on the floor, and a **teaching music box** (two bells) whose tune box stands in the
  corridor below, behind glass: whoever hears the two-note tune walks round and strikes the bells
  in order. Middle room: a keypad whose keys sit in a **dark** nook; its code plays only in the
  earpiece, so Can't see (handed it by Can't hear) texts the tune a number a note, and Can't speak,
  in the goggles, presses the keys. Room B, past the flag: a **real music box** (four bells), its
  tune box again behind glass in the corridor; Can't speak hears the tune and marks each bell in
  order with an x, Can't hear strikes the marks. The exit door opens when all three are done.
  Questions: is the tune box found and tied to its bells (only the glass and the label link them);
  does Can't see understand the earpiece's tune as numbers to text (key n is the digit n; the
  hardest step); does anyone know the goggles are for the dark nook; does anyone wait idle more
  than about 20 s?
- **Ruled overnight (phase file §4):** the plan said each bell lights as its note plays, but the sim
  shows no such light, so the tune is heard only; and an earpiece keypad must be in the dark (the
  lint for spec probe #12). Both are design calls worth your eye.
- **Start locally:** `lsof -ti tcp:8080 -sTCP:LISTEN | xargs kill; pnpm build && pnpm start`, open
  `http://localhost:8080` in three tabs (one at 375 px wide), create a lobby, join from the other two,
  Start, Ready: room 8 comes after rooms 1 to 7. Room 8 alone: `mkdir -p /tmp/r8 && cp
  rooms/08-music-room.room /tmp/r8/ && ROOMS_DIR=/tmp/r8 PORT=8098 node server.ts`, then
  `http://localhost:8098`. Per-role perception: `playtests/mockups/08-music-room.html`.
- **Screenshots** (room start; 1280 = Can't speak, 375 = Can't hear on a phone):
  `review/09-task25-music-room-1280.png`, `review/09-task25-music-room-375.png`.
- **Judged:** renders clean at both widths: the two bells with numbers and pattern bands, the tune
  box under the glass, the gear, the dark nook to the east. On the phone the gear and glass labels
  sit close (the label cap's usual crowding at the start). Bots clear it in about 37 s in every
  rotation, never caught. The old rooms are now 09 and 10.

## Phase 10, Task 27: room 9 The Vault (two teaching safes feed a little vault, a sync lock, then the real vault)

- **Look at:** play room 9 in three tabs, each role at least once. Region A: a hall with a little
  **vault** (two sockets and a handle), an **order card** showing two motifs (wave, star), and a
  **sync lock** (two keys far apart). North and south of the hall are two little wing rooms behind
  **hatches** (see-through, not walk-through), each with a teaching safe drawn with its motif; a
  solved safe shows its symbol. Whoever stands in the hall sees each wing's symbol through its
  hatch, reads the card, steps each socket to the symbol of the wing the card names, then Acts on
  the handle. Then the two key holders turn together: the one who can text counts "3", "2", "1".
  Past the flag, region B: a wire panel (moon; its plaque round the corner in the hall) and a keypad
  (leaf; its code through a vent), in wings behind hatches, feed the real vault (card: moon, leaf).
  Questions: is it clear, without being told, that the card's motifs mean "the symbol of the wing
  with this motif" (clues FR3)? Is the sync count found without the bell (text only, see the
  ruling)? Does anyone wait idle more than about 20 s? (Can't see has no station of their own here,
  as in room 7.)
- **Ruled overnight (decisions file, 10/26 and 10/27):** no bell or lamp (room 9 would bring four
  new kinds; pacing allows two); the sync countdown is text, not the bell; the old rooms moved to
  `spec/fixtures/old-rooms/` rather than `spec/fixtures/rooms/`; the stations draft's hints were
  rewritten so perception-only bots can clear it.
- **Start locally:** `lsof -ti tcp:8080 -sTCP:LISTEN | xargs kill; pnpm build && pnpm start`, open
  `http://localhost:8080` in three tabs (one at 375 px wide), create a lobby, join from the other
  two, Start, Ready: room 9 comes after rooms 1 to 8. Room 9 alone: `mkdir -p /tmp/r9 && cp
  rooms/09-the-vault.room /tmp/r9/ && ROOMS_DIR=/tmp/r9 PORT=8098 node server.ts`, then
  `http://localhost:8098`. Per-role perception: `playtests/mockups/09-the-vault.html`.
- **Screenshots** (room start; 1280 = Can't speak, 375 = Can't hear on a phone):
  `review/10-task27-the-vault-1280.png`, `review/10-task27-the-vault-375.png`.
- **Judged:** renders clean at both widths: the order card's two motifs, the sync key numbered 1,
  the vault's sockets and handle, both hatches with their labels. On the phone the keys and hatch
  labels sit close at the start (the label cap's usual crowding). The wings are out of sight from
  the spawn, as intended. Bots clear it in about 39 s in every rotation, never caught. Now 9 rooms.

## Phase 12, Tasks 33 to 40: fixes from the human review of phases 02 to 10 (reviews batched at the phase's end, at your request)

Task 33 (the crate plate) you accepted on 2026-10-31. The other seven are built and committed (one
commit each, `pnpm check` green on a fresh server) and wait for you. Three are by ear with your eyes
closed, which I cannot do for you.

- **Start locally:** `lsof -ti tcp:8080 -sTCP:LISTEN | xargs kill; pnpm build && pnpm start`, open
  `http://localhost:8080` in three tabs (one at 375 px wide), create a lobby, join from the other
  two, Start, Ready. One room alone: `mkdir -p /tmp/rN && cp rooms/<room>.room /tmp/rN/ &&
  ROOMS_DIR=/tmp/rN PORT=8091 node server.ts`. (If `pnpm start:check` dies with EADDRINUSE, an old
  dev server is on :8080: use another PORT and `APP_URL`, or the specs run against the wrong app.)
- **Task 34, labels (play rooms 3, 5 and 7):** is a camera, glass or vent labelled when you first
  meet it, even with other things near? Does a chip ever sit on a plaque's words? The range (9 tiles)
  is my number. Screenshots: none of its own; `spec/layout/labels.test.ts` measures it.
- **Task 35, plaques and wires (rooms 4, 5, 8):** `review/12-task35-links-1280.png`, `-375.png`,
  `-room8-1280.png`, `-room4-375.png`. Does the faint dashed wire read as a link, not clutter? Rooms
  8 and 9 have pairs with no wall route, which get a straight line (your ruling). At 375 the chips
  cover most of it. Does room 8's keypad now look right without its lone box?
- **Task 36, chimes (BY EAR, eyes closed, rooms 5, 6 and 8, no subtitles):** can you count the chimes
  in a group, hear the gap between groups, and tell two codes apart? The 150 ms, 600 ms and 2 s are
  my numbers, as is the pentatonic climb. Bots now take 34 s in room 5 and 44 s in room 8 (were
  27 to 29 and 37).
- **Task 37, room 7:** `review/12-task37-night-shift-1280.png`, `-375.png`. Is the torch worth
  finding (it is in the pocket at the west, round a corner from the spawn)? Do the lamps open when
  the wires are cut? Does the ink read? Known limit: a long rule can lose the start of its first
  line where a wall cuts the pool ("o red wires" in the 1280 shot); the second line always reads.
  Is that acceptable, or should the ink be shorter or the pool bigger?
- **Task 38, practice lever (BY EAR, eyes closed, room 8):** `review/12-task38-practice-1280.png`,
  `-375.png`, `-off-1280.png`. Is the practice sound clearly not a solve, and the lever's clunk
  clearly a lever? Does the 45 % dimming read as "not counting"? Both sounds are my synths.
- **Task 39, HUD:** `review/12-task39-hud-1280.png`, `-375.png`. The dock is at the bottom right. Note
  the plan's premise was partly off: the chat box and touch controls were never under it.
- **Task 40, hand-holding (play room 2 with a person as the towed seat):** `review/12-task40-tug-1280.png`,
  `-375.png`. Can the towed person steer? Does a tug of war read by ear and caption, and does room 2's
  "one leads another" still land? **ADR 0019 is `proposed` and needs your approval**; spec FR22 got
  one italic line pointing at it (revert it if you disagree).
- **Judged:** every task renders at both widths and its specs pass. What I did not see: the three
  strain ticks on the taut hold (too small at 1280, drawn per the unit test); anything by ear; room 2
  with a real person towed.
- **Flaky under load (a judgement, not a proof):** `pnpm check:flaky 4` had 0 failures in runs 1 to 3
  and 5 in run 4 (under load), in `spec/layout/wheel.test.ts` and the reveal spec, each in 1 of 4.
  Six more loaded runs of those two files: one failure, in the reveal spec. Not a repeat offender
  and the reveal screen has no dock, so I believe it is the machine, but a clean control was not
  possible (old tree 4 of 4 passes, new tree 3 of 4, within noise). Worth a look when you are
  fresh: the wheel's 1000 to 1500 ms waits under load.
## Side work (branch `auto/side-work`): phase 11 Tasks 29 and 30, ahead of their dependencies

**Merged 2026-11-05** into `auto/wrap-up` (merge 6ac50e3, overnight lane B); see the overnight
run section below for what changed in the merge. Expect touch points with Task 28 (credits on
`cleared`, `RoomCleared`) and with any room phase that edits `spec/layout/hud.test.ts`. Neither task
has a `Human review:` line; these are for your eye only.

### Task 29: the comms map on the cleared card

- **Look at:** the Room cleared card's "Comms this room": the crew as a triangle (shape and name at
  each corner), an arrow each way, thicker the more went that way, with its count; a dashed line
  where nothing went. Under it, a 48 px chip per busy arrow ("Bo → Cy 3"); focus, hover or tap one
  and its arrow turns green, with the line under it giving the breakdown by method. Then the
  summary ("Most messages went Bo → Ana. Ana sent nothing."). Heist complete shows the last room's
  map. Voice counts once per spurt (a gap of 1 s starts a new one). Does it read at a glance?
- **Start locally:** `lsof -ti tcp:8080 -sTCP:LISTEN | xargs kill; pnpm build && pnpm start`,
  three tabs at `http://localhost:8080` (one at 375 px), create, join, Start, Ready, send a few
  callouts and texts, then clear room 1.
- **Screenshots:** `review/11-task29-comms-map-{1280,375}.png` (Bo's tab, three callouts from Bo).
- **Judged:** fixed what the first screenshots showed: the arrowheads didn't draw (an SVG marker
  with `context-stroke`; now drawn polygons), and a focused arrow got a large box outline. Biome's
  a11y rules then pushed the keyboard path from focusable SVG groups to real buttons, which
  reads better anyway. Worth your eye: on a phone the cleared card is now long (map, chips,
  summary, buttons, board) and scrolls inside the frame. The spot for Task 28's credit lines is
  marked in `RoomCleared.tsx`, under the map.

### Task 30: leaderboard edition 2

- **Look at:** `/leaderboard`: a link "Earlier heist (edition 1)", room tabs for whatever `rooms/`
  holds (5 today, 9 once the room phases land), wrapping on a phone. `?edition=1` shows the old
  runs with their old rooms as tabs and "Back to the current heist". The in-game panel and the
  cleared card's board show edition 2 only.
- **Start locally:** as above, then open `http://localhost:8080/leaderboard`. Your own
  `./.data/app.db` gains the column on first open (migration 0010, all existing rows read as
  edition 1, none deleted), so your old runs move to the earlier board.
- **Screenshots:** `review/11-task30-leaderboard-{1280,375}.png` (empty current board).
- **Judged:** fine at both widths. The earlier board's room tabs are labelled "Room 1, Room 2…"
  by the old room ids' order, not by name; the old phase plan's name map (Loading Dock, Don't
  Blink…) was not added, since the old ids changed several times.

### Flaky test found and fixed on the way

`spec/layout/reveal.test.ts` "the person the host pulls in can still press I'm ready" failed in 1
of 3 runs of that file alone (and once in a full check): it read Ana's alertdialog count once,
right after Di's reveal arrived, but Ana's pause card closes on Ana's socket, which can be a
moment later. It now polls for the card to go (same promise). 3 of 3 green after.
The full check took 287 s against a 237 s baseline at the start of this run; two new browser
tests and the parallel session's load account for it, not measured per file.

## Overnight run 2026-11-05, lane B (`auto/wrap-up`): phase 11 closed

### Merge of `auto/side-work` (Tasks 29 and 30) onto phases 12 to 14

- **Look at:** the Room cleared card after room 1: phase 14's column (title, Time and Loot, a credit
  card per player, side-job tile, buttons), then **the comms map after the buttons and before the
  board**. The side work first put the map between the credits and the buttons, which pushed the
  buttons out of the frame and failed phase 14's layout spec, so it went below them (DESIGN.md
  `RoomCleared` says so). The heist-complete card shows the keepsake shelf, the rank, then the last
  room's map. `/leaderboard`: nine room tabs and the "Earlier heist (edition 1)" link.
- **Start locally:** `lsof -ti tcp:8080 -sTCP:LISTEN | xargs kill; pnpm build && pnpm start`, three
  tabs at `http://localhost:8080` (one at 375 px), create, join, Start, Ready, send a few callouts,
  clear room 1. Then `http://localhost:8080/leaderboard` and `?edition=1`.
- **Screenshots (retaken after the merge):** `review/11-task29-comms-map-{1280,375}.png` (scrolled
  to the map because a chip has focus), `review/11-task30-leaderboard-{1280,375}.png`.
- **Judged:** renders clean at both widths and nothing is clipped. The card is long on a phone and
  scrolls inside the frame (map, chips, summary, then the board). Full `pnpm check` green
  (149 files, 2215 tests, 379 s under the other lane's load).

### Task 31: the CLAUDE.md diff, and ADRs 0017 and 0018 waiting on you

- **Your call:** read the CLAUDE.md diff (`git show <Task 31 commit> -- CLAUDE.md`): three
  additions, each inside its own bullet: **Shape of the app** names stations and gear; **Sensory
  parity** names gear's deliberate exceptions (stethoscope tumbler and earpiece tones have no
  picture, UV ink and goggle sight have no sound) and "a new station sound goes in `parity.test.ts`";
  **Rooms** names `lintPresence`/`lintClues`, the two-new-things cap (`pacing.test.ts`) and
  perception-only bots (ADR 0018). The "must pass `pnpm lint:rooms` and `spec/rooms.test.ts`" part
  was already in the bullet.
- **Accept, if you agree:** `doc/adr/0017-balance-by-presence-stations-and-gear.md` and
  `doc/adr/0018-perception-only-bots-and-paced-rooms.md` are still `proposed`; the overnight rules
  forbid me to accept them. Flip each to `accepted` and commit.
- **Also checked, no change needed:** DESIGN.md 4.6 (label cap 3 desktop, 2 phone = `LABEL_CAP`) and
  4.8 (clue visuals) match the code; `spec/design.test.ts` green. `specs/backlog.md` has no item
  this phase settled (the side-job and "Can't speak" lines were already moved to Decided).
  PROCESS_LOG gained one entry, your 2026-11-02 pacing ruling (side jobs were loot with an owner).
- **Merge note:** the blind-purpose lane also edits CLAUDE.md and DESIGN.md; my edits sit inside
  the Shape, Sensory parity and Rooms bullets and the DESIGN.md `RoomCleared` line only.

### Load-only timeout seen (not fixed, timeout not raised)

`src/game/rooms/load.test.ts` "loads the shipped rooms…" timed out at 20 s in one `pnpm test:unit`
run (load average 25 with the other lane running); alone it passes in 15.6 s, and the full
`pnpm check` after was green. It is close to its limit even unloaded: worth timing on a quiet machine.


## Overnight run 2026-11-05, lane A (`auto/blind-purpose`), phase 01

- **Task 70, the landing Can't see feed walks (FR1):** `review/bp-01-task70-blind-feed-1280.png`,
  `-375.png` (the feed alone) and `review/bp-01-task70-feeds-page-1280.png`, `-375.png` (the page).
  - **What to look at:** does the Can't see feed's dim figure hop and kick up dust while its bot
    walks, sit still otherwise, and look like the in-game Can't see screen? The ring is gone. Pass =
    it looks like the game.
  - **Start it:** in the `wt-blind` worktree, `pnpm build && pnpm start`, open
    `http://localhost:8080/` (or `PORT=8181 pnpm start` if :8080 is taken), and watch the first feed.
    Reduced motion (DevTools > Rendering > prefers-reduced-motion) holds it still.
  - **What I judged:** at 1280 it reads as the game's figure. **At 375 the feed strip is short enough
    that the top of the hat is cut off.** `drawOwnBlind` draws at the game's fixed size
    (`MAP.phoneTilePx * 2`), and the plan says to reuse it unchanged, so I did not scale it. If you
    want it fixed, the smallest change is a size option for `drawOwnBlind` that the feed sets from its
    canvas height. Reduced motion checked: two frames 500 ms apart are identical.
- **Flaky under load (not acted on):** one full check during Task 69 had
  `spec/layout/hud.test.ts` "one No shows 'Not restarted: <name> kept playing.' to everyone, then it
  goes" time out at 30 s while the other lane was loading the machine. The next three full checks
  passed it. Not retried for green; worth a `pnpm check:flaky` when the machine is quiet.

## Overnight run 2026-11-05, lane A (`auto/blind-purpose`), phase 02

- **Task 81, played roles as hollow shapes on the role screen (FR4):**
  `review/bp-02-task81-played-icons-1280.png`, `-375.png` (four people, the room-2 role screen as
  the host sees it after room 1).
  - **What to look at:** every crew row that has played (yours, others' and the sitting-out one)
    shows a muted "Played" and then hollow 14 px shapes, which should read clearly apart from the
    filled, coloured "now" shape on the left. A screen reader hears "Already played: Can't see". A
    row with nothing played shows nothing. Pass = you accept it.
  - **Start it:** in the `wt-blind` worktree, `pnpm build && PORT=8181 pnpm start` (or `pnpm start`
    if :8080 is free), open four tabs (one private window per extra person), make a lobby, join with
    4 nicknames, Start, play room 1, Next.
  - **What I judged:** good at both widths, with no clipping or overflow. Nicknames are cut to 16
    characters by the server, so "Bartholomew-Feat" is the longest a name can be. It stays on one
    line beside "Not ready" even at 375.

## Overnight run 2026-11-05, lane A (`auto/blind-purpose`), phase 03

- **Task 75, the braille card on Can't see's screen (FR6 to FR8):**
  `review/bp-03-task75-braille-card-1280.png`, `-375.png` (Can't see, the card open);
  `review/bp-03-task75-plate-sighted-1280.png`, `-375.png` (Can't hear, the plate beside Ana).
  - **What to look at:** whether the card reads as "felt, not lit" on black; whether raised dots
    (filled discs) are easy to tell from flat positions (small rings); whether the key is easy to
    match; whether the teaching line is clear; whether anything important is covered on a phone. Also the
    sighted plate: a brass plaque with a fixed six-stud pattern, outlined in `--ui` while a hand
    is on it, with a ring pulsing on a read. On a light floor the outline is faint. Pass = you accept it.
  - **Start it:** the screenshots come from the fixture room (the plate one tile from Can't see's spawn):
    in the `wt-blind` worktree, `pnpm build && ROOMS_DIR=spec/fixtures/rooms-braille PORT=8181 pnpm start`,
    two tabs (one private), make a lobby with the first, join with the second, Start, both ready;
    the host is Can't see: press Space. Room 4's own plate is on the parked Task 74 branch (below):
    after merging it, `pnpm build && pnpm start`, three tabs, play to the flag in room 4.
  - **What I judged:** the 375 card first spilled its key out of the frame and over the captions;
    the layout spec now checks the card is inside the frame and above the captions, and the phone
    key sits in two rows of six beside the cells. At 375 the dim own figure shows through the
    unfilled card (the spec says "no panel fill"); it does not cover a dot, but say if you want a
    black fill.

## PARKED

Nothing parked. Task 74 (room 4's braille plate and the Can't-see bot that reads it) was ruled option 1 (a
plate is part of the station it serves, so the pacing test does not count it), merged, and verified
(`bb0ed58`, `f986a25`). Task 75, the braille card, was accepted on 2026-11-07 and phase 03 is closed.

## Overnight run 2026-11-07

### bp04 (blind-purpose phase 04): manual three-tab run of room 6 (queued for morning)

- **Look at:** room 6 (Lights Out) with three people: Can't see reads the braille plate at (21,1) in the radio beat and texts the band; Can't speak turns the radio. Turn onto a *decoy* band: the tone sounds and the pips come, but with a wrong digit and the keypad's door stays shut; only the real band solves it. Also: a keypad's tune plays a quiet low marker at the gap (rooms 5 to 9).
- **Start locally:** `pnpm build && pnpm start`, open `http://localhost:8080` in three tabs, create a lobby, play to room 6.
- **Screenshots:** none (no new visual; sound and behaviour only).
- **Judged:** bots clear rooms 4 to 9 in every rotation and the unit tests show a decoy tones but never solves; the human feel of the decoy bands and the `rest` marker is not judged.

### bp05 Task 79: wire plaque riddles (human review, pending)

- **Look at:** the full riddle table: `WIRE_RULES[].riddles` and `NUMBER_RIDDLES` in `src/game/sim/stations.ts`. Each should be answerable from the wires in front of you, in the game's voice (DESIGN.md §7 Copy), and not a plain instruction with words swapped. Plaques in rooms 4 and later (not teaching stations) show one at random per attempt; rooms 1 to 3 and teaching plaques stay plain.
- **Start locally:** `pnpm build && pnpm start`, open `http://localhost:8080` in a tab, play to room 5 (or 9) and read the sign near the second wire panel.
- **Screenshots:** `review/n7-bp05-task79-riddle-table-1280.png`, `review/n7-bp05-task79-riddle-table-375.png` (a rendering of the table).
- **Judged:** every riddle resolves to its rule in the unit test (exact match, no pool overlaps); bots clear rooms 5, 7, 9 in every rotation (`spec/rooms.test.ts`). The voice is a little ornate; the numbered ones are plainer on purpose (arithmetic limited to one).

### bp05 Task 82: accept ADR 0023 (braille plates)

- **Ask:** accept `doc/adr/0023-*.md` (status `proposed`; left unchanged overnight). Phases 01 to 05 that it governs are built.
- Also still queued for accepting: ADRs 0024 to 0028 (proposed).

### caches Task 85: room 4's cache jobs (human review, pending)

- **Look at:** play room 4 (The Safe) as Can't hear with two bots, then as Can't speak with two bots. Uncover the cache (the moon tile at (10,5)) and watch: the bots go into the chamber; the Can't-see bot listens at the back (24,7); the dial gets entered on its "stop"; the vault opens and the owner (seat 1) takes the watch. A pass is a cache solved without you touching the dial (as Can't hear), and as Can't speak you turn the dial while the bot listens.
- **Start locally:** `pnpm build && pnpm start`, open `http://localhost:8080`, make a lobby with two bots, play to room 4.
- **Screenshots:** `review/n7-caches-task85-room4-mockup-1280.png`, `review/n7-caches-task85-room4-mockup-375.png` (the room mockup; the behaviour is not a picture).
- **Judged:** `spec/bots-caches.test.ts` shows three bots plus a harness uncover solve Q3 and the owner take the keepsake in every rotation with no catches; nobody has played it with a person.

### caches Task 87: accept ADR 0024 (bots work a cache once people uncover it)

- **Ask:** accept `doc/adr/0024-*.md` (status `proposed`; left unchanged overnight). On acceptance, ADR 0020's status gains "its bots clause superseded by 0024" (not edited overnight: 0020 is accepted).
- **Built:** Tasks 83 to 86 (cache jobs, `currentJob`, rooms 4 to 9, `spec/bots-caches.test.ts`: 36 cases). The human play of room 4 is queued above (Task 85).

### doors Task 89: the door ring anywhere, and a door pill off screen (human review, pending)

- **Look at:** three tabs in room 4 (or the fixture `spec/fixtures/rooms-door`, a 40-wide room with one far door). The person at the far end sees a "Door" pill at the edge toward a door that opens off screen, and the door drawn open. A pass is: readable at a glance, and it does not collide with a face pill.
- **Start locally:** `pnpm build && pnpm start`, open `http://localhost:8080`, make a lobby, play to room 4. For the fixture: `ROOMS_DIR=spec/fixtures/rooms-door pnpm start`.
- **Screenshots:** `review/n7-doors-task89-pill-deaf-1280.png`, `-deaf-375.png`, `-mute-1280.png`, `-mute-375.png`.
- **Judged:** the pill reads "Door" in a gold stroke at the east edge on both viewports, clear of the HUD and the caption strip; a 3-tile door gives one pill (fixed after the first screenshot showed three).

### doors Task 90: the unlock voice (human review, pending)

- **Look at (listen):** as Can't see, open a door from across the room; then play room 7 and listen to its doors opening in a chain. A pass is that it sounds like a heavy unlock (not a click, not a chime), is clearly panned, and is not unpleasant in a chain.
- **Start locally:** `pnpm build && pnpm start`, open `http://localhost:8080`, make a lobby, play to room 4 (or 7).
- **Screenshots:** none: the artifact is a sound (a bolt: 120 ms band-passed noise at 1.1 kHz, then a 95 to 80 Hz sine thunk over 180 ms, starting 120 ms in). The caption "door unlocked" with its direction is tested in `src/client/hud.test.ts`.
- **Judged:** not listened to; synthesised to the plan's description. If it is wrong, the numbers are in `unlock` in `src/client/audio.ts`.

### doors Task 91: accept ADR 0025 (a door opening reaches the whole team)

- **Ask:** accept `doc/adr/0025-*.md` (status `proposed`; left unchanged overnight), after a three-tab playtest of rooms 4 and 7. On acceptance, ADR 0012 gains "amended by 0025" if the process requires it (0012 is accepted; not edited overnight).
- **Built:** Tasks 88 to 90. Human reviews for 89 and 90 are queued above.

### sounds Task 93: Rain and Café masking beds (human review, pending)

- **Look at (listen):** the beds, a minute each at the default volume with headphones. A pass is that each is pleasant enough to keep on for a heist, with no click at the loop. If either fails, the user picks recordings (a new brainstorm).
- **Start locally:** `pnpm build && pnpm start`, open `http://localhost:8080/preferences`, set Headphones "Yes", and pick Masking noise sound (Rain, Café). In a game, play as Can't hear with headphones set, then Settings → Masking noise sound. Or play the loops directly: `review/n7-sounds-task93-{brown,rain,cafe}-loop2x.wav` (two passes of the 6 s buffer, so the join is heard once; 22 kHz).
- **Screenshots:** `review/n7-sounds-task93-prefs-1280.png`, `review/n7-sounds-task93-prefs-375.png` (the picker beside the volume).
- **Judged:** not listened to. Rain is band-passed noise (0.9 to 7 kHz) with about 30 droplet pings a second; Café is pink noise band-passed 250 Hz to 2.5 kHz with a slow swell and a faint 3 to 5 kHz clink every 2.4 to 3.6 s. All beds are normalised to the same RMS. `maskBeds.test.ts` guards the seam (equal-power crossfade into the head). If a bed is wrong, the recipe is in `src/client/maskBeds.ts`.

### sounds Task 94: menu sounds, the join glow and the ready pulse (human review, pending)

- **Look at (listen, three tabs):** demo steps 1 to 5 of `plans/2026-11-07-menu-sounds-and-masking.md`: presses and toggles tick, a bad code blips, a join and a leave chime with the row glowing for 1 s, the role reveal stings, a teammate getting ready chimes and pulses, all ready is a brighter sting as the game rises, and "Menu sounds" off silences all of it. A pass is that the sounds feel light and are not tiring after a whole lobby wait, and nothing ticks during play.
- **Start locally:** `pnpm build && pnpm start`, open `http://localhost:8080` in three tabs; make a lobby in one, join with the code in the others, Start, press I'm ready.
- **Screenshots:** `review/n7-sounds-task94-lobby-glow-1280.png`, `-375.png` (the players list, Cy's row glowing), `review/n7-sounds-task94-reveal-pulse-1280.png`, `-375.png` (the reveal just after Bo pressed ready).
- **Judged:** not listened to. The levels are 0.05 to 0.09 on sine and triangle notes of 50 ms to 0.5 s; if they are too loud or too long, the numbers are `UI_PLANS` in `src/client/uiSound.ts`. `spec/layout/lobby-people.test.ts` proves the glow, the reduced-motion outline and that `menuSounds: false` silences a join and a press. The `ready`, `reveal` and `all-ready` kinds were seen in `__uiSounds` by script, not asserted in a spec.

## Overnight run 2026-11-07

### dl01 Task 97: walls drawn in their room's hue (human review, pending)

- **Look at:** each room's walls read as a different, calm pastel, none lilac; room 01 looks exactly as it did.
- **Start locally:** `pnpm build && pnpm start`, open `http://localhost:8080` in three tabs, make a lobby, Start. Rooms 02 (teal) and 06 (violet) via a cleared heist or `ROOMS_DIR` holding one room file.
- **Screenshots:** `review/diorama/p0-room{01,02,03,06,07}-{1280,375}.png` (copies as `review/n7-dl01-task97-room<NN>-<width>.png`).
- **Judged:** teal and violet looked right (viewed 02 at 1280 and 06 at 375); the others were not individually inspected. The dusk look (room 03 alarm) is covered by unit tests only, no screenshot.

### dl02 Task 99: the plum shell and the trimmed display face (human review, pending)

- **Look at:** home, lobby, reveal, game HUD and the cleared card read as warm dusk plum that belongs with the pastel world; the text is as legible as before; headings are calmer, and only the home hero, the lobby code, the reveal's role line and the cleared title and time keep the big expanded face. Compare with older shots in `review/` (navy).
- **Start locally:** `pnpm build && pnpm start`, open `http://localhost:8080` in three tabs, make a lobby, Start, press I'm ready. The cleared card needs a cleared room (or `ROOMS_DIR=spec/fixtures/rooms-next`, where walking east clears it).
- **Screenshots:** `review/n7-dl02-task99-{home,lobby,reveal,game,cleared}-{1280,375}.png` (also `review/diorama/p1-<page>-<width>.png`).
- **Judged:** home at 1280, game at 375, cleared at 1280 and reveal at 375 viewed: plum reads well, nothing clipped. The lobby shots were not individually inspected. The panels are flat until the next phase gives them gradients. `door-pill.test.ts` is an existing flake (fails on the base commit too); see `plans/2026-11-07-overnight.md`.

## dl03 (overnight run 2026-11-07)

### dl03 Task 100: lit panels, wells, pills and buttons (human review, pending)

- **Look at:** the lobby, the reveal, the HUD and the cleared card. A pass is panels lit from the upper left, buttons clearly pressable with primary obvious, and nothing embossed or heavy.
- **Start locally:** `pnpm build && pnpm start`, open `http://localhost:8080` in three tabs, make a lobby, Start, press I'm ready. The cleared card needs `ROOMS_DIR=spec/fixtures/rooms-next`.
- **Screenshots:** `review/n7-dl03-task100-{lobby,reveal-blind,reveal-deaf,reveal-mute,game-blind,game-deaf,game-mute}-{1280,375}.png` (one width each; the cleared card was not shot).
- **Judged:** reveal at 1280 (Cy) and game at 375 (Bo) viewed: the card and crew wells read as lit, nothing clipped. Others not individually inspected.

### dl03 Task 101: the bezel, role tab and 1 px rim (human review, pending)

- **Look at:** three tabs at 1280 and a phone at 375: from across a room you can tell whose screen is whose by the tab and the line, the canvas looks set into the panel, and nothing overlaps the tab. A cache room's side-job chip starts past the tab (`spec/fixtures/rooms-cache`).
- **Start locally:** `pnpm build && pnpm start`, open `http://localhost:8080` in three tabs, make a lobby, Start, press I'm ready. A spectator: a fourth tab joins and presses Watch.
- **Screenshots:** `review/n7-dl03-task101-game-{blind,mute}-1280.png`, `review/n7-dl03-task101-game-deaf-375.png`.
- **Judged:** Can't speak at 1280 and Can't hear at 375 viewed: tab, rim and recess read well, nothing overlaps. The spectator's dashed bezel was proven by `frame.test.ts` but not screenshotted.

### dl03 Task 102: the dusk reveal, the backdrop fix, the home glow and windows (human review, pending)

- **Look at:** the reveal for each role in rooms 1 and 2 (the room shows dimly in dusk behind the card, never black for a sighted role; Can't see's stays black), and the home page (a soft corner glow, feeds that look like windows).
- **Start locally:** `pnpm build && pnpm start`, open `http://localhost:8080` in three tabs, make a lobby, Start. For room 2: `ROOMS_DIR=spec/fixtures/rooms-next pnpm start`, walk east to clear room 1, press Next.
- **Screenshots:** `review/n7-dl03-task102-reveal-{blind,mute}-1280.png`, `-reveal-deaf-375.png`, `-home-{1280,375}.png`.
- **Judged:** the mute reveal and the home at 1280 viewed. The dusk room reads dim and calm behind the card. The home glow's upper edge is a little visible where the `.home` box starts; if it bothers you, move the gradient to `body`. Room 2's reveal and the Can't-see reveal were checked by `backdrop.test.ts`, not by eye.

## dl04 (overnight run 2026-11-07)

### dl04 Task 105: stone and wood floors, wall-base shade, lit walls, sun, strata, foam and reflection (human review, pending)

- **Look at:** walk room 4 and room 5 as Can't hear at 1280 and 375. A pass: the floor reads as stone (wood boards in room 4), walls look lit from the upper left, wall bases sit in a soft shade, the mist and night still read clearly as unseen, and nothing stutters. Also: the sun glow in the sky's top-left corner disappears while the camera pans north or south and comes back when it stops (a perf trade, see `plans/2026-11-07-overnight.md` dl04/105): say if that shows.
- **Start locally:** `pnpm build && pnpm start`, open `http://localhost:8080` in three tabs, make a lobby, Start, press I'm ready. For one room only: `ROOMS_DIR=<a dir holding just rooms/04-the-safe.room> pnpm start`. High contrast: Settings → High contrast (everything flat).
- **Screenshots:** `review/diorama/p3-room{01,04,05,09}-{canthear,cantspeak,spectator}-{1280,375}.png`.
- **Bench:** `pnpm bench:frame --compare` (about 9 minutes; median of 3 runs against `review/diorama/bench-baseline.json`).
- **Judged:** room 4 (boards), room 5 (stone, mist) and room 9 (spectator: strata, foam, glow) viewed; the materials read as intended and the mist still reads as unseen. The high-contrast shot was not taken (the scripted run failed); HC flatness is proven by the unit tests (`materials.test.ts`).

## fixesA (overnight run 2026-11-07)

No human review in this unit (nothing here changes how the game looks, beyond edge pills keeping apart). Left for the user from the plan's §5:

- **A listen: masking beds and the door bolt.** The masking beds are about 3.5 dB louder than the old brown noise (`TARGET_RMS = 0.3` against about 0.2), and the door bolt is 50 ms, not the 120 ms its plan names. Start locally: `pnpm build && pnpm start`, open `http://localhost:8080`, Settings → masking noise; a door opens in room 01 once all three stand on their plates.
- **A note: Task 88's commit message** claims all three perception tests fail on old code; one cannot. No change made.
- **The decoy band's parity** went to `specs/backlog.md` as a dated line (spec-level).
- **Edge pills spread (Task 134):** a door pill and a mark pill toward the same edge now stack 48 px apart. Seen at 375 (Can't hear's phone, a mark at (12, 2) and the far door): the Door pill above, Cy's mark pill below, neither clipped. Reproduce: `pnpm vitest run spec/layout/door-pill.test.ts -t "never touch"`.

## fixesB (overnight run 2026-11-07)

### fixesB Tasks 135 and 136: high contrast keeps its rim, the reveal and the glass; the role tab sits under overlays (human review, pending)

- **Look at:** (135) Settings → High contrast: the game frame has a 1 px role-coloured rim, the reveal rising into the game is see-through (not a black sheet), and the map's name chips are black glass. (136) At 375 px as Can't see in a plate room, the braille card is not covered by the role tab (the tab is `z-index: 1`: over the canvas, under the top stack).
- **Start locally:** `pnpm build && pnpm start`, open `http://localhost:8080` in three tabs, make a lobby, Start, I'm ready. Press Space at the plate in a plate room (room 4 on) as Can't see.
- **Screenshots:** `review/n7-fixesB-task135-hc-game-{1280,375}.png` (taken mid-fade of the reveal, the rim visible), `review/n7-fixesB-task136-tab-{1280,375}.png`.
- **Judged:** all four viewed; the rim shows in cyan/purple, the game shows through the fading reveal, the tab is visible at both widths. The card-over-tab case is proven by `spec/layout/braille.test.ts` (it fails with `z-index: 4`).

## Overnight run 2026-11-07

### dl05 Task 107: station bodies in brushed steel and brass (human review, pending)

- **Look at:** room 4's safe, room 5's wires and room 9's vault, as Can't hear and Can't speak at 1280 and 375. A pass: the stations look like metal furniture, and every colour code and number is as easy to read as before.
- **Start locally:** `pnpm build && pnpm start`, open `http://localhost:8080` in three tabs, make a lobby, Start, I'm ready. One room only: `ROOMS_DIR=<a dir holding just rooms/04-the-safe.room> pnpm start`.
- **Screenshots:** `review/n7-dl05-task107-room{04,05,09}-cantspeak-1280.png`, `-canthear-375.png` (and every seat in `review/diorama/p4-*.png`).
- **Judged:** room 4's safe and room 5's wire panel viewed at 1280 (banded steel, swatches and dial number flat on top) and room 9 at 375; the colour codes read as before.

### dl05 Task 108: figures with a soft gradient and a radial shadow; goggles' grain at 6 fps (human review, pending)

- **Look at:** three tabs in room 2 at 1280 and 375. A pass: the figures look soft and lit but are still told apart instantly by hat and colour, and the goggles' grain no longer buzzes (pick up the goggles in room 6 or any room that has them).
- **Start locally:** `pnpm build && pnpm start`, open `http://localhost:8080` in three tabs, make a lobby, Start, I'm ready. Also see the doors, crates, glass and vents (Task 106, no review line) in rooms 2, 3 and 4.
- **Screenshots:** `review/n7-dl05-task108-room{02,04,05,06,09}-cantspeak-1280.png`, `-canthear-375.png`; every seat (and so both sighted roles and Can't see's own screen) in `review/diorama/p4-*.png`. No spectator or high-contrast shot was taken; HC flatness is proven by `materials.test.ts`.
- **Bench:** `pnpm bench:frame --compare` passes twice after Tasks 107 and 108: 375×667@3 p95 69.8 / 78.7 ms (rooms 05 / 09) against baselines 87.5 / 93.8; 1280×800@2 p95 149.8 / 172.4 against 168.2 / 182.4.
- **Judged:** room 2 at 1280 and 375 viewed: the figure gradient and shadow read as soft and lit, the hats and colours still separate at a glance; crates show grain and a floor shadow. The goggles' grain was proven by a unit test (changes at 170 ms, not at 100 ms), not by eye.

### dl06 Task 109: the start of a room (flat plan → tilt → swoop → land) (human review, pending)

- **Look at:** room 1 in three tabs at 1280 (and one at 375), plus a spectator tab (a fourth person joins the lobby before Start), on a build **started without `INTRO_MS`** (the real 2.4 s). Then again with reduced motion on (DevTools → Rendering → prefers-reduced-motion). Then a passed "Restart room" vote, which replays it. A pass: the board clearly tips from the flat plan into 2.5D with the walls growing north to south, the camera then flies to you, you land with a small hop and ring, and it feels like a start, not a delay. Reduced motion: a short hold, then a cross-fade, no movement.
- **Start locally:** `pnpm build && pnpm start` (no `INTRO_MS`; `pnpm start:check` sets it to 0 and plays nothing), open `http://localhost:8080` in three tabs (and a fourth to watch), make a lobby, Start, I'm ready in each.
- **Screenshots:** `review/n7-dl06-task109-intro-{tilt,swoop,land,done}-{1280,375}.png` (Can't speak at 1280, Can't hear at 375, taken 700, 1650 and 2230 ms into the start and after it). No spectator, Can't see or reduced-motion shot was taken; those are unit-tested (`intro.test.ts`, `render.test.ts`).
- **Judged:** the tilt shot shows walls part-grown and shorter to the south, the swoop shot shows the camera between the whole room and the game camera, and the land shot shows the hop and the ring at Can't speak's feet. Whether the 2.4 s reads as a start rather than a wait is the call to make.

### autofix1 Task 213: the sun glow holds through a vertical pan (human review, pending)

- **Look at:** walk north and south as Can't hear in a room whose sky shows above the north wall (room 05's top edge; the start of any room, as the camera swoops). A pass: the top-left glow never blinks off while the view moves and never pops back at full strength when it stops. A few pixels of stale horizon under the water's edge mid-pan should be invisible.
- **Start locally:** `pnpm build && pnpm start`, open `http://localhost:8080` in three tabs, make a lobby, Start, I'm ready in each; take the Can't hear tab and walk with the arrows.
- **Screenshots:** `review/diorama/fix213-room05-canthear-pan-{1280,375}.png` (mid-walk south from room 05's top edge). Room 09, the plan's choice, fills the view at both widths so its sky never shows (decision logged in `plans/2026-11-07-overnight.md`). FR4 itself is proven by `src/client/render/backdrop.test.ts`: every frame of a pan after the first draws the cached sky image; high contrast draws no image and no radial gradient.
- **Judged:** both shots show nothing broken. The glow is a faint corner wash, too subtle to read in a still at these crops; the call is whether the pan looks steady in motion.

### dl07 Task 112: every event's own motion, the reserved ring, and the audit's rulings (human review, pending)

- **Look at:** three tabs through rooms 1, 3 and 5, then again with reduced motion on (DevTools → Rendering → prefers-reduced-motion). Watch with Can't hear's tab. A pass: each event's motion is about its own object (a plate sinks, a door's leaves part and sink, a crate rocks, the bell swings three times once and then hangs still, the flag's pennant unrolls, a sign stamps or shakes) and is told apart without colour; the only rings are a station solved and your own landing; nothing feels busy or flashes; reduced motion shows plain end states. Also: get caught once (a burst where you were, then you pop up at the flag) and clear a room (everyone hops twice).
- **Start locally:** `pnpm build && pnpm start`, open `http://localhost:8080` in three tabs, make a lobby, Start, I'm ready in each.
- **Screenshots:** `review/n7-dl07-task112-motion-{1280,375}.png`: a contact sheet, each row one event's drawer at ages 0, 0.15, 0.3, 0.5, 0.75 and 1 on a real canvas (door, crate, plate press, plate release, solve, bell, caught, cleared hop). Not a live game: the live 3-tab run is the review. The plan's `p6-*.gif` recordings were not made (decision logged).
- **Judged:** every row moves as its table row says and ends at rest; the solve row is the only one with a ring. Built smaller than the plan: one shared dip for every station type's part change, no guard walk cycle, no music-box nod (decisions logged in `plans/2026-11-07-overnight.md`).


### dl08 Task 115: decor in rooms 05, 08 and 09 (human review, pending)

- **Look at:** walk rooms 5, 8 and 9 as Can't hear and Can't speak at 1280 and 375. A pass: the rooms feel like a gallery (gilt-framed abstract paintings under picture lights), a salon (violin and lute silhouettes, staves with no notes, swags) and a strongroom (rivet rows on fronts and tops, steel cladding with vertical seams, caged sconces); no decor is mistaken for a clue, a station or something to use; no light falls on the floor; it stays simple. High contrast (Settings) shows no decor.
- **Start locally:** for one room alone, `mkdir -p /tmp/r5 && cp rooms/05-the-gallery.room /tmp/r5/ && pnpm build && ROOMS_DIR=/tmp/r5 PORT=8095 DATABASE_PATH=$(mktemp -d)/app.db node server.ts`, open `http://localhost:8095` in three tabs, make a lobby, Start, I'm ready in each (the same with `08-music-room` and `09-the-vault`). A still of each without players: `BENCH=1 pnpm build && BENCH=1 PORT=8291 node server.ts`, then `http://localhost:8291/bench?room=08&still=1` (`&decor=0` without decor, `&hc=1` high contrast).
- **Screenshots:** `review/diorama/p7-room{05,08,09}-{canthear,cantspeak,spectator}-{1280,375}.png` and `p7-room{05,08,09}-canthear-hc-{1280,375}.png` (no decor); `review/n7-dl08-task115-decor-{1280,375}.png` are copies of two of them.
- **Judged:** nothing broken. The decor is quiet: the paintings and rivets read as wall texture at a glance, and room 08 places only two fronts at its seed (its walls are short runs between doors and glass), so the salon theme is thin there. Room 08's density is the likeliest thing to want more of; raising it is a change to FR10's 1-in-6, not done here. `spec/layout/decor.test.ts` proves no decor pixel leaves its face (it went red, naming floor pixels, with the clip removed).

### dl09 / Task 117: decor in the home feeds

- **Look at:** the home page's three feeds at 1280 and 375. A pass is: room 1's ivy and planters show and the feeds still read as three roles' views.
- **Start it:** `pnpm install && pnpm build && pnpm start`, open `http://localhost:8080/`.
- **Screenshots:** `review/n7-dl09-task117-home-feeds-1280.png`, `review/n7-dl09-task117-home-1280.png`, `review/n7-dl09-task117-home-375.png`, `review/n7-dl09-task117-home-feeds-375.png`.
- **Judged:** room 1 is at half density and a feed shows the whole room, so only two planters on the south wall's top and one ivy trail are placed; they are small but visible. Raise room 01's density if you want more. Can't see's feed draws none (it is sent no map).

### dl09 / Task 119 and 120: the whole look, and ADR 0026

- **Look at:** the overview §6 manual walkthrough on a local build (`pnpm install && pnpm build && pnpm start`, `http://localhost:8080/`): room 1 tilt, swoop and land; room 5 through to cleared; the alarm in room 3; high contrast on; reduced motion on; at 1280 and 375 for each sighted role and a spectator. Also the DESIGN.md diff (`git diff 29ccc69..HEAD -- DESIGN.md`). *(queued for morning: the 3-tab walkthrough needs a person.)*
- **Screenshots:** `review/diorama/final-room01..09-{1280,375}.png` (each room's settled frame with its decor, from the bench page: `BENCH=1 pnpm build`, `BENCH=1 node server.ts`, `/bench?room=NN&still=1`). The lobby, reveal, cleared, HC and reduced-motion shots were not taken overnight (they need live play).
- **Judged:** bench passes (p95 81.9 / 87.2 / 159.3 / 178.6 ms against the baseline). Full check green on a quiet run except `door-pill` at 375 once (5 of 5 alone; the same flake dl08 logged).
- **Ask: accept ADR 0026** (`doc/adr/0026-*.md`, `proposed`; left unchanged). On acceptance set `## Status accepted`, and 0016's status line gains a new sentence "partly superseded by 0026 (flat shading)"; confirm this is how you handle a partial supersession. The 0016 file name in 0026 was fixed overnight (0026 is still proposed).

### autofix2 / Task 220: a rung bell swings for its fx's 1.2 s

- **Look at:** a bell mid-swing. No shipped room has a bell rope (`b`), so the stills draw room 01 with one injected beside the players and its `bell` fx at age 0.2 (240 ms in), with no `state` on the entity, as the server sends after the pull tick.
- **Start it:** `BENCH=1 pnpm build && BENCH=1 PORT=8181 node server.ts`, open `http://localhost:8181/bench?room=01&still=1`, then in the console `__still(true, { entities: [...__scene.entities, { id: "b9", kind: "bell", pos: { x: 3.5, y: 1.5 } }], fx: [{ kind: "bell", targetId: "b9", pos: { x: 3.5, y: 1.5 }, tone: "ui", age: 0.2 }] })` (vary `age` from 0 to 1 to step through the swing).
- **Screenshots:** `review/n7-autofix2-task220-bell-1280.png`, `review/n7-autofix2-task220-bell-375.png`.
- **Judged:** the bell hangs visibly tilted on its bracket at both widths; nothing broken. Live, it now swings for 1.2 s (before: one 50 ms tick).

### autofix2 / Task 221: a door's opening is drawn in its own row

- **Look at:** room 01's first door (x 12) opening, with Can't see's figure standing one row south of it. The figure must stand in front of the sinking leaves, not under them. (The figure at the door's tile is an extra copy added for the shot.)
- **Start it:** `BENCH=1 pnpm build && BENCH=1 PORT=8181 node server.ts`, open `http://localhost:8181/bench?room=01&still=1`, then in the console `__still(true, { self: { x: 11.5, y: 3.5 }, entities: [...__scene.entities.map((e) => e.kind === "door" && Math.floor(e.pos.x) === 12 ? { ...e, state: "open" } : e), { id: "P9", kind: "player", seat: 0, pos: { x: 12.5, y: 2.5 } }], fx: [{ kind: "door", door: true, targetId: "D1", pos: { x: 12.5, y: 1.5 }, tone: "ui", age: 0.25 }] })`.
- **Screenshots:** `review/n7-autofix2-task221-door-1280.png`, `review/n7-autofix2-task221-door-375.png`.
- **Judged:** the figure is drawn over the door's tile and its leaves; nothing broken. Live play in three tabs (a door opening behind a wall still showing its leaves) is queued for morning.

### autofix2 / Task 222: decor is the same for every seat in a room

- **Look at:** rooms 01, 05 and 08's settled frames. Every placement has moved, because each wall cell now rolls its own dice and seven rooms' salts were re-picked. A pass: decor stays on wall faces, nothing sits beside a station or plaque, and the density still feels right.
- **Start it:** `BENCH=1 pnpm build && BENCH=1 PORT=8181 node server.ts`, open `http://localhost:8181/bench?room=NN&still=1` (NN = 01, 05, 08; any room 01 to 09 works).
- **Screenshots:** `review/diorama/fixes2-room01-{1280,375}.png`, `review/diorama/fixes2-room05-{1280,375}.png`, `review/diorama/fixes2-room08-{1280,375}.png`.
- **Judged:** nothing broken. Room 08 now places three items instead of two. Room 05 has two pictures on its lower wall. Room 09 had to go to salt 12365 to find a placement with no item beside a station part. Worth a live 3-tab look: a goggled player and a spectator in room 08 should now see the same walls away from the dark nook.

### plaque / Task 2: a plaque's plate is never cut by the light

- **Look at:** room 5's keypad-nook plaque S1 with the sign in sight and the cone's edge across the plate: the plate and every word are drawn whole, not pasted-over-the-veil looking.
- **Start it:** `pnpm build && PORT=8092 pnpm start:check`, a sighted seat in room 5, walk down the gap at x 9, east along the corridor, up the gap at x 25 to the nook. (Or `ROOMS_DIR` with only `rooms/05-*.room`, as `spec/layout/labels.test.ts` does.)
- **Screenshots:** `review/n7-plaque-task2-plate-1280.png`, `review/n7-plaque-task2-plate-375.png`.
- **Judged:** at 1280 the plate "A lone red keeps watch; the wire at the head falls." reads whole on a whole plate. At 375 it is whole too, but the HUD's side-job card and a label chip sit over part of it in this frame (the card is a HUD overlay, not the light; chips are checked off the plate by `labels.test.ts`, which passed). Worth a glance on whether that overlap is acceptable. Sign-off pending.

### los (line-of-sight cut fixes): two tasks PARKED, one fixed

- **Fixed (Task 2, `b36943a`):** L1, L3, L5: a figure at a corner, the flag and the goggles stay drawn while any of their footprint is lit (server and client share `footLit`). Worth a 3-tab look in room 6 and room 8 at a corner: the figure's top is cut by the cone, never dropped. Start: `pnpm build && pnpm start`, three tabs, play to room 6.
- **PARKED, Task 3 (glass): branch `auto/overnight-parked-los-task3`.** L2 (glass veiled before the corner) is unattempted; L7 (a box in front of glass cut vertically) has a candidate change (glass is not a "wall behind") that does not move its test. Both tests are red on the branch. The plan's Human review (screenshots of 124 and 130 at 1280 and 375) waits on this. Needs: another session, starting from the note in the PARKED commit.
- **PARKED, Task 4 (music box): branch `auto/overnight-parked-los-task4`.** L4 and L6 are not the plan's cause (c) (`cutToSight` is never called). A station's parts share one clip, each part's piece swept up by the whole station's height, so the lit music box's piece reaches over bell 3's number, and a lit bell's covers its neighbour. Needs your ruling: cut each part of a station by its own piece only (a change to how every station is drawn), or something narrower for bells. Finding: `review/los-repro-2026-11-08.md`.

### polish (playtest polish): Task 2 hat sheen, Human review pending

- **Look at:** the three hats at 1×, 2× and 3×: an arc on the dome, a straight line on the cone, an L on the box, each inside its outline. A pass means the L reads as light on a corner, not clutter.
- **Start:** `pnpm build && pnpm start`, play a room with all three roles, zoom the figures; or open `review/n7-polish-task2-hats-1280.png` (1×) and `review/n7-polish-task2-hats-375.png` (3× scale), drawn by the real `paintHatSheen` and `shapePath` on a canvas.
- **Judged:** all three sit clear of the edge; the L is thin and faint (40 % white) and reads as a corner highlight. No fallback to a short top-left stroke was needed.

### polish (playtest polish): Task 3 crew favicon, Human review pending

- **Look at:** the icon at 16 and 32 px on a light and a dark tab bar. A pass means three distinct figures, not a smudge.
- **Start:** `pnpm build && pnpm start`, open `http://localhost:8080` and look at the tab; or the screenshots `review/n7-polish-task3-favicon-1280.png` (16 px, 32 px PNG, 32 px SVG and 128 px on white and dark) and `review/n7-polish-task3-favicon-375.png` (the same at 3× scale).
- **Judged:** at 32 px the dome, box and cone hats and the three colours are distinct; at 16 px the three figures are small but still three colours with hat tops visible. Pills were widened once after a first look read thin.

### wire / Task 3: a cut wire is drawn cut, and the snip (Human review pending)

- **Look at:** a wires panel with one wire cut: settled (two pieces, a 3 px gap hatched in line colour), and mid-snip (the halves lifted apart with a hatch between them, a `ui` spark at the cut). A pass means it reads as a cut, not a glitch.
- **Start it:** live: `pnpm build && PORT=8092 pnpm start:check`, three tabs, room 5, a sighted seat by the teaching panel Q1 while a teammate cuts a wire (this route shows the snip only since auto fixes 4 Tasks 240 and 241; before them a right cut showed only the solve and a wrong cut nothing). Shots: `BENCH=1 pnpm build && BENCH=1 PORT=8193 node server.ts`, then a script drives room 5's real sim (seed 1, as the bench) through `step`: Can't see cuts the right wire at Q1 while Can't hear and Can't speak stand below it, and the real `viewFor` (Can't hear) and `detectFx` results are drawn with `window.__still(true, { entities, fx, self })`.
- **Screenshots (retaken 2026-11-08, auto fixes 4 Task 242; no shot is hand-built):** `review/n7-wire-task3-snip-1280.png`, `-snip-375.png`: the view right after the cut, with its real fx (ring, tick, snip, one spark) at age 0.4; the cutter stands on the wire's tile, so their figure covers much of the snip. `review/n7-wire-task3-cut-1280.png`, `-cut-375.png`: the settled cut, after the cutter walked about two tiles off (12 ticks of input through `step`), so the split wire is in plain sight. Q1 is all white this attempt, as drawn by the real seed: the earlier shots' red, blue and yellow recolouring is gone, so the cut is shown at its least legible.
- **Judged (2026-11-08 retake):** in real play the snip and spark sit under the cutter's own figure, so teammates see the ring and tick most; the settled cut on an all-white panel is a thin seam across the hatch at 1280 and barely there at 375. Worth deciding live whether the cut needs more weight. **Earlier judgement (synthetic shots):** the snip reads plainly. The settled cut reads at 1280 but is slight at 375 (a 3 px gap is about 1.5 CSS px of the swatch's height on a phone); if it reads as a seam, the knob is `CUT_GAP_PX` in `src/client/render/stations.ts`. On an all-white panel the hatch across the gap is close to white's own pattern: worth a look live. Reduced motion draws exactly the settled frame (no spark), checked pixel for pixel at both widths.

## Overnight run 2026-11-07

### sunrise Task 3: the HUD fades in as a window (plan `plans/2026-11-08-intro-sunrise.md`)

- **Look at:** the start of a room, from the card to the land: the card and scrim fade while the
  HUD (bars, overlays, the frame's bezel fill) fades in on the same timing, and the room stays in
  place under both. Pass: it reads as a window opening on the room. Can't see: only the HUD comes in
  over black.
- **Start it:** `pnpm build && PORT=8092 pnpm start` (no `INTRO_MS`: the real 2400 ms hold), three
  tabs (one at 375 px wide), create a lobby, join twice, Start, press I'm ready in all three.
- **Screenshots** (contact sheets, left to right: cover start, mid-tilt, tilt end, mid-swoop, swoop
  end, done): `review/n7-sunrise-task3-hud-window-1280.png` (Can't speak),
  `review/n7-sunrise-task3-hud-window-375.png` (Can't hear).
- **What I judged:** at 375 it reads as intended. At 1280 room 1 is small, so the fit and the
  follow camera nearly coincide and the swoop is slight. The jump from the backdrop's dusk to the
  day colours in these sheets is Task 4's sunrise, which came after.

### sunrise Task 4: the sunrise (plan `plans/2026-11-08-intro-sunrise.md`)

- **Look at:** the same start of a room, watching the walls, floor and sky: they warm from the
  reveal's dusk to the room's own colours between the start of the tilt and the end of the swoop,
  with no jump at the first game frame. Try two rooms with different hues. Also: reduced motion
  (room colours at once, no sunrise), high contrast (none), restart a passed room (plays from dusk
  again).
- **Start it:** as Task 3 (`pnpm build && PORT=8092 pnpm start`, three tabs). For a teal first
  room: `mkdir /tmp/teal && cp rooms/02-three-hands.room /tmp/teal/ && ROOMS_DIR=/tmp/teal PORT=8092 pnpm start`.
- **Screenshots** (same six marks as Task 3): `review/n7-sunrise-task4-sunrise-rose-1280.png`,
  `review/n7-sunrise-task4-sunrise-rose-375.png`, `review/n7-sunrise-task4-sunrise-teal-1280.png`,
  `review/n7-sunrise-task4-sunrise-teal-375.png`.
- **What I judged:** it reads as a sunrise in both hues. The sheets were taken with the page's clock
  frozen and stepped, which runs a little ahead of the real timeline (the 1200 ms frame is warmer
  than it is live). A real-time probe of the canvas's sky on Can't speak's page read 59,45,67 (dusk)
  at the first frame, rising every frame to 247,221,205 (day) by the end of the swoop.

### decor Task 3: the style bar, rooms 1 and 2 (plan `plans/2026-11-08-decor-redesign.md`)

- **Look at:** the contact sheets `review/decor/01-first-steps.png` and `review/decor/02-three-hands.png`
  (every look of every kind on a wall tile, at 1×, 2× and 3×), then the same rooms in game. A pass:
  each item can be named at a glance, it looks lit from the north-west with no outline, and none can be
  taken for a signal. Strike or swap items; rooms 3 to 9 were drawn overnight to this bar as built,
  so a strike here may need the same change there.
- **Start it:** `pnpm decor:sheet` (all nine sheets); in game, `pnpm build && PORT=8092 pnpm start`,
  three tabs, play rooms 1 and 2. A one-frame view per room: `BENCH=1 pnpm build`, then
  `BENCH=1 PORT=8092 node server.ts` and open `http://localhost:8092/bench?room=01&still=1`.
- **Screenshots:** `review/n7-decor-task3-room{01,02}-{1280,375}.png` (Can't hear's spawn view; at
  375 the decor in view is off screen in room 1, the sheets show every item).
- **What I judged:** pavilion: ivy on a lattice, a lantern on a bracket, a hanging basket, coping (its
  joints only) and moss. Conservatory: a fan trellis with a vine, a plant shelf with three pots, a
  fern basket, a gooseneck lamp. Calls made (`plans/2026-11-07-overnight.md`, decor/3): no cresting
  on room 2's tops (it stands up from the top); the first trellis (arched iron bars) read as a gate
  and was redrawn in wood; the lantern's lit panes are the brightest decor so far: say if it reads as
  a signal lamp.
- **Ask: accept ADR 0029** (`doc/adr/0029-decor-may-show-real-things-with-a-job.md`, `proposed`).

### decor Task 4: rooms 3, 4 and 5, drawn to the bar of rooms 1 and 2 (no review line in the plan; for the whole-sheet review in Task 6)

- **Sheets:** `review/decor/03-watchers.png`, `04-the-safe.png`, `05-the-gallery.png`. **In game:** `review/n7-decor-task4-room{03,04,05}-{1280,375}.png`.
- **What I judged:** watch house: a cloth banner hung flat from a rod (not on a pole, which is the exit's flag), a hooded lantern, crossed staves, a rope coil. Bank: raised-panel wainscot, a landscape engraving, a banker's lamp, coat hooks. Gallery: landscapes and still lifes in muted code colours (a test holds them at 70 % toward the wall), a blank label card, a picture light. The rope coil is a ring: say if it reads as a dial (rule 3).

### decor Task 5: rooms 6, 7 and 8 (human review, pending; rooms 7 and 8 were your named complaints)

- **Look at:** `review/decor/06-lights-out.png`, `07-night-shift.png`, `08-music-room.png`, and in game `review/n7-decor-task5-room{06,07,08}-{1280,375}.png`. A pass: you can say what each thing is. Room 7's breaker cabinet and pegboard (spanner and hammer) are on the north wall at Can't hear's spawn; room 8's framed manuscript is on the north wall and a violin on the glass corridor's wall.
- **Start it:** as Task 3 (`pnpm decor:sheet 06 07 08`; or `pnpm build && PORT=8092 pnpm start` and play to rooms 7 and 8).
- **What I judged:** each is nameable at 1280. Dropped from the plan's table: the conduit run (it read as a rail) and room 8's swag (it read as a bridge). The manuscript carries a clef and bar lines, never a note head (tested). The dressing mirror's glass is flat dull steel-grey, no sheen (rule 5). No lit item sits within a tile of a dark zone (tested).

### decor Task 6: room 9 and the nine-room sheet (human review, pending)

- **Look at:** all nine sheets in `review/decor/0{1..9}-*.png`, and in game `review/n7-decor-task{3,4,5,6}-room<NN>-{1280,375}.png`. A pass: every item in every room can be named, none reads as a signal.
- **Start it:** `pnpm decor:sheet`.
- **What I judged:** room 9: riveted cladding with a weld seam, hinge straps, a cable tray, a girder end on its plate, a caged sconce; rivet rows on tops only. In game the cable tray is a thin band across a face: it is the closest any item comes to a rail (rule 3); strike it if it reads as one. `spec/layout/decor.test.ts` green for all nine rooms at 1280 and 375 (no floor pixel). `pnpm bench:frame --compare`: within 10 % of the baseline (p95 80.6/83.8 ms at 375, 157.3/169.8 ms at 1280), but run at load 5 to 15 (the machine never stayed under 6 for 9 minutes), so by the plan it is not a result: **rerun it on a quiet machine**.

### autofix4 Task 241: a wrong wire cut sparks for the sighted (plan `plans/2026-11-07-auto-fixes-4.md`)

- **Look at:** a wrong cut at a wires panel, seen by Can't hear or Can't speak in sight: one `ui` spark at the
  cut wire's foot, while the panel is already redrawn (a teaching panel also jams). A right cut: ring,
  tick, snip and exactly one spark. A pass means the wrong cut reads as "that wire was cut", not a glitch.
- **Start it:** live: `pnpm build && PORT=8092 pnpm start:check`, three tabs, room 5; Can't hear and Can't
  speak stand below teaching panel Q1 while Can't see cuts a wire. The shots: `BENCH=1 pnpm build &&
  BENCH=1 PORT=8193 node server.ts`, then a script drives room 5's real sim (seed 1, as the bench) through
  `step` (a wrong cut, and separately a right cut, at Q1 by seat 0, with seats 1 and 2 at (6,3) and (8,3)),
  feeds the real `viewFor` results to `detectFx` + `fxOfCuts`, and draws them with `window.__still(true,
  { entities, fx, self })` at fx age 0.35. Nothing is hand-built.
- **Screenshots:** `review/n7-autofix4-task241-wrongcut-1280.png`, `-wrongcut-375.png`,
  `-rightcut-1280.png`, `-rightcut-375.png`, and `review/n7-autofix4-task241-wrongcut-spark-zoom-1280.png`
  (a 3× crop with the cutter's figure moved one tile aside, for this shot only, so the spark is visible).
- **Judged:** the right cut reads plainly (snip, spark, ring, tick). The wrong cut's spark is real but
  small, and in play the cutter stands on the wire's tile, so their own figure covers much of it; the
  teammates in sight still see it at the panel's foot. If it reads too faint, the knob is the spark's
  size in the renderer, not the field.

### autofix4 Task 244: rule 3's slat and dial guards; the cable tray and rope coil redrawn

- **Look at:** room 9's cable tray (`cableTray`), now three cables sagging out of the tray between its brackets instead of three flat bands; the watch theme's rope coil (`ropeCoil`), now a long hank hanging off its hook instead of near-round rings. A pass means the tray reads as cable (not a rail or slats) and the coil as rope (not a dial or a ring target).
- **Start it:** `node scripts/decor-sheet.ts 09 03` writes `review/decor/09-the-vault.png` (row 4, the tray) and `review/decor/03-watchers.png` (row 5, the coil) at 1×, 2× and 3×. In the game: `pnpm build && pnpm start`, room 9, walk east along the top corridor past the wire panel Q2 to x ≈ 29.
- **Screenshots:** `review/n7-autofix4-task244-tray-room9-1280.png` (Can't hear at (25, 2): Q2's wires and the tray in one frame, from a real `viewFor`), `review/n7-autofix4-task244-tray-room9-375.png` (at (27, 2): the tray; Q2 is off a phone's width). No shipped room places a rope coil, so it has only the contact sheet.
- **Allow-list entries for you:** `violin` may draw its lower bout (0.15 by 0.13 of the face) because it is the instrument's body, not a dial. The band count merges a rod's lit and shaded edges into one band and ignores a box's own edges (logged in `plans/2026-11-07-overnight.md`).
- **Judged:** the tray reads as loose cable at 2× and 3×; at 1× it is a thin sagging line, which is fine. The coil reads as rope at every size. The tray's red cable is still strong next to Q2's red wire: that is Task 245's (rule 2's colour ban).

### autofix4 Task 245: rule 2's colour ban measured on every painter

- **Look at:** room 7's pipe (now painted steel or rust, was code green or a 70 % code red), room 9's cable tray (grey and rust cables, was a code red beside Q2's red wire), the watch banner's border (plain brass), and the cloth, velvet, banner blue, lamp shade, terracotta, white blooms and candle wax, all muted to `MUTE` (0.72) or moved to cream. A pass means none of them could be taken for a wire or code colour, and the rooms still look warm.
- **Start it:** `BENCH=1 npx astro build && node scripts/decor-sheet.ts 07 09 03 06 08` (sheets in `review/decor/`); in the game, `pnpm build && pnpm start`, rooms 7 and 9.
- **Screenshots:** `review/decor/07-night-shift.png`, `review/decor/09-the-vault.png`, `review/n7-autofix4-task245-room9-1280.png` (Q2's wires and the tray in one frame, from a real `viewFor` with Can't hear at (25, 2)), `review/n7-autofix4-task245-room9-375.png` (at (27, 2)).
- **Allow-list entries for you (green only, each "a leaf is green"):** `ivy`, `fernBasket`, `hangingBasket`, `moss`, `plantShelf`, `trellis`. Their leaf greens are about 70 % of a darkened code green. If you want them muted too, delete the entries and mute `leafTone`.
- **The measure:** each fill or stroke is fitted as a·code + t·wall by least squares; colours made from a code colour leave under 1 RGB unit, and brass, wood and steel leave 2.1 or more, so a fill fails at a leftover under 2 and t under 0.7. Neutral greys near the rose wall can fall in a code's plane by chance (the first steel pipe tone did); if one does, change the tone rather than the line.
- **Judged:** the sheets for rooms 7 and 9 read as steel, rust and brass; nothing in them reads as a code colour.

## Overnight run 2026-11-07

### pt01 (playtests phase 01: proxy proof, autopilot seam, page hook)

- **No human review task in this phase.** Nothing visible changed (the full check, all of
  `spec/layout`, is green).
- **ADRs to accept:** 0027 (a test-only autopilot for a person's seat) as built: env flag
  `PLAYTEST_AUTOPILOT=1`, refusal on Fly (`server.ts`, `src/net/playtest.ts`), `autopilot` message,
  `window.__playtest`/`__cuesPlayed` only when the welcome says so. 0028 (the screenshot review) is
  committed with the SDK as a devDependency; its proxy gate passed (5/5 image calls, Task 121's commit).
  Both stay `proposed` until you accept.
- **Try it:** `pnpm build && PLAYTEST_AUTOPILOT=1 pnpm start`, open three tabs, start a room, then in
  any tab's console `__playtest.autopilot(true)`: that seat walks itself. `PLAYTEST_AUTOPILOT=1
  FLY_APP_NAME=x node server.ts` exits 1.
- Decisions: `plans/2026-11-07-overnight.md` under `## pt01`.

### pf01 Task 1: landing margins (plan `plans/2026-11-08-playtest-fixes.md`, Human review pending)

- Look at: the landing page. The headline and feeds now sit inside the north-west glow, off its edge
  (`.home` padding: 24/16 px on a phone, 32 px at 880 px and up; the glow stays full bleed).
- Run: `pnpm build && PORT=8092 pnpm start:check`, open `http://localhost:8092/` at 1280 and 375.
- Screenshots: `review/n7-pf01-task1-landing-1280.png`, `review/n7-pf01-task1-landing-375.png`.
- Measured: headline and feeds 32 px left / 32 px top at 1280, 16 px left / 24 px top at 375; no
  horizontal scroll at 375; high contrast still draws no gradient.
- My read: comfortably inside the glow at both widths. A pass means you agree it no longer sits
  on the edge.
