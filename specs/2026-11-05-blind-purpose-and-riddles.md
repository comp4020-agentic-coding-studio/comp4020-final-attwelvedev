# Braille, riddles and the post-phase-14 fixes

- **Date:** 2026-11-05
- **Status:** Approved
- **Approved by user:** yes — 2026-11-05 (amended the same day in plan-feature: §7)
- **Tier:** Architecture (braille changes what one role perceives; ADR 0023). The rest are slices and
  bug fixes batched into the same plan.

## 1. Problem / intent

After phase 14 the user played the game and listed what is wrong or thin:

- **Can't see has too little purpose.** Their screen is black and they mostly follow. The user wants
  braille that appears only for Can't see, carrying hints the team must have, so Can't see holds
  information nobody else can get and has to pass it on.
- **The game is too easy.** Wire plaques and keypad clues state the answer in plain words
  (backlog 2026-11-01). The user wants riddles instead. The radio is only "dial until the static
  clears" (backlog 2026-11-01). Dials and caches can be brute-forced by spamming Act, because a wrong
  answer only redraws the station (backlog 2026-11-03).
- **Room 6's chime gap is too subtle** (backlog 2026-11-02).
- **Room edits can silently renumber objects** (backlog 2026-11-03).
- **UI and bugs:**
  - the landing page's Can't see feed draws an outdated ring instead of the walking figure the game
    draws
  - the role screen's "Played: …" line is unclear
  - the last walking figure keeps bobbing on the cleared screen
  - a player can land in the next room without readying, and its timer never runs (solo, the lobby
    is deleted)

## 2. Requirements

### 2.1 Functional requirements

**Bugs and polish**

- **FR1 Landing feed.** The home page's Can't see feed draws its bot's own figure the way the game
  draws Can't see's own figure (`drawOwnBlind`). It bobs and kicks up dust while the bot walks, and
  stands still otherwise. The dim ring fallback is no longer reached from the home feed.
- **FR2 Still on cleared.** Once a room's status is `cleared`, no figure is drawn as moving: no bob,
  no dust. This covers the viewer's own figure and every other figure, for every role and for
  spectators.
- **FR3 No room without a reveal.** After the host presses Next:
  - every seated player sees the new room's role screen
  - no player's page enters the room until the server sends a view of the new room past tick 0
  - the room's timer runs once all three are ready
  - in a solo lobby (one person plus bots) the same steps leave the lobby alive
  The fix starts with a failing test that reproduces the bug. The suspected cause is in §3; the test
  confirms or rejects it.

**Role screen**

- **FR4 Played icons.** Each crew row (seated, sitting out) shows the roles that person has played
  earlier in this heist as small outline role shapes, behind the visible word "Played". The full
  text "Already played: Can't see, Can't hear" is the accessible name and the tooltip. A person who
  has played nothing shows no Played group at all (A4). The role being played now never appears in the list.
  The old full-width "Played: …" text line is removed. Spectators (who are never in a room) show
  nothing.

**Braille (ADR 0023)**

- **FR5 One plate per room, rooms 4 to 9.** Each of rooms 4 to 9 has exactly one braille plate,
  `B` in the room format. A plate holds one number. What that number is depends on the room:

  | Room | The plate's number | Required to clear |
  |---|---|---|
  | 4 The Safe | one dial's digit | yes |
  | 5 The Gallery | one digit of keypad Q3's code | yes |
  | 6 Lights Out | the real band of the radio (FR10) | yes |
  | 7 Night Shift | which wire to cut, for one wire station | yes |
  | 8 Music Room | one keypad digit | yes |
  | 9 The Vault | one digit of keypad Q7's code (A3) | yes |

  A carried digit or wire is no longer given anywhere else in plain form. For example, the wire
  plaque in room 7 leaves its deciding fact to the plate, and a keypad clue lacks that digit.
- **FR6 Who perceives what.**
  - Every sighted role sees a plate as a plate: a drawn floor or wall object under the usual line of
    sight, so they can guide Can't see to it.
  - Only Can't see's own view ever carries the plate's content, as dot cells, and only while they
    are at the plate with it read.
  - A spectator following Can't see sees what Can't see's screen shows.
  - No other role's view, message or log line carries the cells or the number.
- **FR7 Reading.** Can't see, standing on or next to the plate, presses Act. Their Act hint reads
  "Read the plate" there. The braille card opens:
  - the number as braille cells: the number sign, then one cell per digit
  - a fixed key of 0 to 9 and the number sign, drawn the same way
  - in room 4 only, every time it opens, the teaching line "Raised dots, read left to right. Match
    each to the key."

  The card closes the moment Can't see leaves the plate. Act at the plate reopens it, as often as
  they like. Nothing is kept on screen after leaving.
- **FR8 The read is heard.** Opening the card plays a soft tactile tap, a new sound heard by every
  hearing role in earshot under the usual sound rules. It has its own row in `parity.test.ts`, with
  its sight for the sighted: a small pulse on the plate. Can't hear gets the sight, not the sound.
- **FR9 Bots.** A bot playing Can't see walks to the plate, reads the cells from its own view
  (decoded in `src/game/bots/decode.ts`, never from simulation state) and sends the number the way a
  human would. Every room passes `spec/rooms.test.ts` in every role rotation. `pnpm lint:rooms`
  fails a room 4 to 9 that has no plate, has more than one, or whose plate's number is reachable
  without Can't see.

**Radio**

- **FR10 Decoy bands.** A radio that has a plate has three settings that clear to a tone. One is the
  real band and pips the true digit. The other two are decoys, each pipping a wrong digit. All three
  sound and look the same to every role. The seeded generator draws the real band, both decoys and
  the decoy digits. The plate gives the real band. Feeding a keypad a decoy digit is an ordinary
  wrong answer (FR13). A plated radio is a hint, not a puzzle: it never solves, so no band plays a
  `solved` chime or shows a tick, and the real band is told from a decoy by the plate alone (ruled
  2026-11-09, after the final review found the real band solving: spinning the knob found it
  without the plate). Its digit feeds the keypad from the start; a wrong keypad digit is what
  costs the team.

**Riddles**

- **FR11 Riddle wording.** From room 4 on, every wire plaque (sign or numbered ink; keypad clues are chime tunes and stay, A1) reads as a
  riddle that resolves to the same rule or code as today's plain sentence. Rooms 1 to 3, and the
  first station of each type in the heist (its teaching station), keep plain wording.
- **FR12 Riddle pool.** Each wire rule, and each keypad-clue form, has a pool of 2 to 3 phrasings.
  The room's seed picks one per station, so a replay is not memorised. Bots decode a riddle by
  looking up its phrasing in the same table (the rule id), never from simulation state. A test fails
  if any phrasing in a pool resolves to a different answer from its siblings.

**Lockout**

- **FR13 Jam.** A wrong answer on a teaching station or a cache (where it only redraws today; elsewhere the team is already sent back, A2) jams that station for 3 s:
  - inputs to it are ignored
  - it shows a jammed look to the sighted who can see it
  - it plays a jam sound with a parity row
  - a teaching station or cache still redraws as today, after the jam

  Wires are exempt, because a wrong cut already raises the alarm. Bots wait out the jam.

**Room 6 chimes**

- **FR14 Gap marker.** In room 6, the keypad's chime sequence plays a quiet marker tone (a distinct
  low pitch) where the radio's digit goes, so the gap reads as "a number goes here". It follows the
  existing chime format (`chimePlan`) and gets a parity row.

**Room-id snapshot**

- **FR15 Ids don't move.** A test holds each shipped room's id-to-position map (every `Q`, `c`, `u`,
  `g`, `D` and the new `B`). It fails when an edit renumbers an existing object. Adding a new object
  updates the snapshot on purpose.

### 2.2 Non-functional requirements

- **Perception and parity invariants** (CLAUDE.md, ADR 0007, ADR 0012) hold. The plate's cells are
  an own-seat field like the cache riddle. New sounds (tap, jam, gap marker) each get a parity row.
- **Accessibility:**
  - The braille card is `role="group"`, `aria-label="Braille plate"`.
  - A visually hidden line gives dot numbers only ("Cell 1: dots 3 4 5 6 …"), never the decoded
    number.
  - A polite status announces "Plate: N cells" when it opens.
  - Raised and flat dots differ by shape, not colour, and stay readable in high contrast.
  - Reduced motion shows the cells at once.
- **Layout:** the card and the crew row are checked by screenshots and a layout spec at 1280 and
  375, for each role that can see them.
- **Performance:** no measurable cost per frame for a closed card. The 256 MB machine is unaffected
  (no new dependency).
- **Logging:** `logGame` records a plate read and a jam by kind only, never the number.
- **DESIGN.md** gains entries for `BrailleCell`, `BrailleCard`, the `RoleShape` outline option, the
  jammed look and the plate's drawing.

### 2.3 Out of scope

- Cache hints in braille. A second, optional plate near a chamber was dropped for now and stays in
  the backlog.
- Plates holding words or phrases. Plates are numbers only, so contracted braille is not needed.
- Audio-tap or vibration braille (considered, rejected: the user chose dots on screen).
- The realistic-look pass, the automated playtest, menu sounds, the pivoting camera, other masking
  noises, the periscope, the codebook, spectators voicing the earpiece. All stay in the backlog.
- Wire lockout (a wrong cut already costs the alarm).

### 2.4 Assumptions (confirmed)

- "Played" means rooms played earlier in this heist, from the lobby's existing per-person `played`
  record. Confirmed with the design.
- A person may read a plate as often as they like. Confirmed.
- Can't see's real players may be sighted people role-playing, so dots on screen with a key are
  acceptable. Confirmed (the user chose "dots on screen to decode").
- The join bug's cause (§3) is a suspicion only. The failing test decides it, and the plan must not
  treat it as known.

## 3. Existing context

- **Landing feed.** `src/components/Feeds.tsx` `paint()` builds a `Scene` with `tiles: null` and
  `self: null` for the blind seat and no `own`. `src/client/render/index.ts` `drawScene` then draws
  the ring (`MAP.blindRingTiles`). In the game, `Game.tsx` passes `own` and `drawOwnBlind`
  (`render/figures.ts`) draws the walking figure. `ownMotion()` in `Game.tsx` takes the blind seat's
  motion from `view.you.motion`.
- **Bob.** `render/figures.ts` bobs (`lift`) and adds dust while `animated(scene) && pose.moving`.
  Pose comes from the entity's `moving` or the viewer's own motion, and nothing clears it when
  `status === "cleared"`.
- **Join bug, suspected cause.** `src/components/Lobby.tsx` keeps `early.current.view` (the latest
  `view` message) across rooms. On a new `reveal`, `Game` re-mounts (`key={reveal.index}`) and, if
  `early.view.tick > 0`, calls `start(false)`, skipping the role screen. That leftover view is the
  previous room's last view, while the server (`src/net/attach.ts` `case "next"` → `advanceRoom` →
  `announceRoom`, which sends the reveal before `sendRevealViews`) holds the new room at tick 0. A
  refresh clears `early`, which matches the report. The solo-lobby deletion is unexplained and is
  checked under the same test.
- **Played.** `src/net/attach.ts` `revealFor` sends `played` per nickname. `src/client/reveal.ts`
  `crewRows` maps it. `src/components/RoleReveal.tsx` renders it as text (`.reveal-crew .played` in
  `src/styles/game.css`).
- **Plaque rules.** `src/game/sim/stations.ts` `WIRE_RULES` (six plain sentences) and `ruleFor`.
  Keypad clues use `clue` ids into the room's `c` objects. Room 7's ink is a bare number.
- **Radio.** `stations.ts`: the answer is `[setting, digit]`, solved when `value === answer[0]`,
  pips every `PIP_TICKS`. Rooms with radios: only `06-lights-out`.
- **Wrong answers.** `stations.ts` records `wrong`. `redrawOne` redraws a teaching station or cache
  (clues FR7, caches FR5), with no other cost.
- **Stations per room (4 to 9):**
  - 4: dials
  - 5: wires, keypads
  - 6: radios, keypad, switches
  - 7: wires, dials, switches
  - 8: bells, keypad
  - 9: dials, keypad, sync, vault, wires
- **Own-seat fields:** the cache riddle is the precedent for a field only one seat's view carries.
- **Design system:**
  - `DESIGN.md`
  - `src/styles/tokens.css`, `src/styles/game.css`
  - `src/components/RoleShape.tsx`, `ActHint.tsx`, `SideJob.tsx`, `TouchControls`

## 4. Design

**Braille plates (ADR 0023).** A new room object `B` (a plate) names its target: a station and which
part of its answer it carries (`{"type":"plate","for":"Q3","part":1}` or similar; the exact shape is
the plan's call).

- The simulation computes the plate's number from the station's seeded answer each attempt, so a
  redraw changes the plate.
- `viewFor` adds an own-seat field `plate: { cells: number[][] }` (dot numbers per cell) only for a
  Can't see seat that is at the plate and has pressed Act. It is cleared when they step off.
- Act on a plate is a new act target with its `act` hint string.
- The read emits the `tap` event under ordinary sound reach.
- The linter gains the plate rules (FR9) and treats the plate as the only path to its carried part.
- Braille encoding is standard Grade 1: the number sign (dots 3 4 5 6), then digits as a to j.

Chose this over:

- a word or phrase plate: too long uncontracted, and the key would leak which letters to expect
- audio taps: rejected by the user
- an optional-only plate in room 4: the user wanted braille required from its first room

**Radio decoys.** The station's answer grows from `[setting, digit]` to the real setting, the digit
and two decoy settings with their digits. "Tuned" (tone and pips) is true at any of the three. Only
the real one is the band the plate names, and only its digit is right downstream.

**Riddles.** `WIRE_RULES` keeps each rule's id and `cut` function and gains a `riddles: string[]`
pool. Keypad and ink clue forms gain the same. The station's seeded rng picks the phrasing, and the
teaching station of each type and rooms 1 to 3 use the plain text. The view sends the chosen text;
bots map text back to rule id through the table.

**Lockout.** Station state gains `jammedUntil` (a tick). Inputs before it are ignored. A view field
or `detectFx` effect shows it, and a `jam` sound has a parity row. 3 s = the tick count from
`TICK_MS`.

**Gap marker.** `chimePlan` gains a marker note in place of the silent gap for a radio-fed digit.

**Join bug.** The fix must make a new room's `Game` ignore any view from a room other than its own
(for example by clearing `early.view` on a reveal for a new index, or by tagging views with the room
index). Which one is the plan's call, after the failing test shows the cause.

Ambitious alternatives considered:

- braille as the radio's only challenge: too narrow, Can't see would matter in one room
- a new "braille station" type with its own puzzle: rejected because a plate carrying part of an
  existing station's answer reuses the stations, bots and linter, as ADR 0020 argued for caches

### 4.1 UI design

From a frontend-design proposal, accepted by the user unchanged.

**A) Braille card, "felt, not lit".** Can't see's screen stays `--ink`.

- The card is a thin `--solid` outline (corner `--r`) straight on black, with no panel fill.
- Raised dots are filled `--ui` discs (about 12 px desktop, 10 px phone). A flat position is a
  small hollow ring of about 4 px. They differ by shape.
- The key uses the same cell drawing with a label under each cell, so decoding means matching
  shapes.
- No Close button.
- It sits top-centre, under the side-job chip, which it covers. A vote prompt takes priority over
  the card.
- Cells appear left to right at a 60 ms stagger. With reduced motion they appear at once. It closes
  instantly.
- Title "Plate under your hand". Type: Archivo condensed 700, tabular figures.

```
desktop 1280                                        phone 375
+------------------------------------------------+  +-----------------------------+
| Plate under your hand                          |  | Plate under your hand       |
| Raised dots, read left to right. Match each    |  |  . .  o .  o o              |
| to the key.            (room 4 only)           |  |  . o  . .  . .              |
|  . .  o .  o o  |  o. o. oo oo o. … .o ..      |  |  o o  . .  . .              |
|  . o  . .  . .  |  .. o. .. .o .o … oo .o      |  | --------------------------- |
|  o o  . .  . .  |  .. .. .. .. .. … .. oo      |  |  o. o. oo oo o. oo          |
|                 |  1  2  3  4  5 …  0  #       |  |  1  2  3  4  5  6           |
+------------------------------------------------+  |  oo o. .o .o ..             |
          (dim figure, black)                       |  7  8  9  0  #              |
                                                    +-----------------------------+
                                                     [joystick] [comms] [Read plate]
```

The card has `pointer-events: none` on a phone, and the comms wheel draws above it. A plate is at
most 3 cells (number sign plus up to 2 digits), so it never wraps.

The closed state at the plate is the existing `ActHint` "[Space] Read the plate" and, on a phone,
the Act button labelled "Read the plate".

**B) Crew row: colour means now, outline means history.**

```
[■20] Ana (you)                      Ready    [Select]
      Can't hear   Played ( ○ △ )
[◌  ] Cy                             Watching
      Played ( ○ □ △ )
[●20] Dee                            Ready
      Can't see                    (nothing played yet: no group, A4)
```

- The leading `RoleShape` (20 px, filled) is the role played now.
- Played roles are `RoleShape` at 14 px with a new `outline` option: stroke only, `currentColor`,
  in `--ui-muted`. They sit behind the word "Played" (`--t-14`, `--ui-muted`) on the second line of
  `.crew-who`.
- The group is `role="img"` with the "Already played: …" label and a `title`.
- A long nickname wraps (`overflow-wrap: anywhere`). On a phone the row wraps and Select drops to
  its own line.

**New:**

- `BrailleCell` (SVG of one 6-dot cell; drawn, because the font subset rule forbids braille glyphs)
- `BrailleCard`
- the `RoleShape` `outline` option
- copy: "Plate under your hand", the room 4 line, "Read the plate"

No new tokens.

## 5. Probes raised and resolved

| # | Type | What was raised | Resolution |
| --- | --- | --- | --- |
| 1 | ambiguity | "Icons next to names": which UI? | The role screen's "Played: …" text line. It becomes outline icons with a label (FR4). |
| 2 | gap | How does Can't see read anything on a black screen? | Dot cells on screen plus a key, decoded by the player (FR7). |
| 3 | ambiguity | Riddles replace what? | Wire plaques and keypad or ink clues. Teaching stations and rooms 1 to 3 stay plain (FR11). |
| 4 | gap | Riddles memorised after one play | A seeded pool of 2 to 3 per rule (FR12). |
| 5 | gap | What does braille carry? | Radio band, wire, keypad digit and, after #7, a dial digit (FR5). |
| 6 | ambiguity | Which rooms? | One plate per room, 4 to 9 (FR5). |
| 7 | contradiction | Proposed room 4 as an optional cache hint; the user wanted braille required from room 4 | Room 4's plate is a dial digit, and cache hints are dropped (§2.3). |
| 8 | gap | Radio backlog: needs a real challenge | Three bands with two decoys; the plate names the real one (FR10). |
| 9 | gap | Brute-forcing dials and caches | A 3 s jam on every station except wires (FR13). |
| 10 | gap | Re-reading a plate | Any time, at the plate; nothing kept after leaving (FR7). |
| 11 | gap | Do the others know Can't see read it? | A tap sound with a parity row and sight (FR8). |
| 12 | gap | Card versus other top-centre HUD | A vote wins, and the card covers the side-job chip (§4.1). |
| 13 | gap | Screen readers could leak the answer | Dot numbers only, never the decoded number (§2.2). |
| 14 | ambiguity | "Played" scope | This heist only, never the current role (FR4). |
| 15 | gap | Phrase length in braille | Plates are numbers only, at most 3 cells (§2.3, §4.1). |
| 16 | assumption | Join bug cause | A suspicion (§3). The failing test decides it (FR3). |
| 17 | gap | Ordering against phase 14 | Phase 14 is closed (commit eb4647c), so nothing blocks this batch. |
| 18 | gap | Bots and the linter for braille | A decoder in `decode.ts` and lint rules (FR9). |

## 6. Handoff notes for planning

- **Do first:** FR3 (join bug) and FR2 (bob) are plain bugs. Fix them first, each from a failing
  test shown red.
- **Next:** FR15 (id snapshot), before any room is edited, so the braille and riddle room edits are
  guarded.
- **Then:** braille end to end in one room (room 4) — sim, view, card, sound, bot, lint — before
  rooms 5 to 9.
- **Ordering:** radio decoys (FR10) land with room 6's plate. Riddles (FR11, FR12) and the jam
  (FR13) are independent of braille.
- **Not to re-litigate:**
  - numbers-only plates
  - a required plate in room 4
  - 3 radio bands
  - 3 s jam, wires exempt
  - a seeded riddle pool
  - the accepted UI design
- **Risks:**
  - Bot rotation pass rates once plates and decoys make rooms longer: watch `budgetS` and pacing
    (ADR 0018).
  - Changing which clue carries a digit can make a room unsolvable for a role rotation:
    `spec/rooms.test.ts` is the guard.
  - The cache dial rules in CLAUDE.md still apply to chambers.
- **Admin:**
  - ADR 0023 is `proposed` until the user accepts it.
  - At commit time, move the backlog lines this batch closes to "Decided":
    - 2026-11-01 riddles
    - 2026-11-01 radio
    - 2026-11-02 room 6 gap
    - 2026-11-03 brute force
    - 2026-11-03 room ids
  - Update `CLAUDE.md`'s perception and rooms bullets for the plate.

## 7. Amendments (2026-11-05, from the plan-feature investigation, each ruled by the user)

- **A1.** Keypad clues are chime tunes (`updateClues`, `tuneGroups`), not text, so riddles apply to
  wire plaques only: rule sentences on signs (rooms 5 and 9) and room 7's numbered ink.
- **A2.** An ordinary station's wrong answer already dyes the team and sends them back, so the 3 s jam
  applies only to teaching stations and caches, where a wrong answer only redraws today.
- **A3.** Room 9's plate carries a digit of keypad Q7, not the wire. Its wire station keeps a plaque,
  which becomes a riddle.
- **A4.** A person who has played nothing shows no Played group. This keeps the role screen's rule
  "nothing to say is nothing drawn" (`spec/layout/reveal.test.ts`).
- **A5** (the agent's call, not contested). The plate's tile letter is `o`, because `B` is already a
  crate.
