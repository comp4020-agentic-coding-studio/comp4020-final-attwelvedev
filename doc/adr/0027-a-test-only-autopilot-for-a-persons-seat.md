# 27. A test-only autopilot that lets a bot drive a person's seat

## Status

accepted (2026-11-11)

The design is `specs/2026-11-07-playtests.md`. Builds on 0018 (perception-only bots).

## Context

The bugs a human playtest found in phase 14 lived between layers:

- the server sent a whole station and the client drew it whole
- the server's tile sight disagreed with the client's ray light
- a passed vote cleared the room but not the heist screen
- a bot's mark was never drawn, because it went only through the bot's path

Each test that missed one checked a single layer or used a stand-in. To catch them, the real server,
the real client and the real renderer must all be in the loop for a whole heist. A whole heist needs
someone to play it, and a scripted browser player would have to re-solve every puzzle from pixels.

We weighed these.

- **A scripted player that solves rooms through the UI.** It tests the input path too, but it is weeks
  of fragile work, and every puzzle change breaks it. Rejected.
- **A separate playtest server entry that wraps `server.ts`.** It isolates the hook cleanly, but it is a
  second server to keep in step. Rejected.
- **Bots driving the seats, through an env-gated seam in the real server.** The bots already clear all
  nine rooms from what they perceive.

## Decision

When `PLAYTEST_AUTOPILOT=1` is set, a person's socket may send `{ t: "autopilot", on }`. While it is
on, a bot memory (as `seatBots` makes one) supplies that seat's input and messages, and the socket's
own input is ignored. The socket still receives that seat's views and draws them. When the flag is
not set, the message is refused.

The server refuses to start with the flag set when `FLY_APP_NAME` is present, so the deployed app can
never have it. Turning autopilot on or off is one `logGame` event (`autopilot`, with no detail beyond
`on`).

## Consequences

- One server code path, gated twice: by the env flag, and by the refusal on Fly. A spec proves the
  refusal.
- A seat on autopilot is played by the same perception-only bot as any bot seat, so a run tests the
  bots in the real server too.
- The regression run (`pnpm playtest`) can play every room in real browsers deterministically and for
  free.
- It is not a playtest by people. It cannot tell whether a person understands a room; the screenshot
  review reads its evidence for that, as leads (`doc/adr/0028-a-screenshot-review-from-what-a-player-perceives.md`).
