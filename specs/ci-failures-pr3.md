# CI failures on PR 3 (draft): what they were, and where it stands

Rewritten 2026-11-09 after the first green run, and corrected the same day once its re-run failed. The earlier
version of this file (commit a52e4d5) recorded seven red runs and a list of causes that had been ruled out; it did
not find the cause. This one records what did, and what is still open.

## The state

CI run 42579267291 (commit eb904dd) passed on its first attempt, the first green run on this branch: all eleven
steps, including the process-evidence check and both secret scans, which had never run here because the `Run the
spec` step failed first. It took 17 m 23 s of the 20 minute cap. Attempt 2 of the same commit FAILED, in two files
that had not failed before: `door-pill` ("shows a pill at the edge toward the door at 1280") and `game` ("gives
every player a Restart ... back at spawn"). Neither has a cause yet (see "Still unexplained"); commit 5d49130
makes each explain itself when it fails again.

CI runs 42586723384 (cc44612) and 42595732106 (1c936f2, a `workflow_dispatch`; the pull_request trigger fired for
neither a81c081 nor 1c936f2, cause unknown) failed in `labels` room 03 and `door-pill` at 1280. Both now have a
shown cause (below) and a fix that is not yet in a CI run. Four runs of nearly the same code: one pass, three
failures, in five different files between them.

So one commit has passed once and failed once. The walk, `standing`, `reveal` and `home` tests that the fixes below
target passed in both attempts, which is encouraging and is two runs. The suite still has load-sensitive tests, and
the branch should not be called fixed, or merged, on this evidence.

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
- **labels again (runs 42586723384, 42595732106): the room's camera, not the walk.** Room 3 has a camera over its
  hall that watches 2.5 s of every 8 and sends the whole team back to the spawn when it sees anyone in its cone.
  A plain held-d walk probed locally is sent back once when it starts 2 to 5 s into the cycle (the
  `.caught-banner` shows) and not at 0, 1, 6 or 7 s. That fits what the CI reports showed and the earlier
  explanations did not: three passes that began at x 1.5 (the figure sent back), and a stall at a different x every
  run (8.2, 25.6, 16.9, 10.4, 17.5, 29.7). The test now copies room 3 with that camera's `watchingS` set to 0 (it is
  still there and still labelled). Not shown red: the committed test passes even at 8x throttle with a late start,
  so the catch is shown and that it caused the CI failure is inferred. An earlier version of this file blamed a
  dropped key on a window blur and 28083e0 added a press-every-poll hold for it; the injected blur reproduced a
  similar slowdown, but the cause was the camera. That change is harmless and stays.
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

The first two each failed once in a full local check (the one run just before f746849 was committed), then passed 3
of 3 on their own and in 4 of 4 `pnpm check:flaky` runs. The next two failed in CI attempt 2 only. None has a cause.
`eb904dd` and `5d49130` make each explain itself if it fails again:

- **reveal, "lets a person take I'm ready back".** Bo's "Ready" never showed on the host within 8 s. Hypothesis, not
  shown: `send` in `src/client/socket.ts` drops a message while the socket is not open, and the reveal flips its
  own button first, so a send that never left the page looks the same as an update the host never drew. The
  failure now reports every non-ping message Bo's page sent, the sockets' states, Bo's buttons and the host's row.
- **home, "holds still with reduced motion".** The still feed changed between two screenshots 400 ms apart. A
  guess (the button shows before the first still frame is painted) did not reproduce in 120 tries at 1x, 4x and 8x
  throttle. The failure now reports the canvas size, box, font status and scroll before and after, and whether a
  third frame matches the second.
- **door-pill, "shows a pill at the edge toward the door at 1280" (attempt 2, runs 42586723384, 42595732106): the
  figures overshot the plate, so the door never opened.** The plate is the tile at x 2 (`Math.floor(x) === 2`,
  step.ts updatePlates), x 2.0 to 3.0, and the door needs all three on their plates at once. The failure report
  (5d49130, 28083e0) said no pill of any size in 40 to 46 passes and, after the walk, the figures at x 3.1 and 3.06
  and the blind one after 9 inputs, about 3.3: all past the pad. A held key released when a poll sees the figure
  is released late on a loaded runner. Reproduced locally with a 500 ms late key-up: the figures ended at x 4.3 to
  4.5 and both tests failed with the CI report shape. Can't see's page publishes no position, and inputs sent do not
  measure distance (the server applies an input every tick until the next one), so a position check could not stop
  that figure; the fixture (`spec/fixtures/rooms-door`) now has a wall on the tile after each plate, so a held key
  carries each figure onto its plate and the wall stops it there. The late key-up and a blur every 150 ms pass.
  (Two earlier attempts at `standOn` were dropped: one counted `ack`, which counts reads and not moves, and one
  walked the blind figure past the plate.) The earlier "a slow pass missed a 4 s pill" idea is ruled out: no pill of
  any size was drawn at all.
- **game, "back at spawn".** Failed in CI attempt 2: after a restart, `settledHash` never equalled the spawn
  picture within 8 s. `settledHash` returns its last frame whether or not it held still, so "settled on the wrong
  picture" and "never settled" were indistinguishable in the old message. `settleReport` (`spec/playUi.ts`) now
  says which, with the figure's `data-self` beside the same reading at the spawn.
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
  here, 324 s in CI), and the spec step is most of the workflow's 20 minute cap. The green attempt used 17 m 23 s;
  the failed attempt's spec step took 16 m 22 s.
- **Running `pnpm check` needs the right port.** A stale `astro dev` held :8080 and `pnpm start:check` exited
  with EADDRINUSE; the suite then ran against that server and failed in files unrelated to the change. Start the
  app yourself on a free port and pass `APP_URL`.

## Do not

- Raise a timeout to make a failing test pass (CLAUDE.md, "Flaky tests"). The poll default above is a default for
  waits that never named a bound, shown red and chosen against measured times, not a bump to one failing wait.
- Merge with CI red: the `deploy` job runs on `main` for this public repo.
- Trust a "passes under shuffle" or "passes under throttle" result as proof a failure is gone. The old walk never
  failed locally under 24 busy loops or 8x throttle either.
