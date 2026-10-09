import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { axeViolations, DESKTOP, horizontalOverflow, launch, openPage, PHONE } from "../browser.ts";

const baseUrl = inject("baseUrl");
let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser.close();
});

describe.each([
  ["phone", PHONE],
  ["desktop", DESKTOP],
])("the leaderboard at %s width", (_name, viewport) => {
  it("has no horizontal overflow and no axe violations on the empty full-heist board", async () => {
    const page = await openPage(browser, new URL("/leaderboard", baseUrl).toString(), viewport);
    await page.getByRole("heading", { name: "Leaderboard" }).waitFor();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(await axeViolations(page)).toEqual([]);
    await page.close();
  });

  it("has no overflow or axe violations on a board tab with rows in it", async () => {
    const page = await openPage(
      browser,
      new URL("/leaderboard?tab=room-1", baseUrl).toString(),
      viewport,
    );
    await page.getByRole("heading", { name: "Leaderboard" }).waitFor();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(await axeViolations(page)).toEqual([]);
    await page.close();
  });
});
