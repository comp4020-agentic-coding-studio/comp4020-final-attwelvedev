# Play tweaks: clearer labels, remote sound, comms after a clear, in-game leaderboard

- **Date:** 2026-10-29
- **Tier:** Slice
- **Status:** Approved
- **Requirements confirmed by user:** yes, 2026-10-29 (brainstorm in conversation, demo script below)
- **Runs:** in the overnight run on `auto/escape-room`, before escape-room phase 05. Independent of
  the escape-room plan. Escape-room Task 30 (leaderboard edition) runs later and builds on Task 5 here.

## What you'll see

- The role screen says "Played: Can't see, Can't hear" in words, not small shapes.
- Bots are "Bot Ace", "Bot Jinx" and "Bot Moss", never a shape name that clashes with a role.
- A remote player gets game sound without headphones. A remote Can't hear starts with masking noise
  off.
- After a room clears, the crew can still talk, chat and send messages while the panel is up.
- The cleared panel shows this room's top 5. The full leaderboard opens inside the game.

## Demo script (local build, three tabs, 1280 and 375)

1. Play a room, then reach the next role screen → each row reads "Played: <role names>" in words.
2. Fill a seat with a bot → it is "Bot Ace" / "Bot Jinx" / "Bot Moss" (seat 0/1/2), the same after
   roles rotate.
3. Set up as Remote, No headphones, and play Can't see → game sound plays, with no "no headphones"
   note in Settings. In the room with others and No headphones → captions replace sound, as before.
4. Play Can't hear, Remote, with headphones → masking noise starts off, and the Settings toggle turns
   it on. In the room with headphones → it starts on, as before.
5. Clear a room → while "Room cleared" is up, chat, voice, callouts, clips and faces still send, each
   as the role allows. Marks are off (the panel covers the map) and movement is off.
6. The cleared panel shows the room's top 5 (team, time, loot) with this team's run highlighted. If
   the run is outside the top 5, it shows a sixth line with its rank. With no runs yet, "First clear
   of this room".
7. "Full leaderboard" on the cleared panel, and "See the leaderboard" on the heist-complete screen,
   open the board as an in-game panel with its tabs. Close returns to the game. No navigation, no
   new tab.

## Requirements

- **R1** Played roles in words → demo 1, Task 3.
- **R2** Bot names `Ace`, `Jinx`, `Moss` per seat → demo 2, Task 2.
- **R3** "Remote" = `!(me.inRoom && sharesRoom(crew))` (`src/game/setup.ts`). No-headphones →
  captions-instead-of-sound applies only when not remote → demo 3, Task 1.
- **R4** Masking noise defaults off when remote, on when not, and the person's own toggle wins once
  set → demo 4, Task 1.
- **R5** Comms per role while cleared, marks and movement excepted → demo 5, Task 4.
- **R6** Room top 5 with own run in the `cleared` message → demo 6, Task 5.
- **R7** In-game leaderboard panel, replacing the `/leaderboard` link in `HeistComplete` → demo 7,
  Task 5.
- Logging: no new log fields. A board in a socket message carries team names and nicknames, as the
  public `/leaderboard` page already does (FR32). Never log them (`CLAUDE.md` Logging).

## Out of scope

Leaderboard editions (escape-room Task 30). Changing what a role may send. A mark placed through the
cleared panel. Restyling the `/leaderboard` page.

## Existing code (read 2026-10-29)

- `src/net/realLife.ts` `realLifeFor(role, me, crew): RealLife`, where `RealLife` has
  `{ maskNoise, soundOff, captions, voice, lines }`. `soundOff = role !== "deaf" && !me.headphones`
  and `maskNoise = role === "deaf" && me.headphones`. Tests in `src/net/realLife.test.ts`.
- `src/client/settings.ts` has `maskNoiseOn: boolean`, default `true`.
  `src/components/Game.tsx` (~L646) sets `maskNoiseOn = real.maskNoise && settings.maskNoiseOn`.
  `src/components/Settings.tsx` (~L136–163) has the toggle and the headphones notes.
- `src/net/lobbies.ts:268` `SEAT_SHAPE` gives the bot nickname `Bot ${SEAT_SHAPE[i]}` there (L284)
  and in `src/net/game.ts` (L205, L404). Tests naming bots: `src/net/lobbies.test.ts`,
  `src/net/game.test.ts`, `spec/bots.test.ts`, `spec/layout/game.test.ts:268`. Keep `SEAT_SHAPE` if
  anything else uses it.
- `src/components/RoleReveal.tsx` ~L189 draws `RoleShape` pips with an aria-label "Played …".
- `src/components/Game.tsx` disables comms on `cleared` in three places:
  - `TalkBar commsDisabled={cleared}`;
  - `TouchControls disabled={cleared}`;
  - the `cleared` flag gates the wheel through `toTile`/`CommsWheel`. Read this one and follow it.

  The server's `send` case in `src/net/attach.ts` (~L1019) and `relay` in `src/net/game.ts` don't
  check `status`.
- `src/net/attach.ts` ~L330–385 sends `{ t: "cleared", room, ms, loot, lootTotal }`
  (`src/net/protocol.ts:96`), then `saveRun(db, {...})`, which returns a `RunRow` (`id`, `rank`).
  `topRuns(db, { kind: "room", roomId }, limit)` is in `src/lib/runs.ts`.
  `src/pages/leaderboard.astro` builds tabs from `loadRooms()`. `HeistComplete.tsx:31` links to
  `/leaderboard`.

## Tasks

- [x] **Task 1: Remote sound and masking noise.**
  - **Change:** `RealLife` gains `maskDefault: boolean`, true only when not remote.
    - `soundOff` becomes `role !== "deaf" && !me.headphones && !remote`.
    - `Settings.maskNoiseOn` becomes `boolean | null`, with `null` meaning "not chosen", the default.
      Old saved `true` reads as `null`, so it follows the new default.
    - `Game.tsx` then uses `real.maskNoise && (settings.maskNoiseOn ?? real.maskDefault)`.
    - In Settings, the "no headphones, so game sound is off" note shows only when `soundOff`.
  - **Files:** `src/net/realLife.ts` (+ test), `src/client/settings.ts` (+ test),
    `src/components/Game.tsx`, `src/components/Settings.tsx` (+ `Settings.test.ts` if it covers the
    note).
  - **Tests first, in `realLife.test.ts`:**
    - A remote hearing role without headphones has `soundOff` false and `captions` set only by
      `me.captions`.
    - A hearing role without headphones that is in the room with two others is `soundOff`.
    - A remote deaf player with headphones has `maskNoise` true and `maskDefault` false; in the room
      with company, `maskDefault` is true.
  - **Also in `settings.test.ts`:** a saved `maskNoiseOn: true` from before loads as `null`.
  - **Verify:** demo 3–4.
- [x] **Task 2: Bot names.**
  - **Change:** add `BOT_NAME = ["Ace", "Jinx", "Moss"] as const` in `src/net/lobbies.ts`. Every bot
    nickname becomes `Bot ${BOT_NAME[seat]}`.
  - **Tests:** update the named tests' expected names. This is the requirement changing, not a
    weakened test: the assertions stay exact.
  - **Test first:** `lobbies.test.ts` — a bot in seat 2 is "Bot Moss".
  - **Check:** `grep -rn "Bot \(circle\|square\|triangle\)" src spec` is empty.
  - **Verify:** demo 2.
- [x] **Task 3: Played roles in words.**
  - **Change:** replace the pips in `RoleReveal.tsx` with text "Played: " plus `ROLE_LABEL` names
    joined by ", ", styled `muted` in `src/styles/game.css` if needed, wrapping on a phone.
  - **Test first:** `spec/layout/reveal.test.ts` checks that a row after one room contains
    "Played: " and isn't clipped (`scrollHeight`), at 375 and 1280.
  - **Verify:** demo 1.
- [x] **Task 4: Comms while cleared.**
  - **Change:**
    - Stop disabling the talk bar, text field, voice, wheel and touch comms on `cleared`. Disable only
      mark placement (`toTile` returns null while cleared) and movement or Act (`TouchControls`
      keeps its movement disabled).
    - The cleared overlay must not cover the talk bar. Check the CSS stacking.
  - **Server test first, in `src/net/game.test.ts`:** `relay` of a text from Can't see to Can't hear
    succeeds while `world.status === "cleared"`. If it already passes, note it and add the spec
    below.
  - **Spec, in `spec/layout/game.test.ts`:** after a clear, the text field is enabled and a sent
    text reaches the receiver.
  - **Verify:** demo 5.
- [x] **Task 5: Room leaderboard on clear, board in the game.**
  - **Server change:**
    - In `attach.ts`, save the room run *before* sending `cleared`.
    - `cleared` gains `board: { top: BoardRow[]; mine: { rank: number; ms: number } | null }`, where
      `BoardRow = { rank: number; teamName: string; ms: number; loot: number; lootTotal: number;
      mine: boolean }`.
    - `top` is `topRuns(db, { kind: "room", roomId }, 5)`, with `mine` matched on the saved run's
      `id`. `board.mine` is set only when the run isn't in the top 5.
  - **Client change:**
    - Add `src/components/RoomBoard.tsx`, drawn in `RoomCleared`.
    - Add a new GET `src/pages/leaderboard.json.ts`, returning the same tabs and rows as
      `leaderboard.astro`. Share the tab-building code in `src/lib/runs.ts` rather than copying it.
    - Add `src/components/LeaderboardPanel.tsx`, an overlay with tabs, Close and Escape, that fetches
      the JSON. It opens from "Full leaderboard" in `RoomCleared` and replaces the `HeistComplete`
      link.
  - **Tests first:**
    - `src/lib/runs.test.ts` for the shared tab builder.
    - `spec/heist.test.ts`: `cleared` carries `board.top`, including this run with `mine: true`.
    - `spec/leaderboard.test.ts`: `/leaderboard.json` returns a tab per room.
    - `spec/layout/leaderboard.test.ts`: the in-game panel opens with no navigation (`page.url()`
      unchanged), is axe clean, and closes, at both widths.
  - **Docs:** `DESIGN.md` Components gains `RoomBoard` and `LeaderboardPanel` (`spec/design.test.ts`).
  - **Verify:** demo 6–7.

**Human review:** demo 1, 2, 6 and 7 on a local build at 1280 and 375. The words read clearly, and
the board looks like part of the game. Overnight, take screenshots and queue them in
`review/QUEUE.md`, per the overnight rules.

## Done

- [x] All tasks done and committed, `pnpm check` green, reviews queued (review queued)

## Corrections log

<!-- one line per user redirect during execution -->
