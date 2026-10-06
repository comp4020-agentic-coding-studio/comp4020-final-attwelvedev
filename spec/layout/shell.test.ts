import type { Browser } from "playwright";
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

describe.each([
  ["phone", PHONE],
  ["desktop", DESKTOP],
])("shell at %s width", (_name, viewport) => {
  it.each(["/", "/readme/"])(
    "%s has no horizontal overflow and no axe violations",
    async (path) => {
      const page = await openPage(browser, new URL(path, baseUrl).href, viewport);
      expect(await horizontalOverflow(page)).toBe(0);
      expect(await axeViolations(page)).toEqual([]);
      await page.context().close();
    },
  );
});
