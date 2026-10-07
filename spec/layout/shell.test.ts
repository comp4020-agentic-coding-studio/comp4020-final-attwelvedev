import type { Browser, BrowserContext } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  axeViolations,
  DESKTOP,
  horizontalOverflow,
  launch,
  openPage,
  PHONE,
  type Viewport,
} from "../browser.ts";
import { startHousehold } from "../people.ts";

const baseUrl = inject("baseUrl");

let browser: Browser;
let storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;
beforeAll(async () => {
  browser = await launch();
  const sam = await startHousehold(browser, baseUrl);
  storageState = await sam.context.storageState();
  await sam.context.close();
});
afterAll(async () => {
  await browser?.close();
});

type Scheme = "light" | "dark";

// A page for the signed-in household, so every tab shows.
async function signedInPage(path: string, viewport: Viewport, colorScheme: Scheme) {
  const context = await browser.newContext({ viewport, colorScheme, storageState });
  const page = await context.newPage();
  await page.goto(new URL(path, baseUrl).href, { waitUntil: "networkidle" });
  return page;
}

const SCHEMES: Scheme[] = ["light", "dark"];

describe.each([
  ["phone", PHONE],
  ["desktop", DESKTOP],
])("shell at %s width", (_name, viewport) => {
  describe.each(SCHEMES)("%s scheme", (scheme) => {
    it.each(["/", "/readme/", "/history", "/household", "/offers", "/communities"])(
      "%s has no horizontal overflow and no axe violations (contrast on)",
      async (path) => {
        const page = await signedInPage(path, viewport, scheme);
        expect(await horizontalOverflow(page)).toBe(0);
        expect(await axeViolations(page)).toEqual([]);
        await page.context().close();
      },
    );
  });

  it("signed-out first run has no overflow and no axe violations", async () => {
    for (const colorScheme of SCHEMES) {
      const page = await openPage(browser, baseUrl, viewport, { colorScheme });
      expect(await horizontalOverflow(page)).toBe(0);
      expect(await axeViolations(page)).toEqual([]);
      await page.context().close();
    }
  });

  it("uses the self-hosted Atkinson font and has a visible Keyboard help line", async () => {
    const page = await signedInPage("/", viewport, "light");
    expect(
      await page.evaluate(() => getComputedStyle(document.body).fontFamily.split(",")[0]),
    ).toBe('"Atkinson Hyperlegible Next"');
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() => document.fonts.check('16px "Atkinson Hyperlegible Next"')),
    ).toBe(true);
    const footer = page.locator("footer");
    expect(await footer.innerText()).toContain("Keyboard");
    expect(await footer.isVisible()).toBe(true);
    await page.context().close();
  });
});

describe("tab bar", () => {
  it("is fixed at the bottom with four links on a phone, and hides while the add field is focused", async () => {
    const page = await signedInPage("/", PHONE, "light");
    const nav = page.getByRole("navigation", { name: "Main" });
    // the add field autofocuses on load, which hides the bar (below)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(await nav.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
    const box = await nav.boundingBox();
    expect(box?.y).toBeGreaterThan(PHONE.height / 2);
    expect(await nav.getByRole("link").count()).toBe(4);
    expect(await nav.isVisible()).toBe(true);
    await page.getByLabel("Add an item").focus();
    expect(await nav.isVisible()).toBe(false);
    await page.context().close();
  });

  it("sits inline in the top band on desktop", async () => {
    const page = await signedInPage("/", DESKTOP, "light");
    const nav = page.getByRole("navigation", { name: "Main" });
    expect(await nav.evaluate((el) => getComputedStyle(el).position)).not.toBe("fixed");
    const box = await nav.boundingBox();
    expect(box?.y).toBeLessThan(80);
    expect(await nav.getByRole("link").count()).toBe(4);
    expect(await page.locator("header").innerText()).toContain("Unit 4");
    await page.context().close();
  });
});
