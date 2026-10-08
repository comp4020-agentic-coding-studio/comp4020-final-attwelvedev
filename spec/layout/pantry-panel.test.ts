import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { dateText } from "../../src/components/pantryView.ts";
import {
  axeViolations,
  DESKTOP,
  horizontalOverflow,
  launch,
  PHONE,
  type Viewport,
} from "../browser.ts";
import { daysFromToday, makeItem, pantryItems, writeItem } from "../items.ts";
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

const panel = (page: Page) => page.locator(".panel");
const open = async (page: Page, name: string) => {
  await row(page, name).locator(".row-main").click();
  await panel(page).waitFor();
  // the panel fades in over 160 ms; colours are only final once it has
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
};
const valueText = (page: Page, name: string) => row(page, name).locator(".value-text");
const slider = (page: Page) => page.getByRole("slider", { name: "Amount left" });
const posted = (page: Page, path: string) =>
  page.waitForRequest((r) => r.method() === "POST" && r.url().includes(path));
const localDate = (page: Page) =>
  page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

// A household with milk (fill, ½), eggs (count) and cumin (have), as known items
async function pantry(viewport: Viewport = DESKTOP) {
  const sam = await startHousehold(browser, baseUrl, { viewport });
  const http = await httpFor(sam, baseUrl);
  const milk = await makeItem(http, "milk");
  await writeItem(http, milk, "value", { fillStop: "2" });
  const eggs = await makeItem(http, "eggs");
  const cumin = await makeItem(http, "cumin");
  await sam.page.reload({ waitUntil: "networkidle" });
  return { sam, http, milk, eggs, cumin };
}

describe("opening a row", () => {
  it("opens in place, and opening another closes the first", async () => {
    const { sam } = await pantry();
    await open(sam.page, "milk");
    expect(await row(sam.page, "milk").locator(".row-main").getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(await row(sam.page, "milk").locator(".panel").count()).toBe(1);
    await row(sam.page, "eggs").locator(".row-main").click();
    await row(sam.page, "eggs").locator(".panel").waitFor();
    expect(await panel(sam.page).count()).toBe(1);
    expect(await row(sam.page, "milk").locator(".row-main").getAttribute("aria-expanded")).toBe(
      "false",
    );
    await sam.context.close();
  });

  it("closes on Esc and puts focus back on the row", async () => {
    const { sam } = await pantry();
    await open(sam.page, "milk");
    await slider(sam.page).focus();
    await sam.page.keyboard.press("Escape");
    expect(await panel(sam.page).count()).toBe(0);
    expect(await sam.page.evaluate(() => document.activeElement?.className)).toContain("row-main");
    await sam.context.close();
  });
});

describe("fill", () => {
  it("moves a stop with the arrow keys, shows it before the response, and posts fillStop", async () => {
    const { sam, http } = await pantry();
    await sam.page.route("**/items/*/value", async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.continue();
    });
    await open(sam.page, "milk");
    expect(await sam.page.locator(".ticks span").count()).toBe(5);
    await slider(sam.page).focus();
    const sent = posted(sam.page, "/value");
    await sam.page.keyboard.press("ArrowLeft");
    expect(new URLSearchParams((await sent).postData() ?? "").get("fillStop")).toBe("1");
    // before the response: the row's value and the panel already say it
    expect(await valueText(sam.page, "milk").innerText()).toBe("¼");
    expect(await sam.page.locator(".panel .attribution").first().innerText()).toBe("Saving…");
    await sam.page.getByText("Sam's estimate, just now").first().waitFor();
    expect((await pantryItems(http)).find((i) => i.name === "milk")?.fillStop).toBe(1);
    await sam.context.close();
  });

  it("takes an exact amount, and moving the slider clears it", async () => {
    const { sam } = await pantry();
    await open(sam.page, "milk");
    await sam.page.getByLabel("Exact amount").fill("400 g");
    const sent = posted(sam.page, "/value");
    await sam.page.getByLabel("Exact amount").press("Enter");
    const body = new URLSearchParams((await sent).postData() ?? "");
    expect([body.get("exactAmount"), body.get("exactUnit")]).toEqual(["400", "g"]);
    await sam.page.waitForFunction(
      () => document.querySelector(".value-text")?.textContent === "~400 g",
    );
    await slider(sam.page).focus();
    await sam.page.keyboard.press("ArrowRight");
    await sam.page.waitForFunction(
      () => document.querySelector(".value-text")?.textContent === "¾",
    );
    expect(await sam.page.getByLabel("Exact amount").inputValue()).toBe("");
    await sam.context.close();
  });

  it("says what it could not read, without a dialog", async () => {
    const { sam } = await pantry();
    await open(sam.page, "milk");
    await sam.page.getByLabel("Exact amount").fill("lots");
    await sam.page.getByLabel("Exact amount").press("Enter");
    await sam.page.getByText("Try 400 g, 1.5 L or 2.").waitFor();
    await sam.context.close();
  });
});

describe("count and have", () => {
  it("counts up with a few quick taps in one or two requests, and − stops at 1", async () => {
    const { sam, http } = await pantry();
    // taps are quick next to a slow network: the later ones wait, and only the newest is sent
    await sam.page.route("**/items/*/value", async (route) => {
      await new Promise((r) => setTimeout(r, 400));
      await route.continue();
    });
    let requests = 0;
    sam.page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/value")) requests += 1;
    });
    await open(sam.page, "eggs");
    expect(await sam.page.getByRole("button", { name: "One fewer" }).isDisabled()).toBe(true);
    const more = sam.page.getByRole("button", { name: "One more" });
    await more.click();
    await more.click();
    await more.click();
    await sam.page.waitForFunction(() => document.querySelector("output")?.textContent === "4");
    await sam.page.getByText("Sam's estimate, just now").first().waitFor();
    expect(requests).toBeLessThanOrEqual(2);
    expect((await pantryItems(http)).find((i) => i.name === "eggs")?.count).toBe(4);
    await sam.context.close();
  });

  it("shows no amount control for have, and switching to Count then shows the stepper", async () => {
    const { sam } = await pantry();
    await open(sam.page, "cumin");
    expect(await slider(sam.page).count()).toBe(0);
    expect(await sam.page.getByRole("button", { name: "One more" }).count()).toBe(0);
    const sent = posted(sam.page, "/measure");
    await sam.page.getByRole("button", { name: "Count", exact: true }).click();
    expect(new URLSearchParams((await sent).postData() ?? "").get("measure")).toBe("count");
    await sam.page.getByRole("button", { name: "One more" }).waitFor();
    await sam.context.close();
  });
});

describe("use by", () => {
  it("moves the row to its bucket, and sets and clears an exact date", async () => {
    const { sam, http, milk } = await pantry();
    await writeItem(http, milk, "expiry", { bucket: "use-soon", today: daysFromToday(0) });
    await sam.page.reload({ waitUntil: "networkidle" });
    sam.page.setDefaultTimeout(6000);
    await open(sam.page, "milk");
    const sent = posted(sam.page, "/expiry");
    const week = sam.page.getByRole("button", { name: "This week", exact: true });
    await week.click();
    const body = new URLSearchParams((await sent).postData() ?? "");
    expect([body.get("bucket"), body.get("today")]).toEqual([
      "this-week",
      await localDate(sam.page),
    ]);
    await sam.page.getByRole("heading", { name: /^This week/ }).waitFor();
    expect(await week.getAttribute("aria-pressed")).toBe("true");

    const date = daysFromToday(30);
    const dated = posted(sam.page, "/expiry");
    await sam.page.getByLabel("Exact date").fill(date);
    expect(new URLSearchParams((await dated).postData() ?? "").get("date")).toBe(date);
    await row(sam.page, "milk").getByText(dateText(date)).waitFor();

    const cleared = posted(sam.page, "/expiry");
    await sam.page.getByRole("button", { name: "Clear date" }).click();
    expect(new URLSearchParams((await cleared).postData() ?? "").get("clearDate")).toBe("1");
    await sam.context.close();
  });
});

describe("who set it", () => {
  it("says Guessed, then who set it, and tells an open panel when a housemate changes it", async () => {
    const { sam, milk, eggs } = await pantry();
    const alex: Person = await joinHousehold(browser, baseUrl, sam);
    const alexHttp = await httpFor(alex, baseUrl);
    await open(sam.page, "eggs");
    expect(await sam.page.locator(".panel .attribution").first().innerText()).toBe("Guessed");
    await open(sam.page, "milk");
    await slider(sam.page).focus();

    await writeItem(alexHttp, milk, "value", { fillStop: "1" });
    await sam.page.getByText("Alex just changed this to ¼").waitFor({ timeout: 2000 });
    expect(await sam.page.getByText("Alex's estimate, just now").count()).toBeGreaterThan(0);

    // a closed row updates in place, and focus stays where it was
    await writeItem(alexHttp, eggs, "value", { count: "5" });
    await sam.page.waitForFunction(() =>
      [...document.querySelectorAll("li.row")].some(
        (li) =>
          li.textContent?.includes("eggs") && li.querySelector(".value-text")?.textContent === "5",
      ),
    );
    expect(
      await sam.page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type),
    ).toBe("range");
    await sam.context.close();
    await alex.context.close();
  }, 40_000);
});

describe("a write that fails", () => {
  it("snaps back with a Retry line, and Retry works", async () => {
    const { sam, http } = await pantry();
    await sam.page.route("**/items/*/value", (route) => route.abort());
    await open(sam.page, "milk");
    await slider(sam.page).focus();
    await sam.page.keyboard.press("ArrowLeft");
    await sam.page.getByText("Couldn't save ¼. Back to ½.").waitFor();
    expect(await valueText(sam.page, "milk").innerText()).toBe("½");
    await sam.page.unroute("**/items/*/value");
    await sam.page.getByRole("button", { name: "Retry" }).click();
    await sam.page.waitForFunction(
      () => document.querySelector(".value-text")?.textContent === "¼",
    );
    await sam.page.getByText("Sam's estimate, just now").first().waitFor();
    expect((await pantryItems(http)).find((i) => i.name === "milk")?.fillStop).toBe(1);
    await sam.context.close();
  });
});

describe("on a phone", () => {
  it("keeps Binned and Offer in the open panel, not the closed row", async () => {
    const { offerer, claimer } = await offerPair(browser, baseUrl, { viewport: PHONE });
    const http = await httpFor(offerer, baseUrl);
    await makeItem(http, "milk");
    await offerer.page.reload({ waitUntil: "networkidle" });
    const binned = offerer.page.getByRole("button", { name: "Binned milk", exact: true });
    expect(await binned.isVisible()).toBe(false);
    await open(offerer.page, "milk");
    expect(await binned.isVisible()).toBe(true);
    expect(
      await offerer.page.getByRole("button", { name: "Offer milk", exact: true }).isVisible(),
    ).toBe(true);
    await offerer.context.close();
    await claimer.context.close();
  });
});

describe("Offer some…", () => {
  it("splits a count: the sheet offers 1 to 5 of 6, and 2 leaves 4 and a new offered row of 2", async () => {
    const { offerer, claimer } = await offerPair(browser, baseUrl);
    const http = await httpFor(offerer, baseUrl);
    const eggs = await makeItem(http, "eggs");
    await writeItem(http, eggs, "value", { count: "6" });
    await makeItem(http, "cumin");
    await offerer.page.reload({ waitUntil: "networkidle" });
    offerer.page.setDefaultTimeout(6000);

    await offerer.page.getByRole("button", { name: "Offer cumin", exact: true }).click();
    await offerer.page.getByLabel("Pickup note").waitFor();
    expect(await offerer.page.getByLabel("Offer some…").count()).toBe(0);
    await offerer.page.keyboard.press("Escape");

    await offerer.page.getByRole("button", { name: "Offer eggs", exact: true }).click();
    await offerer.page.getByLabel("Pickup note").waitFor();
    await offerer.page.getByLabel("Offer some…").check();
    const more = offerer.page.getByRole("button", { name: "One more" });
    for (let i = 0; i < 4; i++) await more.click();
    expect(await more.isDisabled()).toBe(true);
    expect(await offerer.page.locator("dialog output").innerText()).toBe("5");
    await offerer.page.getByRole("button", { name: "One fewer" }).click();
    await offerer.page.getByRole("button", { name: "One fewer" }).click();
    await offerer.page.getByRole("button", { name: "One fewer" }).click();
    expect(await offerer.page.locator("dialog output").innerText()).toBe("2");
    await offerer.page.getByLabel("Pickup note").fill("Porch, after 5");
    await offerer.page.getByRole("button", { name: "Post offer" }).click();

    await offerer.page.locator(".offer-state").waitFor({ timeout: 3000 });
    const rows = await offerer.page
      .locator("li.row")
      .evaluateAll((els) =>
        els
          .filter((e) => e.querySelector(".name")?.textContent === "eggs")
          .map((e) => [
            e.querySelector(".value-text")?.textContent,
            e.textContent?.includes("Offered"),
          ]),
      );
    expect(rows.sort()).toEqual([
      ["2", true],
      ["4", false],
    ]);
    await offerer.context.close();
    await claimer.context.close();
  }, 40_000);
});

describe.each([
  ["phone", PHONE],
  ["desktop", DESKTOP],
])("an open panel at %s width", (_name, viewport) => {
  it("has no overflow and no axe violations, in both schemes", async () => {
    const { sam } = await pantry(viewport);
    const storageState = await sam.context.storageState();
    for (const colorScheme of ["light", "dark"] as const) {
      const context = await browser.newContext({ viewport, colorScheme, storageState });
      const page = await context.newPage();
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      for (const name of ["milk", "eggs", "cumin"]) {
        await open(page, name);
        expect(await horizontalOverflow(page), `${name} overflow`).toBe(0);
        expect(await axeViolations(page), `${name} axe`).toEqual([]);
      }
      await context.close();
    }
    await sam.context.close();
  }, 60_000);
});
