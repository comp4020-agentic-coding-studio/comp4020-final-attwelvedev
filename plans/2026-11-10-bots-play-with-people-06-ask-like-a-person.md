# Bots and people: Phase 06, a bot asks the way a person would (no bot-only chip)

- **Status:** Approved
- **Tier:** Architecture (it reverses a rule in ADR 0031)
- **Overview:** `plans/2026-11-10-bots-play-with-people-00-overview.md` (§1 rules). Spec: BT1, BT2.
- **Why this phase exists:** in the owner's playtest (2026-11-11) the ask chip floated above the Can't see bot, moved jerkily, showed even with Labels off, and no human has such a thing. The owner's ruling: **a bot asks exactly the way a person would, with no exceptions and no bot-only UI.**

## Owner decisions (binding; do not re-ask)

1. **Can't see and Can't speak:** the ask is a spoken line, and a caption (Can't see gets the caption too: Task 311 of phase 05). No chip.
2. **Can't hear:** the ask is a **Desperate face (`f06`)** popping over the asking bot, sent the way any player's face is, and repeated on the ask clock (8 s, 16 s, then every 30 s, as BT3). **No text chip, no special face, no special UI.** It may be mistaken for a teammate's panic; the owner accepts that, it is the nature of these sensory limits.
3. **Can't speak is on the team** and should notice a Can't hear teammate's need and help on request; nothing extra is built for that.
4. **The stand-in as Can't hear infers from sight.** It is not told the ask's kind. It gets only what a real Can't hear person gets: a face from a bot, and its own view of the room. Some Can't hear combinations may stop clearing; that is a real playability finding, not a defect of the test. Log each one, and leave it in `NOT_YET` with its measured cause. Do not hand the stand-in the kind to make it pass.
5. **Labels off** has nothing left to hide, because there is no ask chip.

## What you'll see

- No chip above any bot. Can't see hears the ask and reads it as a caption; Can't speak reads it; Can't hear sees a Desperate face pop over the bot and re-pop on the clock.
- The face follows the figure smoothly, because it is drawn the way every player's face is.

## Facts already established (check them, they may have moved)

- Asks are a private per-seat view field `you.asks` (`asks.ts`, `perception.ts`), never a channel message. Who gets what: `stop-on-click`, `read-plate`, `plate-first` go to Can't see; `steer-me` and `count-turn` go to **Can't hear only**; `press-marked`, `strike-marked`, `taking-over` go to whichever person owns the job.
- `RECEIVES` (`types.ts`): Can't hear takes faces and marks only. Bots can already send a face (`{ method: "face", id }`, `Outgoing` in `net/game.ts`; `brain.ts` sends `f02` when cleared).
- The chip: `labelsFor` in `src/client/labels.ts` (the `asking` list, `kind: "ask"`, always shown even with labels off, `bp02/301`), drawn through `Game.tsx` (`rt.labels`, line ~258).
- The spoken line and Can't speak's caption: `Game.tsx` effect near line 956 (`role === "deaf"` returns early today; Task 311 added Can't see's caption).
- A face pop lasts `FACE_POP_MS` (1.5 s, `channels.ts`), shown through `Game.tsx` (`pops`, ~line 237).

## Tasks

### Task 312: A Can't hear person is asked by a face, and the chip goes (BT1, BT2, decisions 1, 2, 5) — [ ]

- **Behaviour:**
  - Remove the `ask` chip: delete the `asking` list in `labelsFor`, the `asks` parameter, the `"ask"` label kind and its placement code, its `rt.roomKinds` exception in `Game.tsx`, its ASK_COPY `chip` strings, and the tests that pin them (replace, never weaken: each now asserts there is no chip).
  - When a bot's ask is due for a seat whose role is Can't hear, the bot **sends** `{ method: "face", id: "f06" }` on the same clock (`askFor`/`reaskDue`: first ask, 8 s, 16 s, then 30 s; held while the person is at the spot; never within `ASK_QUIET_MS` of a perceived message; reset on progress). The face goes to Can't hear through the normal channel path, so it is a message like any player's: it shows over the bot, it appears in the Can't hear person's feed as faces do, and it counts as heard for other bots' quiet window (check that this does not stall the bots' own sends; if a bot-sent face makes other bots wait, exempt it and log why).
  - `you.asks` is no longer delivered to a Can't hear seat (they receive no words and no kind). It still reaches Can't see and Can't speak for the spoken line and the caption.
  - Only one bot-sent ask face per bot at a time; a second bot asking at the same moment is fine.
- **Files:** `src/client/labels.ts`, `src/components/Game.tsx`, `src/game/asks.ts` (drop `chip`), `src/game/perception.ts` (no asks to Can't hear), `src/game/bots/brain.ts` (`askFor`, the send), `src/game/bots/crew.ts` and `src/net/game.ts` if the ask must become an outgoing face there, DESIGN.md (the ask chip entry is replaced by this).
- **Tests first (red):**
  - `labels.test.ts`: with asks pending and Labels on or off, no `ask` label exists
  - `perception.test.ts`: a Can't hear view never carries `you.asks`; Can't see's and Can't speak's still do
  - `brain.test.ts`: a Can't see bot at a standstill with a person as Can't hear: a `face f06` goes out at the first ask, at about 8 s and 16 s if nothing changes, and stops once the person steers
  - `brain.test.ts`: `count-turn` and `press-marked` for a Can't hear person also go as a face
- **Break check:** by script, make the bot send no face; the brain test goes red. Put the chip back; the labels test goes red.
- **Acceptance:** `spec/rooms.test.ts` green in every rotation (all-bot runs have no person, so no asks and no faces), `pnpm check` green.

### Task 313: The words of an ask are said the way a person would say them (decision 1) — [ ]

- **Behaviour:** rewrite `ASK_COPY.say` for the kinds Can't see and Can't speak receive (`stop-on-click`, `read-plate`, `plate-first`, `press-marked`, `strike-marked`, `taking-over`) in the plain words a teammate would use, each still naming the route and never carrying a digit, band, wire, note or answer. Keep them short; a caption is on screen for `CAPTION_MS`.
  - `steer-me` and `count-turn` go only to Can't hear, who gets no words: their `say` is never shown. Keep the text only as a test fixture and say so in a comment, or remove it if nothing uses it (check `Game.tsx` and the tests).
  - The ask is shown to Can't see and Can't speak even when "spoken lines" is off and captions are off? **No**: speech follows the spoken-lines setting and the caption follows the captions setting (Task 311), the same as any teammate's line.
- **Files:** `src/game/asks.ts`, its test.
- **Tests first (red):** the copy test: every `say` is non-empty, contains no digit, and each names a route (wheel, Talk, Text, a button) where one is needed.
- **Break check:** put a digit in one line by script; the test goes red.

### Task 314: The stand-in as Can't hear infers from sight (decision 4) — [ ]

- **Behaviour:** `standin.ts` gives a stand-in as Can't hear **no ask kind**. Today it reads `you.asks`; after Task 312 a Can't hear view has none. It sees a Desperate face over a bot and its own view of the room, and acts as a person would: if a face comes from a Can't see bot that is standing still, steer it (callouts toward its goal as the guide does for a person); if a bot's face comes while a counter or a switches/bells watcher is waiting on it, do that job. Write down in a comment exactly which conclusions the stand-in draws and from what it sees. If an inference cannot be drawn from what a real person would see, the stand-in does **not** act: that is the finding.
  - Re-measure `spec/rooms-people.test.ts` with every Can't hear combination. For each that stops clearing, keep or add its `NOT_YET` entry with the measured cause and the phrase `owner question: how does a Can't hear person learn what a bot needs?` (overview §1 rule 1: a measured new failure is written down with why). Do not give the stand-in the kind.
- **Files:** `src/game/bots/standin.ts`, `standin.test.ts`, `spec/rooms-people.test.ts`.
- **Tests first (red):** a stand-in as Can't hear, a Can't see bot standing still and a face arriving: it steers; with no face it does not; with a face and nothing waiting it does nothing.
- **Break check:** by script, hand it the kind again; a "does not act on the kind" test goes red.
- **Acceptance:** `pnpm check` green; the `NOT_YET` counts before and after are logged; time both rooms files.

### Task 315: ADR 0031 and the spec say what changed — [ ]

- **Behaviour:** amend `doc/adr/0031-bots-play-at-a-persons-pace-and-teach-what-they-need.md` (add a dated amendment, do not rewrite history) and `specs/2026-11-10-bots-play-with-people.md` (BT1, BT2): a bot asks as a person would, by a spoken line or caption, or by a Desperate face for Can't hear; there is no chip. Update CLAUDE.md and DESIGN.md wherever the chip is described. Log the reversal in the decisions log under `bp06/ADR`.
- **Acceptance:** no remaining mention of an "ask chip" in CLAUDE.md, DESIGN.md, the spec or the ADR's current-state text, except the dated amendment.

**Human review:** a real playtest with you as Can't see (hear the ask, read it as a caption), and with you as Can't hear and a bot Can't see standing still (does the Desperate face make you look, and is it clear enough to steer?). Queue it under `## Bots and people`.

## Phase Definition of Done

Tasks 312–315 are ticked or parked, `pnpm check` is green, `spec/rooms.test.ts` is green in every rotation, and the human review is queued. Then commit `Unit done: bp06`.

## Corrections log

(empty)
