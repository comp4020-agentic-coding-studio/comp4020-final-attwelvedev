import { describe, expect, it } from "vitest";

// A spec's `expect.poll` with no timeout of its own gets the spec project's default (vitest.config.ts), not
// vitest's 1 s: a freshly opened page took about 0.5 s to draw its first frame on a quiet laptop and
// reveal.test.ts failed in CI when a slower runner crossed 1 s. A wait that needs a bound says so itself.
describe("expect.poll in a spec", () => {
  it("waits longer than a second by default", async () => {
    const ready = Date.now() + 1500;
    await expect.poll(() => Date.now() >= ready).toBe(true);
  });
});
