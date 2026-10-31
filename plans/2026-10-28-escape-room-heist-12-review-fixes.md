# Escape-room heist: Phase 12, fixes from the human review of phases 02 to 10

- **Date:** 2026-10-31
- **Status:** Approved
- **Tier:** Slice batch (one fix phase; the crate plate, chimes and practice lever touch the sim)
- **Requirements confirmed by user:** yes, 2026-10-31 (brainstorm demo script approved)
- **Part of:** `plans/2026-10-28-escape-room-heist-00-overview.md` (add a §5 row for phase 12, unticked).
  Read it first. Depends on phases 02 to 10. Tasks 32 to 40 (phase 11 keeps 28 to 31).
- **Commits:** one per task once `pnpm check` is green, ending with
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (the overview's Opus trailer is out of
  date). Never push or deploy without the user's go-ahead.

## 1. What you'll see

- G drops, gives, takes and swaps gear; Space takes, and swaps too when your slot is full.
- Room 2's plate is held only by a crate, in its own drawn design.
- Labels go to the nearest objects, a new kind first; none covers a plaque; no plaque is cut off.
- A thin wire or pipe joins each station to its remote box. Room 8's stray keypad box is gone.
- Chimes come in groups you can count by ear. Room 7 has a door the wire cut opens, a short UV
  ink and a hidden torch. Room 8 has a practice lever. Gear and Act hint sit bottom right. Both hand-holders can steer.

## 2. Demo script

1. Hold gear, press G alone → it drops at your feet. Beside a teammate with an empty slot → they
   get it. Standing on other gear while holding one → they swap, the old one lands under you.
2. Room 2: stand on the crate plate → door stays shut. Push the crate on → it stays open.
3. Enter the room that first shows a camera, glass or a grate → its label shows even with other
   things near. Elsewhere only the nearest three (two on a phone) in range are labelled, and no
   chip sits on a plaque's text.
4. Shrink the window height → a tall plaque still shows in full.
5. Look at the safe's back, each tune box and room 8's keypad → a wire joins each pair; no lone box.
6. Eyes closed in a chime room → groups with a clear gap, rising within a group; the count is
   countable. No visible pip anywhere.
7. Room 7: the lights are behind a door; cutting the wires opens it and it stays open. The ink
   reads only a wire number; the torch is not in plain sight of the spawn.
8. Room 8: flip the lever → keys and bells sound, look dimmed and don't count; a distinct
   practice sound plays per press and the lever clunks. Flip back → they count.
9. Gear slot and Act hint sit bottom right and never touch the chat box, at 1280 and 375.
10. Hold hands, then both push the same way → the pair moves; one idle → the other leads; opposite
    ways → the pair stalls and both hear a short "pulled" cue.

## 3. Requirements and out of scope

Requirements 1 to 10 are the demo steps; each task names its step. Out of scope: a hover preview,
visible chime pips, a hatch-walled plate, an elastic leash between hand-holders, moving room 8's keypad code, a practice twin in the
teaching room (only if trivial after Task 38; otherwise a `specs/backlog.md` line), room 9.

## 4. Tasks

### Task 32: G reaches the sim; G and Space take, drop, give and swap  [x]  (demo 1)

Root cause found while planning: `src/net/attach.ts:1081` calls `applyInput(game, seat, { seq,
move, act })` and drops `msg.gear`, so the sim never sees G. `gearPress` is tested only in
`src/game/sim/gear.test.ts`, never through the socket.

- **Red first:** `src/net/game.test.ts` (the nearest socket test; there is no `attach.test.ts`): an `input` message with
  `gear: true` reaches `game.inputs[seat].gear`. Then in `gear.test.ts`: holding gear and
  pressing G on other gear swaps (old one `at` the tile, new one `heldBy` the seat, one `gear`
  event each way).
- **Green:** pass `gear` through in `attach.ts`. `gearPress` (`src/game/sim/gear.ts`): empty slot
  and gear underfoot → take; else give to a teammate beside; else swap with gear underfoot; else
  drop. `actOn`: the take branch also swaps when the slot is full, but last among Space's gear
  actions (after hold-hands, sill and bell/lamp), so Space never swaps when a hand, sill or rope
  was meant. Red-first tests for that priority order in `gear.test.ts`. The Act hint
  (`src/game/perception.ts` ~L900) reads "Swap the X for the Y" when it will swap. Update the `GEAR` comment in `src/client/input.ts` and the Act-hint/Captions copy if
  it names G.
- **Done when:** the three tests pass and a three-tab check shows drop, give and swap.

### Task 33: Crate-only plate in room 2  [x]  (demo 2)

Today `updatePlates` (`src/game/sim/step.ts:106`) presses a plate for a player or a crate. Add a
plate kind pressed by a crate only. New tile letter or `p` metadata: choose the smaller change
(`"P1":{"crateOnly":true}` on a `p` plate needs no parser letter; check `format.ts` keeps unknown
plate params). Read `DESIGN.md` first.

- **Red first:** `step.test.ts`: a player on a crate-only plate leaves `pressed` false; a crate on
  it makes it true. `format.test.ts`: the flag parses. Lint: `pnpm lint:rooms` still passes room 2.
- **Green:** `updatePlates` skips players when the flag is set. Draw it differently in
  `src/client/render` (a recessed square frame with a crate-shaped notch, not the round pad), add
  a `LABEL_COPY` line ("Crate plate: only a crate's weight holds it"), update `DESIGN.md` (token or
  component list; `spec/design.test.ts` checks it). Edit `rooms/02-three-hands.room` so the
  crate plate gates the door and a person cannot stand in for the crate.
- **Done when:** `spec/rooms.test.ts` bots clear room 2 in every rotation; screenshots at 1280 and
  375 show the two plate designs apart. **Human review:** `review/12-task33-plates-{1280,375}.png`.
- **Depends on:** none.

### Task 34: Labels by distance, a new kind first, never on a plaque  [x]  (demo 3; human review deferred to the end of the phase)

`labelsFor` (`src/client/labels.ts:104`) keeps one chip per kind, nearest instance, filtered by
`only` (`ESCAPE_KINDS`, past the first room) and capped by `max`. Game.tsx:199 passes the filter.
First find why camera, glass and grate go unlabelled in their intro rooms (likely the `only`
filter or the cap sorting by distance alone), and write the failing case.

- **Red first:** `labels.test.ts`: a kind never labelled before beats nearer known kinds for a
  slot; labels beyond a fixed range are dropped; a chip's box does not intersect any plaque's
  box (`drawPlaque` extents in `src/client/render/stations.ts:248`).
- **Green:** rank by distance with unseen kinds first, add a range cutoff, remember met kinds on
  the runtime (`rt`), and nudge a chip off a plaque's rectangle. Keep the user toggle.
- **Done when:** unit tests pass; a layout test `spec/layout/labels.test.ts` measures no chip
  overlaps a plaque in rooms 3, 5 and 7 at 1280 and 375. **Human review:** the intro rooms of
  camera, glass and grate, played.

### Task 35: Plaques never cut off; wires join linked parts; drop the stray anchor box  [x]  (demo 4, 5; human review deferred to the end of the phase)

- **Plaque:** `drawPlaque` places the plate above its tile, so a tall one leaves the frame when the
  window is short. Clamp it into the canvas (or flip it below its tile). Layout spec at three
  heights, measuring the plate's rectangle inside the canvas (not a stand-in).
- **Links:** draw a thin conduit along the wall between each station's anchor and its remote part
  (a safe's `back`, a bells station's `tune`, a keypad's `clue`), in `src/client/render/stations.ts`,
  routed along wall tiles using `scene` tiles. Keep it faint (DESIGN.md token, no new colour if one
  fits).
- **Anchor:** a keypad's `Q` anchor (room 8 x=11) is only the station's anchor; stop drawing a
  box for a keypad anchor (`stations.ts:735`) and draw the keys alone.
- **Done when:** layout spec passes; screenshots `review/12-task35-links-{1280,375}.png` of rooms 4,
  5 and 8. **Human review:** the wire reads as a link, not clutter. **Depends on:** 34 (labels
  must not hide it).

### Task 36: Chimes you can count  [x]  (demo 6; by-ear review deferred to the end of the phase)

A `clue` event carries `n`; `audio.ts` plays "key" and "bellnote" notes one at a time on a 60-tick
loop (`TUNE_TICKS`, `NOTE_TICKS` in `src/game/sim/stations.ts:398`), so rounds sound alike. Group
the notes: a pause of about 600 ms between groups, notes within a group rising in pitch, the
group's length the count.

- **Red first:** a unit test beside `noteOf` that two different codes produce distinguishable
  schedules (different group lengths, gaps longer than the in-group spacing, rising pitch within a
  group). `parity.test.ts` still has a row for every cue.
- **Green:** change the schedule in the sim (the cue's `n` and timing), synthesis in `audio.ts`, and
  the bot decoder in `src/game/bots/decode.ts` to read the new grouping from cues alone. No new
  visual of any kind.
- **Done when:** bots still clear rooms 5, 6 and 8 in every rotation (`pnpm test` spec rooms);
  the Captions text still names the count. **Human review:** eyes closed in rooms 5, 6, 8, count
  the chimes without subtitles.

### Task 37: Room 7 door, short ink, hidden torch  [x]  (demo 7; human review deferred to the end of the phase)

- **Red first:** `rooms/07-night-shift.room` lint (`pnpm lint:rooms`): the lights nook cannot be
  reached before the wires are cut (add a door `D3` with `"opensWhen":["Q1"]` between the wires and
  the switches/lights corridor; a second door for the real pair, `Q3`). The ink text `u1`,`u2` is
  `""` in the file and comes from `plaqueText` (`src/game/sim/stations.ts:193`, used at `src/game/perception.ts:858`; "Cut wire n" / "Cut the
  colour wire"): shorten it to the wire number only, so it cannot be clipped by the wall, and
  check its tile is a wall face wide enough with `pnpm mockup:room`.
- **Green:** edit the room, move torch `g1` out of the spawn's line of sight (behind the first
  bend or in the dark zone), adjust `hints`.
- **Done when:** lint and `spec/rooms.test.ts` pass (bots clear it, in every rotation, after the new
  door); mockup shows the full ink at 1280 and 375. A solved station stays solved on a reset.
- **Human review:** play room 7: the torch needs finding, the ink reads clean.

### Task 38: Practice lever in room 8  [x]  (demo 8; by-ear review deferred to the end of the phase)

- **Sim:** a `lever` object (new tile letter or station param; prefer a `Q` param
  `"practice":"L1"` plus a one-tile `l`-style object, read the letters table in `format.ts` first)
  toggled by Act. A station with `practice` set plays its tone but ignores input for solving, and
  pushes a `practice` sound. Views: `station.practice` boolean gated in `viewFor` (it is shown to
  all roles that perceive the station; a Can't-see player gets the sound, not the dimming).
  Log through `logGame`: add `practice` to `GameEvent` (`src/lib/gameLog.ts`), kind only.
- **Red first:** `stations.test.ts`: with practice on, pressing the right keys leaves
  `solved` false and no wrong answer (no dye, not caught); off again, it solves. `parity.test.ts`:
  rows for the practice cue and the lever clunk. `perception.test.ts`: the field is only sent to
  roles that perceive the station.
- **Client:** dim the keys and bells while practising (DESIGN.md, a state of the station, not a new
  colour); lever drawn with its position. Update `LABEL_COPY` ("Lever: while on, keys and bells only
  play"). Room 8: a lever by the keypad and one by each bell set; bots leave it off.
- **Done when:** unit tests, lint and bots (`spec/rooms.test.ts`) pass; screenshot
  `review/12-task38-practice-{1280,375}.png`. **Human review:** the practice sound is clearly not a
  solve, by ear with eyes closed. **Depends on:** 36 (shares the cue schedule).

### Task 39: HUD to the bottom right  [x]  (demo 9; human review deferred to the end of the phase)

`.hud-dock` (`src/styles/game.css:1436`) sits bottom-left over `.talk-bar` and the chat. Move it to
the bottom right on desktop; on a phone the gear stays a 48 px button clear of the joystick (left)
and the Act button (right: place the dock above it). Read `DESIGN.md` first.

- **Red first:** extend `spec/layout/escape-hud.test.ts` (or `hud.test.ts`): the dock's box never
  intersects the talk bar or chat box, and no HUD target is under 48 px, at 1280 and 375, for every
  role.
- **Done when:** the layout spec passes; screenshots at both widths. **Human review:**
  `review/12-task39-hud-{1280,375}.png`.

### Task 40: Both hand-holders can steer  [x]  (demo 10; human review deferred to the end of the phase)

Today `ownMove` (`src/game/sim/step.ts:388`) zeroes the towed seat's move and `tow()`
(`gear.ts:138`) places them behind the leader each tick (spec FR22), so only the one who pressed
Act steers. New rule: the leader's step is the sum of both players' moves, clamped to length 1;
the towed seat still follows via `tow()`, so no second body is moved. Opposite pushes cancel and
the pair stalls; one idle means the other leads at full speed.

- **Red first:** `step.test.ts` / `gear.test.ts`: towed seat pushing alone moves the pair; both
  pushing the same way moves at one step, not two; opposite pushes leave both still; a blocked
  combined step stops both; a held bot (idle input) never stalls the human. The existing "towed
  seat's input is ignored" test (`gear.test.ts:149`) is rewritten, not deleted: say why in the
  commit.
- **Green:** change `ownMove` into a pair move in the step loop (`step.ts:416`). A stall pushes a
  new `pull` cue (add to `SoundCue["kind"]`, a `parity.test.ts` row, a `Captions` line, an
  `audio.ts` synth: a short low strain), sent to both holders only; the caption gives the sound's
  parity. Log through `logGame` as a kind only, once per stall start, never per tick. This
  changes spec FR22: propose an ADR for the user to approve.
- **Done when:** tests and lint pass; bots still clear rooms 2 and 3 in every rotation
  (`spec/rooms.test.ts`). **Human review:** play room 2 with a human as the towed seat: they can
  steer, a tug of war reads by ear and by caption, and room 2's lesson ("one leads another") still
  lands. **Depends on:** 32 (shares `gear.ts`).

## 5. Phase Definition of Done

- [x] Tasks 32 to 40 done, one commit each; `pnpm test:unit` and `pnpm check` green on a fresh
      server (`pnpm start:check`, on its own port: see PROCESS_LOG); `pnpm check:flaky` NOT run yet.
- [ ] Demo script 1 to 10 played on a local build, three tabs, 1280 and 375.
- [ ] CLAUDE.md invariants hold: parity rows added, `viewFor` gates the new fields, log lines kinds
      only, `DESIGN.md` updated in the same commits as the look.
- [ ] Every `Human review:` task accepted explicitly by the user. Overview §5 row ticked, and the
      sensory-split note (no visual pip, practice dimming has a sound twin) recorded in
      `PROCESS_LOG.md`.

## 6. Requirements coverage

| Demo | Task |
| --- | --- |
| 1 | 32 |
| 2 | 33 |
| 3 | 34 |
| 4, 5 | 35 |
| 6 | 36 |
| 7 | 37 |
| 8 | 38 |
| 9 | 39 |
| 10 | 40 |

## 7. Corrections log

(execution appends one line per user redirect and mirrors it into `PROCESS_LOG.md`)

- 2026-10-31, Task 33 accepted. Process change: the user asked that the remaining `Human review:`
  tasks (34, 36, 37, 38, 39, 40) be built and committed as their checks go green, and reviewed
  all at once at the end of the phase, not one stop per task. Expected: stop at each review.
  Wanted: one batch. Why the first reading missed: the skill says never commit before an explicit
  accept; a batched review means a rejection later is a follow-up commit, not an amend.
- 2026-11-01, Task 35 links. Plan said: draw the wire "along wall tiles", and a keypad's `clue` is
  its remote part. Found: two of six remote parts (rooms 8 and 9) have no wall-only route and room
  4's is 17 tiles for a 2-tile gap; a keypad's `clue` is a chime id, not a tile. User chose: wall
  route where one exists, else a straight line. Built that (a wall route over twice the Manhattan
  distance also falls back to straight); a keypad gets no wire. Why the plan missed: it was
  written without running a route search over the real rooms.
- 2026-11-01, Task 36 chimes. Plan said: bots keep clearing rooms 5, 6 and 8 and only the sim, audio
  and decoder change. Found, in this order: (1) `chimes.ts` importing `TICK_MS` from `world.ts`
  made a cycle (`world.ts` > `stations.ts` > `chimes.ts`), so `TICK_MS` was undefined, every tick
  count `NaN` and the decoder tests failed only when `chimes.ts` loaded first; fixed by a local
  `CHIME_TICK_MS` plus a test that the two agree. (2) The decoder tests listened a fixed 200
  ticks, three tunes of the old 60-tick schedule; a tune is now up to 172 ticks, so they listen
  `3 * TUNE_MAX_TICKS`. (3) A tune is longer in play: bots clear room 5 in 34 s (was 27 to 29) and
  room 8 in 44 s (was 37), inside the 240 s budgets. (4) The plan's `NOTE_TICKS`/`TUNE_TICKS` had
  four more consumers than it named: the linter's cycle length, the decoder, the parity row for the
  earpiece (`tick = 59`) and a perception test. Why the plan missed: it named the files it
  expected, and did not grep for the constants it was replacing. (5) My own slip, not the plan's:
  I launched the full check straight after `pnpm lint` without reading its output, and it failed on
  a lint error in my new test; it cost one 5-minute run.
- 2026-11-01, Task 38 practice lever. Plan said: a lever "new tile letter or station param", a
  `practice` sound and "the lever clunks" (one cue row each). Built: tile `v` (the only free letter
  that read as a lever), a `lever` kind, `levers` in the world, and a station's `practice` param
  naming its lever. Chose two cue kinds (`practice`, `lever`) over reusing `key` and `clunk`, so a
  practice press can never be taken for a note of the real tune; each has a synth, a caption, a
  range and a parity row. The view carries `station.practice`, gated like `teach` (a station reaches
  a role only where it is in sight), so Can't see gets the sound and no flag. Two of my own slips:
  a screenshot script grabbed hands instead of flipping the lever (Space takes hold-hands before a
  lever, by the priority order; fixed by keeping the seats apart), and a render test picked the
  wrong `lineTo` and passed or failed for the wrong reason (fixed by finding the handle from its
  pivot, then checked by breaking the handle and the dimming and watching each go red).
- 2026-11-01, Task 39 HUD. Plan said: the dock sits over the talk bar and the chat, so move it to
  the bottom right and make it "never touch the chat box". Found, by measuring every role first:
  the talk bar and the touch controls are below the frame and the dock is inside it, so they never
  touched; the one real neighbour was the captions. The move is a CSS change (`right`, row-reversed);
  the spec measures the dock against the frame, the captions, the talk bar and the touch controls.
  Two slips of mine: (1) my spec first resized every page to both widths, so a desktop seat at 375
  px (a layout the game never has: touch comes from the device, not the width) failed the
  phone rule at a fixed 109 px; I first blamed a stale layout, wrong, a fixed number means a real
  difference, and the fix was to judge each page by what it is. (2) I wrote "G take, give, swap or
  drop" into DESIGN.md while the slot still said "G give or drop": Task 32 changed G and the plan
  said to update this copy; fixed in the component, the phone button's label, the spec and the type
  comment. Checked by putting the dock back on the left and watching the spec go red.
- 2026-11-01, Task 37 room 7. Plan said: a door `D3` "between the wires and the switches/lights
  corridor", a second door for the real pair, and shorten the ink to a wire number from
  `plaqueText`'s "Cut wire n". Found: (1) the doors as I proposed them put both switch stations
  behind a door, which the linter's FR2 rule (two stations open from the start and from each
  checkpoint) forbids; (2) `plaqueText` returns a rule sentence, and "Cut wire n" is the Act hint, so
  shortening would have given the answer away; the ink was clipped because it was 7 to 12 tiles
  wide against a 5-tile pool. User chose: doors over the lamps only (the glass in front of each lamp
  bank becomes a door that opens when its wires are cut; the buttons stay reachable), and wrap the
  ink. Built both, plus the torch out of the spawn's sight (the pocket at (1,6), round a corner).
  Found while looking at the render: wrapping was not enough, the ink sat on the pool's edge
  (the pool is cast over floor only and the ink is on a wall tile), so it is now written on the
  wall's face, and the label chips read the same box (`inkBox`) so none sits on it. Not done: the
  plan's "mockup shows the full ink": `mockup.ts` knows nothing of ink text; the render is the check.
  Still true: a long rule can lose the start of its first line where a wall cuts the pool.
  Slips of mine: the door numbers (scan order puts the exit before the mid door, so I had the two
  swapped and the bots stalled), the gear ids (moving the torch to a later row swapped g1 and g2),
  and a search-and-replace that matched nothing after the formatter reflowed the text.
- 2026-11-01, Task 40 hand-holding. Plan said: the leader's step is the sum of both moves, clamped
  to one; a stall sends a `pull` cue to both holders; "bots still clear rooms 2 and 3". Built that,
  and ADR 0019 (`proposed`, awaiting approval). Found by testing, not named in the plan: (1) the sum
  put the towed seat's `seq` on the leader's `lastSeq` when the leader sent nothing, so the leader's
  client would be acknowledged for an input it never sent (rubber-banding); each seat's own input is
  now left alone and only the combined move is the leader's. (2) A Can't-see bot told "left" and
  then taken by the hand kept sending left, so the pair stalled forever (the person moved 0 tiles in
  40 ticks); a sighted bot led by a person did the same, partly (1.2 tiles of 8). Both now add
  nothing while led. The bot rooms had passed throughout, because in them a bot only ever leads.
  (3) The parity row only checked a field in the view; nothing drew it, so a sighted player would
  have seen nothing. The hold is now drawn straight, heavy and ticked while pulling. Spec FR22 got
  one italic line pointing at the ADR (specs/ is not a protected path; veto it if unwanted).
  Slips of mine: a test callout "west" that does not exist (the bot ignored it and the test proved
  nothing until I printed what the bot sent), a `Vec` passed where a `PlayerInput` was wanted
  (caught by the typecheck), and a spec I wrote and deleted because its assertions could not fail.
  Not done: the plan's by-hand check that room 2 still teaches "one leads another" with a person as
  the towed seat: that is the end-of-phase review. Out of scope, seen: the "Hold hands" chip still
  shows while a pair is already holding hands.
