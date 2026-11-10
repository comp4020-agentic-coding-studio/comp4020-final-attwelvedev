# Bots and people: Phase 02, the ask (clock, delivery, chip and voice)

- **Status:** Approved
- **Tier:** Architecture
- **Overview:** `plans/2026-11-10-bots-play-with-people-00-overview.md` (§1 rules, §4 types). Spec: BT1–BT3.

## What you'll see

- When a bot needs something from you, you're told what it needs and **how** to send it.
  - **Can't see** hears it spoken, as a bot's text is today.
  - **Sighted players** get a chip on the bot that asked, saying what to do. It stays up until you do it.
- If you miss it, it repeats at 8 s, then 16 s, then every 30 s. It doesn't repeat while you're at the spot doing the thing, and never within 2 s of another message.

## Interfaces from earlier phases (exact)

```ts
export function solveRoom(room: Room, roles: readonly [Role, Role, Role], budgetS?: number,
  opts?: { humans?: ReadonlySet<Seat>; standIns?: ReadonlySet<Seat>; uncoverWhenReached?: true | number }): SolveResult;
export const STANDIN_DELAY_TICKS = 20;
export function createStandIn(seat: Seat, humans: ReadonlySet<Seat>, roles: readonly [Role, Role, Role]): BotSeat;
export type Signal = "callout" | "text" | "mark" | "none";
export function needs(job: Job, room: Room): Signal[];
```

## Context (read this turn)

- **Why asks aren't channel messages:** `route(roles, from, msg, cooldowns, now)` in `src/game/channels.ts` delivers a message to **every** other seat whose role receives its method. It has no addressee. A text ask would reach the second person in a two-person game too, which breaks BT1's "to one person". So an ask is a **per-seat view field** (`you.asks`), added by perception for the asked seat only, the way `you.braille` is own-seat-only (`perception.ts`, `RoleView`, about line 263). This is no new channel (ADR 0011): Can't see gets the spoken form, which is text-equivalent, and a sighted person gets only fixed what/how copy (BT2).
- **Server loop:** `src/net/game.ts:570` calls `botsAct(...)`, and the harness calls it in `solve.ts`. `BotTurn` is `{ input, send }` today (`brain.ts:103`).
- **Client:**
  - Bot texts are spoken by `src/client/speech.ts` (`SUPERSEDE_MS`) from `Game.tsx`'s message handler.
  - Chips are built by `labelsFor(entities, tiles, near, enabled, visible, only, max, met, me?)` in `src/client/labels.ts` (copy in `LABEL_COPY`, caps in `LABEL_CAP`), and are drawn by the renderer.
  - The hold-hands chip (`canhold`) is the closest example: a chip on a teammate, driven by a server field (`me.act`).
- **CLAUDE.md "Perception":** check the new view field against the role tables in `src/game/types.ts`. **"Sensory parity"** doesn't apply, because an ask is a private message, not a team event.

## Tasks

### Task 299: The ask and its clock (BT1, BT3) — [ ]

- **Behaviour:**
  - **`src/game/asks.ts` (pure):** `AskKind`, `Ask`, `ASK_COPY`, `REASK_MS`, `ASK_QUIET_MS`, `AskClock` and `reaskDue`, as overview §4.
  - **Copy per kind:**
    - `say` is what Can't see or Can't speak hears or reads. It always names the wheel route, for example "Listen for the click. Say Stop: wheel, Talk, Stop."
    - `chip` is the short sighted form, for example "Needs: Stop on the click".
  - Give `taking-over` (used by Task 305) the copy "I'll do this one." now, so `ASK_COPY` is total.
    - **Neither may contain a digit or a game value.** A test asserts no `\d` in any copy.
  - **`reaskDue`:**
    - gaps of 8 s, then 16 s, then 30 s for every later repeat
    - counted from the later of `lastAt` and `progressAt`
    - false while `atSpot`
    - false within `ASK_QUIET_MS` of `lastHeardAt`
  - **Bots ask:** `BotTurn` gains `ask?: Ask | null`. A bot memory keeps `asks: Record<string, AskClock>`, keyed `"<kind>:<station>:<to>"`, and a helper `askFor(m, kind, to, station, now, atSpot, progressed)` returns an `Ask` when it's due. No station uses it yet (that's phase 03), except one smoke use: the Can't speak turner at room 4's Q2 asks its listener `stop-on-click` when that listener is a person.
  - **`lastHeardAt`:** the latest `sentAt` of any message in the bot's inbox, people's messages included, or its own send.
- **Files:** a new `src/game/asks.ts` and `asks.test.ts`; `src/game/bots/brain.ts` (`BotTurn`, memory, `askFor`, the Q2 smoke use).
- **Tests first (red):**
  - `asks.test.ts`: the cadence (asks at 0, 8, 24, 54 and 84 s, with no progress, no spot and no messages); a reset on progress; the hold while at the spot; the 2 s quiet window; no digit in any copy.
  - `brain.test.ts`: the room 4 Q2 turner with a **human** listener at the safe's back returns `ask.kind === "stop-on-click"`, `to` = the listener's seat, and no ask when the listener is a bot.
- **Acceptance:** the tests pass, and `spec/rooms.test.ts` is green.
- **Break check:** make `reaskDue` ignore `atSpot` by script; the hold test goes red.
- **Depends on:** phase 01.

### Task 300: Asks reach the asked seat only (BT1 delivery) — [ ]

- **Behaviour:**
  - `botsAct` collects each bot's `turn.ask` into `sentAsks`, part of its return value (add the field; keep the existing ones).
  - The game keeps the live asks per target seat. Server: on `Game` in `src/net/game.ts`. Harness: in `solve.ts`, so stand-ins see them.
  - An ask stays live until the bot stops asking. A bot re-sends its ask each tick while it wants it; the clock only decides when it's **said** again.
  - Perception adds `you.asks: { from, kind }[]` for the asked seat only. There's no station id and no value.
  - The stand-in (Task 296) now sends a suppressed signal only when one of its live asks has the matching kind, after its delay.
- **Files:** `src/game/bots/crew.ts`, `src/game/bots/solve.ts`, `src/net/game.ts`, `src/game/perception.ts` (`RoleView.you.asks`), `src/game/bots/standin.ts`.
- **Tests first (red):**
  - `perception.test.ts`: with an ask from seat 2 to seat 0, `viewFor` seat 0 has `asks` = `[{from: 2, kind}]`, and seats 1 and 2 have none. This covers every role combination.
  - `standin.test.ts`: a stand-in Can't see at room 4's safe back, with a live `stop-on-click` ask, sends `stop` 20 ticks after the tumbler sounds.
- **Acceptance:** the tests pass. `spec/rooms.test.ts` is green. In `spec/rooms-people.test.ts`, the room 4 Q2 stand-in Can't see entry is **still** on the list (the turner is still at bot pace until phase 03). Re-check its cause and update the entry.
- **Break check:** send asks to every seat by script; the perception test goes red.
- **Depends on:** Task 299.

### Task 301: The chip and the spoken ask (BT1, BT2) — [ ]

- **Behaviour:**
  - **Client chip:** a label of kind `ask`, with `ASK_COPY[kind].chip`, anchored on the asking bot's figure, for each entry in `view.you.asks`. It's sighted only, because Can't see's frame draws no labels.
  - **Placement:** the chip goes past the `LABEL_CAP` limit (an ask always shows), but stays in the renderer's chip-placement rules. It must not cover the side-job chip; reuse the `avoid` path.
  - **Spoken form:** when an ask is **said** (new, or re-said by the clock), Can't see and Can't speak hear or see `ASK_COPY[kind].say`, through the same speech and caption path as a bot's text. It doesn't cut off a line under 300 ms old; the bot's quiet window already prevents that.
  - **Can't hear** gets the chip only, since they receive no words.
  - **Re-says:** this needs "said at" in the view. Add `saidAt` (a tick) to each `you.asks` entry, so the client speaks it when the tick changes.
- **Files:** `src/client/labels.ts`, `src/components/Game.tsx` (speaking, and passing asks to `labelsFor`), `src/game/perception.ts` (`saidAt`), DESIGN.md (the ask chip).
- **Tests first (red):**
  - `labels.test.ts`: `labelsFor` with an ask from seat 2 gives an `ask` label at seat 2's position, with the chip copy, even when the cap is full.
  - A layout spec, `spec/layout/ask-chip.test.ts`: at 375 and 1280, for Can't speak and Can't hear, the chip isn't clipped and doesn't intersect `.side-job`. The CLAUDE.md overlay rule names that neighbour.
- **Acceptance:**
  - the tests pass, and `pnpm check` is green
  - screenshots `review/bp-301-ask-chip-{1280,375}.png` (room 4, a person as Can't speak, the turner's chip)
  - `pnpm check:flaky 4` method on the new layout spec

  **Human review:** the chip's wording and placement, and the spoken ask heard in a three-tab game in room 4 (you as Can't see, two bots).
- **Break check:** drop the cap exemption by script; the labels test goes red.
- **Depends on:** Task 300.

## Phase Definition of Done

Tasks 299–301 are ticked or parked, `pnpm check` is green, and the `NOT_YET` causes are re-checked. Then commit `Unit done: bp02`.

## Corrections log

(empty)
