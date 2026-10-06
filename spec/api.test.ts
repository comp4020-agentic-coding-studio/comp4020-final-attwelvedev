import { describe, expect, inject, it } from "vitest";
import { type Client, client } from "./http.ts";

const baseUrl = inject("baseUrl");
const JSON_HEADERS = { accept: "application/json" };

async function signedIn(memberName = "Sam"): Promise<Client> {
  const me = client(baseUrl);
  await me.post("/households", { householdName: "Unit 4", memberName });
  return me;
}

// biome-ignore lint/suspicious/noExplicitAny: the specs read arbitrary JSON bodies
const asJson = (res: Response) => res.json() as Promise<Record<string, any>>;

describe("GET /api/pantry", () => {
  it("returns the Snapshot for the signed-in member", async () => {
    const me = await signedIn("Sam");
    await me.post("/items", { name: "milk" });
    const res = await me.get("/api/pantry");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const snap = await asJson(res);
    expect(snap.household.name).toBe("Unit 4");
    expect(snap.me.name).toBe("Sam");
    expect(snap.members.map((m: { name: string }) => m.name)).toEqual(["Sam"]);
    expect(snap.items.map((i: { name: string }) => i.name)).toEqual(["milk"]);
    expect(Object.keys(snap.items[0]).sort()).toEqual(
      [
        "category",
        "count",
        "createdAt",
        "createdBy",
        "estimatedExpiry",
        "exactAmount",
        "exactExpiry",
        "exactUnit",
        "expirySetAt",
        "expirySetBy",
        "fillStop",
        "householdId",
        "iconKey",
        "id",
        "measure",
        "name",
        "valueSetAt",
        "valueSetBy",
      ].sort(),
    );
  });

  it("is 401 with a JSON error without a session", async () => {
    const res = await client(baseUrl).get("/api/pantry");
    expect(res.status).toBe(401);
    expect(await asJson(res)).toEqual({ error: expect.any(String) });
  });
});

describe("JSON variants of the item endpoints", () => {
  it("POST /items answers 201 { item, rid }", async () => {
    const me = await signedIn();
    const res = await me.post("/items", { name: "milk", rid: "r-1" }, JSON_HEADERS);
    expect(res.status).toBe(201);
    const body = await asJson(res);
    expect(body.item.name).toBe("milk");
    expect(body.rid).toBe("r-1");
  });

  it("POST /items drops an invalid rid, and answers 400 for a blank name and 401 without a session", async () => {
    const me = await signedIn();
    const ok = await asJson(
      await me.post("/items", { name: "eggs", rid: "has space" }, JSON_HEADERS),
    );
    expect(ok.rid).toBeUndefined();
    const blank = await me.post("/items", { name: " " }, JSON_HEADERS);
    expect(blank.status).toBe(400);
    expect(await asJson(blank)).toEqual({ error: expect.any(String) });
    const anon = await client(baseUrl).post("/items", { name: "x" }, JSON_HEADERS);
    expect(anon.status).toBe(401);
  });

  it("outcome answers 200 { historyId, itemId, itemName, outcome }, and undo answers 200 { item }", async () => {
    const me = await signedIn();
    const { item } = await asJson(await me.post("/items", { name: "milk" }, JSON_HEADERS));
    const used = await me.post(`/items/${item.id}/outcome`, { outcome: "used" }, JSON_HEADERS);
    expect(used.status).toBe(200);
    const body = await asJson(used);
    expect(body).toEqual({
      historyId: expect.any(String),
      itemId: item.id,
      itemName: "milk",
      outcome: "used",
    });
    const undone = await me.post(`/history/${body.historyId}/undo`, {}, JSON_HEADERS);
    expect(undone.status).toBe(200);
    expect((await asJson(undone)).item.id).toBe(item.id);
  });

  it("answers 400, 404 and 401 as { error }", async () => {
    const me = await signedIn();
    const { item } = await asJson(await me.post("/items", { name: "milk" }, JSON_HEADERS));
    const bad = await me.post(`/items/${item.id}/outcome`, { outcome: "given" }, JSON_HEADERS);
    expect(bad.status).toBe(400);
    expect(await asJson(bad)).toEqual({ error: expect.any(String) });
    const missing = await me.post("/items/nope/outcome", { outcome: "used" }, JSON_HEADERS);
    expect(missing.status).toBe(404);
    expect(await asJson(missing)).toEqual({ error: expect.any(String) });
    expect((await me.post("/history/nope/undo", {}, JSON_HEADERS)).status).toBe(404);
    const anon = client(baseUrl);
    expect(
      (await anon.post(`/items/${item.id}/outcome`, { outcome: "used" }, JSON_HEADERS)).status,
    ).toBe(401);
    expect((await anon.post("/history/x/undo", {}, JSON_HEADERS)).status).toBe(401);
  });

  it("another household's item is a 404, not a leak", async () => {
    const me = await signedIn();
    const other = await signedIn("Zed");
    const { item } = await asJson(await other.post("/items", { name: "tea" }, JSON_HEADERS));
    expect(
      (await me.post(`/items/${item.id}/outcome`, { outcome: "used" }, JSON_HEADERS)).status,
    ).toBe(404);
  });

  it("without Accept: application/json the form endpoints still answer 303", async () => {
    const me = await signedIn();
    expect((await me.post("/items", { name: "milk" })).status).toBe(303);
    const html = await (await me.get("/")).text();
    const id = html.match(/\/items\/([^/"]+)\/outcome/)?.[1];
    const used = await me.post(`/items/${id}/outcome`, { outcome: "used" });
    expect(used.status).toBe(303);
    expect(used.headers.get("location")).toMatch(/^\/\?undo=/);
  });
});
