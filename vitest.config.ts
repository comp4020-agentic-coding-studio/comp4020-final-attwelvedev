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
          globalSetup: ["./spec/global-setup.ts"],
        },
      },
    ],
  },
});
