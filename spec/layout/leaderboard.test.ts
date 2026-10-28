import type { Browser, Page } from "playwright";
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
import { clearRoomOne } from "../heistPlay.ts";
import { closeAll, type Player, ready, startedGame } from "../play.ts";

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

// A player's own device opened on a game sockets started: their cookie and saved nickname, so the
// lobby page rejoins their seat.
async function openAs(player: Player, nickname: string, code: string, viewport: Viewport) {
  const eq = player.cookie.indexOf("=");
  const context = await browser.newContext({ viewport });
  await context.addCookies([
    { name: player.cookie.slice(0, eq), value: player.cookie.slice(eq + 1), url: baseUrl },
  ]);
  await context.addInitScript((n) => localStorage.setItem("heist.nickname", n), nickname);
  const page: Page = await context.newPage();
  await page.goto(new URL(`/lobby/${code}`, baseUrl).href);
  await page.locator(".frame canvas").waitFor();
  return page;
}

describe.each([
  ["phone", PHONE],
  ["desktop", DESKTOP],
])("the board in the game at %s width", (name, viewport) => {
  it("shows the room's top 5 on the cleared card, with this run marked", async () => {
    const { players, code } = await startedGame(baseUrl);
    ready(players);
    const page = await openAs(players[1] as Player, "Bo", code, viewport);
    await clearRoomOne(players);
    const board = page.locator(".room-board");
    await board.waitFor();
    const rows = board.locator("tbody tr");
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
    expect(await rows.count()).toBeLessThanOrEqual(6);
    // this run is one highlighted row: its team's in the top 5, or "You" with its rank below them
    // (bot clears tie on time, so on the shared server it may be either)
    expect(await board.locator("tr.mine").count()).toBe(1);
    expect(await board.locator("tr.mine").innerText()).toMatch(new RegExp(`Team ${code}|You`));
    await page.screenshot({ path: `/tmp/room-board-${name}.png` });
    await page.context().close();
    await closeAll(players);
  }, 120_000);

  it("opens the full board as a panel with no navigation, axe clean, and closes", async () => {
    const { players, code } = await startedGame(baseUrl);
    ready(players);
    const page = await openAs(players[1] as Player, "Bo", code, viewport);
    await clearRoomOne(players);
    const url = page.url();
    await page.getByRole("button", { name: "Full leaderboard" }).click();
    const panel = page.getByRole("dialog", { name: "Leaderboard" });
    await panel.waitFor();
    await panel.getByRole("tab", { name: "Room 1", exact: true }).click();
    await panel.locator("table").waitFor();
    expect(
      await panel.getByRole("tab", { name: "Room 1", exact: true }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(page.url()).toBe(url);
    expect(await page.context().pages()).toHaveLength(1);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    // the panel's own content; what it covers is the game's (and the cleared card's) to check
    expect(await axeViolations(page, ".board-panel")).toEqual([]);
    await page.screenshot({ path: `/tmp/board-panel-${name}.png` });
    await panel.getByRole("button", { name: "Close" }).click();
    await panel.waitFor({ state: "detached" });
    // Escape closes it too
    await page.getByRole("button", { name: "Full leaderboard" }).click();
    await panel.waitFor();
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "detached" });
    expect(page.url()).toBe(url);
    await page.context().close();
    await closeAll(players);
  }, 120_000);
});
