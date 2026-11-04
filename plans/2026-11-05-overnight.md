# Overnight run 2026-11-05: decisions made without the user
- bp01/task67: the plan says the cleared room "keeps ticking" until Next, but the server stops its
  interval on clear (`src/net/attach.ts` `tick`), so the stale view is only the cleared room's last
  one; and the bug is a race (it passes unless the new tick-0 view lands after Game re-mounts) → the
  spec waits for `cleared` instead of 500 ms of cleared ticks, and delays the new room's tick-0 view
  by 1.5 s with Playwright `routeWebSocket` to make the race deterministic, on its own app with two
  one-step fixture rooms (`spec/fixtures/rooms-next`) rather than room 1, because it reproduces the
  real failure in seconds instead of a 90 s route. Reversible by rewriting the spec to the plan's
  room-1 recipe (it would then pass on the old code most runs).
- bp01/task69: `pnpm format` rewrote the generated `__ids__/*.json` snapshots (Biome collapses and
  re-indents them), so they stopped matching the test's output → added `!src/game/rooms/__ids__` to
  biome.json's `files.includes`, the way `src/data/*.json` is excluded, because CLAUDE.md says never
  to format generated files and the snapshot must be byte-for-byte what the test writes. Reversible
  by removing that line and emitting Biome's layout from the test.
