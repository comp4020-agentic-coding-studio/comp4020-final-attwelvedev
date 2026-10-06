import { describe, expect, it } from "vitest";
import { cleanRid, failure, json, wantsJson } from "./http.ts";

describe("wantsJson", () => {
  it.each(["application/json", "text/html, application/json;q=0.9"])("is true for %s", (accept) => {
    expect(wantsJson(new Headers({ accept }))).toBe(true);
  });

  it.each([["text/html"], ["*/*"]])("is false for %s", (accept) => {
    expect(wantsJson(new Headers({ accept }))).toBe(false);
  });

  it("is false with no Accept header", () => {
    expect(wantsJson(new Headers())).toBe(false);
  });
});

describe("json", () => {
  it("sets the content type and status, defaulting to 200", async () => {
    const res = json({ a: 1 });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ a: 1 });
    expect(json({ error: "no" }, 404).status).toBe(404);
  });
});

describe("cleanRid", () => {
  it("keeps a request id of letters, digits, _ and -, up to 64 characters", () => {
    expect(cleanRid("abc_DEF-123")).toBe("abc_DEF-123");
    expect(cleanRid("x".repeat(64))).toBe("x".repeat(64));
  });

  it.each([["x".repeat(65)], ["has space"], [""], [undefined], [42]])("drops %s", (rid) => {
    expect(cleanRid(rid)).toBeUndefined();
  });
});

describe("failure", () => {
  it("is { error } for JSON callers and the plain message otherwise", async () => {
    expect(await failure(true, 404, "No such item.").json()).toEqual({ error: "No such item." });
    const plain = failure(false, 404, "No such item.");
    expect(plain.status).toBe(404);
    expect(await plain.text()).toBe("No such item.");
  });
});
