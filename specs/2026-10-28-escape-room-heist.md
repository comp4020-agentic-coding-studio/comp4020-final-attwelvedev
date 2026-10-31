# Escape-room heist: stations, gear and presence replace lead roles

- **Date:** 2026-10-28
- **Status:** Draft
- **Approved by user:** yes, 2026-10-28
- **Partly superseded by:** `specs/2026-10-28-escape-room-clues-and-pacing.md` (FR3, the clue
  parts of FR6 to FR14, FR26, FR27, FR28's rooms), after the first stations playtest.
- **Supersedes:** `specs/2026-10-19-play-overhaul.md` FR12 and FR14, and the
  proposal `plans/2026-10-21-room-ramp-proposal.md` (never accepted). ADR 0017
  (proposed) records the balance decision.

## 1. Problem / intent

Two playtests (`playtests/2026-10-09-playtest-01.md`, `-02.md`) and the
`02-blackout` draft showed that the roles do not contribute evenly. Can't see
is "deadweight", a remote-control car receiving "left, left, stop". Can't speak
knows the most but nothing asks for what they know, so they "do their own
thing". Can't hear naturally commands.

The play overhaul's answer was to give each of rooms 2 to 4 a beat one role
leads (dark, alarm, twin cue). That rotates the imbalance instead of removing
it: each beat still has one leader and two followers, and dark beats leave the
others waiting (playtest 1's stranding). The root cause is that the task is
walking a body through space, which is a solo skill: whoever perceives best
just does it, and information flows one way.

What was fun in the playtests was the communication: inventing a language (air
horn = go), comedy from a narrow channel, relief together at the exit. This
spec turns rooms 2 to 4 into escape-room puzzles where **presence is the scarce
thing**: each puzzle needs several places attended at once, and because each
role perceives differently, the team's choice of who goes where is the puzzle.
Nothing tells a role what to do. The user wants a highly social, fun game that
works for people with little gaming experience, and walking is not part of the
game's identity.

## 2. Requirements

### 2.1 Functional requirements

**Balance rule (replaces FR12 and FR14)**

1. Every station has a **clue** (what tells you the answer), a **control**
   (where you act) and **feedback** (how you know it worked). The room linter
   rejects a room where any single role, standing on any one tile, holding any
   one piece of gear (or none), perceives the clue, control and feedback of the
   same station. Perception is computed with the game's own `viewFor` (as
   `src/game/rooms/mockup.ts` does).
2. Rooms 2 to 4 are built so the stations form a **dependency triangle**: at
   any moment at least two stations are open at once, so no one waits.
3. `spec/rooms.test.ts` keeps "three bots clear every room in every rotation".
   In station rooms bots read answers from the simulation, so they prove the
   room can be cleared, not that a role is needed. FR14's "lead role's sends
   switched off fail its beat" is removed; the linter (FR1) carries "every role
   is needed".
4. Lead-beat metadata (`leads`) is removed from the room format and the linter.

**Stations** (worked by walking onto them and pressing Act; no pop-up panels)

5. Every station's answer is drawn fresh from a seeded random generator at the
   start of each attempt (room start and every checkpoint reset), so tests can
   repeat it. A solved station stays solved through resets.
6. **Safe dial.** A safe with a dial on its front and turn pads ◀ and ▶ on the
   floor; Act on a pad turns one notch (a tick sound). The answer is one to
   three numbers. A tumbler click at the back of the safe, behind a vent, is
   audible only at touch range and only with the stethoscope. Solved: the door
   swings open.
7. **Wire panel.** Three to five wires on a wall, one per tile, in the code
   colours. Stand under a wire and press Act to cut it. The cut is the control;
   a spark and snap are the feedback.
8. **Rule plaque.** Short rules ("Two reds: cut the last") on a wall in another
   chamber, chosen to match that attempt's wires. Some are in UV ink (FR18).
9. **Keypad.** A 3×3 floor grid, each key with its own pitch and light. The
   code is played as pitches somewhere the keypad's user cannot hear it (a clock
   behind a vent, or the earpiece).
10. **Radio tuner.** A knob with turn pads. Static clears to a tone at the
    right setting; once tuned it pips N times, a digit for another station.
11. **Lights-out switches.** Floor buttons in one chamber toggle lamps behind
    glass in another; the goal is a target pattern.
12. **Music box.** A four-note tune plays with lights blinking in time; strike
    the coloured bells in order. Reading which bell is which needs sight and
    sound together.
13. **Vault meta-code (room 4).** The vault door has one socket per wing. Each
    wing's last station reveals a symbol in the world only (never in the HUD);
    a pad steps each socket through six symbols. A clue in the vault gives the
    order.
14. **Sync lock.** Two or three keys must all be turned within 0.5 s. A miss
    resets the lock only: it is not a wrong answer.
15. **Wrong answer** at a station (a wrong cut, a wrong code, a wrong order)
    plays the dye pack (FR29), then counts as caught: the whole team goes back
    to the last checkpoint. Unsolved stations get new answers.

**Gear** (changes what a person perceives from the world; never the channel
table, ADR 0011)

16. One gear slot per person. Walk over gear and press Act to pick it up. **G**
    gives it to an adjacent teammate with an empty slot, or else drops it. Gear
    can go through a hatch (FR23).
17. **Earpiece:** plays a private tone feed (never speech): a code as a tune, a
    count of beeps. Useless to Can't hear. A sound with no picture, like the
    `clue` chime.
18. **UV torch:** a radius of about 2.5 tiles around the holder, clipped by
    walls. Hidden ink shows only on tiles inside the radius and in a sighted
    viewer's line of sight; the glow is seen by every sighted role who can see
    it. Useless to Can't see.
19. **Goggles:** the wearer sees inside dark zones under the normal
    line-of-sight rules, tinted green-grey with a light grain. Useless to Can't
    see.
20. **Stethoscope:** hears faint station sounds at touch range. Useless to
    Can't hear.
21. On a checkpoint reset, gear returns to where it lay at the checkpoint, the
    same as loot does today.

**Team mechanics**

22. **Hold hands:** Act on an adjacent teammate grabs their hand; the leader
    tows. Any role can lead or be towed; either can let go (Act again). Can't
    see's own screen says who they are holding. *Both steer (ADR 0019,
    proposed): the pair's step is the sum of both seats' moves, clamped to one;
    opposite pushes stall it, and the two hear and see it.*
23. **Hatch** (`passThrough` in code): a wall tile with a sill that passes gear
    and crates but not people.
24. **Bell:** a rope pull rings a bell every hearer in the room hears; the
    sighted see it swing if it is in their line of sight.
25. **Lamp:** a switch flashes a lamp in every sighted player's HUD. The team
    decides what the bell and the lamp mean. At most one of each per room.

**Rooms**

26. Four rooms, larger than today's strips where the puzzles need it:
    - **1 First Job:** as built, plus a label that teaches holding hands.
    - **2 The Gallery:** a hub with three side chambers. Safe dial with the
      stethoscope, wire panel with its plaque, keypad with its clock. Cameras
      and a guard.
    - **3 Lights Out:** dark sections. Radio tuner, lights-out switches, a sync
      lock, the bell and the lamp; goggles and the UV torch. Lasers arrive here.
    - **4 The Vault:** the team starts in separate wings joined by hatches.
      Music box, earpiece, all gear; the vault meta-code (FR13).
   Cameras, guards and lasers stay. The ramp proposal's room 2 airlock is
   dropped. The existing `02-cameras-lasers` and `03-vault` are rewritten.
27. Every new object gets a room 1-style first-seen label (§4.1).

**Side jobs**

28. In rooms 2 to 4, each player gets one private, optional bonus item, shown
    on their reveal and as a HUD chip. It sits where its owner can neither
    perceive nor reach it alone (linted like FR1). It counts as loot. Results
    credit it: "April's side job: the music box (with Hanna)" with a drawn tick.
    On a reset it goes back like loot.

**Failure, results, records**

29. **Dye pack:** a wrong answer puffs a pastel paint cloud over the station;
    every figure is splattered (blotch shapes, not only a tint) until the reset;
    hearers get a soft *pomf*; a glass banner for everyone reads, e.g., "Wrong
    wire. Back to the flag." This is a team-wide event, in the same tick for
    every role. Can't see gets a caption and sees their own dimmed figure
    splattered.
30. The results screen adds one credited line per person (a station they
    solved, a side job).
31. The heist version is bumped (ADR 0014); old boards stay reachable by link.

### 2.2 Non-functional requirements

- **Perception:** every new view field and message is checked against the role
  tables (CLAUDE.md). The Act hint names only what the viewer perceives
  ("Cut wire 2" for Can't see, "Cut the blue wire" for the sighted).
- **Sensory parity:** every new sound has a row in `src/game/parity.test.ts`.
  Deliberate exceptions, alongside the alarm and the `clue` chime: earpiece and
  stethoscope sounds (no picture), UV ink and goggles sight (no sound).
  CLAUDE.md's invariant is amended to say so.
- **Audio:** no recorded speech anywhere and no new audio files; every new
  sound is synthesised in `src/client/audio.ts`.
- **Performance:** larger rooms and the UV pool must keep a 20 Hz tick for
  about 10 lobbies on the 256 MB machine; measure line-of-sight cost at the new
  sizes.
- **Accessibility:** never colour alone (code colours each have a fixed
  pattern; lamps lit vs hollow; keys numbered with pitch bars); flashing at most
  2 per second; reduced-motion and high-contrast variants for every object
  (§4.1); phone targets at least 48 px.
- **Logging:** new socket events (station solved or wrong, gear picked up or
  given, hold or release, side job done) go through `logGame` as kinds only:
  never answers, codes, symbols or side-job items.

### 2.3 Out of scope

- Recorded or synthesised speech (no text-to-speech in clues).
- Heat or escalation meters.
- A team codebook; spectators voicing the earpiece (backlog).
- Distraction job, periscope (backlog).
- Guard radio chatter.
- Deficits that come from where you stand instead of your role.
- Role-specific abilities: gear works for anyone, so overhaul §2.3 is reworded
  to "no role-specific abilities; gear is open to every role".
- Close-up station panels or overlays.

### 2.4 Assumptions (confirmed)

| Assumption | How confirmed |
| --- | --- |
| About two weeks remain; a plan the size of the play overhaul fits in about one week | User |
| Walking is not part of the game's identity; stationary rooms are fine | User |
| Bots prove the room can be cleared; the linter proves each role is needed | User |
| Four rooms, on the larger side | User |
| A wrong answer costs the whole team the checkpoint | User |
| No recorded speech anywhere | User |
| Side-job loot counts toward the loot total; heist version bumps | User |
| Gear and side-job items reset like loot | User |
| The renderer and camera handle hub-shaped, larger rooms | **Not verified**: plan must check |
| Line-of-sight cost holds at the new sizes | **Not verified**: plan must measure |

## 3. Existing context

- Channel table: `SENDS`/`RECEIVES` in `src/game/types.ts` (ADR 0011);
  unchanged by this spec.
- Perception: `src/game/perception.ts`; line of sight in
  `src/game/sim/sight.ts` and `visibility.ts` (ADR 0012); the `clue` chime
  (a sound with no picture, range 8) is the precedent for earpiece and
  stethoscope sounds.
- Simulation: `src/game/sim/step.ts`; checkpoint reset at about L320 returns
  players, crates and loot, the model for gear and side-job resets. Held
  sequence plates are the model for the sync lock.
- Rooms: `rooms/01-first-job.room`, `02-cameras-lasers.room`,
  `03-vault.room`; drafts in `spec/fixtures/drafts/`; format in
  `src/game/rooms/format.ts`; linter in `src/game/rooms/lint.ts`; mockup in
  `src/game/rooms/mockup.ts` (`pnpm mockup:room`).
- Bots: `src/game/bots/`, jobs in each room's `hints.jobs`.
- Client: `src/client/render/` (blocks, figures, sight), `fx.ts`, `hud.ts`,
  `labels.ts`, `audio.ts`, `speech.ts` (reads talk aloud for Can't see; not
  used for clues); tokens in `src/styles/tokens.css` mirrored in
  `src/client/tokens.ts`; `DESIGN.md`.
- Records: ADR 0014, `src/lib/runs.ts`.

## 4. Design

**Balance by presence.** Line of sight (ADR 0012) already gives each player
exclusive knowledge of where they stand. Stations turn that into need: each
station splits its clue, control and feedback across places and senses, so the
team must spread out and talk across the channel table's narrow edges (Can't
see to Can't hear is faces only; Can't speak to Can't see is clips only). The
game prescribes nothing: which split works is the puzzle, and teams find their
own. Gear lets any person change what they perceive, so "who carries what" is
the allocation conversation; one slot each stops it stacking into the
omniscience playtest 1 had.

**Stations are part of the floor.** Every control is a tile you stand on and
press Act. This works the same for Can't see (move, Act, hear), never covers
the map (playtest 1), reuses line of sight, the mockup and the bots' "go to a
tile" jobs, and lets several bodies share a station.

**Alternatives seriously considered**

- *Keep lead beats (FR12) with the ramp proposal:* rotates the leader rather
  than removing followers; dark beats strand players.
- *Close-up station panels (Keep Talking):* clearer for sighted players, but a
  new UI layer that hides the world and shuts Can't see out.
- *Deficit by station (your sense comes from where you go):* the boldest
  reframe; rewrites rotation, reveal and parts of the channel table. Too large.
- *Role abilities (BOMBANANA's braille):* declined in playtest 2; gear gives
  information to anyone instead.
- *Heat meter for failure:* rejected; the whole team pays the checkpoint.
- *Recorded speech for the earpiece:* rejected; tones only.
- *A cartoon dog as the comic failure:* out of place; replaced by the dye pack.

### 4.1 UI design

From a frontend-design proposal (read-only); user changes: the dog became the
dye pack; the Act hint names only perceived facts; Act on a teammate holds
hands and G handles gear.

**Principles.** The object is the readout (nothing about a station shows
anywhere else). One colour = one name = one pattern, everywhere. The UV pool
is the one bold effect; everything else is as quiet as a plate. Failure is a
toy, not the alarm. Who holds what can be read twice: on the figure and in the
crew row.

**Station states.** Idle: normal materials, plum outline on the parts you
work. In use: your pad sinks 3 px, the active part gets a plum bracket. Solved:
a drawn tick plate and a `--goal` ring; stays visible. Wrong: the station
shakes three times at 2 Hz (none under reduced motion), then the dye pack.

```
 safe (idle)        wire panel (wall)                  keypad (floor)
  ┌──────────┐      ┌─────────────────────────────┐    ┌──────────────┐
  │  ╭─0─╮   │      │ ║   ┃   ╬   :   ╱   ≫       │    │ 1▁ │ 2▂ │ 3▃ │  bars = pitch
  │ 9 (•) 1  │      │ ║  [┃]  ╬   :   ╱   ≫       │    │ 4▁ │[5]│ 6▃ │
  │  ╰─5─╯   │      └─────────────────────────────┘    │ 7▁ │ 8▂ │ 9▃ │
  └──────────┘       .  [▼✂]  .   .   .   .            └──────────────┘
  [◀][  ][▶]         stand under a wire, Act cuts

 radio: static /\/\/\  ->  tuned ∿∿∿  ->  pips ● ● ○ (2 per s), needle on band
 lights-out: floor (◉)(○) here; lamps ☼ (rays) / · (hollow) behind glass there
 music box: bells in code colours with pattern bands, numbered, tilt when struck
 plaque: brass frame, condensed 700, two lines, colour words carry a swatch;
         hidden ink without UV shows a faint stipple
 vault: round door, one socket per wing (wing name under), pads below
```

**Code colours** (new tokens `--w-code-*`, each with a fixed pattern): red
plain, blue stripe, yellow bands, green dots, white hatch, black chevrons. Used
by wires, bells, lamps and plaque swatches.

**Gear.** On the floor: a small mat with a contact shadow, no bob (never reads
as loot). Carried: on the figure (goggles replace the eyes; stethoscope round
the neck; earpiece curl; torch at the side) plus a shoulder badge on phone, and
a `GearGlyph` in the crew row (`● Ana ◯-◯`). Hand-over: the glyph arcs between
them over 250 ms (appears instantly under reduced motion).

**UV pool.** Blue-violet wash at 30% with a dashed rim (shifted away from
`--role-mute`), clipped by walls; ink in `--w-uv-ink` with a plum outline,
drawn only where the pool and the viewer's sight overlap (letters clip at the
rim). High contrast: no wash, a 3 px dashed white rim, yellow ink outlined
black.

**Goggles.** Normal sight inside the dark zone, green-grey tint, grain 8% at
12 fps (a static stipple under reduced motion; under high contrast no tint, a
2 px green inner frame and the goggles glyph in the gear slot).

**Hatch.** A wall tile with a waist-high sill and a lintel; an item on the sill
is seen from both sides in line of sight.

**Hold hands.** A 2 px plum arc between hands with a bead each end and an
arrowhead toward the leader. Can't see: a short arc toward the leader and the
caption "Holding Bo's hand".

**Bell and lamp.** The bell swings ±15° three times in 1.2 s (static tilt under
reduced motion); hearers' caption "↗ Bell (Cy)" with a drawn arrow. The lamp
lights a HUD lamp with four rays and the puller's role shape for 1 s, at most
2 per second.

**Dye pack.** A pastel paint cloud puffs from the station; every figure gets
drawn blotches until the reset; soft *pomf*; banner "Wrong wire. Back to the
flag." for every sighted player; then the 300 ms cross-fade to the checkpoint.
Reduced motion: no puff animation, blotches appear.

**HUD**

```
 desktop 1280 (sighted)
 ┌────────────────────────────────────────────────────────────────────────┐
 │[● Ana ◯-◯] [■ Bo you] [▲ Cy torch]   ☼ lamp(▲Cy)   1:42  ◆3  ◉ Live [≡]│
 │ ┌ Side job: the brooch in the east study  ○ ┐                           │
 │                        (world, unobstructed)                           │
 │ ┌ gear ─────────┐            ┌ Space  Cut the blue wire ┐              │
 │ │ ◯-◯ Goggles   │            └──────────────────────────┘ Hold Q: comms│
 │ │ G give or drop│                                                       │
 └────────────────────────────────────────────────────────────────────────┘

 phone 375 portrait
 ┌───────────────────────────┐
 │● Ana◯-◯ ■ Bo ▲You  1:42 ◆3│
 │[≡] ☼▲Cy   Side job ○       │  chip; tap shows the full line
 │      world (full height)  │
 │ captions (glass)          │
 │ [◯-◯]          [★][◐]      │  gear slot 48 px, tap = give or drop
 │ (joystick)  [Mic]  (Cut)  │  Act button label = what Act will do
 └───────────────────────────┘
```

Can't see's own screen: crew row with gear glyphs, own gear slot, side-job
chip, Act label (perceived facts only), captions; no lamp flash, no in-world
readouts.

**Labels** (first time each object is seen): "Safe: stand on an arrow and press
Act to turn the dial"; "Wires: stand under one and press Act to cut it";
"Plaque: a rule for another room. Some are only in UV ink"; "Keypad: each key
has its own note and light"; "Radio: turn until the static clears, then count
the pips"; "Switches: each one flips lamps in another room"; "Music box: strike
the bells in the tune's order"; "Vault: one symbol from each wing"; "Hatch:
gear and crates go through, people don't"; "Bell: pull the rope; everyone who
can hear, hears it"; "Lamp: flips a light on every sighted teammate's screen";
"Gear: walk over it and press Act to pick it up"; "Hold hands: press Act next
to a teammate".

**New tokens** (each with a high-contrast value): `--w-code-*` (6), `--w-steel`,
`--w-steel-front`, `--w-brass`, `--w-lamp`, `--w-uv`, `--w-uv-ink`, `--w-nv`,
`--w-card`, `--w-dye-*` (splat colours, from the code set). **New components:**
`GearGlyph`, `GearSlot`, `SideJob`, `LampLight`, `ActHint`; canvas helpers
`turnPad`, `codeSwatch`, `symbolGlyph`, `splat`. DESIGN.md is updated with
them; `spec/design.test.ts` checks the names.

## 5. Probes raised and resolved

| # | Type | What was raised | Resolution |
| --- | --- | --- | --- |
| 1 | contradiction | Lead beats rotate the leader but leave two followers | Replaced by the clue/control/feedback rule (FR1) |
| 2 | assumption | Rooms should be smaller | No: four rooms, larger where the puzzles need it |
| 3 | gap | Bots cannot decode a face code | Bots read answers from the sim; linter carries "every role is needed" |
| 4 | ambiguity | "Role abilities" vs earpiece | Gear open to any role, changes perception only, not channels |
| 5 | gap | Gear could stack into omniscience | One slot per person; FR1 lints every single-gear loadout |
| 6 | gap | What a wrong answer costs | Whole team to checkpoint; solved stations stay; unsolved re-randomise |
| 7 | ambiguity | "Just the in-world clues" for audio | No recorded speech anywhere; tones only |
| 8 | gap | Cost of a missed sync | Resets the lock only |
| 9 | ambiguity | How UV and goggles look | UV radius about 2.5 tiles; goggles normal LoS with tint |
| 10 | contradiction | Act hint "Cut the blue wire" leaks colour to Can't see | Hint names only perceived facts |
| 11 | contradiction | Act on a teammate meant both hold and give | Act holds hands; G gives or drops |
| 12 | contradiction | Earpiece playing the keypad code at the keypad lets one hearer perceive all three parts | Linter rejects it (FR1) |
| 13 | gap | Dog fail out of place | Dye pack |
| 14 | gap | Records and side-job loot | Version bump; side-job loot counts |
| 15 | gap | Gear and side-job items on reset | Reset like loot |
| 16 | ambiguity | "Hatch" already names the "can't" stripes | Players see "Hatch"; code says `passThrough` |
| 17 | gap | Fail banner for players who cannot see the station | Shown to all (team-wide event); the splash itself is line-of-sight |
| 18 | gap | Should the HUD record vault symbols | No, world only |
| 19 | gap | Radio pips as numeral or dots | Dots, countable by eye and ear |

## 6. Handoff notes for planning

- **Do not re-litigate:** presence over lead beats; gear open to all with one
  slot; no speech; whole-team checkpoint on a wrong answer; four rooms;
  stations on the floor; the dye pack.
- **Build order, so a short run still ships whole rooms:** station and gear
  framework (format, sim, perception, linter FR1) → room 2 → room 3 → room 4 →
  side jobs, meta-code, credited results. Each room ships with its labels,
  sounds, parity rows and bots.
- **Measure early:** renderer and camera on a hub-shaped room; line-of-sight
  cost at the new sizes with the UV pool.
- **Supersede cleanly:** ADR 0017 (proposed) records the balance decision; the
  overhaul spec's FR12 and FR14 are marked superseded by this spec; the CLAUDE.md
  sensory-parity invariant and "Rooms" bullet are amended; the ramp proposal is
  marked superseded.
- **Risk accepted:** puzzle authoring cost per station; randomised answers must
  stay solvable (a property test per station that every drawn answer is
  reachable).
- **Playtest:** a three-tab playtest of room 2 before building rooms 3 and 4.
