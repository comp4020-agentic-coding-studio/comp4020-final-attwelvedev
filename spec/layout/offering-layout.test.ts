import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { axeViolations, DESKTOP, horizontalOverflow, launch, PHONE } from "../browser.ts";
import { offerPair, pantryRow } from "../neighbours.ts";
import { addItem, type Person } from "../people.ts";

const baseUrl = inject("baseUrl");

let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});

const close = (...people: Person[]) => Promise.all(people.map((p) => p.context.close()));

describe("the offer sheet, by keyboard", () => {
  it("closes on Escape with focus back on Offer, and posts on Enter in the note field", async () => {
    const { offerer, claimer } = await offerPair(browser, baseUrl);
    const { page } = offerer;
    await addItem(page, "soup");
    const button = pantryRow(page, "soup").getByRole("button", { name: "Offer soup", exact: true });
    await button.click();
    await page.getByLabel("Pickup note").waitFor();
    await page.keyboard.press("Escape");
    await page.locator("dialog[open]").waitFor({ state: "detached" });
    expect(await button.evaluate((el) => el === document.activeElement)).toBe(true);
    expect(await pantryRow(page, "soup").textContent()).not.toContain("Offered");

    await button.click();
    await page.getByLabel("Pickup note").fill("Porch, after 5");
    await page.getByLabel("Pickup note").press("Enter");
    await pantryRow(page, "soup").getByText("Offered").waitFor({ timeout: 1000 });
    await close(offerer, claimer);
  }, 30_000);
});

// Below 900 px the Binned/Offer/Note cluster is in the row's open panel.
async function openRowOnPhone(page: Page, name: string, viewport: { width: number }) {
  if (viewport.width >= 900) return;
  const main = pantryRow(page, name).locator(".row-main");
  if ((await main.getAttribute("aria-expanded")) !== "true") await main.click();
}

describe("the offer sheet, laid out", () => {
  for (const [label, viewport] of [
    ["a phone", PHONE],
    ["a desktop", DESKTOP],
  ] as const) {
    it(`has no overflow and no axe violations on ${label}, with the sheet open and after`, async () => {
      const { offerer, claimer } = await offerPair(browser, baseUrl, { viewport });
      const { page } = offerer;
      await addItem(page, "a very long item name that wraps onto more than one line on a phone");
      await addItem(page, "soup");
      await pantryRow(page, "soup").waitFor();
      await openRowOnPhone(page, "soup", viewport);
      await pantryRow(page, "soup")
        .getByRole("button", { name: "Offer soup", exact: true })
        .click();
      await page.getByLabel("Pickup note").waitFor();
      expect(await horizontalOverflow(page)).toBe(0);
      expect(await axeViolations(page)).toEqual([]);

      await page.getByLabel("Pickup note").fill("Porch, after 5");
      await page.getByRole("button", { name: "Post offer" }).click();
      await pantryRow(page, "soup").getByText("Offered").waitFor({ timeout: 1000 });
      await page.getByRole("button", { name: "Edit note", exact: true }).waitFor();
      expect(await horizontalOverflow(page)).toBe(0);
      expect(await axeViolations(page)).toEqual([]);

      // the Note button on the offered row opens the sheet with that offer's note
      await openRowOnPhone(page, "soup", viewport);
      await pantryRow(page, "soup").getByRole("button", { name: "Note soup", exact: true }).click();
      await page.getByLabel("Pickup note").waitFor();
      expect(await page.getByLabel("Pickup note").inputValue()).toBe("Porch, after 5");
      expect(await horizontalOverflow(page)).toBe(0);
      expect(await axeViolations(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await close(offerer, claimer);
    }, 30_000);
  }
});
