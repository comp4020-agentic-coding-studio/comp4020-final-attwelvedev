import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { axeViolations, DESKTOP, horizontalOverflow, launch, openPage, PHONE } from "../browser.ts";

const baseUrl = inject("baseUrl");

let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});

// Creates a household the way a person does: through the form, by keyboard.
async function startPantry(viewport = DESKTOP): Promise<Page> {
  const page = await openPage(browser, baseUrl, viewport);
  await page.getByLabel("Household name").fill("Unit 4");
  await page.getByLabel("Your name").fill("Sam");
  await page.getByLabel("Your name").press("Enter");
  await page.waitForURL(new URL("/", baseUrl).href);
  return page;
}

// The pantry row for an item, not every element that mentions it: each button
// also carries the name for screen readers.
const row = (page: Page, name: string) => page.getByRole("listitem").filter({ hasText: name });

describe("pantry in a browser", () => {
  it("adds by typing and pressing Enter, keyboard only", async () => {
    const page = await startPantry();
    // the empty pantry focuses the add field, so no click is needed
    await page.keyboard.type("eggs");
    await page.keyboard.press("Enter");
    await row(page, "eggs").waitFor();
    await page.context().close();
  });

  it("marks Used in one click with no dialog, then offers Undo", async () => {
    const page = await startPantry();
    let dialogs = 0;
    page.on("dialog", () => {
      dialogs += 1;
    });
    await page.keyboard.type("eggs");
    await page.keyboard.press("Enter");
    await row(page, "eggs").waitFor();

    await page.getByRole("button", { name: /^Used/ }).click();
    await page.getByText("marked used").waitFor();
    expect(await row(page, "eggs").count()).toBe(0);
    expect(await page.getByRole("button", { name: "Undo" }).count()).toBe(1);
    expect(dialogs).toBe(0);
    await page.context().close();
  });

  // 12 sequential POSTs take a few seconds against a remote app (APP_URL), which is
  // past vitest default 5 s timeout.
  describe.each([
    ["phone", PHONE],
    ["desktop", DESKTOP],
  ])("with 12 items at %s width", (_name, viewport) => {
    it("has no horizontal overflow and no axe violations", async () => {
      const page = await startPantry(viewport);
      const names = [...Array.from({ length: 11 }, (_, i) => `item ${i + 1}`), "x".repeat(120)];
      for (const name of names) {
        const res = await page.request.post(new URL("/items", baseUrl).href, {
          form: { name },
          headers: { origin: new URL(baseUrl).origin },
          maxRedirects: 0,
        });
        expect(res.status()).toBe(303);
      }
      await page.reload({ waitUntil: "networkidle" });
      expect(await horizontalOverflow(page)).toBe(0);
      expect(await axeViolations(page)).toEqual([]);
      await page.context().close();
    }, 30_000);
  });
});
