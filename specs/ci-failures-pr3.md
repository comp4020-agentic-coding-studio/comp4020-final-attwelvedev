# CI failures on PR 3 (draft): handoff

Rewritten 2026-11-10 after the flaky browser tests were replaced. The per-failure evidence (numbers, probes, what was
shown red) is in the commit messages named below; `git log --grep "PR 3 CI"` lists them. PR 3 is `auto/overnight`, still
a draft. Do not merge it while CI is red or flaky: the `deploy` job runs on `main` for this public repo.

## Where it stands

- Remote head is `9f43c63`, pushed. CI run 42629293965 on it passed in all four attempts (the first, then three
  `gh run rerun`s), and `pnpm check:flaky 4` (2 idle, 2 under load, the app started without `INTRO_MS=0`) passed 4 of 4.
  Before it, the same branch passed 3 of 8 attempts (42579267291 passed then failed; 42586723384, 42595732106,
  42605097983 failed; 42611330796 passed twice and failed once). Four passes in a row is the best evidence so far and
  still not proof: one earlier commit passed twice before it failed.
- The `pull_request` trigger did not fire for two pushes earlier (a81c081, 1c936f2), cause unknown. If a push starts
  no run after a few minutes: `gh workflow run checks.yml --ref auto/overnight` (the deploy job needs `main`, so a
  dispatch cannot deploy). Find a run by its ID: `headSha` is the full 40 characters.

## What was done: replaced, not fixed

The user's decision (2026-11-10): the flaky browser tests are replaced by tests that cannot flake, checking the same
logic, and if a replacement is not cheap and clearly red-to-green the test is deleted. A browser test that walks a
figure with held keys, or reads a canvas picture across a clock, is the shape that failed; the logic each guarded
lives in pure code, which a unit test reaches with a tick count and no clock.

| was | now | commit |
|---|---|---|
| labels rooms 3, 5, 7 (a walk) | `src/client/render/labels-layout.test.ts`; the browser test is one check at room 5's spawn | `ca007d9` |
| door-pill (three seats walk onto plates, poll the pill's pixels inside 4 s) | `src/client/render/door-pill.test.ts`: the sim walks the seats a fixed tick count, `openedDoors`, the real `draw()` on a recording canvas at 1280 and 375 | `351e71a` |
| spectator "receives the msgs the followed seat receives" (a callout raced the follow) | `src/net/follow.ts` (`followersOf`, pulled out of `attach.ts`, used by messages and voice) and its test; the spec keeps "can't send" | `ff873ca` |
| reveal "take I'm ready back" (failed once, no cause) | `src/components/RoleRevealReady.test.ts` (buttons, `onReady`, crew rows); the server half was already `unready` in `game.test.ts` | `5a3ae09` |
| escape-hud "shows what you carry" (a walk onto the gear) | `src/components/GearTake.test.ts`: `viewFor` with a figure placed on gear, then the real `ActHint` and `GearSlot`; `nudgeTo` removed | `fba14ae` |
| game: three restart tests (menu asks twice; No keeps everyone in place; move after a restart) | a test in `src/net/game.test.ts` that `restartGame` forgets the old held input; the vote tests were already there | `9f43c63` |

Earlier fixes that stay in place, not replaced: door-pill's wall after each plate is still the fixture
(`3c03d5d`), reveal "joins late" has a spec poll default of 8 s (`56f4397`), the standing unit tests were split
(`f746849`), and escape-hud's gear walk helper `walk` is still used by the net trace test.

## What the replacements no longer check

Each is also in its commit message. Nothing covers these now:

- **door-pill:** the pill's real pixels with the real font; its clearance from the DOM boxes of `.captions` and
  `.hud-top`.
- **spectator:** that the server's `spectate` handler writes the follow map `followersOf` reads.
- **reveal:** the path through two real pages and the server. The hypothesis for the one failure (`send` in
  `src/client/socket.ts` drops a message while the socket is not open, and `Game.tsx` sets `ready` before sending)
  has no check and is not fixed.
- **escape-hud:** the page showing the take after Space over a real socket; the crew row's gear chip.
- **game restarts:** the page dropping its prediction when the tick goes backwards (`Game.tsx` `onView`); the menu
  asking twice; the "Not restarted: Bo kept playing" message; the page walking again after a real restart.
- **labels:** real text widths (a width per character stands in).

## Unexplained, with reports in place

Two failed once in a local full check and then passed every time (home, reveal); labels failed once in CI. None has
failed since. Their failure messages say what happened (`eb904dd`, `5d49130`, `10fa998`):

- **home "holds still with reduced motion".** Two screenshots 400 ms apart differed; no cause in 120 tries. The most
  likely of these to fail again (nothing replaces it and its cause is unknown).
- **labels room 05 (run 42611330796 attempt 3).** The walk it came from no longer exists.
- **reveal "I'm ready"**: replaced (above); the cause was never shown.

## Not replaced, and why

`game.test.ts` "shows each role's frame..." and "moves the deaf player's avatar within 500 ms" (hold a key, compare
hashes), `hud.test.ts`'s four-restart test, `wheel`, `braille`, `voice`, `sight`, `intro`, `home` reduced motion.
Past failures found in history: `wheel` (axe contrast and timeouts under full-suite load, in October and again in a
full check of the 2026-10-28 overnight plan; causes partly fixed in `b27e8e6` and `ef2da6d`), `voice` (an `afterAll`, October), `sight` (load, and one real bug since
fixed), `home` (above). None failed in the four CI attempts or four local flaky runs on `9f43c63`. Replace one only
after it fails again, naming its spec from the CI log: replacing on a guess gives up coverage for no gain shown.

## Verifying

- **Run the app the way CI does.** `pnpm start:check` sets `INTRO_MS=0`, so the room's 2.4 s start hold is over at
  once and a spec that moves a seat right after a start or restart passes locally and fails in CI. `pnpm check:flaky`
  starts its own app without it, so it already runs as CI does. To start one yourself:
  `PORT=8091 DATABASE_PATH="$(mktemp -d)/app.db" node server.ts`, then `APP_URL=http://localhost:8091 pnpm check`.
  Another process may hold :8080 (a stale `astro dev` did, and the suite then ran against it).
- A replacement is shown red by breaking the code it guards, through a script that asserts the text it replaces and
  never a bare `sed` (macOS `sed -i` needs an argument and one silently did not apply). Restore with `git checkout`
  and re-run.
- Reruns: `gh run rerun <id>` makes a new attempt of the same commit; `gh run view <id> --attempt N` reads one.
  Attempts must be started one after another.

## Decisions, and what is left

- **CLAUDE.md note about `INTRO_MS=0`:** not added. CLAUDE.md already says CI starts the app without it and that a
  spec waits for a first tick with `nextTick`'s default. The part that was not there (`data-intro` still reads the old
  room's `done` after a restart; wait for `tick` in `data-net`) concerned the restart tests, which are gone.
- **PROCESS_LOG.md:** entry written (2026-11-10, flaky tests replaced).
- **Open:** whether to merge PR 3 (a deploy to `main`); the docs commit that holds this file is not pushed.

## Found along the way, not fixed

- `game.test.ts` "shows each role's frame, and only the sighted roles' canvas has walls" cannot fail for its main
  claim: with the blind page handed the whole map and the renderer's blind check removed, it still passes.
- Shuffling `hud.test.ts` is not a valid check: the unmodified file fails under the same seeds.
- The runner is about 2.5 times slower per file than a 12-core laptop (reveal.test.ts is 131 s here, 324 s in CI).
- Docker `--cpus=2` was dropped: `labels` and `escape-hud` start their own `node server.ts` and never use the
  container CI starts.

## Do not

- Raise a timeout to make a failing test pass (CLAUDE.md, "Flaky tests").
- Retry until green, or call a branch fixed on one pass.
- Trust "passes under throttle" or "passes under shuffle" as proof a failure is gone: the walks that failed in CI
  never failed locally under 24 busy loops or 8x throttle.
