# Bots and people: Phase 05, a person as Can't see is towed, room 7's gear goes by role, and the guard is emptied

- **Status:** Approved
- **Tier:** Architecture
- **Overview:** `plans/2026-11-10-bots-play-with-people-00-overview.md` (§1 rules, §4 types). Spec: BJ3 and BG1.
- **Why this phase exists:** phase 04 parked Task 306 in part. `spec/rooms-people.test.ts` still has 29 one-person and 18 two-person `NOT_YET` entries. The owner answered the two parked questions on 2026-11-11 (see the note `overnight/bp-owner-answers-2026-11-11.md`, copied into the decisions log under `## bots-people` as `bp05/owner`).

## Owner decisions (binding; do not re-ask)

1. **A person as Can't see is towed by a bot.** That is what happens when humans play. Taps/callouts for a Can't-see person stay only as an edge-case fallback (for example no sighted bot can reach them, or the person has already been towed to the end tile and is a step short).
2. **Room 7's goggles go to the person who is Can't hear** (they can then see in the dark, and also talk). Gear in room 7 is claimed by the room's preferred role before nearness.

## What you'll see

- A person as Can't see, with a bot Can't hear/Can't speak beside them, is led by the hand to each plate and to the listen tile instead of being tapped from a drifting estimate.
- In room 7 the person who is Can't hear wears the goggles; the others take the torch and the ink jobs.
- `NOT_YET` and `NOT_YET_TWO` in `spec/rooms-people.test.ts` shrink to what is truly out of reach, ideally empty.

## Interfaces already in the code (check them, they may have moved)

- `src/game/bots/brain.ts`: the guide (`blindListening`, `besideOf`, the `tow` job at about 1116 and 1667, the tap texts), `claimJobs` and `queuesOf` (queue cache), `takeOver`/`selfWatch` from Task 305.
- `src/game/bots/jobs.ts`: `Job` (`tow` kind), `needs`, `fits`, `claimJobs`, `eligible`, `canDo`.
- `src/game/bots/standin.ts`: `Person.move` (the stand-in obeys a tap text as one 0.2-tile step). A stand-in must also **follow a tow**: it is led by the hand, so it moves with the leader and stops where the leader lets go.
- `spec/rooms-people.test.ts`: `NOT_YET`, `NOT_YET_TWO`, each entry measured.

## Tasks

**Order of work: 311, 307, 308, 310, 309.** The numbers are only labels. Do 311 first (small, and the owner cannot playtest without it), and 309 last (it re-measures and empties the guard). If budget runs short, park the later ones with the reason; never weaken a test to finish. This unit runs on Sonnet: park what is beyond you rather than guess.

### Task 307: Tow a person as Can't see onto each tile (BJ3, decision 1) — [ ]

- **Behaviour:**
  - **Measure first.** Run `pnpm vitest run spec/rooms-people.test.ts` with only the `blind` entries removed from `NOT_YET` (and the `*|blind`/two-person entries that name Can't see). Log which rooms/rotations clear and which stall, and the stall tile.
  - **Tow is the primary guide.** When the person is Can't see and a sighted bot is free, the guide plans a tow job: the bot takes the person's hand, leads them to the target (plate, listen tile, the safe's back at (23, 1) in room 4), and lets go **on** the end tile. Phase 04 found "a tow leaves them a tile short": fix that cause at its root (the end tile rule for a trailing person), not by walking past it, which was tried and reverted.
  - **Who tows:** the lowest-seat bot that is sighted and not on a job that needs it elsewhere, deterministic across bots like `claimJobs`. If a person is Can't see and another person is the only sighted seat, there is no tow: fall back to the old tap/callout guide.
  - **Fallback:** keep taps only when no bot can tow (two people one bot where the bot cannot see, a watcher in the way). The fallback is the existing code path, unchanged.
  - **A tow never walks a person into a watcher's view** (phase 04's `03-watchers|*|blind` failures: the old guide walked them in; the tow route must use the same cover rule the bots use).
- **Stand-in:** make `standin.ts` follow a tow (it is held by the hand: its position is the leader's offset). Without this the proxy stalls for a reason a real person would not.
- **Files:** `src/game/bots/brain.ts`, `jobs.ts`, `standin.ts`, `solve.ts` if the harness drives tows.
- **Tests first (red), `brain.test.ts` and `standin.test.ts`:**
  - room 4: a person as Can't see ends on the listen tile (23, 1) after a tow, and is not left at (24, 1)
  - a person as Can't see is never led into a watcher's view in room 3
  - with no sighted bot free the fallback still taps (existing test stays green)
- **Break check:** by script, make the guide never plan a tow; the room 4 test goes red.
- **Acceptance:** the tests pass, `spec/rooms.test.ts` is green in every rotation, and every `NOT_YET`/`NOT_YET_TWO` entry this clears is removed in the same commit.
- **Depends on:** phase 04.

### Task 308: Room 7's gear goes by role, goggles to Can't hear (decision 2) — [ ]

- **Behaviour:** in room 7, claim gear by the room's preferred role before nearness: goggles to the Can't hear seat (person or bot), torch to the seat that does the ink jobs.
  - This is the idea phase 04 tried and reverted because `released.test.ts` Task 48 (the torch test) went red. **Update that test's premise on purpose and say so in the decisions log**: its premise was "with people in the other two seats the bot that can't speak ends up with the torch because a person took the goggles". Under the owner's rule the person Can't hear holds the goggles, and the bot Can't speak still ends up with the torch, so the test's assertion (the torch carrier lights the ink and marks the wire) should still hold. Change only the set-up that decided who holds what.
  - Do not weaken the assertion. If the assertion cannot stand, park and say why.
- **Files:** `src/game/bots/jobs.ts` (`claimJobs` gear branch), `brain.ts`, `released.test.ts`.
- **Tests first (red), `jobs.test.ts`:**
  - room 7, a person as Can't hear: the goggles are claimed by that seat
  - room 7, a person as Can't speak and a person as Can't hear: goggles to Can't hear
  - all-bot run: the same split as today (the preferred role matches nearness there)
- **Break check:** by script, put the gear branch back to nearness only; the room 7 test goes red.
- **Acceptance:** tests pass, `spec/rooms.test.ts` green, room 7 `deaf` and `mute` entries removed if they clear.
- **Depends on:** Task 307 (they share files; do 307 first).

### Task 309: Diagnose and clear what is left; empty the guard (BG1) — [ ]

- **Behaviour:** re-measure after 307 and 308. The entries left are the ones phase 04 marked "not diagnosed": room 4 rotation 1 Can't hear, room 7 and room 8 Can't speak, room 8 `mute` caught once, and the two-person Can't hear tows and guides Can't see combinations.
  - Diagnose each (a few lines in the decisions log with the stall tile or the cause). Fix it if it is in this feature's scope (asks, takeover, tow, gear, progress counted on the station); otherwise park it with the reason.
  - **Two people with one bot, where one person is Can't hear and tows a Can't see person:** the stand-in tows with the bot brain's limits. If the stand-in cannot tow with a person's 1 s delay, lengthen only the stand-in's tow patience, never the bot's.
- **Braille plate check (owner, 2026-11-11).** The owner believes a room with a braille plate and a person as Can't see is impossible with two bots, because Can't see cannot pass the number on. The code says the channel exists (Can't see has `text`; a bot reads a single-digit text, `decode.ts` `readNumber`; the `read-plate` ask asks for it; the stand-in sends a digit only after that ask). Verify, do not assume:
  - for rooms 4 to 9, does the stand-in as Can't see read its plate (`BrailleCard`) and text the digit(s) after `read-plate`? Log what it sends and what the bot's belief (`b.plate`) holds
  - does a plate whose number has **more than one digit** get through? `readNumber` takes one digit only; if any room's plate is multi-digit, say so
  - if the plate path is the blocker, fix it here when it is in this feature's scope (asks, decode, stand-in) and add a test per room; otherwise park it with the evidence and say what the owner would need to decide
  - the owner floated texting "the hashtag" (the braille number sign): a real player has no reason to send it; do not build that without asking
- **Finish the guard:** `NOT_YET` and `NOT_YET_TWO` are empty, or every remaining entry names a diagnosed cause and the owner question it needs.
- **Docs:** if both lists are empty, the spec `specs/2026-11-10-bots-play-with-people.md` status becomes `Built`; otherwise it stays `Approved` and the overview's DoD line says which entries remain.
- **Acceptance:** `pnpm check` green; both rooms files' times logged; split `rooms-people` by room if it is now the slowest file.

  **Human review:** a real playtest of rooms 4, 7 and 8 with you as Can't see (towed), and room 7 with you as Can't hear (goggles). The stand-in is a proxy; this is the check.
- **Depends on:** Task 308.

### Task 310: The takeover clock is fair (review F1, F2 of bp04) — [ ]

- **Owner decision (2026-11-11):** fix both. For F1 the owner asked what happens when a person is carrying gear a bot needs; the answer must be in the design, not left implied.
- **F1, the clock starts too early.** `takeOver` in `brain.ts` takes the person's first undone station or watch job and starts its clock the first time a bot sees it, even if the person's earlier gear, tow, door or lever jobs are not finished. A person still carrying gear then loses their station while busy.
  - Start the clock only when the person's earlier jobs in their queue are done (or the beat is reached), so the 60 s measures idleness at the station, not time spent on the way.
  - **A person holding gear a bot needs (the owner's question).** Takeover covers only station and watch jobs, so a stuck gear job is not covered today, and gating the clock as above would make that case stall with nothing to break it. **Diagnose it first** (what do `claimJobs`, the `give` job near `jobs.ts:497` and the brain do when the holder is a person who never hands it over?) and log the finding under `bp05/310`. Then: a gear or give job a person owns and does not progress for `TAKEOVER_TICKS` gets the same treatment as a station, with the bot asking the person to hand it over (a new ask kind only if the existing copy cannot say it; chips carry no game information) and nothing more. **The owner confirmed on 2026-11-11 that a bot cannot take gear from a teammate**: do not add a take. If the room cannot clear while a person sits on gear a bot needs, the asks continue; log that as the known limit.
- **F2, bots decide from their own sight.** `known.stations[id].changedAt` moves only while the station is in sight (`decode.ts`), so a bot that cannot see the station times out while the person is working it. Restart the clock on any evidence of progress the bot can perceive: the person's asks and sends, a sequence result, and any perceived change of the station. Alternatively let only a bot that can see the station take the job. Choose the one that keeps every bot's copy of the queues in agreement (they agree by computing the same answer from shared events), and log the choice under `bp05/310`.
- **Files:** `src/game/bots/brain.ts`, `jobs.ts` if the gear rule needs `canDo`, `src/game/asks.ts` only if a new ask copy is unavoidable.
- **Tests first (red), `brain.test.ts`:**
  - a person with a 70 s gear job followed by a station: no takeover until the gear job is done, then 60 s of idleness
  - a person working a station out of one bot's sight: that bot does not take it
  - a person holding gear a bot needs: the behaviour decided above
  - the existing takeover tests (room 6, progress at 50 s resets the clock) stay green
- **Break check:** by script, start the clock at first sight again; the first test goes red.
- **Acceptance:** tests pass, `spec/rooms.test.ts` green in every rotation, `spec/rooms-people.test.ts` no worse than before.
- **Depends on:** Task 307 (shared brain code; do 310 after 309's measurements so a takeover change is not confused with a tow change).

### Task 311: Can't see gets an ask without spoken lines; the guide stops repeating callouts at a person who is not moving (owner playtest, 2026-11-11) — [x]

- **What the owner saw** (`pnpm dev --host` on `auto/playtest-3`, room 4, the real safe, the owner as Can't see, a bot as Can't speak at the dials): no ask ever arrived. They had "spoken lines" off, because the bot Can't hear kept sending direction callouts while they stood still. Captions were on.
- **Cause found by reading the code (confirm with a test):** `Game.tsx` (the `view` effect near line 956) speaks an ask through `browserSpeech`, and `createSpeech` (`src/client/speech.ts`) drops every line when "spoken lines" is off. Only `role === "mute"` also gets the ask as a caption line. Can't see has no chip and no caption for an ask, so with speech off an ask is lost without trace.
- **Fix 1, the ask reaches Can't see:** when spoken lines are off, or captions are on, Can't see gets the ask as a caption line the same way Can't speak does (the same fixed copy, never game information). Do not turn speech on for them. A test in `Game`'s component tests: a Can't see view with `you.asks` and speech off shows the line; with speech on it is spoken and shown only if captions are on.
- **Fix 2, the callout spam (owner decision, 2026-11-11: fix it):** the cause is the rule itself. In `guideBlind` (`brain.ts`, the block after "a direction is said once (FR10)") a person who makes no progress hears the direction again after 3 s, 6 s, 12 s and then **every 12 s forever** (FR11, as changed on 2026-11-10). A person who is simply standing still therefore hears it for as long as they stand there.
  - **New rule:** the repeats stop after the 12 s one. Then the guide is quiet until the person moves (progress, or a new direction), or asks for steering (`steer-me`), or a new direction is planned. The first callout and the three repeats stay. This changes FR11, so update its line in the spec (`specs/2026-11-10-bots-play-with-people.md` and the playtest-3 fixes spec where FR11 is written) and say so in the decisions log under `bp05/311`.
  - **Test first (red), `brain.test.ts`:** a Can't see person who never moves, a Can't hear bot guiding: over 60 s the callouts are the first plus at most three repeats, then none; when the person moves a step, the guide speaks again.
  - A person who is Can't see and stuck against a wall is still handled by the "stop" rule above it; do not touch that.
- **Files:** `src/components/Game.tsx` and its test, `src/game/bots/brain.ts` (`guideBlind`), `brain.test.ts`.
- **Break check:** by script, put the `role === "mute"` condition back; the Can't see caption test goes red. For fix 2, set the backoff to 1; the callout count test goes red.
- **Acceptance:** tests pass, `spec/rooms.test.ts` green in every rotation.
- **Depends on:** none (do it first: it is small and a person cannot play the rest without it).

## Phase Definition of Done

Tasks 307–311 are ticked or parked, `pnpm check` is green, `NOT_YET` and `NOT_YET_TWO` are empty (or every remaining entry has a diagnosed cause), and human reviews are queued under `## Bots and people`. Then commit `Unit done: bp05`.

## Corrections log

(empty)
