# Bots help work a cache once people uncover it

- **Date:** 2026-11-07
- **Status:** Approved
- **Approved by user:** yes — 2026-11-07
- **Tier:** Architecture. It lifts caches FR8 (`specs/2026-11-02-escape-room-caches.md`) and the bots
  clause of ADR 0020; ADR 0024 (proposed) records the decision.

## 1. Problem / intent

The user reviewed the phase 14 demo and found room 4's cache dial cannot be done (backlog
2026-11-05). The backlog put the cause down to Can't see having no way to say "now". That is wrong
for people, who can speak. The real cause shows only with bots in the crew. A dial cache needs two
people: one at the safe's back with the stethoscope, listening for the tumbler, and one at the dial,
turning it and entering the digit. Caches FR8 keeps bots out of every cache ("bots never uncover,
enter, work or take a cache"). So one person with two bots can never finish it, and the same is true
of any cache that needs two seats.

The user wants bots to help with every cache, as soon as a person has uncovered it.

## 2. Requirements

### 2.1 Functional requirements

- **FR1 Uncovering stays human.** No hint job may lead a bot to uncover a cache: nothing that does
  what ADR 0021's reveal asks. A crew of only bots never opens a chamber, and each room's all-bot
  clear is unchanged.
- **FR2 Cache jobs.** A hint job may carry `"cache": "<station id>"`. Such a job is active only
  while that cache is uncovered and not yet done (its keepsake taken, or its vault open and the job
  is not the take). Only a cache job may:
  - name a cache's station (`station`, `listen`, `watch`)
  - have a tile (`at`, `read`, `to`, `goTo`) inside a chamber or its vault
  - be a take-keepsake job (FR5)

  The linter rejects these on a job without `cache`, as today, and rejects a `cache` field that names
  something that is not a cache. A cache job's `beat` is the beat of the room the chamber hangs off
  (the beat whose x range holds the chamber's door).
- **FR3 Straight away.** On the tick a bot perceives a cache uncovered (the `uncover` event and the
  map sent again, never the simulation's state), it leaves its current beat's job and starts its
  cache jobs. When its cache jobs are done, it goes back to the job it left. A send-back that shuts
  the chamber ends its cache jobs and returns it to its beat job. A send-back that leaves the chamber
  open (a checkpoint after the uncover) lets its cache jobs carry on.
- **FR4 Solved by perception.** A bot works a cache's station with the decoder its station type
  already has (`src/game/bots/decode.ts`), from what it perceives and what teammates send (ADR 0018).
  A wrong answer jams and redraws the cache (blind-purpose FR13), and the bot tries again after the
  jam.
- **FR5 A bot owner takes the keepsake.** A new job kind, `"keepsake": "<cache station id>"`, sends
  the owner seat's bot to the vault's item tile once the vault is open, and makes it Act there. It is
  claimed only by the owner seat, and only when that seat is a bot. The take counts loot, fills the
  keepsake slot and shows on the shelf exactly as a person's take does.
- **FR6 People choose first.** Cache jobs are shared out like beat jobs (`jobs.ts`): humans choose
  first, then `prefer`, then the bot with the fewest jobs. Every station job's role must perceive
  what it needs: Can't hear never listens, Can't see never reads a plaque.
- **FR7 Six rooms.** Rooms 4 to 9 each get a set of cache jobs that let any one person plus two bots
  finish the cache, whichever role the person plays, provided the person's role is not the only one
  needed somewhere the person cannot be. If a role a station needs is the person's, the person does
  that part and the bots do the rest.

### 2.2 Non-functional requirements

- No new sound, view field or socket message. Perception (ADR 0007, 0012) and the parity table are
  unchanged.
- The full check's time stays within today's range. The new tests go in their own file per area.
- Bots read nothing but their view and inbox (ADR 0018). The layering test still passes.

### 2.3 Out of scope

- Bots uncovering a cache, or helping to (FR1).
- Bots asking for help, or people asking bots (no new callout).
- A cue a person can use alone, without bots.
- Changes to what a cache is, how it uncovers (ADR 0021), its riddle, or its reward.

### 2.4 Assumptions (confirmed)

- Bots help on all six caches, not only the dials. Confirmed by the user.
- A bot owner takes its own keepsake. Confirmed by the user.
- Bots start on the cache as soon as it is uncovered, not after the beat. Confirmed by the user.
- A cache whose uncover clue only a bot's role perceives stays unopenable. Accepted by the user when
  approving the design.
- Every cache station type (dial, keypad, switches, wires, bells) has a bot decoder already. Checked
  in `src/game/bots/decode.ts`. Each set of room jobs is proven by FR7's test, not assumed.

## 3. Existing context

- `src/game/bots/jobs.ts` `parseJob`: two checks enforce FR8 today. One rejects a job tile inside a
  chamber ("bots never go in"). The other rejects `station`/`listen`/`watch` on a cache ("bots never
  work a cache"). Jobs are split per beat by `assign` (humans first, then `prefer`, then fewest).
- `src/game/bots/brain.ts`: Can't see holding the stethoscope calls `stop` on the tumbler. The dial
  decoder in `decode.ts` takes a blind `stop` as "the dial is on the number". The safe in room 4's
  main beat already uses this pair, so a dial cache needs only the jobs, not new decoding.
- The caches, from the room files:

  | Room | Cache | Type | Owner seat |
  | --- | --- | --- | --- |
  | 4 The Safe | Q3 | dial | 1 |
  | 5 The Gallery | Q4 | keypad | 2 |
  | 6 Lights Out | Q5 | switches | 3 |
  | 7 Night Shift | Q7 | wires (numbered plaque) | 1 |
  | 8 Music Room | Q4 | bells | 2 |
  | 9 The Vault | Q8 | dial | 3 |

- ADR 0021 changed uncovering from a motif tile to the team working out the room. ADR 0020's bots
  clause is the part ADR 0024 supersedes.
- `src/game/rooms/ids.test.ts` guards ids. Adding jobs does not move a letter, but any chamber tile
  change must keep ids where they are.

## 4. Design

**Jobs.** `Job` gains `cache?: string`, and `JobTarget` gains `{ kind: "keepsake"; cache: string }`.
`parseJob` lets a job carrying `cache` pass the two FR8 checks, and checks that the named cache
exists and that a keepsake job names a cache. The room hints of rooms 4 to 9 gain their cache jobs.
For room 4 that is:

- a `listen` at `Q3`'s back for blind, after the stethoscope
- a `station` on `Q3` for mute
- a `tow` of blind to the back for deaf
- a `keepsake` for `Q3`

**Brain.** A bot keeps two queues: its beat queue (today's) and its cache queue. On the tick it
perceives an uncover, it parks the beat job and runs the cache queue. When the cache queue is empty,
or the chamber shuts, it takes the parked job up again. "Uncovered" and "done" come from the bot's
`Known`: the uncover event, the doors it has seen or heard open, and the loot or stash event.

**Alternatives considered** (also in ADR 0024):
- a cue a person can use alone, without bots
- bots that help only when asked
- bots helping on dial caches only
- bots that also uncover

Each was rejected for the reasons in the ADR.

### 4.1 UI design

None: no UI. Bots walking into a chamber is drawn as any figure walking.

## 5. Probes raised and resolved

| # | Type | What was raised | Resolution |
| --- | --- | --- | --- |
| 1 | contradiction | The backlog says Can't see cannot say "now", but people playing Can't see can speak. | The failure shows only with bots: FR8 leaves a person alone with a two-seat station. |
| 2 | gap | FR8 and ADR 0020 are accepted rules. | This is Architecture, with ADR 0024 superseding 0020's bots clause. |
| 3 | ambiguity | Dials only, or every cache? | All six (user). |
| 4 | gap | Who takes the keepsake when the owner is a bot? | The bot owner takes it (user), as FR5. |
| 5 | ambiguity | When do bots go to the cache? | Straight away, then back to the beat (user), as FR3. |
| 6 | gap | Could bots uncover, so a crew of only bots finds caches? | No: uncovering stays human (FR1). |
| 7 | gap | A cache whose uncover clue only a bot's role perceives. | Accepted as unopenable (user). |
| 8 | gap | A send-back while bots are in a chamber. | FR3: a shut chamber returns them to the beat. An open one keeps them on the cache. |

## 6. Handoff notes for planning

- Do not re-litigate: bots never uncover; bots work every cache once it is uncovered, straight away;
  a bot owner takes its keepsake; no new message or sound.
- Order: the job parsing and linter change first (test-first, against room 4), then the brain's two
  queues, then room 4's jobs with FR7's test, then rooms 5 to 9 one at a time. Each room edit runs
  `pnpm lint:rooms`, `spec/rooms.test.ts` and `src/game/rooms/ids.test.ts`.
- FR7's test: per room, one human seat that is scripted to do the uncover and nothing else (so the
  bots must do the station), for each role the human could play, plus the existing all-bot clear.
  Show it red first by removing one room's cache jobs.
- Risk: a send-back mid-cache is the likeliest way for the bots to get stuck. Test it on room 4.
- When ADR 0024 is accepted, set 0020's status to add "its bots clause superseded by 0024".
- After this lands, move the backlog line of 2026-11-05 to Decided, pointing here.
