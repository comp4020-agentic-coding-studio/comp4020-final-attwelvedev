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
    await me.post("/households", { householdName: "Unit 4", memberName: "Sam" });
    await me.post("/items", { name: "Milk" });
    const after = await stats();
    expect(after.actions["household.create"]).toBeGreaterThan(
      before.actions["household.create"] ?? 0,
    );
    expect(after.actions["item.add"]).toBeGreaterThan(before.actions["item.add"] ?? 0);
    expect(after.requests).toBeGreaterThanOrEqual(before.requests + 2);
    expect(after.recent.some((r) => r.action === "item.add" && r.who?.match(/^[0-9a-f]{8}$/))).toBe(
      true,
    );
  });

  it("shows no name, item or link token, in the data or the page", async () => {
    const tag = randomUUID().slice(0, 8);
    const secretItem = `SECRETMILK-${tag}`;
    const nosy = `NOSY-${tag}`;
    const me = client(baseUrl, { headers: ownAddress() });
    await me.post("/households", { householdName: `SECRETHOME-${tag}`, memberName: nosy });
    await me.post("/items", { name: secretItem });
    const html = await (await me.post("/household/invite-link")).text();
    const path = html.match(/\/join\/([A-Za-z0-9_-]{22})/)?.[0] ?? "";
    const token = path.split("/").pop() ?? "";
    expect(token).toHaveLength(22);
    await fetch(new URL(path, baseUrl)); // the page that carries the token in its path

    const data = await (await fetch(new URL("/stats.json", baseUrl))).text();
    const page = await (await fetch(new URL("/stats", baseUrl))).text();
    for (const secret of [secretItem, nosy, `SECRETHOME-${tag}`, token]) {
      expect(data).not.toContain(secret);
      expect(page).not.toContain(secret);
    }
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
