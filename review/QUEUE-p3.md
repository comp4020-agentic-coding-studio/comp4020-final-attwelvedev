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

### Task 306 (part): the stand-in known-failing lists are not empty (bp04)

- **Branch:** `auto/playtest-3-parked-bp04-task306` (the same commit as Task 306 on `auto/playtest-3`: what was fixed is committed there; nothing else was held back).
- **Why:** the plan's "every `NOT_YET` entry is gone" and the spec's `Built` status. Measured after Task 306: one stand-in, 29 of 81 combinations still fail; two stand-ins with one bot (new), 18 of 27. Most include a person as Can't see: the bot guide steers a person by taps from an estimate that drifts and never lands them on a plate or the listen tile. That is a guide fault, beyond "asks routing and station progress", the scope this task names. Each entry in `spec/rooms-people.test.ts` says its cause, or that it is not yet diagnosed. Tried and reverted (overnight log, bp04/306): claiming gear by the room's preferred role (cleared room 7 with a person as Can't hear, but broke the Task 48 torch test), and a tow that walks past its end (broke room 2).
- **What it needs from you:** a ruling on the guide: is a person as Can't see steered to a tile by taps (fix the guide's estimate of where they are), or towed by a bot onto the tile? And for room 7: who should carry the goggles when a person takes the nearest gear?
- **Still worth a look in the morning:** Task 306's playtest under `## Bots and people`.

### Task 278: the jerk after the intro (B4), did not reproduce

- **Branch:** `auto/playtest-3-parked-p3fix04-task278` (the measurements, kept frames, and the capture scripts `scripts/capture-intro.ts` and `scripts/capture-intro-page.ts`). No fix was made.
- **What was measured:** `review/p3-278-frames/MEASUREMENTS.md` on that branch. Real 2.4 s intro, room 1, Can't speak at 1280 and Can't hear at 375, with and without 4× CPU throttling, plus a whole-page screencast. From the end of the swoop through 4 s the camera does not move and luminance stays within 0.2. The playing→done handover changes nothing measurable.
- **What it needs from you:** where you saw it (browser, laptop or phone, which seat, which room), or a screen recording. To re-measure on that machine: `git switch auto/playtest-3-parked-p3fix04-task278`, `pnpm build`, `node server.ts` (no `INTRO_MS`), then `APP_URL=http://localhost:8080 node scripts/capture-intro.ts review/p3-278-frames` (add `THROTTLE=4` for a slow machine).
- **Still worth a look in the morning:** start room 1 at 1280 and on a phone (the plan's human review). If you see it, note the seat and the moment (before or after the HUD's clock starts).

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

## Phase 05

### Task 279: the restart jerk (B4, re-opened)

- **What to look at:** restart a room by vote and watch the intro replay. The vote's note ("Restarting the room.") now floats over the top of the map instead of pushing it down, so when it goes (3 s after the vote, ~0.6 s after the swoop lands) nothing resizes.
- **Measured before the fix** (real intro, room 1, per rAF): the note made the frame 636→603 px at 1280 (433→401 at 375); it went at vote+3.07 s and the frame grew back in one frame, the camera's scale value stepping 191.8→192.2 and easing to 208.3. **After:** frame 636 / canvas 624 (433 / 421 at 375) and the camera constant from the swoop's end to +4 s.
- **Start it:** `pnpm install && pnpm build && pnpm start`, open `http://localhost:8080` in three Chrome windows, make a lobby, play room 1, Menu → Restart room → Sure, the other two vote Restart room.
- **Screenshots:** `review/p3-279-restart-1280.png`, `review/p3-279-restart-375.png` (the note over the frame, mid-swoop).
- **A pass:** on your Mac in Chrome, for a sighted seat, the replayed intro lands and nothing jumps when the note goes. The note reads clearly and does not hide anything you need.
- **My judgement:** the note sits centred at the top of the map, under the bar, readable at both widths; it covers a strip of wall at the top of room 1 for 3 s. The same layer now carries every in-game alert (voice lagging, new host, left/back), so none of them resizes the map either.

### Task 280: the goal line for the sighted, in the phone's top bar (T3)

- **What to look at:** Can't hear and Can't speak see "Get all three onto the exit." On a phone it sits in the top bar's second row, beside "Live" and left of the menu button; from 720 px it is under the bar, where Can't see's line is.
- **Measured:** at 375 the bar stays 92 px tall and the map frame 433 px, the same as without the line (under the bar it cost 30 px and pushed the phone's wheel plate out of the frame, which is why Task 271 parked).
- **Start it:** `pnpm install && pnpm build && pnpm start`, three windows on `http://localhost:8080` (one at phone width in devtools' device mode), make a lobby, start room 1.
- **Screenshots:** `review/p3-280-goal-mute-1280.png`, `review/p3-280-goal-deaf-375.png`, `review/p3-280-goal-mute-375.png`.
- **A pass:** the line reads at a glance in the phone's bar and doesn't crowd the live light or the menu.
- **My judgement:** the full wording fits at 375 with room to spare (218 px), 14 px bold condensed like the room label, so I kept the full line, not the short fallback.

### Task 285: the radio draws its own range of ticks (F5)

- **What to look at:** the radio's band now has one tick per band: 6 on room 6's teaching radio (Q1, range 6), 8 on the plated radio Q3 (range 8), 10 where no range is set. The needle's chip still carries the number (all numbers don't fit: the band is ~22 px wide at 375).
- **Start it:** `BENCH=1 pnpm build && BENCH=1 node server.ts`, open `http://localhost:8080/bench?room=06&still=1` (room 6's Q1, top left; the screenshots set its needle to band 4). Live: `pnpm build && pnpm start`, three tabs, play to room 6.
- **Screenshots:** `review/p3-285-radio-1280.png`, `review/p3-285-radio-375.png`.
- **A pass:** at 375 the six ticks read as separate marks and the needle sits plainly on one of them.
- **My judgement:** at 375 the six ticks are distinct and the chip reads 4 under the 4th; fewer ticks are easier to count than ten were.

### Task 288: a spectator following Can't see sees Can't see's frame (F9, FR4 option b)

- **What to look at:** a watcher who follows the Can't see seat now gets Can't see's frame: black, the dimmed own figure in the middle, and the hand's link while they hold hands. Following Can't hear, Can't speak or Whole room is unchanged (the full room). The spectator chrome (dashed grey bezel, no role tab, the Follow buttons) stays.
- **Start it:** `pnpm install && pnpm build && pnpm start`. Three windows on `http://localhost:8080`, make a lobby, start room 1. A fourth window joins with the code and presses Watch, then Follow → the Can't see player. In the Can't see window, press Space next to a teammate to hold hands.
- **Screenshots:** `review/p3-288-spectator-blind-1280.png`, `review/p3-288-spectator-blind-375.png` (Can't see leading Can't hear in room 1).
- **A pass:** watching Can't see this way reads well: you understand you are seeing what they get, and the link reads as their hand.
- **My judgement:** it matches Can't see's own frame exactly, inside the spectator bezel. One thing to consider: a watcher loses the room while following Can't see, which is FR4's point but may surprise someone who wanted to watch the room; "Whole room" is one tap away.

## Phase 06

### Task 292: alerts stack with the cards at the frame's top (review F3)

- **What to look at:** an alert ("Voice lagging", "Bo is now the host.", how a vote ended) and an open restart vote at the same time, with a side-job chip. They now flow down one column at the map's top: chip, (Can't see's braille plate), alerts, cache moment, vote card. None covers another, and the vote's buttons take their clicks (alerts let clicks through).
- **Start it:** `pnpm install && pnpm build && pnpm start`. Three windows on `http://localhost:8080` (one at phone width, 375×812), make a lobby, start room 1, ready. In one window: Menu → Restart room → "Sure? Ask to restart room". A real alert needs a lagging voice or a host change; the screenshots inject the app's own alert markup into `.hud-alerts`.
- **Screenshots:** `review/p3-292-alert-vote-1280.png` (Can't speak, who asked), `review/p3-292-alert-vote-375.png` (Can't hear on the phone, with the vote's buttons).
- **A pass:** the stacked alert and vote read well together, and the vote card is not too low on the phone.
- **My judgement:** nothing overlaps at either width, and the buttons are clear. The cost: on a phone, with the chip open and two alerts, the vote card starts about 280 px down and covers the middle of the map (it used to sit at the top, under the alerts). If that is too much, the next step would be collapsing the chip while a vote is open.

### Task 294: parked (the intro starting zoomed in did not reproduce)

- **What happened:** the camera maths for every room at 1280×800, 1024×768 and 375×812 (and a sweep of 320–2560 × 500–1400) has the intro starting *below* the follow camera's zoom: it only ever zooms in, and no figure is under the top bar when the HUD has faded in. What did show: on a phone, rooms 3–9 start with the team at the room's west wall, half under the frame's 12 px left bezel.
- **Evidence:** branch `auto/playtest-3-parked-p3fix06-task294`: `review/p3-294-measure.txt` (the table), `review/p3-294-before-04-the-safe-{375,1280,1280-blind}.png` (real canvas, real intro, at the cover's end).
- **What I need from you:** the window size and room where you saw "starts zoomed in, HUD over the players, then zooms out", and whether it was a first start or a restart. Then the plan's fix (fit the reveal's backdrop to the frame) can be built against a reproduction.

## Bots and people

### Task 301: the ask chip and the spoken ask (BT1, BT2)

- **What to look at:** a bot's ask of you. Sighted seats: a chip on the asking bot's figure, "Needs: Stop on the click", never covering the side-job chip. Can't see: the ask spoken ("Listen for the click. Say Stop: wheel, Talk, Stop."). Can't speak: also a caption. Can't hear: the chip only.
- **How to start it locally:** `pnpm build && PORT=8191 INTRO_MS=0 pnpm start:check`, open three tabs on `http://localhost:8191`, make a team, start, and play room 4 with you as Can't see and two bots (swap seats if needed). At the safe the Can't speak bot's turner asks you to say Stop; the ask repeats at 8 s, then 16 s, then every 30 s. (Until phase 03, the bots only ask in this one place.)
- **Screenshots:** `review/bp-301-ask-chip-1280.png`, `review/bp-301-ask-chip-375.png` (room 1 with a person as Can't speak and a made-up ask: the real layout and copy, not room 4).
- **A pass looks like:** the chip reads at a glance, sits on the bot that asks, does not hide the plate chip or the figures' hand-hold chip; the spoken line is clear and does not talk over a callout.
- **What I judged:** the chip and caption both render at both widths; the phone's chip sits close to the hold-hands chip but they do not overlap. Not judged: the spoken ask in a real three-tab game.


### Task 304: every station's ask, re-marking, and the blind bot's steering ask (BT1 per station, BT3, BJ3)

- **What to look at:** you as Can't see in room 4, and as Can't hear or Can't speak in rooms 6 and 8, each with two bots. The asks tell you what to do, and the repeats are spaced (8 s, 16 s, then 30 s), not naggy. Room 4 as Can't see: the turner asks you to say Stop on the click, and the Can't see bot asks to be steered when you are Can't hear.
- **How to start it locally:** `pnpm build && PORT=8191 INTRO_MS=0 pnpm start:check`, open three tabs on `http://localhost:8191`, make a team and start. The host starts as Can't see: use the reveal's swap to take another seat, or play the rooms in order.
- **Screenshots:** `review/bp-304-asks-room6-{1280,375}.png` (Can't speak: "Needs: the marked button pressed" on Bot Jinx), `review/bp-304-asks-room8-{1280,375}.png` (Can't hear: "Needs: steering" chip on the Can't see bot), `review/bp-304-asks-room4-{1280,375}.png` (room 4 as Can't see: the ask is spoken, so no chip is on this view).
- **A pass looks like:** each chip names one thing to do and where it comes from, never a digit; a re-ask holds while you stand at the spot; the Can't see bot stops marching blind when nobody steers it and asks instead.
- **What I judged:** the chips render at both widths and read clearly. Not judged: the spoken asks in a real three-tab game, how naggy the 8/16/30 s cadence feels, and the Can't see view of room 4 (no chip by design).

### Task 305: a bot takes over a person's idle job (BJ2)

- **What to look at:** you own a station or watch job and do nothing for a minute. The asks repeat; after about 60 s with no progress at the station, a bot that can do the job takes it and says "I'll do this one" (a chip on that bot for 3 s; spoken for Can't see). It does not hand the job back if you start later.
- **How to start it locally:** `pnpm build && PORT=8191 INTRO_MS=0 pnpm start:check`, open three tabs on `http://localhost:8191`, make a team and start. Play room 6 as Can't speak with two bots: once the radio is solved, stand still instead of pressing the switches. After about 60 s the Can't hear bot walks to the buttons and presses them itself.
- **Screenshots:** none new. The chip is drawn by the same `labelsFor` path as Task 301's ask chip (`review/bp-301-ask-chip-*.png`) with shorter copy ("I'll do this one", from `ASK_COPY`), so the reviewed layout holds.
- **A pass looks like:** the takeover comes no sooner than about a minute of doing nothing at the station; the notice is noticed but not alarming; the bot finishes the job; a single press by you resets the minute.
- **What I judged:** the unit tests (a still person loses room 6's switches after 60 s and gets the notice; a press at 50 s puts it off). Not judged: whether 60 s feels right in play.

### Task 306: two people and one bot (BG1), in a real game

- **What to look at:** the plan's own review: a real playtest of rooms 4, 6 and 8, (a) you with two bots, and (b) two people with one bot. The stand-in is a proxy for a person; this is the check.
- **How to start it locally:** `pnpm build && PORT=8191 INTRO_MS=0 pnpm start:check`, three tabs on `http://localhost:8191` (two of them people for (b), the third left to a bot), make a team, start, and play rooms 4, 6 and 8 (the room list on the lobby, or play through).
- **Screenshots:** none: this review is a playtest, and no new view was added.
- **A pass looks like:** asks go to the right person, a person's own texts to another person never move a bot's station, and the rooms clear.
- **What I judged:** in the stand-in harness, two stand-ins with one bot clear 9 of 27 room/seat combinations in rotation 0; one stand-in clears 52 of 81 (see `## Parked` below). Expect rooms 4 to 8 to be hard with a person as Can't see: the bot guide's steering of a person is the main known fault.

### Task 307, 309 and 311 (phase 05): towed as Can't see, and the ask without spoken lines

- **What to look at:** (a) you as Can't see in rooms 4, 7 and 8 (and 2, 5 and 9), two bots: the Can't hear bot should take your hand and lead you onto each plate and the listen tile, and let go on it. (b) You as Can't see with "spoken lines" off and captions off: an ask ("Listen for the click. Say Stop: wheel, Talk, Stop.") now shows as a caption line. (c) Standing still as Can't see: the direction callout is said once and repeated at 3, 6 and 12 s, then the bot is quiet until you move. (d) Room 7 with you as Can't hear: this is **not** done (see Parked below); you will hold the torch, not the goggles.
- **How to start it locally:** `pnpm build && PORT=8191 INTRO_MS=0 pnpm start:check`, three tabs on `http://localhost:8191`, make a team and start; use the role wheel to pick Can't see in one tab. (`pnpm dev --host` works as for the earlier playtest.)
- **Screenshots:** none: no new view was added (the ask caption reuses the caption line the Can't speak role already gets).
- **A pass looks like:** you are led, not tapped, and are put on the tile (not a tile short); asks reach you whatever your speech setting; a standing-still person is not talked at forever; rooms 4, 7 and 8 clear.
- **What I judged:** in the stand-in harness, a person as Can't see now clears rooms 2, 4 (rotations 1 and 2), 5 (rotation 1), 6 (rotation 2), 7 (rotations 1 and 2), 8 and 9 in every rotation. Not judged: how a real person's drift feels while towed, and the caption copy for Can't see in a real game. Known not to work: room 3 as Can't see (a camera sees the person while a callout is late), room 4 rotation 0 (the guide oscillates at the gap), rooms 5, 6, 7 rotation 0 and the rest listed in `spec/rooms-people.test.ts` with causes.

### Task 310 (phase 05): the takeover clock and held gear

- **What to look at:** you own a gear job and then a station job; the bot takes the station only after 60 s of idleness at the station, not time spent carrying. If you keep gear a bot needs, you get "Pass me the gear: stand beside me and press G." (a new ask, `hand-over-gear`) after 60 s and every 8/16/30 s; the bot never takes it from you.
- **How to start it locally:** as above, room 4 with you as Can't speak: take the stethoscope and do not hand it on.
- **Screenshots:** none: the ask is drawn by the same chip path as the other asks.
- **A pass looks like:** the chip appears after a minute and names one thing to do; handing the gear on clears it.
- **What I judged:** unit tests only (the gear ask is made after 60 s; no take; a message from you restarts the clock). Not judged: the copy, and whether 60 s of silence while carrying is right.

## Parked (phase 05)

- **Task 308, room 7's goggles to Can't hear:** parked on branch `auto/playtest-3-parked-bp05-task308`. Claiming gear by the role clears room 7 for a person as Can't hear but breaks the Task 48 torch test's premise and leaves a person as Can't speak stalled: a person watcher's marks have no ask a bot can send. **Owner question:** may a person at the goggles (Can't hear) be asked to mark the switches (a new ask kind), or should room 7's hints change so a bot watches for them? Details in `plans/2026-11-07-overnight.md` under `bp05/308`.
- **Task 309, the guard is not empty:** 19 one-person and 15 two-person entries remain, each with a diagnosed cause in `spec/rooms-people.test.ts`. Owner questions: room 3 needs a tow hint or a different guide rule near a camera; the rest are guide faults (a person passing a one-tile gap, rotation 0) that need a stand-aside rule in the guide.

### bp06 / Task 312-315: a bot asks like a person (review queued)

- **What to look at:** no chip over any bot, with Labels on or off. As Can't see you hear the ask and read it as a caption; as Can't hear a Desperate face pops over the asking bot (1.5 s) and pops again at about 8 s, 16 s, then every 30 s while nothing changes.
- **Start it:** `pnpm build && pnpm start`, open three tabs at `http://localhost:8080`, make one lobby with a single human and two bots, and play. Case A: you are Can't see in room 4 (a Can't speak bot turns the dial: hear "Listen for the click, then say Stop", read the caption). Case B: you are Can't hear in room 1 with a Can't see bot: stand still and watch whether its face makes you look, and whether it is clear enough to steer it.
- **Screenshots:** not saved. Setting up a real asking bot in a headless browser was beyond this run's budget, so the render has not been looked at by me; the face is drawn by the same path as every player's face (`pops` in `Game.tsx`), which was not changed. The old `spec/layout/ask-chip.test.ts` was deleted with the chip.
- **A pass looks like:** you act on the ask without being told what it means. A Can't hear person who cannot tell what a face wants is the known finding (see the overnight log, bp06/314: room 5 rotation 1 as Can't hear no longer clears in the stand-in run, owner question: how does a Can't hear person learn what a bot needs?).
- **Judged:** green checks and unit tests only.

