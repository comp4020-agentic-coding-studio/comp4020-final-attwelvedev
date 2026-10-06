import { defineConfig } from "vitest/config";

// `unit` tests sit beside the code and need no server. `spec` tests run
// against the running app, which spec/global-setup.ts finds.
export default defineConfig({
  test: {
    projects: [
      { extends: true, test: { name: "unit", include: ["src/**/*.test.ts"] } },
      {
        extends: true,
        test: {
          name: "spec",
          include: ["spec/**/*.test.ts"],
          // Multi-household setups take several round trips each; against the
          // deployed app (Sydney) that is more than vitest's default 5 s. The
          // 1 s live-sync bounds are assertions in the specs, not this timeout.
          testTimeout: 30_000,
          globalSetup: ["./spec/global-setup.ts"],
        },
      },
    ],
  },
});
