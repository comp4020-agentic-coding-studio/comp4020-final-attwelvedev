import { describe, expect, it } from "vitest";
import { json } from "./http.ts";

describe("json", () => {
  it("sets the content type and status, defaulting to 200", async () => {
    const res = json({ a: 1 });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ a: 1 });
    expect(json({ error: "no" }, 404).status).toBe(404);
  });
});
