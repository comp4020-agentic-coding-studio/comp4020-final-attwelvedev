import { describe, expect, inject, it } from "vitest";
import { joinCommunityByCode, newHousehold } from "./neighbours.ts";

const baseUrl = inject("baseUrl");

// Alone in its file on purpose. Fly's proxy overwrites the fly-client-ip the
// specs send, so on the deployed app every client shares the runner's address
// and this test blocks that address for a minute. Run it after the other
// specs have finished (or a minute before them), never beside them.
describe("the community join throttle", () => {
  it("answers 429 with Retry-After after ten wrong codes", async () => {
    const me = await newHousehold(baseUrl);
    for (let i = 0; i < 10; i++) {
      expect((await joinCommunityByCode(me, "NOPE-00")).status).toBe(400);
    }
    const blocked = await joinCommunityByCode(me, "NOPE-00");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("60");
  });
});
