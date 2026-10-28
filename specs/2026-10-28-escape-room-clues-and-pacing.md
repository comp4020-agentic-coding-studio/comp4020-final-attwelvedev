# Escape-room heist: clues a person can follow, one new thing at a time

- **Date:** 2026-10-28
- **Status:** Draft
- **Approved by user:** yes, 2026-10-28
- **Supersedes, in `specs/2026-10-28-escape-room-heist.md`:** FR3 (bots read answers from the
  sim), FR6 to FR14 where they describe a station's clue, FR26 (four rooms), FR27 (labels) and
  FR28's "rooms 2 to 4". Everything else there stands: roles and channels, gear, holding hands,
  hatch, bell, lamp, the dye pack, wrong answer = caught, side jobs, credited results, the
  version bump. ADR 0018 (proposed) records the bot and room-sequence decisions.

## 1. Problem / intent

The user played the stations draft (`spec/fixtures/drafts/00-stations-draft.room`) after phase
02's drawing, sounds and HUD landed, and could not solve any station: "all the clicks sound the
same" at the safe; "how do I know which bell corresponds to which tune?"; "what tells me which
wires to cut, what code to input, what switches to press?"; "I can't see how they link." Tracing
it showed the clues mostly never reach a person (the plaque's rule is never drawn, the switches
have no target, the vault's answer is random rather than fed by its wings, the radio feeds a
keypad whose clue is a chime). Bots clear the room by reading answers from the simulation, which
hid all of it.

The user also judged the room "way too overwhelming": every station type at once, and the
first room itself, with about eleven kinds of object and no limit on label chips, already too
much. They want players to learn a few things at a time.

So: every station has a clue a person can perceive, decode and pass on; the links between
stations are there to be found, as in a real escape room, but never spelled out; and the heist
introduces at most two new things per room, each taught before it is tested.

## 2. Requirements

### 2.1 Functional requirements

**Clues** (replaces the clue parts of FR6 to FR13)

1. Every station's clue is perceivable by at least one human role from where it stands, through
   that role's own view (`viewFor`), in a form the role can decode without sim knowledge: text
   it can read, a drawn pattern it can compare, a sound it can tell apart from every other sound
   at that place, or a count it can make.
2. Per station type (control and feedback as in the old spec unless noted):
   - **Safe:** the tumbler at the right number is a double clack that a hearer tells apart from
     the tick by ear; heard only through the stethoscope at the safe's back. The dial's number
     is on its face for the sighted.
   - **Wires:** the rule plaque is drawn as readable text (or in UV ink, FR18), naming the rule
     that applies to this attempt's wires.
   - **Keypad:** each key carries its pitch as drawn bars and plays it when pressed; the code is
     played as those pitches somewhere the presser cannot hear (behind a vent, or the earpiece).
   - **Radio:** static clears to a tone at the right setting; once tuned it gives its digit as N
     pips, both as a light (for the sighted) and a sound (for hearers).
   - **Switches:** a target card, a drawn grid of lit and hollow lamps, stands out of sight of the
     lamps; the goal is to make the lamps match it.
   - **Music box:** as each note of the tune plays, the bell it belongs to lights; each bell has
     a fixed pitch it also plays when struck, so sight and sound together tell which is which.
   - **Vault:** each wing's last station, once solved, reveals a symbol plate in the world; the
     vault's sockets step through the same six symbols; a clue in the vault gives their order.
   - **Sync lock:** no clue (it is a timing lock); unchanged.
3. **Implicit links.** When one station's result is another's input (a radio digit for a keypad,
   a wing's symbol for the vault socket), both ends carry the same drawn motif (a symbol, shape
   or pattern), and nothing names the other station: no "feeds", no tag, no arrow. Players join
   the dots.
4. **Clue-path linter.** The room linter fails a room where any station's clue cannot reach a
   human role per FR1, or where a link (FR3) lacks the matching motif at both ends. The draft's
   faults (an undrawn plaque, a switches station with no target card, a vault fed by nothing, a
   `yields` into a station that does not take it) each fail it.

**Bots** (replaces FR3 of the old spec)

5. Bots solve stations only from what their own role perceives and from messages they receive,
   like a person: they read plaques, compare the target card, tell pitches and counts apart,
   carry symbols. "Three bots clear every room in every rotation, never caught" stands, and now
   also proves a human could have done it.
6. Each station type ships with the bot skill that solves it from its view; a room is not done
   until perception-only bots clear it.

**Teaching**

7. The first time a station type appears it is a **teaching** version: a smaller answer (one
   digit, three wires, three keys or lamps, a two-note tune), extra feedback where a sense would
   otherwise be guessing (the teaching safe also lights a small lamp at the right number), and a
   wrong answer re-draws only that station, with no dye pack and no send-back.
8. The station's next appearance is the real version, with the dye pack and the checkpoint.

**Rooms and pacing** (replaces FR26)

9. A room introduces at most two new kinds of thing (an object, a hazard, a station type, a
   piece of gear). Loot, the checkpoint and the exit are not counted: they are labelled, not
   learnt.
10. Nine rooms, each about two to four minutes:

    | Room | New | Notes |
    | --- | --- | --- |
    | 1 First Steps | plate and door; talking across roles | one player holds a plate, the others go through |
    | 2 Three Hands | crate; the three-plate door (and holding hands) | push a crate onto a plate; everyone needed; Can't see led by the hand |
    | 3 Watchers | glass and camera; vent and guard | seeing versus hearing a hazard |
    | 4 The Safe | safe; stethoscope | teaching safe, then a real one |
    | 5 The Gallery | wires and their plaque; keypad | plaque beside a teaching panel, then the real plaque elsewhere; keypad code behind a vent |
    | 6 Lights Out | radio; switches | the radio's digit and its keypad slot share a motif; the switches' target card |
    | 7 Night Shift | UV torch; goggles | ink plaques; dark zones |
    | 8 Music Room | music box; earpiece | |
    | 9 The Vault | vault; sync lock | separate wings, hatches, the bell and the lamp |

    The bell, lamp and hatch arrive where the plan places them in rooms 6 to 9, counted against
    that room's two. The current rooms (`01-first-job`, `02-cameras-lasers`, `03-vault`) are
    replaced. Lasers return where a later room has room for them, or are dropped if none does.
11. Side jobs (old FR28) apply from room 4.

**Labels** (replaces FR27)

12. At most three label chips show at once on desktop and two on a phone, for the nearest
    labelled things in sight; the others come back as the player moves. Every new kind (station,
    gear, hatch, bell, lamp, ink, held hands, and the basics in rooms 1 to 3) has a label; labels
    show in whichever room a kind first appears. DESIGN.md 4.6 changes from "a chip for every
    kind in sight" to this cap.

### 2.2 Non-functional requirements

- **Perception and parity:** unchanged from the old spec and CLAUDE.md; the clue paths add view
  fields only through `viewFor`, checked against the role tables.
- **Audio:** the tick and tumbler, static and tone, and the nine key pitches must each be told
  apart by ear (the phase 02 ear review is the test). No speech, no new audio files.
- **Performance:** nine short rooms stay within the measured budget (phase 02 Task 7: 0.30 ms a
  tick on a 60x30 hub).
- **Accessibility:** never colour alone (the target card's lit and hollow lamps; motifs are
  shapes, not colours); phone targets at least 48 px; reduced motion and high contrast as the old
  spec.

### 2.3 Out of scope

- Procedurally generated rooms, a separate tutorial mode, and a stuck-for-N-minutes hint system:
  considered and dropped (§4).
- A start-from-room-4 option for returning crews (considered; not asked for).
- Ambience and music (overhaul phase 07).

### 2.4 Assumptions (confirmed)

- A wrong answer at a real station still sends the team back (old FR15): kept, confirmed by the
  approved demo.
- The leaderboard's version bump (old FR31) covers the new room set; old boards stay reachable.
- `spec/fixtures/drafts/00-stations-draft.room` stays a test bench and is never a level.
- Phase 01 (stations, gear, team mechanics in the sim) and phase 02 Task 7 stand. Phase 02's
  drawing, sounds and HUD (branch `wip/escape-room-02-client`) are reused where they fit.

## 3. Existing context

- Station clues as built: `src/game/sim/stations.ts` (`drawAnswer`, `stationShows`, `noteOf`,
  `tuneNote`, `WIRE_RULES`, `plaqueText`); the vault's answer is `int(SYMBOLS)` per socket, not
  derived from `from`; switches' `answer` is the target but nothing shows it.
- Perception: `src/game/perception.ts` (`viewFor`, `entitiesFor`, `soundsFor`, `actHint`;
  `sign` entities carry `text` that the renderer does not draw).
- Bots: `src/game/bots/brain.ts` (`stationStep` reads `world.stations[...].answer`), jobs in
  `src/game/bots/jobs.ts`; rooms' `hints.jobs`.
- Linter: `src/game/rooms/lint.ts` (presence rule FR1 of the old spec: `hasClue`, `hasFeedback`,
  `readout`, all via `viewFor`).
- Rooms: `rooms/01-first-job.room` (about eleven object kinds in 40 tiles), `02-cameras-lasers`,
  `03-vault`; `spec/rooms.test.ts` (bots clear every rotation).
- Labels: `src/client/labels.ts` (`labelsFor`, `LABEL_COPY`, `ESCAPE_KINDS` on the parked branch);
  `src/client/render/labels.ts` (chip placement).
- The parked phase 02 work: branch `wip/escape-room-02-client` at `c2e4142`, off
  `play-overhaul` at `64f802f`.

## 4. Design

**Clues are designed per station, linted per room, proved by bots that see what a person sees.**
The linter (FR4) catches a missing or undecodable clue before anyone plays; perception-only bots
(FR5) catch a clue that is present but not enough to solve; the human playtest catches whether
it is fun. The old spec had the third and a weak version of the first, and the bots it relied on
for the second read the answers outright.

**Links are found, not told.** A shared motif at both ends (FR3) is the escape-room convention:
the room never says "the radio feeds the keypad", but the keypad's empty slot wears the radio's
symbol. The linter checks the motif exists at both ends; it does not check that players notice
it, which is the playtest's job.

**Teach, then test.** A station type's first appearance is small and forgiving (FR7), so the
dye pack, a team-wide setback, only ever punishes something the team has already met.

**One or two new things a room** (FR9) applies from the very first room, which is why the
basics now take three rooms of their own.

Alternatives weighed:

- **Bots keep reading the sim, plus a stronger linter** (the conventional, cheaper option):
  rejected by the user. A linter can only check that a clue is perceivable; only a bot that must
  solve from its view proves the clue is enough.
- **Explicit links** ("feeds the keypad" tags, filling slots): proposed, rejected by the user as
  not how an escape room works.
- **Fewer station types** to cut building cost: offered; the user kept all eight.
- **Four or six rooms** with gear folded into station rooms: offered; the user chose nine short
  rooms with the basics spread over three.
- **Procedural rooms, a tutorial mode, a timed hint system:** dropped without raising. Procedural
  rooms are too risky for the course timeline and the user wants designed rooms; rooms 1 to 3
  already are the tutorial; a timed hint would undo the implicit links.

### 4.1 UI design

Design pass skipped: the new visuals (plaque text, the target card, drawn motifs, the teaching
safe's lamp) are small additions to components and canvas helpers phase 02 already drew
(`codeSwatch`, `symbolGlyph`, name plates, `turnPad`) with the existing tokens. The phase 02
joint review, rerun on the real rooms, is where they are judged. Label chips: nearest three on
desktop, two on a phone (FR12), placed by the parked branch's nearest-free-spot rule.

## 5. Probes raised and resolved

| # | Type | What was raised | Resolution |
| --- | --- | --- | --- |
| 1 | gap | No station's clue was traced end to end to a person | FR1, FR2: a clue path per station type |
| 2 | gap | Bots reading the sim hid unsolvable stations | FR5, FR6: perception-only bots, per station type (user) |
| 3 | contradiction | Proposed explicit "feeds" tags vs. a real escape room | Implicit links by matching motif (FR3, user) |
| 4 | gap | Implicit links could be unfindable | Matching motif at both ends, linted (FR3, FR4, user) |
| 5 | ambiguity | "Broken up": fewer types, more rooms, or both? | At most two new things a room; all eight types kept; nine rooms (user) |
| 6 | contradiction | "Room 1 as built" vs. room 1 already overwhelming | Room 1 redesigned; the basics spread over rooms 1 to 3 (user) |
| 7 | gap | Labels have no limit; chips pile up | Nearest three on desktop, two on a phone (FR12, user); DESIGN.md 4.6 changes |
| 8 | ambiguity | How forgiving is a teaching station? | Wrong answer re-draws only that station; no dye, no send-back (FR7, user) |
| 9 | gap | Run length with nine rooms | Each room two to four minutes, about thirty in all (user) |
| 10 | assumption | Wrong answer = caught still holds | Kept for real stations (approved demo) |
| 11 | gap | Side jobs were for rooms 2 to 4 | From room 4 (FR11) |
| 12 | gap | Tick and tumbler sound alike | Must be told apart by ear (FR2, NFR audio) |

## 6. Handoff notes for planning

- **Re-plan from phase 02 on.** Phase 01 and phase 02 Task 7 stand. Phase 02 Tasks 8 to 10
  (branch `wip/escape-room-02-client`) are largely reusable: drawing, sounds, labels and HUD
  stay; add the label cap, plaque text, target card, motifs and the teaching lamp; the Act hint,
  gear slot and fixes there are sound. Its Corrections log records why it stopped.
- **Sequencing:** each room is a unit: its station types' clue paths, their perception-only bot
  skills, the linter rules they need, then the room, then a review. Rooms 1 to 3 need no station
  work and can come first.
- **Risks accepted:** perception-only bots are the most expensive part (reading plaques, pitch
  matching, carrying symbols); a room the bots cannot clear is not finished. Nine rooms is a lot
  of authoring; a short run ends with fewer rooms, not broken ones, so rooms ship in order.
- **Not to re-litigate:** implicit links, perception-only bots, nine rooms, two new things a
  room, the labels cap, teaching then real. Roles, channels, gear, holding hands, hatch, bell,
  lamp and the dye pack were settled by the old spec.
- **Human review per room** on a local build, as before; the user plays it.
