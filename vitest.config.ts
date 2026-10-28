import { defineConfig } from "vitest/config";

// `unit` tests sit beside the code and need no server. `spec` tests run
// against the running app, which spec/global-setup.ts finds.
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          // The slowest unit test (a loop of bot simulations) takes under a second on a quiet
          // machine, but once missed the default 5 s when it ran alongside a dozen browsers
          // (they now run after it, see the spec project). Roomy enough for a busy machine, and
          // a test that really hangs still fails in 20 s, not never.
          testTimeout: 20_000,
          sequence: { groupOrder: 0 }, // first, at full width; then the browser specs (below)
        },
      },
      {
        extends: true,
        test: {
          name: "spec",
          include: ["spec/**/*.test.ts"],
          // Multi-household setups take several round trips each; against the
          // deployed app (Sydney) that is more than vitest's default 5 s. The
          // 1 s live-sync bounds are assertions in the specs, not this timeout.
          testTimeout: 30_000,
          // Launching Chrome in a file's beforeAll takes seconds on a small CI runner
          // with dozens of files starting at once; the default 10 s is not enough there.
          hookTimeout: 60_000,
          // Each spec file drives its own Chrome. Left to the default (cores - 1, so 11 on a
          // 12-core laptop) they starved the machine: load average 200+, and ~100 browser specs
          // timed out at 30 s that pass alone. Capped at 3 the whole spec project passed in every
          // run, at about 210 s (2026-10-28). Unit tests are not capped: they need no browser.
          maxWorkers: 3,
          sequence: { groupOrder: 1 }, // vitest needs its own group for a different maxWorkers
          globalSetup: ["./spec/global-setup.ts"],
        },
      },
    ],
  },
});
