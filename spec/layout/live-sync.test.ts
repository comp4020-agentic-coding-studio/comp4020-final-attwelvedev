import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { launch } from "../browser.ts";
import { addItem, joinHousehold, type Person, row, startHousehold, streamOpen } from "../people.ts";

const baseUrl = inject("baseUrl");

let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});

async function pair(): Promise<{ sam: Person; alex: Person }> {
  const sam = await startHousehold(browser, baseUrl, { name: "Sam" });
  const alex = await joinHousehold(browser, baseUrl, sam, { name: "Alex" });
  return { sam, alex };
}

const close = (...people: Person[]) => Promise.all(people.map((p) => p.context.close()));

describe("two housemates in two browsers", () => {
  it("shows an add in the other browser within 1000 ms", async () => {
    const { sam, alex } = await pair();
    await addItem(sam.page, "milk");
    await row(alex.page, "milk").waitFor({ timeout: 1000 });
    await close(sam, alex);
  }, 30_000);

  it("shows 'Used by <name>' to the other person, then drops the row, with a toast only for the actor", async () => {
    const { sam, alex } = await pair();
    await addItem(sam.page, "milk");
    await row(alex.page, "milk").waitFor({ timeout: 1000 });
    await row(sam.page, "milk").waitFor();

    await alex.page.getByRole("button", { name: /^Used/ }).click();
    await sam.page.getByText("Used by Alex").waitFor({ timeout: 1000 });
    await row(sam.page, "milk").waitFor({ state: "detached", timeout: 4000 });
    await alex.page.getByText("milk marked used.").waitFor();
    expect(await sam.page.getByText(/marked used/).count()).toBe(0);
    await close(sam, alex);
  }, 30_000);

  it("brings an item back for everyone when the toast's Undo is pressed", async () => {
    const { sam, alex } = await pair();
    await addItem(sam.page, "milk");
    await row(alex.page, "milk").waitFor({ timeout: 1000 });
    await alex.page.getByRole("button", { name: /^Used/ }).click();
    await row(sam.page, "milk").waitFor({ state: "detached", timeout: 4000 });

    await alex.page.getByRole("button", { name: "Undo" }).click();
    await row(alex.page, "milk").waitFor({ timeout: 1000 });
    await row(sam.page, "milk").waitFor({ timeout: 1000 });
    expect(await sam.page.getByText("Used by Alex").count()).toBe(0);
    await close(sam, alex);
  }, 30_000);

  it("says 'Reconnecting…' only after 3 s, and catches up without a reload once the stream is back", async () => {
    const sam = await startHousehold(browser, baseUrl, { name: "Sam" });
    const alex = await joinHousehold(browser, baseUrl, sam, { name: "Alex" });

    // Sam's page loads with the stream blocked
    const blocked = await sam.context.newPage();
    await blocked.route("**/events", (route) => route.abort());
    await blocked.goto(baseUrl);
    await blocked.waitForTimeout(2000);
    expect(await blocked.getByText("Reconnecting…").count()).toBe(0);
    await blocked.getByText("Reconnecting…").waitFor({ timeout: 2000 });

    await addItem(alex.page, "bread");
    await row(alex.page, "bread").waitFor();
    await blocked.unroute("**/events");
    await blocked.getByText("Reconnecting…").waitFor({ state: "detached", timeout: 8000 });
    await row(blocked, "bread").waitFor({ timeout: 3000 });
    await close(sam, alex);
  }, 40_000);

  it("signs a removed member out of their open pantry within 2 s", async () => {
    const { sam, alex } = await pair();
    await sam.page.goto(new URL("/household", baseUrl).href);
    await sam.page.getByRole("button", { name: /Remove/ }).click();
    await alex.page.getByLabel("Household name").waitFor({ timeout: 2000 });
    await close(sam, alex);
  }, 30_000);

  it("shows a new member on an open household page within 1000 ms", async () => {
    const sam = await startHousehold(browser, baseUrl, { name: "Sam" });
    await sam.page.goto(new URL("/household", baseUrl).href);
    await streamOpen(sam.page);
    const alex = await joinHousehold(browser, baseUrl, sam, { name: "Alex" });
    await sam.page.locator("#members .who", { hasText: "Alex" }).waitFor({ timeout: 1000 });
    await close(sam, alex);
  }, 30_000);
});
