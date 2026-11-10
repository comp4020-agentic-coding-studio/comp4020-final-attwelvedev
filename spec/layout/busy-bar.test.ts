import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { DESKTOP, launch, PHONE } from "../browser.ts";
import { playRoom, type Table } from "../playUi.ts";

// Review F2 (Task 293): on a phone the sighted goal line sits in the top bar (.hud-goal), and items can appear
// on that row mid-game: the lamp light, the connection's "Offline. Retrying…" and "N watching". If the goal line
// wrapped to make room, the bar would grow and the map frame shrink: the jolt of B4 again. A quiet bar and a busy
// one must be the same height, and so must the frame. The busy items are the app's real markup put where the
// app puts it (a lamp, a dropped socket and a watcher each need a whole scene to set up), with the longest
// clock, loot and watcher count. Measured before the fix at 375: the bar 92 -> 163 px, the frame 433 -> 362.

const baseUrl = inject("baseUrl");
let browser: Browser;
let table: Table;
beforeAll(async () => {
  browser = await launch();
  table = await playRoom(browser, baseUrl);
}, 60_000);
afterAll(async () => {
  for (const page of table?.pages ?? []) await page.context().close();
  await browser.close();
});

const heights = (page: Page) =>
  page.evaluate(() => ({
    bar: Math.round(
      (document.querySelector(".hud-top") as HTMLElement).getBoundingClientRect().height,
    ),
    frame: Math.round(
      (document.querySelector(".frame") as HTMLElement).getBoundingClientRect().height,
    ),
  }));

const makeBusy = (page: Page) =>
  page.evaluate(() => {
    const bar = document.querySelector(".hud-top") as HTMLElement;
    const goal = bar.querySelector(".hud-goal");
    const room = bar.querySelector(".hud-room-game") as HTMLElement;
    room.insertAdjacentHTML(
      "beforebegin",
      `<span class="lamp-light probe" role="status" aria-label="Lamp from Can't see"><svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" /></svg><svg width="14" height="14" viewBox="0 0 14 14"></svg></span>`,
    );
    const conn = bar.querySelector(".conn") as HTMLElement;
    conn.dataset.was = conn.outerHTML;
    conn.className = "conn conn-offline";
    conn.innerHTML = `<span class="conn-dot" aria-hidden="true">○</span> Offline. Retrying…`;
    const watching = bar.querySelector(".hud-watching .hud-btn") as HTMLButtonElement;
    watching.hidden = false;
    watching.disabled = false;
    watching.textContent = "12 watching";
    // the longest the clock and the loot run to in a room
    (bar.querySelector(".hud-clock") as HTMLElement).textContent = "12:09";
    (bar.querySelector(".hud-loot > span") as HTMLElement).textContent = "◆ 12";
    return goal !== null;
  });

describe("the top bar never grows mid-game (Task 293)", () => {
  it("keeps the bar's and the frame's height with the lamp, Offline and a watcher showing, for both sighted seats at 375 and 1280", async () => {
    for (const role of ["deaf", "mute"] as const) {
      const page = table.byRole[role];
      for (const viewport of [PHONE, DESKTOP]) {
        await page.setViewportSize(viewport);
        await page.reload();
        await page.locator('.game[data-intro="done"]').waitFor({ timeout: 10_000 });
        const quiet = await heights(page);
        // the quiet bar shows the whole goal line and the whole "Live": nothing gives way until it must
        const clipped = await page.evaluate(() =>
          [".hud-goal", ".conn"].filter((q) => {
            const el = document.querySelector(q) as HTMLElement | null;
            return el !== null && el.offsetParent !== null && el.scrollWidth > el.clientWidth;
          }),
        );
        await makeBusy(page);
        const busy = await heights(page);
        const label = `${role}@${viewport.width}`;
        expect(clipped, `${label}: clipped in the quiet bar`).toEqual([]);
        expect(busy.bar, `${label}: the bar's height`).toBe(quiet.bar);
        expect(busy.frame, `${label}: the frame's height`).toBe(quiet.frame);
      }
    }
  }, 60_000);
});
