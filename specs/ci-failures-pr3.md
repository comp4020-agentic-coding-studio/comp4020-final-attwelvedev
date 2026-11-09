# CI failures on PR 3 (draft): what they were, and where it stands

Rewritten 2026-11-09 after the first green run, and corrected the same day once its re-run failed. The earlier
version of this file (commit a52e4d5) recorded seven red runs and a list of causes that had been ruled out; it did
not find the cause. This one records what did, and what is still open.

## The state

Eight CI attempts of nearly the same code, three passes and five failures. The last commit alone (5ed2beb) passed twice and failed once:

| run | commit | result | failed |
|---|---|---|---|
| 42579267291 attempt 1 | eb904dd | pass | (17 m 23 s of the 20 minute cap) |
| 42579267291 attempt 2 | eb904dd | fail | door-pill, game |
| 42586723384 | cc44612 | fail | labels (room 03), door-pill |
| 42595732106 (`workflow_dispatch`) | 1c936f2 | fail | labels (room 03), door-pill |
| 42605097983 | 882c113 | fail | spectator, game |
| 42611330796 attempt 1 | 5ed2beb | pass | (13 m 09 s) |
| 42611330796 attempt 2 | 5ed2beb | pass | (15 m 22 s) |
| 42611330796 attempt 3 | 5ed2beb | fail | labels (room 05), both tests: NO CAUSE FOUND |

After attempt 3 the labels walk was replaced (ca007d9, below), so that failure cannot recur in its old form.

The pull_request trigger did not fire for a81c081 or 1c936f2 (cause unknown; it fired for 882c113), hence the
dispatch. Every failure above now has a shown cause and a fix, in commits 3c03d5d and 0f65cf1 and earlier (see "What
the failures were"). Those two are the newest and are not yet in a CI run, so none of this is confirmed on the
runner. One commit passed once and failed once; do not call the branch fixed, or merge it, until several runs in a
row are green.

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
- **game, "back at spawn" (CI run 42605097983, and my own replacement of it): a deterministic failure my local runs
  hid.** The first version compared canvas pictures after a "settle" that returns its last frame whether or not it
  held still (attempt 2 of 42579267291). The replacement read `data-self` but moved the figure right after the
  restart's vote was accepted, while the restarted room's start (2.4 s as CI runs the app) still locks input, so the
  figure stayed on the spawn: `moved away from the spawn: expected 0 to be greater than 1`. Reproduced 3 of 3 by
  running the app without `INTRO_MS=0`, which `pnpm start:check` sets and CLAUDE.md tells you to use, so every
  local check passed. It now waits for the restart from the server's tick in `data-net` (below what it was, then at
  least 1). `data-intro="done"` was tried first and does not work: it still reads the old room's `done` for a
  moment after a restart. Passes with the real intro, with `INTRO_MS=0`, at 8x throttle and with the restart
  reaching the world 600 ms late; red under a restart that leaves everyone in place and a figure that never moves.
  The picture is no longer compared, and nothing else checked it. Two other tests in `game.test.ts` compare canvas
  hashes the same way and are unchanged (neither has failed).
- **spectator, "receives the msgs the followed seat receives" (two CI failures, `no "msg" message within 2000
  ms`): a race in the test.** It sent one callout without waiting for the server to handle `spectate`, and a
  callout sent before that reaches nobody the spectator follows and is lost. With the follow made to take effect
  400 ms late the old test failed 3 of 3 with the CI message at the CI line. It now sends the callout again every
  200 ms until the spectator gets one (a callout has no cooldown, so a repeat is never refused). Waiting for a
  view whose `you.seat` is the followed seat was tried first and failed under the same late follow: the view
  takes its seat from the `spectate` message itself.
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
- **labels room 05, run 42611330796 attempt 3: both tests, no cause found, and the walk is gone (ca007d9).** The
  figure was stuck at (9.5, 4.6): inside the one-tile gap at x 9, 0.9 short of the corridor row it walked to. One
  failure had `conn` Offline (clock stopped at 0:10, `ack` 3 behind `seq`); the other was Live with `ack` equal to
  `seq`, the clock at 0:33 and x unchanged over 358 passes. Room 05 has no camera or guard, so it is not the room-3
  catch, and locally the tap walk crosses that gap in 10 to 20 passes at 1x and at 6x. Never reproduced, never
  explained. The test existed to read where the label chips fall, which needs no walking: the layout is now a unit
  test (`src/client/render/labels-layout.test.ts`) that runs the page's own `labelsFor` and `draw` on a recording
  canvas from every floor tile of rooms 3, 5 and 7, at 1280 and 375, in about 7 s. What that gives up: it uses 5 and
  7 px a character for the text, bracketing the real Archivo 600 at 13 px (5.7 to 6.2, measured in Chrome), not the
  real font; and the browser test that remains stands at room 5's spawn, where the wires chip is in view and no
  plaque is, so it checks that the page publishes well-formed boxes and cannot show a chip on a plaque. Shown red
  under: no plaque clamp, no free-place check, plaques not taken places, a chip off the canvas (the unit test
  missed that at first; a bounds check was added), and, in the browser, the page not publishing.

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
