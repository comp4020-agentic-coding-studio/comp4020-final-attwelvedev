import { describe, expect, inject, it } from "vitest";
import { type Client, client } from "./http.ts";

const baseUrl = inject("baseUrl");

async function signedIn(): Promise<Client> {
  const me = client(baseUrl);
  await me.post("/households", { householdName: "Unit 4", memberName: "Sam" });
  return me;
}

// Item ids appear in each row's form actions, so a black-box test can find them.
async function idOf(me: Client, name: string): Promise<string> {
  const html = await (await me.get("/")).text();
  const row = html.split("<li").find((chunk) => chunk.includes(`>${name}`));
  const id = row?.match(/\/items\/([^/"]+)\/outcome/)?.[1];
  if (!id) throw new Error(`no row for "${name}" in:\n${html}`);
  return id;
}

const location = (res: Response): URL => new URL(res.headers.get("location") ?? "", baseUrl);

describe("adding items", () => {
  it("adds an item by name only", async () => {
    const me = await signedIn();
    const res = await me.post("/items", { name: "milk" });
    expect(res.status).toBe(303);
    expect(location(res).pathname).toBe("/");
    expect(await (await me.get("/")).text()).toContain("milk");
  });

  it("rejects a blank name with 400", async () => {
    const me = await signedIn();
    expect((await me.post("/items", { name: "  " })).status).toBe(400);
  });

  it("allows duplicates", async () => {
    const me = await signedIn();
    await me.post("/items", { name: "milk" });
    await me.post("/items", { name: "milk" });
    const html = await (await me.get("/")).text();
    expect(html.match(/\/items\/[^/"]+\/outcome/g)?.length).toBe(4); // Used + Binned, twice
  });

  it("sends a request without a session back to /", async () => {
    const res = await client(baseUrl).post("/items", { name: "milk" });
    expect(res.status).toBe(303);
    expect(location(res).pathname).toBe("/");
  });
});

describe("outcomes", () => {
  it("marks an item used, shows an Undo, and undo brings it back", async () => {
    const me = await signedIn();
    await me.post("/items", { name: "milk" });
    const id = await idOf(me, "milk");

    const res = await me.post(`/items/${id}/outcome`, { outcome: "used" });
    expect(res.status).toBe(303);
    const to = location(res);
    expect(to.pathname).toBe("/");
    expect(to.searchParams.get("undo")).toBeTruthy();

    const after = await (await me.get(to.pathname + to.search)).text();
    expect(after).not.toContain(`/items/${id}/outcome`);
    expect(after).toContain("marked used");
    const undoAction = after.match(/action="(\/history\/[^"]+\/undo)"/)?.[1];
    expect(undoAction).toBeTruthy();

    const undo = await me.post(undoAction as string);
    expect(undo.status).toBe(303);
    expect(await (await me.get("/")).text()).toContain(`/items/${id}/outcome`);
  });

  it("records a binned outcome", async () => {
    const me = await signedIn();
    await me.post("/items", { name: "spinach" });
    const id = await idOf(me, "spinach");
    const res = await me.post(`/items/${id}/outcome`, { outcome: "binned" });
    expect(res.status).toBe(303);
    const to = location(res);
    expect(await (await me.get(to.pathname + to.search)).text()).toContain("marked binned");
  });

  it("rejects an unknown outcome with 400", async () => {
    const me = await signedIn();
    await me.post("/items", { name: "milk" });
    const id = await idOf(me, "milk");
    expect((await me.post(`/items/${id}/outcome`, { outcome: "eaten" })).status).toBe(400);
  });

  it("answers 404 for another household's item", async () => {
    const owner = await signedIn();
    await owner.post("/items", { name: "milk" });
    const id = await idOf(owner, "milk");
    const stranger = await signedIn();
    expect((await stranger.post(`/items/${id}/outcome`, { outcome: "used" })).status).toBe(404);
    expect(await (await owner.get("/")).text()).toContain(`/items/${id}/outcome`);
  });

  it("answers 404 for an item that's already removed", async () => {
    const me = await signedIn();
    await me.post("/items", { name: "milk" });
    const id = await idOf(me, "milk");
    await me.post(`/items/${id}/outcome`, { outcome: "used" });
    expect((await me.post(`/items/${id}/outcome`, { outcome: "binned" })).status).toBe(404);
  });

  it("answers 404 when undoing another household's record", async () => {
    const owner = await signedIn();
    await owner.post("/items", { name: "milk" });
    const id = await idOf(owner, "milk");
    const to = location(await owner.post(`/items/${id}/outcome`, { outcome: "used" }));
    const historyId = to.searchParams.get("undo");
    const stranger = await signedIn();
    expect((await stranger.post(`/history/${historyId}/undo`)).status).toBe(404);
  });

  it("sends an outcome without a session back to /", async () => {
    const res = await client(baseUrl).post("/items/whatever/outcome", { outcome: "used" });
    expect(res.status).toBe(303);
    expect(location(res).pathname).toBe("/");
  });
});
