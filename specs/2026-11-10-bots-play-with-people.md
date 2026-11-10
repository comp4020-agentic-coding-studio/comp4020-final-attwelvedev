# Bots that play well with people

- **Date:** 2026-11-10
- **Status:** Approved
- **Approved by user:** yes, 2026-11-10 (in `/brainstorm-feature`, after their room 4 playtest with two bots)
- **ADR:** `doc/adr/0031-bots-play-at-a-persons-pace-and-teach-what-they-need.md` (accepted 2026-11-10)

## 1. Problem / intent

The user played room 4 as Can't see with two bots and found the safe unplayable:
- The bot turner moves a notch every ~450 ms, so a person can't send "Stop" in time.
- Nothing tells a person that they must send Stop at all, or how.
- Bots don't understand natural language or voice, and there's no invented team language for a person to fall back on.

The user's words: "A human playing with two bots will find this room impossible and unplayable."

A read-only survey of every room × every human seat (2026-11-10, summarised in §3) found the problem is general. Bots were written to play with bots: fixed bot-speed timing, conventions nobody explains, and job splits that can hand a person a job whose signal they can't even receive.

**Intent:** a person playing with one or two bots can clear every room without knowing the bots' internals. The bots wait at a person's pace, tell the person what they need and how to send it, repeat that when it's missed (without spamming), never give a person a job they can't do, and take over a job a person isn't doing. The bots stay perception-only (ADR 0018), and the game's rules and penalties stay the same.

## 2. Requirements

### 2.1 Functional requirements

**Who counts as a person.** Every rule below is decided **per teammate**: "is the seat this bot is waiting on, or talking to, a person?" (`BotMemory.humans`). It isn't decided per game. One person with two bots, and two people with one bot, both follow from that.

**Pace**
- **BP1.** When a bot's next step waits on a person's signal, it allows a person's reaction time:
  - **The safe (dial) turner** turns a notch about every **2 s** when its listener is a person.
  - **The safe turner credits a late Stop:** a Stop from the listener that arrives up to **~1 s** after a turn is taken as the notch showing just before that turn, from the bot's own record of its turns.
  - **The sync lock (room 9):** when the person turns, the bot counts down at a person's pace, so they can turn on "1" within the lock's 500 ms window. When the person counts ("1" by text), the bot turns as it does today.
  - **Any other timed bot behaviour the plan's audit finds** gets the same treatment.

  With only bots in the crew, timing is unchanged.
- **BP2.** A late-credited Stop is only accepted **after the bot's ask for it** (BT1) and while the listener is at the listen spot. A Stop sent earlier, for example while being guided there, never counts as "on the number".

**Teaching: the ask**
- **BT1.** When a bot needs something from a person, it sends that person an **ask**: what it needs, and **how to send it** (the wheel option or key). For example:
  - "Listen for the click. Say Stop (wheel: Q, then Stop) when you hear it."
  - "Read the plate, then text me its number."
  - "Plate's number first, then the tune."

  The ask goes to the person whose signal it needs, in a channel that person receives: text or voice for Can't see and Can't speak. A person who receives no words (Can't hear) gets the chip (BT2) only.
- **BT2.** The person the ask is for also sees an **ask chip** on the bot that asked, if they're sighted.
  - It uses the existing label chip.
  - It stays up until the ask is answered.
  - **A chip says what to do and how, never game information.** No digit, band, wire, note or answer is ever on a chip. This keeps ADR 0007 and ADR 0011 intact: Can't hear still receives no text-borne information.
  - The other person, in a two-person game, doesn't see chips meant for someone else.
- **BT3. Re-asks:** an unanswered ask repeats at **8 s, then 16 s, then every 30 s** while there's no progress on it.
  - **Progress** is measured on the station or job, not on who made it, so a teammate helping counts.
  - Progress resets the cadence.
  - The re-ask **holds while the person is at the spot doing it**, for example standing at the safe's back or at the plate.
  - It never goes out **within 2 s of any message the bot can perceive**, including messages between two people.
  - Marks a bot sends once today (room 6 switches, room 8 bells) re-send on this cadence while unanswered.

**Accepting a person's signal**
- **BS1.** A bot counts a person's digit or word for a station only if it comes:
  - **from the seat it asked**,
  - **after its ask**,
  - and **since the last send-back**, which clears old digits for every station type, not just earpiece keypads.
- **BS2.** A bot acts on a person's digits **~2 s after the last one**, so a correction replaces a mistake. The ask states the order wherever order matters (room 8 earpiece: "plate's number first").
- **BS3.** Digits two people text each other never feed a bot's station, unless that bot asked that sender for them.

**Jobs**
- **BJ1. Assignment:** a person is never assigned a job unless they can **receive every signal it needs**, not just work the station. For example, Can't hear is never given the safe, the plated radio or the plated wires. Such jobs go to a bot that can.
- **BJ2. Takeover:** if a person's job makes no progress for **~60 s** after its first ask, a bot that can do it takes it over and says so (through BT1's channels). If no bot can, the asks continue.
- **BJ3. Steering:** where a person is the only one who can steer the Can't see bot (a human Can't hear), the Can't see bot asks for steering. Its chip reads "Steer me: send directions from the wheel (Q)", and it re-asks under BT3 instead of silently freezing.

**Guard**
- **BG1. A human stand-in in `spec/rooms.test.ts`.** A scripted "person":
  - reacts ~1 s late
  - knows no bot conventions
  - acts only on asks and what its role perceives
  - sends only wheel options

  Every room must clear:
  - with **one stand-in and two bots**: the stand-in in each seat, in every rotation
  - with **two stand-ins and one bot**: the bot in each seat, in one rotation

  Today's all-bot runs stay as they are.

### 2.2 Non-functional requirements

- **Bots stay perception-only (ADR 0018).** Late credit uses the bot's own turn log, never the simulation's state.
- **Perception (ADR 0007, ADR 0011).** No new channel. Asks travel by existing methods to roles that receive them. Chips carry no game information (BT2).
- **Logging.** Asks are ordinary channel messages, so there are no new log fields. Any new socket event goes through `logGame`.
- **Test time.** BG1 roughly triples or quadruples `spec/rooms.test.ts` (today ~15 s). It must stay under the slowest browser spec file; if not, split it into its own file per CLAUDE.md "Tests".
- **Accessibility.** Ask chips meet the label chip's existing rules: 11 px floor, not clipped, at 375 and 1280.

### 2.3 Out of scope

- **Bots understanding voice or free text.** Asks name wheel options instead.
- **Softer penalties.** A wrong entry made on a person's signal still gets the team caught (user's ruling).
- **New wheel options or callouts,** unless the plan's audit finds a needed signal with no wheel option. Then it comes back to the user as a backlog line, not built here.
- **Phase 06's fixes:** the guide pacing at the listen tile, keep-alive noise, nudge quiet window and overlays are already in progress.
- **Turn-taking** (ask, then a Yes/No each step). This is only a fallback the plan may propose for a timing window BP1 can't make fair, and only with the user's yes.

### 2.4 Assumptions (confirmed)

| Assumption | Confirmed by |
| --- | --- |
| Bots know which seats are people (`m.humans`). | Code (`brain.ts:70`, `net/game.ts:94-98`) |
| Bots ignore voice and faces for stations. | Survey (`brain.ts:294`, `decode.ts:81-131`) |
| Penalties stay as they are. | User |
| The ~2 s pace, ~1 s late credit, ~2 s settle, 8/16/30 s re-ask, ~60 s takeover. | User (pace, re-ask) and recommended defaults accepted at approval. The plan may tune them by measurement, logged. |

## 3. Existing context

From the 2026-11-10 survey: code reading plus `claimJobs` run read-only for every room × human role × rotation.

**Rules that apply everywhere:**
- Jobs are claimed once (`brain.ts:651-669`), and people pick first by distance (`jobs.ts:414-428`).
- `eligible` (`jobs.ts:362-372`) checks working a station, not receiving its signal.
- There's no takeover, except caches after 60 s.

**Human-pace logic exists only in the guide** (`guideBlind`, `blindIsBot`, `brain.ts:1496`), not in station work.

**Dependency rows:**
- **R4 safe Q2, Can't see's Stop** (`decode.ts:151-156`; turn pacing `brain.ts:1350`, `TURN_WAIT_TICKS` = 8 → ~450 ms):
  - a late Stop means a wrong entry and the team is caught
  - an earlier Stop also counts
- **Can't hear assigned jobs it can't receive:** R4 Q2 (and cache safes R4 Q3, R9 Q8), R6 Q3 plated radio, R7 Q3 plated wires.
- **Plated stations use the last digit from anyone** (`decode.ts:186, 283, 316`): R5 Q3, R6 Q3, R7 Q3, R9 Q7. Stale digits survive a send-back (`brain.ts:1146-1151` clears earpiece only).
- **R8 earpiece keypad** assumes the plate digit comes first (`decode.ts:252-266`).
- **R8 bells:** any `x` mark is struck (`decode.ts:121-127`). Bot marks are sent once (`brain.ts:1248-1264`), and so are R6 switch marks.
- **R9 sync lock** (`stations.ts:529-557`, `decode.ts:469-504`): a 500 ms window and the bot's "3, 2, 1" count.
- **A human Can't hear must steer the Can't see bot in every room.** The bot holds after 5 s with no callout (`brain.ts:178, 314`).
- **R7 dark lamps:** a bot watcher without goggles may see nothing (inference, not run).
- **Nothing tells a person the protocol:**
  - room `intent` text is never shown (`rooms/format.ts:405-425`)
  - labels and act hints are mechanics only
  - `BrailleCard` says "Match each to the key"

## 4. Design

- **Pace (BP1–BP2):**
  - A bot that waits on a person's signal uses person timings. The turner keeps a short log of `(tick, setting)` for its own turns, to credit a late Stop.
  - "After the ask" is a per-station mark in the bot's memory.
- **Asks (BT1–BT3):**
  - An ask is a structured bot intent: `{ need, how, to: seat, station }`.
  - It's rendered as a text or callout to the target, or only as a chip when the target receives no words.
  - The chip goes through the existing labels path, drawn on the asking bot's figure, for the target seat only. Its copy is fixed per kind of need, so it can never carry game information.
  - Re-ask state lives per ask: `askedAt`, `count`, last progress, and an `atSpot` hold. Its gap follows 8 s, 16 s, then 30 s.
  - The 2 s quiet window uses every message the bot perceives.
- **Signals (BS1–BS3):**
  - Station beliefs keep **who** sent each digit and **when**.
  - The decoders filter by asked seat, after the ask, and since the last send-back.
  - Entry waits for a 2 s settle.
- **Jobs (BJ1–BJ3):**
  - `eligible` gains a "can receive what this job needs" check. Each job kind declares the signal it needs.
  - Takeover re-runs claims for a job with no progress for 60 s, restricted to bots that can do it.
  - Steering asks come from the Can't see bot.
- **Guard (BG1):** a stand-in player module in the bots test harness (`solve.ts`'s side), reusing perception views. It acts on asks with a ~1 s delay, and on its role's own perception the way a novice would.
- **Alternatives considered:**
  - *Turn-taking (Yes/No per step):* slower; kept only as a fallback.
  - *Swapping roles so the person turns:* impossible, since only the stethoscope holder at the back hears the tumbler.
  - *Teaching in room labels for everyone:* not bot-specific, and misses the moment.
  - *Softening penalties:* rejected by the user.
  - *A one-off audit instead of a standing guard:* rejected. Future rooms would regress.

### 4.1 UI design

**Design pass skipped:** the ask chip reuses the existing label chip (`src/client/labels.ts`, the same renderer as "Space: hold hands"), anchored on the asking bot. Its copy follows DESIGN.md's copy rules.

## 5. Probes raised and resolved

| # | Type | What was raised | Resolution |
| --- | --- | --- | --- |
| 1 | gap | The person misses the ask (looks away, reading braille) | BT3 re-ask at 8/16/30 s, held at the spot, reset on progress (user) |
| 2 | ambiguity | "Tell me what you need": what or how? | The ask states how: the wheel option or key (user) |
| 3 | contradiction | A chip on Can't hear's screen against "Can't hear receives no text" | A chip says what or how, never game information (approved) |
| 4 | gap | A person given a job they can't receive (R4, R6, R7) | BJ1: never assign it (user) |
| 5 | gap | A person who never does their job stalls the room | BJ2: takeover at ~60 s (user) |
| 6 | gap | Stray, early or stale digits get the team caught | BS1–BS3: from the asked seat, after the ask, since the send-back, 2 s settle (user) |
| 7 | assumption | A wrong entry should be softened | No: caught as now (user) |
| 8 | gap | Two people and one bot | Every rule is per teammate. The ask goes to one person; digits between people are ignored; progress is counted on the station; the 2 s quiet window covers people's messages. Tested with the bot in each seat, one rotation (user) |
| 9 | gap | Voice is ignored by bots | Out of scope. Asks name wheel options |
| 10 | gap | A needed signal with no wheel option | Goes to the user as a backlog line; not built here |
| 11 | gap | Test time | Split the stand-in runs into their own file if they become the slowest |
| 12 | gap | R7 dark lamps, bot watcher without goggles | The plan's audit row; covered by BJ1 and BG1 |

## 6. Handoff notes for planning

- **Sequencing:**
  1. BG1's stand-in **first**, red on today's code. It is the measure for every later phase.
  2. Then BJ1 (assignment).
  3. Then BS1–BS3 (signals).
  4. Then BT1–BT3 (asks and chip).
  5. Then BP1–BP2 (pace).
  6. Then BJ2–BJ3 (takeover, steering).

  Each phase should turn some of BG1's failing rooms green.
- **Don't re-open:** penalties stay; voice stays out of scope; the chip carries no game information; the cadences above (tune them only by measurement, logged).
- **Phase 06** (`plans/2026-11-10-playtest-3-fixes-06-…`) touches `brain.ts` (guide quiet at the listen tile, keep-alive, quiet window). Start this work after p3fix06 is merged into the branch.
- **Risk:** stricter signal acceptance (BS1) could break today's all-bot clears where a bot relied on an unasked digit. `spec/rooms.test.ts` all-bot runs must stay green throughout.
- ADR 0031 is accepted (2026-11-10).
