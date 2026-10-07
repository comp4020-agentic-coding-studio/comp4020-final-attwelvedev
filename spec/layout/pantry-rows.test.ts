import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { tapeFraction } from "../../src/components/pantryView.ts";
import { testItem } from "../../src/lib/testItem.ts";
import {
  axeViolations,
  DESKTOP,
  horizontalOverflow,
  launch,
  PHONE,
  type Viewport,
} from "../browser.ts";
import { daysFromToday, makeItem, makeMany } from "../items.ts";
import { httpFor, offerPair } from "../neighbours.ts";
import { joinHousehold, type Person, row, startHousehold } from "../people.ts";

const baseUrl = inject("baseUrl");

let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});

const headings = (page: Page) => page.locator("h2.bucket-heading").allInnerTexts();
const reload = (page: Page) => page.reload({ waitUntil: "networkidle" });
const VIEWPORTS: [string, Viewport][] = [
  ["phone", PHONE],
  ["desktop", DESKTOP],
];

describe("grouped rows", () => {
  it("groups under headings in order, with the count of each", async () => {
    const sam = await startHousehold(browser, baseUrl);
    const http = await httpFor(sam, baseUrl);
    await makeItem(http, "milk", { days: 1 });
    await makeItem(http, "spinach", { days: 2 });
    await makeItem(http, "rice", { days: 200 });
    await makeItem(http, "mystery");
    await makeItem(http, "stale", { days: -2 });
    await reload(sam.page);
    expect(await headings(sam.page)).toEqual([
      "Past estimate (1)",
      "Use soon (2)",
      "Long-lasting (1)",
      "Unknown (1)",
    ]);
    await sam.context.close();
  });

  it("draws the tape to the share of shelf life left, with a pattern per bucket", async () => {
    const sam = await startHousehold(browser, baseUrl);
    const http = await httpFor(sam, baseUrl);
    const plan: [string, number | undefined][] = [
      ["soon", 1],
      ["month", 15],
      ["old", -2],
      ["unsure", undefined],
    ];
    for (const [name, days] of plan) await makeItem(http, name, { days });
    await reload(sam.page);
    const seen = new Set<string>();
    for (const [name, days] of plan) {
      const tape = row(sam.page, name).locator(".tape");
      const [track, bar] = await Promise.all([
        tape.boundingBox(),
        tape.locator(".tape-bar").boundingBox(),
      ]);
      const expected = tapeFraction(
        testItem({ exactExpiry: days === undefined ? null : daysFromToday(days) }),
        daysFromToday(0),
      );
      expect((bar?.width ?? 0) / (track?.width ?? 1)).toBeCloseTo(expected, 1);
      seen.add((await tape.getAttribute("data-bucket")) ?? "");
    }
    expect(seen.size).toBe(4);
    await sam.context.close();
  });

  describe.each(VIEWPORTS)("Used at %s width", (_name, viewport) => {
    it("is one click with no dialog, at least 44 px square, and ignores a scroll", async () => {
      const sam = await startHousehold(browser, baseUrl, { viewport });
      await makeItem(await httpFor(sam, baseUrl), "soup");
      await reload(sam.page);
      let dialogs = 0;
      let outcomes = 0;
      sam.page.on("dialog", () => {
        dialogs += 1;
      });
      sam.page.on("request", (r) => {
        if (r.url().includes("/outcome")) outcomes += 1;
      });
      const used = sam.page.getByRole("button", { name: "Used soup", exact: true });
      const box = await used.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);

      // pointer down, travel 12 px, up on the button: a scroll, not a tap
      const x = (box?.x ?? 0) + 20;
      const y = (box?.y ?? 0) + 20;
      await sam.page.mouse.move(x, y);
      await sam.page.mouse.down();
      await sam.page.mouse.move(x + 12, y);
      await sam.page.mouse.up();
      await sam.page.waitForTimeout(400);
      expect(outcomes).toBe(0);
      expect(await row(sam.page, "soup").count()).toBe(1);

      await used.click();
      await sam.page.getByText("soup marked used.").waitFor();
      expect(await row(sam.page, "soup").count()).toBe(0);
      expect(dialogs).toBe(0);
      await sam.context.close();
    }, 30_000);
  });

  it("shows Binned and Offer inline on desktop, and holds them back on a phone", async () => {
    for (const [name, viewport] of VIEWPORTS) {
      const { offerer, claimer } = await offerPair(browser, baseUrl, { viewport });
      await makeItem(await httpFor(offerer, baseUrl), "soup");
      await reload(offerer.page);
      const binned = offerer.page.getByRole("button", { name: "Binned soup", exact: true });
      const offer = offerer.page.getByRole("button", { name: "Offer soup", exact: true });
      expect(await binned.isVisible(), `${name} Binned`).toBe(viewport === DESKTOP);
      expect(await offer.isVisible(), `${name} Offer`).toBe(viewport === DESKTOP);
      expect(
        await offerer.page.locator(".row-actions").evaluate((e) => getComputedStyle(e).display),
      ).toBe(viewport === DESKTOP ? "flex" : "none");
      await offerer.context.close();
      await claimer.context.close();
    }
  }, 60_000);
});

describe("a long pantry", () => {
  it("offers Jump to above 25 items, and stays clean in both schemes at both widths", async () => {
    const sam = await startHousehold(browser, baseUrl);
    const http = await httpFor(sam, baseUrl);
    await makeMany(
      http,
      Array.from({ length: 20 }, (_, i) => `item ${i}`),
    );
    await reload(sam.page);
    expect(await sam.page.getByLabel("Jump to").count()).toBe(0);
    await makeMany(
      http,
      Array.from({ length: 60 }, (_, i) => `more ${i}`),
    );
    const storageState = await sam.context.storageState();
    for (const [, viewport] of VIEWPORTS) {
      for (const colorScheme of ["light", "dark"] as const) {
        const context = await browser.newContext({ viewport, colorScheme, storageState });
        const page = await context.newPage();
        await page.goto(baseUrl, { waitUntil: "networkidle" });
        expect(await page.locator("li.row").count()).toBe(80);
        expect(await page.getByLabel("Jump to").count()).toBe(1);
        expect(await horizontalOverflow(page)).toBe(0);
        expect(await axeViolations(page)).toEqual([]);
        await context.close();
      }
    }
    await sam.context.close();
  }, 120_000);

  it("takes no time to move rows under reduced motion", async () => {
    const sam = await startHousehold(browser, baseUrl);
    await makeItem(await httpFor(sam, baseUrl), "soup");
    const context = await browser.newContext({
      reducedMotion: "reduce",
      storageState: await sam.context.storageState(),
    });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    expect(
      await page.locator("li.row").evaluate((e) => getComputedStyle(e).transitionDuration),
    ).toBe("0s");
    await context.close();
    await sam.context.close();
  });
});

describe("while you use the list", () => {
  it("holds a housemate's add back until you stop, and keeps focus on your row", async () => {
    const sam: Person = await startHousehold(browser, baseUrl);
    const alex = await joinHousehold(browser, baseUrl, sam);
    await makeMany(await httpFor(sam, baseUrl), ["first", "second"]);
    await reload(sam.page);
    const rowId = async () =>
      sam.page.evaluate(
        () => (document.activeElement as HTMLElement | null)?.closest("li")?.dataset.itemId,
      );
    await sam.page.locator("li.row").nth(1).locator(".row-main").focus();
    const mine = await rowId();
    const order = () =>
      sam.page.locator("li.row").evaluateAll((es) => es.map((e) => e.getAttribute("data-item-id")));
    const before = await order();

    await makeItem(await httpFor(alex, baseUrl), "newcomer");
    await sam.page.waitForTimeout(1000);
    expect(await row(sam.page, "newcomer").count()).toBe(0);
    expect(await order()).toEqual(before);

    await row(sam.page, "newcomer").waitFor({ timeout: 6000 });
    expect(await rowId()).toBe(mine);
    await sam.context.close();
    await alex.context.close();
  }, 40_000);
});

describe("first use", () => {
  it("teaches the add, and a suggestion adds in one tap", async () => {
    const sam = await startHousehold(browser, baseUrl);
    expect(await sam.page.locator(".try").innerText()).toBe("Try: milk, eggs, spinach");
    await sam.page.getByRole("button", { name: "milk", exact: true }).click();
    await row(sam.page, "milk").waitFor();
    await sam.context.close();
  });

  it("sends the viewer's own date, not the server's", async () => {
    const context = await browser.newContext({ viewport: DESKTOP, timezoneId: "Pacific/Auckland" });
    const sam = await startHousehold(browser, baseUrl);
    await sam.context.close();
    const page = await context.newPage();
    await page.goto(baseUrl);
    await page.getByLabel("Household name").fill("Unit 4");
    await page.getByLabel("Your name").fill("Sam");
    await page.getByLabel("Your name").press("Enter");
    await page.waitForURL(new URL("/", baseUrl).href);
    await page.locator('[data-stream="open"]').first().waitFor();
    const sent = page.waitForRequest(
      (r) => r.method() === "POST" && new URL(r.url()).pathname === "/items",
    );
    await page.getByLabel("Add an item").fill("tea");
    await page.getByLabel("Add an item").press("Enter");
    const body = new URLSearchParams((await sent).postData() ?? "");
    const local = await page.evaluate(() => {
      const d = new Date();
      return [d.getFullYear(), d.getMonth() + 1, d.getDate()]
        .map((n, i) => String(n).padStart(i === 0 ? 4 : 2, "0"))
        .join("-");
    });
    expect(body.get("today")).toBe(local);
    await context.close();
  });

  it("still adds, marks Used and undoes without JavaScript", async () => {
    const context = await browser.newContext({ viewport: DESKTOP, javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(baseUrl);
    await page.getByLabel("Household name").fill("Unit 4");
    await page.getByLabel("Your name").fill("Sam");
    await page.getByLabel("Your name").press("Enter");
    await page.waitForURL(new URL("/", baseUrl).href);
    await page.getByLabel("Add an item").fill("eggs");
    await page.getByLabel("Add an item").press("Enter");
    await row(page, "eggs").waitFor();
    await page.getByRole("button", { name: /^Used/ }).click();
    await page.getByText("eggs marked used.").waitFor();
    await page.getByRole("button", { name: "Undo" }).click();
    await row(page, "eggs").waitFor();
    await context.close();
  }, 30_000);
});
