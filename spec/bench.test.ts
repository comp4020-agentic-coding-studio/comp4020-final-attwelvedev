import { describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

// The frame bench (scripts/bench-frame.ts) runs the real renderer on a page that exists only when the
// server is started with BENCH=1; on the app people use it is not there.
describe("the frame bench page", () => {
  it("GET /bench is 404 without BENCH", async () => {
    const res = await fetch(new URL("/bench", baseUrl));
    expect(res.status).toBe(404);
  });
});
