import { describe, expect, inject, it } from "vitest";
import { type Client, client, text } from "./http.ts";

const baseUrl = inject("baseUrl");

async function signedIn(memberName = "Sam"): Promise<Client> {
  const me = client(baseUrl);
  await me.post("/households", { householdName: "Unit 4", memberName });
  return me;
}

async function outcomeFor(me: Client, name: string, outcome: "used" | "binned") {
  await me.post("/items", { name });
  const html = await (await me.get("/")).text();
  const row = html.split("<li").find((chunk) => chunk.includes(`>${name}`));
  const id = row?.match(/\/items\/([^/"]+)\/outcome/)?.[1];
  if (!id) throw new Error(`no row for "${name}"`);
  await me.post(`/items/${id}/outcome`, { outcome });
}

describe("history", () => {
  it("lists used and binned items with who did it", async () => {
    const me = await signedIn("Sam");
    await outcomeFor(me, "milk", "used");
    await outcomeFor(me, "spinach", "binned");
    const res = await me.get("/history");
    expect(res.status).toBe(200);
    const page = text(await res.text());
    expect(page).toContain("milk");
    expect(page).toContain("spinach");
    expect(page).toContain("Sam");
    expect(page).toContain("used");
    expect(page).toContain("binned");
  });

  it("filters by outcome", async () => {
    const me = await signedIn();
    await outcomeFor(me, "milk", "used");
    await outcomeFor(me, "spinach", "binned");
    const page = text(await (await me.get("/history?outcome=binned")).text());
    expect(page).toContain("spinach");
    expect(page).not.toContain("milk");
  });

  it("says so when there is nothing recorded yet", async () => {
    const me = await signedIn();
    const page = text(await (await me.get("/history")).text());
    expect(page).toContain("Nothing recorded yet. Used, binned and given items land here.");
  });

  it("sends a request without a session back to /", async () => {
    const res = await client(baseUrl).get("/history");
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location") ?? "", baseUrl).pathname).toBe("/");
  });

  it("never shows another household's history", async () => {
    const owner = await signedIn("Owner");
    await outcomeFor(owner, "secret-casserole", "binned");
    const stranger = await signedIn("Stranger");
    const page = text(await (await stranger.get("/history")).text());
    expect(page).not.toContain("secret-casserole");
    expect(page).toContain("Nothing recorded yet.");
  });

  it("links to history from the nav", async () => {
    const me = await signedIn();
    expect(await (await me.get("/")).text()).toMatch(/<a[^>]*href="\/history"/);
  });
});
