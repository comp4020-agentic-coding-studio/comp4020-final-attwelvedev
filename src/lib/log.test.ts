import { describe, expect, it } from "vitest";
import {
  inRequest,
  logDetail,
  newRequestContext,
  redact,
  stdoutSink,
  withRequestContext,
} from "./log.ts";

describe("redact", () => {
  it("drops every key outside the allowlist", () => {
    const fields = {
      note: "ring the bell",
      lat: -35.28,
      lng: 149.12,
      token: "abc",
      cookie: "pantry_device=abc",
      photo: "data:...",
      memberName: "Sam",
      itemName: "milk",
    };
    expect(redact(fields)).toEqual({});
  });

  it("keeps the allowlisted keys with primitive values", () => {
    expect(
      redact({ outcome: "used", via: "code", kind: "taken", count: 3, reason: false }),
    ).toEqual({ outcome: "used", via: "code", kind: "taken", count: 3, reason: false });
  });

  it("drops object, array and null values even under an allowed key", () => {
    expect(redact({ outcome: { a: 1 }, via: ["code"], kind: null, count: undefined })).toEqual({});
  });

  it("clamps a long string to 40 characters", () => {
    expect(redact({ reason: "x".repeat(200) }).reason).toBe("x".repeat(40));
  });
});

describe("logDetail", () => {
  it("adds allowlisted detail to the current request's context", async () => {
    const ctx = newRequestContext();
    await withRequestContext(ctx, async () => {
      logDetail({ outcome: "used", note: "private" });
    });
    expect(ctx.detail).toEqual({ outcome: "used" });
  });

  it("does nothing, and does not throw, outside a request", () => {
    expect(() => logDetail({ outcome: "used" })).not.toThrow();
  });

  it("keeps two concurrent contexts apart", async () => {
    const a = newRequestContext();
    const b = newRequestContext();
    const tick = () => new Promise((resolve) => setTimeout(resolve, 1));
    await Promise.all([
      withRequestContext(a, async () => {
        logDetail({ via: "link" });
        await tick();
        logDetail({ count: 1 });
      }),
      withRequestContext(b, async () => {
        await tick();
        logDetail({ via: "code" });
      }),
    ]);
    expect(a.detail).toEqual({ via: "link", count: 1 });
    expect(b.detail).toEqual({ via: "code" });
  });

  it("keeps the detail when the handler throws", async () => {
    const ctx = newRequestContext();
    await expect(
      withRequestContext(ctx, async () => {
        logDetail({ via: "code" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(ctx.detail).toEqual({ via: "code" });
  });
});

describe("inRequest", () => {
  // a rewrite runs the middleware again inside the first run, and must not log twice
  it("is true only inside a request context", async () => {
    expect(inRequest()).toBe(false);
    await withRequestContext(newRequestContext(), async () => {
      expect(inRequest()).toBe(true);
    });
    expect(inRequest()).toBe(false);
  });
});

describe("stdoutSink", () => {
  it("writes one JSON line", () => {
    const written: string[] = [];
    stdoutSink({ a: 1 }, (text) => written.push(text));
    expect(written).toEqual(['{"a":1}\n']);
  });

  it("swallows a write that throws", () => {
    expect(() =>
      stdoutSink({ a: 1 }, () => {
        throw new Error("EPIPE");
      }),
    ).not.toThrow();
  });
});
