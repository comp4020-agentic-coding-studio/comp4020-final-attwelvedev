import { describe, expect, it } from "vitest";
import { failureThrottle, throttleKey } from "./throttle.ts";

const opts = { limit: 3, windowMs: 60_000 };

describe("failureThrottle", () => {
  it("is never blocked with no failures", () => {
    expect(failureThrottle(opts).blocked("a", 0)).toBe(false);
  });

  it("is not blocked before the limit and blocked at it", () => {
    const t = failureThrottle(opts);
    t.fail("a", 0);
    t.fail("a", 1);
    expect(t.blocked("a", 2)).toBe(false);
    t.fail("a", 2);
    expect(t.blocked("a", 3)).toBe(true);
  });

  it("unblocks once the window has passed", () => {
    const t = failureThrottle(opts);
    for (const at of [0, 1, 2]) t.fail("a", at);
    expect(t.blocked("a", 59_999)).toBe(true);
    expect(t.blocked("a", 60_002)).toBe(false);
  });

  it("keeps keys independent", () => {
    const t = failureThrottle(opts);
    for (const at of [0, 1, 2]) t.fail("a", at);
    expect(t.blocked("a", 3)).toBe(true);
    expect(t.blocked("b", 3)).toBe(false);
  });
});

describe("throttleKey", () => {
  it("prefers Fly's client address, else the socket address", () => {
    expect(throttleKey(new Headers({ "fly-client-ip": "1.2.3.4" }), "127.0.0.1")).toBe("1.2.3.4");
    expect(throttleKey(new Headers(), "127.0.0.1")).toBe("127.0.0.1");
  });
});
