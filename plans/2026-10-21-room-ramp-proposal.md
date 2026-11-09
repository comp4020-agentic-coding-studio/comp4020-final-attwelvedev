# Room ramp: a proposal to replace FR12's "one lead role per room" rooms 2 to 4

- **Date:** 2026-10-21
- **Status:** Superseded (2026-10-28) by `specs/2026-10-28-escape-room-heist.md` and ADR 0017. Nothing here was built.
- **Why it exists:** the user's playtest of the `02-blackout` draft, and their ruling on 2026-10-21 that
  the rooms should climb gradually: teamwork and ordinary problem solving first, the senses as the
  twist later, so no role feels like deadweight. Plan `2026-10-19-play-overhaul-06-rooms-results.md`
  (Task 23) builds rooms 2 to 4 around a lead role and a split cue each, and spec FR12 to FR14 say
  so. This proposal changes what Task 23 builds, so it needs a ruling before any room is built, and
  per the execute-plan skill a change this size is `plan-feature`'s to re-plan.

## 1. What the playtest and the measurements showed

1. **Room 2 as drafted was too big a step.** Room 1 teaches a crate, a three-plate door, glass and a
   vent. The draft asked for a timed crossing, a guard, a chime code and a relay, and one mistake sent
   all three players back.
2. **A lead beat made by hiding information leaves someone with nothing to do.** In a dark zone the
   sighted roles see no tiles, objects or players, and Can't hear hears nothing, so they can only wait.
3. **The senses are not symmetric, and the channel table limits what a room can ask for**
   (`src/game/types.ts`):

   | Role | Sends | Receives |
   | --- | --- | --- |
   | Can't see | callout, text, voice, face | callout, text, voice, clip |
   | Can't hear | callout, text, voice, clip, face, mark | face, mark |
   | Can't speak | clip, face, mark | everything |

   Can't see never sees faces or marks. The only thing that reaches Can't hear from Can't see is a
   face, about nine emotions with no direction in it. Guiding Can't hear through a dark room is only
   possible with Can't speak's marks.
4. **A plate can't be found by ear.** It clicks once when pressed (range 8) and hums only for whoever
   stands on it, so a hearing role can't locate one from a distance. The clue chime is the only sound
   that repeats on its own with a bearing.
5. **A laser's hum reaches any hearer within 3 tiles**, so a timing puzzle built on beams leaks to the
   hearing roles, and the darkness did not stop it.
6. **The bots take nothing from another role's messages**, so they can show a room is clearable but
   not that a role is needed. FR14 is already weakened to a room lint rule (the user's "c2" ruling).

## 2. The principle

**Early rooms root the challenge in teamwork that works the same for any role. Later rooms take the
senses away.** A room is hard because of the puzzle, so no role holds the answer, and from room 3
on, the senses are added as a second layer.

One limit stays throughout: **Can't see never sees the puzzle.** So no puzzle may leave Can't see
as a pure receiver of instructions. They have to be a body the puzzle cannot run without.

## 3. The ramp

| Room | The challenge | Senses | Hazards | A mistake costs |
| --- | --- | --- | --- | --- |
| 1 First Job (built, accepted) | the objects: crate, plates, a three-plate door | glass and a vent, taught with labels | a camera and a guard, easy | the checkpoint |
| 2 (new) | ordinary teamwork: someone has to stay behind | none leaned on | none | nothing |
| 3 (new) | teamwork plus one sense at a time | lead: Can't hear (alarm), one split cue | cameras | the checkpoint |
| 4 (new) | the senses are the puzzle | twin cue, lead: Can't speak; dark returns | guard, lasers | the checkpoint |

### Room 2: ordinary teamwork, no hazards (proposed puzzle: an airlock)

- Two chambers, each with a door that opens only while a plate in the other chamber is held.
- To cross, someone stays on a plate while the others go through, then someone in the second chamber
  holds the other plate while the last person crosses. It needs three bodies and a plan about who stays.
- A crate holds one plate down, so the puzzle has a second layer. A crate in the wrong place jams a
  corridor, which makes the order matter.
- Can't see is a body that holds a plate. The room does not need them to read anything.
- No hazards, no dark, and no catches, so the room is safe to get wrong.

Other shapes that use only existing objects, if the airlock is not liked: a **crate relay** (two
crates and three plates behind one door, where a wrongly placed crate jams), and a **code from two
places** (a sign shows an order, plates sit at least 3 tiles apart, one person reads and relays).
The code needs the sequence-door sign, which `03-alarm` also wanted, so I would not use it here.

### Room 3: teamwork, then the alarm (lead: Can't hear)

- Keep the plan's alarm room: an alarm plate the route must cross, during which cues are drowned for
  hearers and cameras lock on.
- Can't hear is unaffected by the alarm and sees cameras through glass, so they lead.
- The split cue is the sequence sign seen through glass, as the plan has it.
- It adds one sense-based idea on top of an airlock-style layout. Cameras, no guard.

### Room 4: the senses are the puzzle (lead: Can't speak)

- The plan's twin-cue room: three doors, one hums, and only Can't speak both sees which door is
  marked and hears which one chimes.
- Dark and lasers return here, because by now the team has the channel habits. The hazards were the
  piece that made the draft of room 2 too hard.
- A held sequence at the vault.

## 4. What this changes in the plan and spec

| Item | Today | Under this proposal |
| --- | --- | --- |
| FR12, room 2 | dark, led by Can't see, with a split cue | an airlock; the dark moves to room 4 |
| FR12, "every role leads once" | rooms 2, 3, 4 | Can't hear leads room 3, Can't speak room 4; **Can't see leads no room** |
| FR14 | every lead beat needs its role | unchanged as already weakened ("c2"); room 2 has no lead beat |
| Linter: `leads: true` | all three roles lead a beat | would fail room 2; needs `leads` dropped for it, or a rule that two roles lead |
| Task 28 | bots proved on a dark room | proved on the airlock; the dark proof moves to Task 23's room 4 |
| Plan §4 room designs | four rooms, each led | rewrite of rooms 2 to 4 |

**The hole this leaves: Can't see leads nothing.** The spec's intent is that every role leads once.
Giving Can't see a lead needs the dark, and the dark is exactly what made room 2 too hard. Options:
(a) accept that Can't see leads no room and is the body the puzzles need, (b) give Can't see a short
dark beat inside room 4 (the dark returning there is the natural place), or (c) put a small dark
beat late in room 3. I would take (b), but it is the user's call.

## 5. What I have not checked

- That an airlock is a good puzzle for three people. It is a proposal from reading the objects.
- That the bots clear it. Plates held by someone who must stay, and a crate on a plate, are in the
  existing job system, but a "stay behind while others cross" job is not something I have seen a bot do.
  I would need to read how `after` and `until` work and build and measure it.
- Whether the ramp is too gentle. Room 2 has no hazards, so it may feel like a step back from room 1.
- Anything about the later rooms' layouts. Only room 2 is specific enough to build.

## 6. Decisions needed

1. Accept the principle in section 2 and the ramp in section 3, or change them.
2. Room 2's puzzle: the airlock, the crate relay, or something else.
3. Where Can't see gets a lead, if anywhere: (a), (b) or (c) above.
4. Whether to send this to `plan-feature` as a re-plan of Task 23, or to amend the plan in place.
