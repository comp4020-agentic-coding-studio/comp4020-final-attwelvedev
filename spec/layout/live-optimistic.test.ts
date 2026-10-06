import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { axeViolations, DESKTOP, horizontalOverflow, launch, PHONE } from "../browser.ts";
import { addItem, type Person, row, startHousehold } from "../people.ts";

const baseUrl = inject("baseUrl");

let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});

// Counts dialogs: this app never opens one, whatever the tap.
function watchDialogs(page: Page): () => number {
  let seen = 0;
  page.on("dialog", () => {
    seen += 1;
  });
  return () => seen;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("optimistic add", () => {
  it("shows the row within 300 ms, busy until confirmed, with the field cleared and focused", async () => {
    const sam = await startHousehold(browser, baseUrl);
    const dialogs = watchDialogs(sam.page);
    await sam.page.route("**/items", async (route) => {
      if (route.request().method() === "POST") await sleep(1000);
      await route.continue();
    });

    await addItem(sam.page, "eggs");
    const eggs = row(sam.page, "eggs");
    await eggs.waitFor({ timeout: 300 });
    expect(await eggs.getAttribute("aria-busy")).toBe("true");
    expect(await sam.page.getByLabel("Add an item").inputValue()).toBe("");
    expect(
      await sam.page.getByLabel("Add an item").evaluate((el) => el === document.activeElement),
    ).toBe(true);

    await sam.page.waitForFunction(
      () => !document.querySelector('li[aria-busy="true"]'),
      undefined,
      { timeout: 5000 },
    );
    expect(await eggs.count()).toBe(1);
    expect(dialogs()).toBe(0);
    await sam.context.close();
  }, 30_000);

  it("rolls back a failed add with an alert, and Retry adds it and clears the alert", async () => {
    const sam = await startHousehold(browser, baseUrl);
    const dialogs = watchDialogs(sam.page);
    await sam.page.route("**/items", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 500, body: "{}" })
        : route.continue(),
    );

    await addItem(sam.page, "eggs");
    await sam.page.getByRole("alert").filter({ hasText: "Couldn't save “eggs”." }).waitFor();
    expect(await row(sam.page, "eggs").count()).toBe(0);

    await sam.page.unroute("**/items");
    await sam.page.getByRole("button", { name: "Retry" }).click();
    await row(sam.page, "eggs").waitFor();
    await sam.page.getByRole("alert").waitFor({ state: "detached" });
    expect(dialogs()).toBe(0);
    await sam.context.close();
  }, 30_000);
});

describe("optimistic outcome", () => {
  it("brings the row back and alerts when the write fails", async () => {
    const sam = await startHousehold(browser, baseUrl);
    await addItem(sam.page, "eggs");
    await row(sam.page, "eggs").waitFor();
    await sam.page.waitForFunction(() => !document.querySelector('li[aria-busy="true"]'));
    await sam.page.route("**/items/*/outcome", (route) =>
      route.fulfill({ status: 500, body: "{}" }),
    );

    await sam.page.getByRole("button", { name: /^Used/ }).click();
    await sam.page.getByRole("alert").filter({ hasText: "Couldn't save “eggs”." }).waitFor();
    await row(sam.page, "eggs").waitFor();
    await sam.context.close();
  }, 30_000);
});

describe("without JavaScript", () => {
  it("still adds, marks Used with the ?undo= banner, and undoes", async () => {
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
    expect(page.url()).toContain("undo=");
    await page.getByRole("button", { name: "Undo" }).click();
    await row(page, "eggs").waitFor();
    await context.close();
  }, 30_000);
});

describe.each([
  ["phone", PHONE],
  ["desktop", DESKTOP],
])("the island with 12 items and a toast at %s width", (_name, viewport) => {
  it("has no horizontal overflow and no axe violations", async () => {
    const sam: Person = await startHousehold(browser, baseUrl, { viewport });
    const names = [...Array.from({ length: 11 }, (_, i) => `item ${i + 1}`), "x".repeat(120)];
    for (const name of names) {
      const res = await sam.page.request.post(new URL("/items", baseUrl).href, {
        form: { name },
        headers: { origin: new URL(baseUrl).origin },
        maxRedirects: 0,
      });
      expect(res.status()).toBe(303);
    }
    await sam.page.reload({ waitUntil: "networkidle" });
    await sam.page.getByRole("button", { name: /^Used/ }).first().click();
    await sam.page.getByText(/marked used\./).waitFor();

    expect(await horizontalOverflow(sam.page)).toBe(0);
    expect(await axeViolations(sam.page)).toEqual([]);
    await sam.context.close();
  }, 30_000);
});
