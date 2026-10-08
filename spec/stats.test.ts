import { randomInt, randomUUID } from "node:crypto";
import { describe, expect, inject, it } from "vitest";
import { client } from "./http.ts";

const baseUrl = inject("baseUrl");
const ownAddress = () => ({
  "fly-client-ip": `10.${randomInt(256)}.${randomInt(256)}.${randomInt(256)}`,
});

interface Stats {
  requests: number;
  errors: number;
  actions: Record<string, number>;
  activeDevices: number;
  perMinute: { minute: number; n: number }[];
  recent: { ts: string; who: string | null; action: string; status: number }[];
}

const stats = async (): Promise<Stats> =>
  (await (await fetch(new URL("/stats.json", baseUrl))).json()) as Stats;

describe("the stats view", () => {
  it("answers /stats.json without a session, uncached, with the snapshot keys", async () => {
    const res = await fetch(new URL("/stats.json", baseUrl));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as Stats & { since: number; now: number };
    expect(Object.keys(body).sort()).toEqual(
      [
        "actions",
        "activeDevices",
        "errors",
        "now",
        "perMinute",
        "recent",
        "requests",
        "since",
      ].sort(),
    );
    expect(body.perMinute).toHaveLength(10);
  });

  it("counts what people do", async () => {
    const before = await stats();
    const me = client(baseUrl, { headers: ownAddress() });
    await me.get("/");
    await me.get("/");
    const after = await stats();
    expect(after.actions["view.home"]).toBeGreaterThanOrEqual(
      (before.actions["view.home"] ?? 0) + 2,
    );
    expect(after.requests).toBeGreaterThanOrEqual(before.requests + 2);
    expect(
      after.recent.some((r) => r.action === "view.home" && r.who?.match(/^[0-9a-f]{8}$/)),
    ).toBe(true);
  });

  it("shows no name or message, in the data or the page", async () => {
    const secret = `SECRET-${randomUUID().slice(0, 8)}`;
    // routes are patterns, so a query string never reaches the log or the counts
    await fetch(new URL(`/?nickname=${secret}`, baseUrl));
    const data = await (await fetch(new URL("/stats.json", baseUrl))).text();
    const page = await (await fetch(new URL("/stats", baseUrl))).text();
    expect(data).not.toContain(secret);
    expect(page).not.toContain(secret);
  });

  it("does not count looking at itself", async () => {
    // Other specs add requests at the same moment, so the site-wide total can't
    // be compared; the per-action table only ever grows, so a view that counted
    // itself would leave its own route in it for good.
    await fetch(new URL("/stats", baseUrl));
    await fetch(new URL("/stats.json", baseUrl));
    const { actions } = await stats();
    expect(Object.keys(actions).filter((action) => action.includes("/stats"))).toEqual([]);
  });

  it("serves a page headed Activity", async () => {
    const res = await fetch(new URL("/stats", baseUrl));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("Activity");
  });
});
