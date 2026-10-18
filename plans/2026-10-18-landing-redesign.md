# Landing page redesign: a record

- **Date:** 2026-10-18
- **Status:** Done. **Written after the work, as a record, not a plan.**
- **Why there is no plan first:** this redesign was done straight from a
  `/frontend-design` session after all eight phases of
  `plans/2026-10-08-sensory-heist-00-overview.md` were ticked. It did not go
  through `/brainstorm-feature` or `/plan-feature`, as the working method in
  `CLAUDE.md` asks for new features. This file records what was decided and
  why, so the decisions are not only in the code and the chat.
- **Commits:** a2d2f4d (attract bots), fc27161 (shared code rule), 9220b90 (home page)

## 1. Why

The home page was a nickname field, a Create lobby button, a join form and an
open-lobby list. Critiquing it against what a first-time visitor needs:

- **Nothing on it showed the game.** The headline was the only explanation
  of a game whose whole point is that the three roles perceive different
  things.
- **The main action was the wrong one.** Create lobby was the bright
  primary at the top, though most people arrive with a code a friend sent.
- **The open-lobby list was usually empty.** It took half the desktop page
  to say "No open lobbies", next to a "Live" badge nobody needs to read
  while connected.
- **It looked like a settings page**, not a game, though the game already
  has a visual language (role shapes and colours, hatched hazards, Can't
  see's black screen).

## 2. Decisions

| Decision | Chosen | Rejected, and why |
| -- | -- | -- |
| Hero | Three live feeds of one bot run of room 1, one per role, each drawn by the game's own `viewFor` and `draw()` | A rotating 3D (Minecraft-style) background: generic, competes with the form, and a 3D library on a 256 MB machine. A static illustration: explains less than the real views |
| Explaining the roles | The headline lists the three roles with their shapes, so it is also the legend for the feeds | A separate "how it works" section the visitor has to read |
| Primary action | Join by code, first and largest, under the nickname | Create lobby on top |
| Create lobby | Renamed "Start a new team", the name `Lobby.tsx` already used; also renamed on the lobby page's not-found state | Keeping two names for one action |
| Open lobbies | Shown only when a team is waiting ("2 teams are waiting"); four rows, then "Show all N teams" | A permanent list with an empty state; a scrolling box (its "there is more" is only a hint, and a box scrolling inside a scrolling page is awkward on touch) |
| Motion | One pulsing light, only beside "teams are waiting", still under reduced motion | Pulsing "Live" or decoration: a pulse on everything means nothing |
| Connection pill | Only shown while connecting or offline, when Join would fail | Always shown |
| Code field | Only code letters (no I, L, O, digits or punctuation); Join is `aria-disabled` until 4 letters, with a countdown hint | A plain `disabled` button, which cannot be focused and gives no reason |

## 3. What was built

- `src/game/bots/attract.ts`: three bots playing a room one tick at a time
  for the home page. The bots are the solver's (`botsAct`, unchanged); this
  layer plays them less perfectly: each role moves on a share of ticks (Can't
  see 0.6, Can't hear 0.9, Can't speak 0.8), the two sighted roles sometimes
  pause, and a callout shows on the feeds 0.3–0.8 s after it was meant. Each
  loop is a new seed.
- `src/components/Feeds.tsx`: runs the bots in the browser (about 16 KB
  gzipped) and draws each seat's view, with captions. One run per page on its
  own clock, so Pause stops everything where it is and Play carries on;
  feeds stop while off screen; with reduced motion, one still frame until
  Play is pressed.
- `src/components/Home.tsx`, `src/styles/pages.css`: the new layout. On a
  phone the join form comes straight after the headline, before the feeds.
- `LOBBY_ALPHABET` and `LOBBY_CODE_LENGTH` moved from `src/net/codes.ts`
  (which imports `node:crypto`) to `src/net/protocol.ts`, the one `src/net/`
  file the browser may import, so the field and the server use one rule.
  `src/client/lobbyCode.ts` filters what is typed.

## 4. What did not work, and the limits left

- **Human-like bots are only partly human.** Making Can't see pause or
  wobble off line stranded it between tile centres in about 40% of seeds:
  Can't hear's guide (`guideBlind` in `brain.ts`) steers it tile by tile and
  assumes it moves on the tick it is told. Any real delay in delivering a
  callout broke every run. So Can't see is only slower, never hesitant, and
  the callout delay is only on screen. Real hesitation needs a guide that
  tolerates it, which changes the bots `spec/rooms.test.ts` relies on: logged
  to the backlog.
- **Can't speak has little to do**, as playtest 1 found; in the feeds only
  Can't hear ever talks, so every visitor now sees it. Logged to the backlog.

## 5. How it is checked

- Unit, `src/game/bots/attract.test.ts`: the run only sends each seat what
  its role perceives; every seed the page reaches (1–60) clears room 1 in
  under 30 s; Can't see's pace slows the room; callouts show late.
- Unit, `src/client/lobbyCode.test.ts`: the code filter.
- Browser, `spec/layout/home.test.ts`: the join button is above the fold on
  a phone; the Can't see feed is black and the others show the map (canvas
  pixels); the feeds hold still under reduced motion; the waiting list
  appears once a team opens, shows four rows and expands to all of them,
  with no axe violations; short codes are refused with a reason.
- The old "Join stays on one line" spec measured the button's height (≤ 50
  px) as a stand-in for one line, so a deliberately taller button broke it.
  It now counts the label's line boxes, and was checked to fail on a
  squeezed, wrapped label.
- `pnpm check` green against a production build (829 passed). Run against
  `pnpm dev`, four unrelated specs failed (font caching, lobby, wizard);
  CLAUDE.md says to check against `pnpm build && pnpm start`.
- Looked at by screenshot at 375, 390, 1024, 1280 and 1440 px wide, with no
  teams, two, and nineteen.
