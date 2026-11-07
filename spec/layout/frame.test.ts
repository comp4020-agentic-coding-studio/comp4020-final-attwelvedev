import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { launch } from "../browser.ts";
import { joinAsWatcher, lobbyCodeOf } from "../lobbyUi.ts";
import { playRoom, type Table } from "../playUi.ts";

// The canvas frame (diorama FR6): a recessed bezel with a role tab, a 1 px role rim and, for a
// spectator, a dashed bezel with no tab.
const baseUrl = inject("baseUrl");
let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser.close();
});

const ROLE_RGB = {
  blind: "rgb(242, 169, 59)",
  deaf: "rgb(77, 179, 255)",
  mute: "rgb(155, 126, 224)",
} as const;
type Box = { x: number; y: number; width: number; height: number };
const touches = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("the role frame", () => {
  let table: Table;
  beforeAll(async () => {
    table = await playRoom(browser, baseUrl);
  });

  for (const role of ["blind", "deaf", "mute"] as const) {
    const label = role === "deaf" ? "375 (phone)" : "1280";
    it(`${role} at ${label}: the tab is at least 36 px square at the top-left in the role colour, the rim is 1 px on all sides`, async () => {
      const page = table.byRole[role];
      const frame = page.locator(".frame");
      const tab = page.locator(".frame .notch");
      const fb = (await frame.boundingBox()) as Box;
      const tb = (await tab.boundingBox()) as Box;
      expect(tb.width).toBeGreaterThanOrEqual(36);
      expect(tb.height).toBeGreaterThanOrEqual(36);
      expect(Math.abs(tb.x - fb.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(tb.y - fb.y)).toBeLessThanOrEqual(1);
      expect(await tab.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(ROLE_RGB[role]);
      // the rim: a spread-1 shadow with no blur in the role colour, drawn on every side
      const shadow = await frame.evaluate((el) => getComputedStyle(el).boxShadow);
      expect(shadow).toContain(`${ROLE_RGB[role]} 0px 0px 0px 1px`);
      expect(await frame.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("0px");
    });

    it(`${role}: a side-job chip's box never touches the role tab's box (.top-stack)`, async () => {
      const page = table.byRole[role];
      // the real chip needs a cache room; borrow the real class in the real column
      await page.evaluate(() => {
        const stack = document.querySelector(".top-stack") as HTMLElement;
        const chip = document.createElement("div");
        chip.className = "side-job is-found";
        chip.id = "probe-chip";
        chip.textContent = "pearl necklace";
        stack.prepend(chip);
      });
      const chip = (await page.locator("#probe-chip").boundingBox()) as Box;
      const tab = (await page.locator(".frame .notch").boundingBox()) as Box;
      await page.evaluate(() => document.getElementById("probe-chip")?.remove());
      expect(touches(chip, tab), JSON.stringify({ chip, tab })).toBe(false);
    });
  }
});

describe("the spectator's frame", () => {
  it("is dashed and has no tab, at 1280 and 375", async () => {
    const table = await playRoom(browser, baseUrl);
    const code = lobbyCodeOf(table.pages[0] as Page);
    for (const [vp, touch] of [
      [{ width: 1280, height: 800 }, false],
      [{ width: 375, height: 812 }, true],
    ] as const) {
      const watcher = await joinAsWatcher(browser, baseUrl, code, "Wes", vp, { hasTouch: touch });
      const frame = watcher.locator(".spectator-frame");
      const style = await frame.evaluate((el) => {
        const s = getComputedStyle(el);
        return { outline: s.outlineStyle, width: s.outlineWidth, rim: s.boxShadow };
      });
      expect(style.outline).toBe("dashed");
      expect(style.width).toBe("2px");
      expect(await watcher.locator(".spectator-frame .notch").count()).toBe(0);
      expect(style.rim).not.toContain("0px 0px 0px 1px");
      await watcher.context().close();
    }
    for (const page of table.pages) await page.context().close();
  });
});
