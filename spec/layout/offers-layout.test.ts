import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { axeViolations, DESKTOP, horizontalOverflow, launch, PHONE } from "../browser.ts";
import { offerNamed, startCommunity, trio } from "../neighbours.ts";
import { type Person, row, startHousehold, streamOpen } from "../people.ts";

const baseUrl = inject("baseUrl");

let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});

const url = (path: string) => new URL(path, baseUrl).href;
const close = (...people: Person[]) => Promise.all(people.map((p) => p.context.close()));

// Counts dialogs: this app never opens one, whatever the tap.
function watchDialogs(page: Page): () => number {
  let seen = 0;
  page.on("dialog", () => {
    seen += 1;
  });
  return () => seen;
}

describe("the offers feed, on a small screen", () => {
  it("holds a new offer behind a '1 new offer' pill while scrolled down, without moving the list", async () => {
    const { offerer, claimer, http } = await trio(browser, baseUrl, PHONE);
    for (let i = 1; i <= 18; i++) await offerNamed(http, `tin ${i}`);
    await claimer.page.reload();
    await streamOpen(claimer.page);
    await claimer.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const scrolled = await claimer.page.evaluate(() => window.scrollY);
    expect(scrolled).toBeGreaterThan(200);
    const firstTop = () =>
      claimer.page
        .locator(".offer")
        .first()
        .evaluate((el) => el.getBoundingClientRect().top);
    const before = await firstTop();

    await offerNamed(http, "fresh bread");
    await claimer.page.getByRole("button", { name: "1 new offer" }).waitFor({ timeout: 1000 });
    expect(await claimer.page.evaluate(() => window.scrollY)).toBe(scrolled);
    expect(await firstTop()).toBe(before);
    expect(await row(claimer.page, "fresh bread").count()).toBe(0);

    await claimer.page.getByRole("button", { name: "1 new offer" }).click();
    expect(await claimer.page.evaluate(() => window.scrollY)).toBe(0);
    await row(claimer.page, "fresh bread").waitFor({ timeout: 1000 });
    await close(offerer, claimer);
  }, 60_000);

  it("hides the rail", async () => {
    const { offerer, claimer } = await trio(browser, baseUrl, PHONE);
    const page = await claimer.context.newPage();
    const streams: string[] = [];
    page.on("request", (r) => r.url().endsWith("/events") && streams.push(r.url()));
    await page.goto(url("/"));
    await streamOpen(page);
    await page.waitForTimeout(500);
    expect(await page.locator(".rail").isVisible()).toBe(false);
    expect(streams).toHaveLength(1);
    await close(offerer, claimer);
  }, 30_000);
});

describe("the offers feed, empty and on a desktop", () => {
  it("says what to do with no community, and that nothing is on offer with one", async () => {
    const lone = await startHousehold(browser, baseUrl, { name: "Sam", household: "Unit 4" });
    await lone.page.goto(url("/offers"));
    await lone.page.getByText("Join a community to see and share offers").waitFor();
    await lone.page.getByRole("link", { name: "Join a community" }).waitFor();

    await startCommunity(lone, baseUrl);
    await lone.page.goto(url("/offers"));
    await lone.page.getByText("No offers in your communities right now").waitFor();
    await close(lone);
  }, 30_000);

  it("shows the rail beside the pantry and opens exactly one /events request", async () => {
    const { offerer, claimer, http } = await trio(browser, baseUrl);
    await offerNamed(http, "soup");
    const page = await claimer.context.newPage();
    const streams: string[] = [];
    page.on("request", (r) => r.url().endsWith("/events") && streams.push(r.url()));
    await page.goto(url("/"));
    await streamOpen(page);
    await page.waitForTimeout(500);
    expect(await page.locator(".rail").isVisible()).toBe(true);
    await page
      .locator(".rail")
      .getByRole("listitem")
      .filter({ hasText: "soup" })
      .waitFor({ timeout: 2000 });
    expect(streams).toHaveLength(1);
    await close(offerer, claimer);
  }, 30_000);

  it("says 'Reconnecting…' while the stream is blocked, then catches up without a reload", async () => {
    const { offerer, claimer, http } = await trio(browser, baseUrl);
    const blocked = await claimer.context.newPage();
    await blocked.route("**/events", (route) => route.abort());
    await blocked.goto(url("/offers"));
    await blocked.getByText("Reconnecting…").waitFor({ timeout: 5000 });

    await offerNamed(http, "soup");
    await blocked.unroute("**/events");
    await blocked.getByText("Reconnecting…").waitFor({ state: "detached", timeout: 8000 });
    await row(blocked, "soup").waitFor({ timeout: 3000 });
    await close(offerer, claimer);
  }, 40_000);
});

describe.each([
  ["phone", PHONE],
  ["desktop", DESKTOP],
])("/offers at %s width", (_name, viewport) => {
  it("has no overflow and no axe violations, with offers in every state, and opens no dialog", async () => {
    const { offerer, claimer, other, http } = await trio(browser, baseUrl, viewport);
    const dialogs = [watchDialogs(offerer.page), watchDialogs(claimer.page)];
    const long = "Leftover lasagne from the weekend, about half a tray, still good until Thursday";
    await offerNamed(http, long, "Porch, after 5");
    await offerNamed(http, "soup");
    await offerNamed(http, "bread");
    await row(claimer.page, "soup")
      .getByRole("button", { name: /^Claim/ })
      .click();
    await claimer.page.getByText("Pickup:").waitFor();
    await row(offerer.page, "soup").getByText("Claimed by House 9").waitFor();
    await row(other.page, long).waitFor();

    for (const page of [offerer.page, claimer.page, other.page]) {
      expect(await horizontalOverflow(page)).toBe(0);
      expect(await axeViolations(page)).toEqual([]);
    }
    expect(dialogs.map((d) => d())).toEqual([0, 0]);
    await close(offerer, claimer, other);
  }, 30_000);
});
