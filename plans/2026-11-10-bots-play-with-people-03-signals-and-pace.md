# Bots and people: Phase 03, strict signals, a person's pace, and every station's ask

- **Status:** Approved
- **Tier:** Architecture
- **Overview:** `plans/2026-11-10-bots-play-with-people-00-overview.md` (§1 rules, §4 types). Spec: BS1–BS3, BP1–BP2, BT1 and BT3 per station, BJ3.

## What you'll see

- **Room 4's safe with a person listening:** the bot turns about every 2 s, asks you to say Stop, and enters the notch you heard even if your Stop is up to about 1 s late. A Stop you sent earlier, while being led there, doesn't count.
- **Plates, the earpiece and the radio:** a stray or old digit never becomes the answer. The bot asks for the number (and says the order), and waits 2 s after your last digit, so a correction wins.
- **Marks:** a bot re-marks a switch or bell you missed.
- **Steering:** a Can't see bot with nobody else to steer it asks you to.

## Interfaces from earlier phases (exact)

```ts
export const STANDIN_DELAY_TICKS = 20;
export function createStandIn(seat: Seat, humans: ReadonlySet<Seat>, roles: readonly [Role, Role, Role]): BotSeat;
export type Signal = "callout" | "text" | "mark" | "none";
export function needs(job: Job, room: Room): Signal[];
export type AskKind = "stop-on-click" | "read-plate" | "plate-first" | "steer-me" | "press-marked" | "strike-marked" | "count-turn" | "taking-over";
export interface Ask { kind: AskKind; from: Seat; to: Seat; station?: string }
export const ASK_COPY: Record<AskKind, { say: string; chip: string }>;
export const REASK_MS: readonly [8000, 16000, 30000];
export const ASK_QUIET_MS = 2000;
export interface AskClock { firstAt: number; lastAt: number; count: number; progressAt: number }
export function reaskDue(c: AskClock, now: number, lastHeardAt: number, atSpot: boolean): boolean;
export interface BotTurn { input: PlayerInput; send: Outgoing | null; ask?: Ask | null }
//   RoleView.you.asks?: { from: Seat; kind: AskKind; saidAt: number }[]
//   brain.ts: askFor(m, kind, to, station, now, atSpot, progressed): Ask | null  (memory: m.asks)
```

## Context (read this turn)

- **`StationBelief`** (`src/game/bots/decode.ts`, about lines 19–37): `numbers: number[]` (one-digit texts, in order), `plate`, `told` and `changedAt`. All of these are filled in `beliefFrom`. The dial decoder's word check uses `inbox.some(m => m.method === "callout" && m.callout === "stop" && m.from.role === "blind")`, about line 151.
- **Places that use the last digit:**
  - plated wires: `b.numbers.at(-1)`, about line 186
  - keypad plate slot: about line 283
  - radio: `b.numbers.at(-1)`, about line 316
  - earpiece order: `told[plateFrom]`, else `told.at(-3)`, lines 252–266
- **`numbers` is cleared on a send-back** only for earpiece keypads (`brain.ts:1146-1151`).
- **Turn pacing:** `brain.ts` `pressFor`, `return tick - b.changedAt < TURN_WAIT_TICKS ? "wait" : "act"` with `TURN_WAIT_TICKS = 8` (`decode.ts:141`).
- **Sync:** `syncCount` (`brain.ts` about 1269), `countStep`/`syncGo` (`decode.ts` about 469–504), the lock's `windowMs` 500 (`stations.ts` 529–557).
- **Marks sent once:** switches use `m.markedFor` per lamp state; bells use `b.told` (`workSend`, `brain.ts` about 1240–1264).
- **Blind bot steering:** a callout-only bot that holds after `IDLE_MS` (`brain.ts:178, 314`). Only a **deaf bot** guides it (`brain.ts:1193`).

## Tasks

### Task 302: A person's digits and words count only when asked for (BS1–BS3) — [x]

- **Behaviour:**
  - `numbers` becomes `{ n: number; from: Seat; at: number }[]` (update every reader). Each station belief also keeps `askedAt?: number` and `askedTo?: Seat`, set when this bot's ask for that station is first said.
  - **Accepting digits:** when the expected sender is a **person**, a decoder accepts a digit or `stop` only if `from === askedTo && at >= askedAt` and it was received since the last send-back. From a bot sender, today's behaviour stays: bots don't ask bots.
  - **Clearing:** a send-back clears `numbers`, `plate`, `askedAt` and the dial's word for **every** station type.
  - **Settle:** a person's digit answer is used only once `now - lastDigitAt >= 2000`, so a correction replaces it.
  - **Earpiece:** the ask is `plate-first`; with a person, the plate digit is taken as the first digit after the ask.
  - **Why digits between people are already safe (BS3):** a digit from a seat that wasn't asked never counts.
- **Files:** `src/game/bots/decode.ts`, and `brain.ts` (the send-back clearing).
- **Tests first (red), `decode.test.ts`:**
  - a plated radio with a person Can't see ignores a digit sent before the ask
  - it takes a corrected digit sent within 2 s
  - it forgets digits on a send-back
  - a digit from the other person (not asked) never counts
  - the dial ignores a person's `stop` sent before the ask
- **Acceptance:** the tests pass. **`spec/rooms.test.ts` is green** (overview §1 rule 2). Remove the `NOT_YET` entries this clears.
- **Break check:** drop the `at >= askedAt` filter by script; the "before the ask" tests go red.
- **Depends on:** phase 02.

### Task 303: A person's pace at the safe and the sync lock (BP1, BP2) — [x]

- **Behaviour:**
  - **The safe at a person's pace:** when a real (not teaching) dial's listener is a person, the turner waits `PERSON_TURN_TICKS = 40` (2 s) between turns instead of `TURN_WAIT_TICKS`.
  - **The turn log:** the turner keeps a log of its own turns, `{ tick, setting }[]`, kept for the last 3 s.
  - **Late credit:** an accepted `stop` (Task 302) that arrives within `LATE_CREDIT_TICKS = 20` of a turn is credited to the setting **before** that turn; otherwise to the current setting. This uses only the bot's own log (ADR 0018).
  - **Sync lock:** with a person turning a key, the counting bot spaces "3, 2, 1" by 20 ticks instead of 10, and turns on its own "1" as now. With a person counting, nothing changes. Check that the 500 ms window is still reachable, using the stand-in's 20-tick delay.
  - **Audit:** walk the spec's §3 table for any other fixed bot timing that waits on a person. Fix each you find the same way, or log it as not applicable.
- **Files:** `src/game/bots/brain.ts`, `src/game/bots/decode.ts`.
- **Tests first (red), `brain.test.ts` with tick counts:**
  - a turner with a person listener turns every 40 ticks
  - a `stop` 15 ticks after a turn is credited to the setting before it, and one 25 ticks after is credited to the current setting
  - a bot listener keeps an 8-tick pace
  - the sync count is 20-tick-spaced with a person turner
- **Acceptance:** the tests pass, and `spec/rooms.test.ts` is green with its tick counts within 5% of before (bots only). Remove the `NOT_YET` entries for room 4 Q2, room 4 Q3 and room 9 Q8 (the safes) with a stand-in Can't see, once they clear.
- **Break check:** set `PERSON_TURN_TICKS` back to 8 by script; the pace test goes red, and room 4's stand-in run goes red.
- **Depends on:** Task 302.

### Task 304: Every station asks, marks are re-sent, and the blind bot asks to be steered (BT1 per station, BT3, BJ3) — [ ]

- **Behaviour:** wire `askFor` everywhere a bot waits on a person, using the spec's §3 table:

  | where the bot waits on a person | ask kind |
  | --- | --- |
  | safes | `stop-on-click` |
  | plated stations | `read-plate`, addressed to the person Can't see |
  | earpiece | `plate-first` |
  | switches | `press-marked`, plus re-marking |
  | bells | `strike-marked`, plus re-marking |
  | sync | `count-turn` |
  | Can't see bot with nobody steering | `steer-me` |

  - **Re-marking:** a watcher's marks are re-sent on the ask clock (BT3) while the button or bell isn't pressed. This replaces `markedFor` and `b.told` sending once, when the presser is a person.
  - **Steering:** a Can't see bot steered by nobody (no deaf bot, and a person Can't hear) asks the person `steer-me`. While asking, it doesn't hold forever on `IDLE_MS`: it waits, and asks again on the clock.
  - **`atSpot`:** true while the asked person stands on the job's tile (listen tile, plate tile, button).
  - **Progress:** a station change the bot perceives (a setting turned, a digit entered, a lamp flipped, a bell struck), whoever made it.
- **Files:** `src/game/bots/brain.ts`, and `src/game/asks.ts` if the copy needs wording fixes (no digits).
- **Tests first (red), `brain.test.ts`:** for each ask kind, a bot in the matching room with a person counterpart sends that ask to that person and not to the other seat. Also:
  - a switch mark is re-sent at 8 s with no press
  - a person at the spot gets no re-ask
- **Acceptance:**
  - the tests pass, and `spec/rooms.test.ts` is green
  - remove every `NOT_YET` entry this clears
  - screenshot `review/bp-304-asks-room{4,6,8}-1280.png`

  **Human review:** in a three-tab game, you as Can't see in room 4 and as Can't hear in room 6, with two bots each: the asks tell you what to do, and the repeats are spaced, not naggy.
- **Break check:** remove the switches re-mark by script; its test goes red.
- **Depends on:** Task 303.

## Phase Definition of Done

Tasks 302–304 are ticked or parked, `pnpm check` is green, and the `NOT_YET` list is re-measured, with only phase 04 causes left. Then commit `Unit done: bp03`.

## Corrections log

(empty)
