# Playtest 3 fixes: touch, the radio's numbers, quieter bots, and the bugs

- **Date:** 2026-11-10
- **Status:** Approved
- **Approved by user:** yes. Each part was approved on 2026-11-10 in the `/brainstorm-feature` sort of the product review's backlog lines.
- **Deadline:** an overnight run that starts from `main` once PR 3 is merged. Everything ships before Wed 2026-11-11 12:00, and deploys by 09:00.

## 1. Problem / intent

Playtest 3 (`playtests/2026-11-08-playtest-03.md`) was the first time people played the station rooms. Two people played with a bot in the third seat. A product review (`product/2026-11-10-review.md` in the `auto/escape-room` checkout) then walked the build in a browser. Together they found:

- **Can't see can't tell when their hand is held.** Holding hands is how Can't see moves with the team, and today it shows them nothing and plays no sound.
- **The plated radio counts from 0.** The user counted from 1 and failed several times before working it out.
- **Bots repeat a direction every 1.5 s.** Hanna turned spoken lines off, and the user has been annoyed by it for a long time.
- **Some small things look broken:** the wheel's tabs vanish on a short window, bots keep talking on the next reveal, an off-screen face points the wrong way, and a jerk follows the intro.

The intent is to fix what makes the game look broken or leaves a player lost, without adding new features.

## 2. Requirements

### 2.1 Functional requirements

**Slices and Architecture (planned by `plan-feature`):**

FR1 to FR5 cover touch: holding hands is felt, never identified. This is Architecture, with ADR 0030.

- **FR1.** While Can't see's hand is held, whether they lead or are towed, Can't see's own frame draws the same hand link the sighted see (`drawHold`, `src/client/render/gear.ts:136`): the arc, a bead at each end, the arrowhead toward the leader, and the tug-of-war tremor. It runs from Can't see's own figure to a point one tile away, in the direction of the other hand. It plays the same 150 ms `join` and `unjoin` motion as for the sighted.
- **FR2.** No figure, colour, shape, name or seat of the other person is drawn or sent to Can't see. The server adds one own-seat field to Can't see's view, the hand's direction (a unit step), whether Can't see leads or is towed, and `pulling`, and **no seat id**. A perception test reads the raw message and fails if any id or seat for the other person is in it.
- **FR3.** Taking a hand plays a soft grip sound, and letting go plays a release sound. Only the two people in the pair hear them, whatever their role. This means Can't hear never hears it and sees the link instead. `parity.test.ts` gets a row for each, marked as a deliberate exception: "touch is felt only by the two holding hands".
- **FR4.** A spectator following Can't see sees what Can't see sees, link included.
- **FR5.** Who is holding the hand is learned only through the comms. Nothing in the HUD, captions or crew list says who it is.

FR6 is the hold-hands prompt for the sighted (a slice).

- **FR6.** A sighted player who is within reach to hold a teammate's hand, and not holding one, sees the label "Space: hold hands" on that teammate's figure. On the phone it reads "Hold hands" and the button is named. It works like the other labels in `src/client/labels.ts`, and the corner chip stays. The label already shown *after* hands are held (`labels.ts:115`) is unchanged.

FR7 to FR9 make the radio count from 1 everywhere (a slice).

- **FR7.** A radio has 10 positions, shown to players as **1 to 10** from the left: on the radio's face as numbered ticks, in the take hint, and in any caption that names a position. The leftmost position, where the knob starts, is 1. The value inside the game stays 0 to 9, so the sim, the decoys and `bandDigit` are unchanged.
- **FR8.** A braille plate that names a radio's band carries the band as players count it (internal value + 1, so 2 to 10, because position 1 is never a band), using the same `plusOne` the keypad and wires use in `src/game/sim/braille.ts:31`.
- **FR9.** The bot decoder (`src/game/bots/decode.ts`) and `lintPlates` read the plate's number the same way, so bots and lint agree with players. `spec/rooms.test.ts` still clears every room in every rotation.

FR10 and FR11 make bots speak a direction once (a slice).

- **FR10.** A bot that guides a teammate says a direction when it **changes**, not again every 1.5 s (`REPEAT_MS`, `src/game/bots/brain.ts:169`).
- **FR11.** It repeats a direction **once**, only if the guided player has stood still, or moved against it, for about 3 s since it was said. Then it says nothing more until the direction changes. Every room still clears with bots in every rotation (`spec/rooms.test.ts`).

**Bugs (each fixed with a failing test first, per `CLAUDE.md`):**

- **B1.** The comms wheel keeps its 1 to 4 tabs (Talk, Faces, Soundboard, Marks) visible and clickable at 1280×560. Today they disappear. The fix is a layout spec at 1280×560 that fails first.
- **B2.** No callout, spoken line or caption from a bot reaches a player after the room ends. That includes on the next reveal. Room-end lines may play during the cleared screen and must stop when the reveal opens. Reproduce first: the bot sends one line when the room clears (`brain.ts:1159`), so the leftovers may be the speech queue (`src/client/speech.ts`).
- **B3.** A face or mark sent from out of sight shows its edge pill on the screen edge facing the sender, and the pill is never cut off by the frame. Reproduce with a face sent through a wall (playtest 3).
- **B4.** A jerk follows the intro, after the hop: a quick tilt, and the room darkening for a split second. The user says the hop itself is fine. Reproduce it first by drawing the real frames around the intro's end on a real canvas and comparing them, as `CLAUDE.md` requires for render bugs. The suspects are the frame where `introScene` drops `sunrise` and `introFit` together (`src/components/Game.tsx:370-398`), and the tile atlas switching on (backlog 11-08 pf01). Fix only the cause the frames show.
- **B5.** Phone movement: `pnpm playtest` found Move left and right doing nothing on the 375 tab in rooms 02 and 03. Can't see also never showed moving in room 04. Run `pnpm playtest --room 02 --width 375` alone first. If it passes alone, it's a test-tool problem: log that and fix the tool if it's cheap. Only if it fails alone, or the user confirms it on a real phone, is it a game bug.

**Tweaks (no plan needed; each its own commit):**

- **T1.** Checkpoints get a label in `labels.ts`: "Checkpoint: caught after this, you start here".
- **T2.** "Earplugs or earmuffs" becomes "Ears blocked (earplugs or earmuffs)", with clear space between it and Headphones in the setup.
- **T3.** Can't hear's and Can't speak's room-1 HUD carries the goal line, as Can't see's does (`Game.tsx:1269`): "Get all three onto the exit."

### 2.2 Non-functional requirements

- **Perception and parity rules hold** (ADR 0007, 0012): FR2 and FR3 are checked in `spec/perception.test.ts` and `src/game/parity.test.ts`.
- **Logging rules hold:** no new game event logs a seat or a nickname.
- **Every visual change is checked by screenshot** at 1280×800 and 375×812, and B1 also at 1280×560. `DESIGN.md` is updated where a label or the radio's face changes.
- **`pnpm check` stays green,** and no new browser spec walks a figure (`CLAUDE.md`, flaky tests).

### 2.3 Out of scope

Each of these is parked in `specs/backlog.md` with its reason:

- touch as a channel (squeezing patterns)
- a short heist
- a keypad rebalance
- bots that obey the wheel's callouts
- natural-language bots
- a numbers page on the wheel
- the signal card
- a newcomer playtest

The hop itself (the "land") stays.

### 2.4 Assumptions (confirmed)

- **The playtest-3 findings are as written.** The date (2026-11-08) and the setup (two people and one bot in one lobby) were confirmed by the user.
- **Hands design:** the existing link, with no new art. Its behaviour matches what the sighted see, the other person's identity is never sent, and the sound is wanted. All confirmed by the user.
- **B4's cause is unknown** until it's reproduced. B5 may not be a game bug. Both are stated as things to check first.

## 3. Existing context

- **Hands:**
  - `world.holding` in the sim.
  - `heldBy` and `holding` on player entities (`src/game/types.ts:148-149`, `src/game/perception.ts:320-323`).
  - Can't see's view skips `entities` (`perception.ts:1259`).
  - `detectFx` emits `join` and `unjoin` for the sighted (`src/client/fx.ts:298-303`).
  - `drawHold` is drawn per towed figure in `src/client/render/index.ts:573-583`.
  - No hand sound exists today (`src/client/audio.ts`).
- **Radio:**
  - `platedRadio` picks settings 1 to 9 internally and never 0 (`src/game/sim/stations.ts:188`).
  - The face is drawn with `range = 10` (`src/client/render/stations.ts:794`).
  - The plate number comes from `plateNumber` (`src/game/sim/braille.ts:31`).
- **Bots:** `REPEAT_MS` is at `brain.ts:169`, the repeat at `brain.ts:1600`, and the room-clear line at `brain.ts:1159`.
- **Intro:**
  - `INTRO` is `{hold 300, tilt 900, swoop 900, land 300}` (`src/game/intro.ts`).
  - The server holds the first tick for `INTRO_FOR` (`src/net/attach.ts:296-310`).
  - Input waits for `introDone` (`Game.tsx:1135`).
- **Wheel:** `src/components/CommsWheel.tsx` and `src/styles/game.css`.
- **Edge pills:** `Game.tsx:162, 227-238`, and `drawEdgePills` in the renderer.

## 4. Design

**Touch (FR1 to FR5).** This reuses what exists. The towed player's view already gets `heldBy` for the sighted. For Can't see, the view gains `you.hand?: { dir: Vec; leads: boolean; pulling: boolean }`. The client draws `drawHold` from Can't see's own figure to `pos + dir`, with the arrowhead pointing away from them when they're towed. `detectFx` gets the `join` and `unjoin` moments from `you.hand` appearing and disappearing. The grip and release sounds are new local sounds for the two seats in the pair only.

- **Chose this over a blurred teammate:** a blurred figure tells you *who* it is, and touch doesn't.
- **Chose this over a new hand or arm drawing:** the user wanted the link the sighted already know, so Can't see learns one picture, not two.
- **Considered vibration:** it isn't supported on iOS, so it can't be the main signal.
- **Recorded in ADR 0030.**

**Radio (FR7 to FR9).** Count from 1 only where players see or read a number. Inside, positions stay at 0. That's the same convention as keys and wires, which already go through `plusOne`.

**Bot callouts (FR10 and FR11).** Replace the timer repeat with two triggers: a change of direction, and one nudge after about 3 s of no progress, which is tracked per guided seat.

### 4.1 UI design

Design pass skipped: no new screen. The changes are:

- the link reused on Can't see's frame
- numbered ticks on the radio's existing face, in the face's own label style
- one new label in the existing label system
- copy in the setup and the HUD

## 5. Demo script

1. Can't see stands on a black screen. A teammate walks up and presses Space. → Can't see hears a soft grip and sees the link reach one tile from their figure, toward the teammate's side. Nothing names the teammate.
2. The teammate walks right. → The link points right, Can't see is towed, and Cy, who isn't in the pair, hears nothing new.
3. Can't see pushes the other way. → The link trembles (tug of war), as the sighted see it.
4. The teammate lets go. → Can't see hears a release sound, and the link draws back.
5. A sighted player walks next to a teammate without holding hands. → "Space: hold hands" appears on the teammate.
6. In room 6, the plate reads band 4. The player turns the radio to the 4th tick from the left. → It's the real band's tone and pips.
7. A bot guides Can't see right, then down. → It says "Right" once and "Down" once. If Can't see stands still for 3 s, it says "Down" one more time, then nothing.
8. The window is shrunk to 560 px tall and the wheel opened. → The four tabs are there.
