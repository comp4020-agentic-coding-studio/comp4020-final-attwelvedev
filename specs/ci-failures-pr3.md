# CI failures on PR 3 (draft): what they were, and where it stands

Rewritten 2026-11-09 after the first green run. The earlier version of this file (commit a52e4d5) recorded
seven red runs and a list of causes that had been ruled out; it did not find the cause. This one records what
did.

## The state

CI run 42579267291 (commit eb904dd) is green: all eleven steps, including the process-evidence check and both
secret scans, which had never run on this branch because the `Run the spec` step failed first. The job took
17 m 23 s of its 20 minute cap. One green run is not proof: the walk failures hit 5 of 7 earlier runs, and the
unexplained ones below hit once each. See "Re-run" for a second attempt of the same commit.

## What the failures were

Run 8 (commit b6eb919) added `data-net` to the game canvas (`src/client/nettrace.ts`): inputs sent, the last seq,
the server's ack and tick, and the server's position. It settled where the seven earlier runs had not:

    room 03, labels: sent=541 seq=610 ack=610 tick=607 srv=16.300,5.500   self 16.300,5.500

The server heard every input (`ack` equals `seq`), and its position equals the page's `data-self`. So the stalls
were not lost inputs, a stale `seq`, a wrong drawn position or a wall. The figure was still moving.

- **labels, rooms 03 and 05: the walk, not the app.** It walked in 45 ms key taps and read the page between them.
  A pass of that loop took 115 to 190 ms in CI (about 50 ms locally; run 9 recorded it per pass), and a tap
  moved the figure about 0.04 tile, so it covered 9 tiles in 30 s. Horizontal legs now hold the key and watch
  the figure's x inside the page, sampling the drawn boxes while it moves. Vertical legs stay on taps: a held
  key wedged the figure on the one-tile gap at x 25 in room 05 (found by running it).
- **escape-hud, "shows what you carry": overshoot.** The walk held a key until x >= 22.2 and stopped when its
  poll saw it; on a loaded runner the key-up came late and the figure was carried past the gear (23.054 to
  23.500), so "Space Take the ..." never showed. It now holds to x >= 20 and nudges onto the gear with short taps
  (`nudgeTo`). Shown red: with a 700 ms late key-up the old walk ended 1 to 3 tiles past the gear; the new one
  passes.
- **reveal, "a watcher who joins late": a 1 s default.** `expect.poll` with no timeout of its own waits 1 s
  (vitest's default); a fresh page takes about 0.5 s to draw its first frame here (0.66 s at 4x throttle, 0.8 to
  0.9 s at 8x), and a slower runner crossed it. The spec project now sets `expect.poll.timeout` to 8000
  (`vitest.config.ts`; `spec/poll-default.test.ts` fails without it). A poll that sets its own timeout keeps it.
- **standing, "feet are partly lit" (unit, 20 s limit): one test doing the work of ten.** 9.6 s here, 23 s in
  CI. Profiling put 8.6 s of it in `viewAt` (a fresh view per figure position, about 24,000 of them). Building the
  view once per viewer and moving the figure in does not match a fresh view in 212 of 23,905 cases, so it was
  split instead: ten tests (room by standing place), about 1 s each, and the "clears each column of a front" test
  (17.7 s in the same log) into its closed and open halves. The slowest test in the file went from 10.5 s to 4.8 s.

## Still unexplained

Each failed once in a full local check (the one run just before f746849 was committed), then passed 3 of 3 on its own and in 4 of 4
`pnpm check:flaky` runs. Neither has a cause. `eb904dd` makes each explain itself if it fails again:

- **reveal, "lets a person take I'm ready back".** Bo's "Ready" never showed on the host within 8 s. Hypothesis, not
  shown: `send` in `src/client/socket.ts` drops a message while the socket is not open, and the reveal flips its
  own button first, so a send that never left the page looks the same as an update the host never drew. The
  failure now reports every non-ping message Bo's page sent, the sockets' states, Bo's buttons and the host's row.
- **home, "holds still with reduced motion".** The still feed changed between two screenshots 400 ms apart. A
  guess (the button shows before the first still frame is painted) did not reproduce in 120 tries at 1x, 4x and 8x
  throttle. The failure now reports the canvas size, box, font status and scroll before and after, and whether a
  third frame matches the second.
- **spectator.test.ts** ("no msg message within 2000 ms") failed once in seven earlier runs and never reproduced.

## Ruled out, each with a measurement

From the earlier report, still true: short key taps are not dropped (45 ms taps moved the figure 40 of 40 times at
1x); the page paints; the server's ticks run on time (19.4 a second idle and under 24 busy loops); stations are not
solid; a blur drops a held key (true, `input.ts`) but is not what CI hit; hand-holding does not steal the walker's
input. Added since: lost or stale inputs (`ack` equals `seq` in CI), a wrong drawn position (`data-self` equals the
server's), and a connection drop in the walk (`conn Live` with the clock running the full 30 s).

## A wrong turn worth keeping

The first hypothesis (after reading `Game.tsx`) was a stale `seq`: the input effect re-runs on `[rt, socket, online,
touch]`, `createInput` restarts its counter at 1, and the server drops any seq below the last. It was wrong: a
reconnect resets the server's input (`attach.ts:1266`), `online` only changes on a real drop, and `touch` flips
before the intro ends, when nothing has been sent. The test that would have "guarded" it would have passed on the
unfixed code, so it was not written. A Docker `--cpus=2` run was also dropped: `labels.test.ts` and
`escape-hud.test.ts` start their own `node server.ts` and never talk to the container CI starts, so capping it
would have changed nothing for them.

## Things found along the way, not fixed

- **`spec/layout/game.test.ts` "shows each role's frame, and only the sighted roles' canvas has walls" cannot fail
  for its main claim.** With the blind page handed the whole map and the renderer's blind check removed, it still
  passes. It samples the blind canvas for one exact colour (`f4b9c3`).
- **Shuffling `spec/layout/hud.test.ts` is not a valid check:** the unmodified file fails under the same seeds.
- **Local vs CI:** the runner is roughly 2.5 times slower per file than a 12-core laptop (reveal.test.ts is 131 s
  here, 324 s in CI), and the spec step is most of the workflow's 20 minute cap. The green run used 17 m 23 s.
- **Running `pnpm check` needs the right port.** A stale `astro dev` held :8080 and `pnpm start:check` exited
  with EADDRINUSE; the suite then ran against that server and failed in files unrelated to the change. Start the
  app yourself on a free port and pass `APP_URL`.

## Do not

- Raise a timeout to make a failing test pass (CLAUDE.md, "Flaky tests"). The poll default above is a default for
  waits that never named a bound, shown red and chosen against measured times, not a bump to one failing wait.
- Merge with CI red: the `deploy` job runs on `main` for this public repo.
- Trust a "passes under shuffle" or "passes under throttle" result as proof a failure is gone. The old walk never
  failed locally under 24 busy loops or 8x throttle either.
