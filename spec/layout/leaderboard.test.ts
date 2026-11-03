import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { clearRoomOne, clearTinyRoom } from "../heistPlay.ts";
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

  it("lays the cleared card out in one centred column: credits inside it, the board on its middle, nothing clipped", async () => {
    const { players, code } = await startedGame(baseUrl);
    ready(players);
    // a long nickname is the stress: a name wider than its card must wrap, never push the column out
    const page = await openAs(
      players[1] as Player,
      "Bartholomew-the-Extremely-Long",
      code,
      viewport,
    );
    await clearRoomOne(players);
    const card = page.locator(".overlay > .cleared");
    await card.waitFor();
    await page.locator(".credits > li").first().waitFor();
    const box = async (sel: string) => {
      const b = await page.locator(sel).first().boundingBox();
      if (!b) throw new Error(`no box for ${sel}`);
      return b;
    };
    const frame = await box(".frame");
    const cardBox = await box(".overlay > .cleared");
    const board = await box(".cleared .room-board");
    const mid = (b: { x: number; width: number }) => b.x + b.width / 2;
    // the card and the board share a middle (within a pixel), and both sit inside the frame
    expect(Math.abs(mid(board) - mid(cardBox))).toBeLessThanOrEqual(1);
    expect(board.x).toBeGreaterThanOrEqual(cardBox.x - 1);
    expect(board.x + board.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
    expect(cardBox.x).toBeGreaterThanOrEqual(frame.x - 1);
    expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
    // every credit card is inside the column and its text is not clipped (scrollWidth, not a guess)
    const clipped = await page
      .locator(".credits > li")
      .evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
    expect(clipped).toBe(0);
    for (const li of await page.locator(".credits > li").all()) {
      const b = await li.boundingBox();
      if (!b) throw new Error("no credit box");
      expect(b.x).toBeGreaterThanOrEqual(cardBox.x - 1);
      expect(b.x + b.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
    }
    // the cards sit side by side on a desktop (one row, the column wide enough for three) and stack
    // on a phone: it is the width of the column, not a wish, that decides
    const tops = await page
      .locator(".credits > li")
      .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(name === "desktop" ? 1 : tops.length);
    // the essentials are in view without scrolling, on both widths: the title, the stats, the
    // credits and the buttons. The board below them may scroll (the overlay scrolls from its top),
    // since a board of six rows plus a rank line is taller than the frame by design.
    const lastButton = await box(".cleared-actions");
    expect(lastButton.y + lastButton.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
    // the buttons are still 48 px targets
    for (const btn of await page.locator(".cleared-actions button").all()) {
      expect((await btn.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
    }
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(await axeViolations(page, ".cleared")).toEqual([]);
    await page.screenshot({ path: `/tmp/cleared-${name}.png` });
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

// The cleared card's side-job tile in a real cleared room that carries a cache (the fixture, on its
// own app: the shared one loads rooms whose caches nobody opens). The tile sits after the credits and
// before the buttons, inside the column, and never makes the buttons fall out of the frame.
describe.each([
  ["phone", PHONE],
  ["desktop", DESKTOP],
])("the side-job tile on the cleared card at %s width", (name, viewport) => {
  const port = 23080 + Math.floor(Math.random() * 1000);
  const ownUrl = `http://127.0.0.1:${port}`;
  const dir = mkdtempSync(join(tmpdir(), "tile-spec-"));
  let app: ChildProcess;

  beforeAll(async () => {
    if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "ignore" });
    app = spawn("node", ["server.ts"], {
      env: {
        ...process.env,
        PORT: String(port),
        DATABASE_PATH: join(dir, "app.db"),
        ROOMS_DIR: "spec/fixtures/rooms-cache",
      },
      stdio: "ignore",
    });
    for (let attempt = 0; attempt < 150; attempt++) {
      try {
        await fetch(ownUrl);
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    throw new Error(`the spec's own app never came up on ${ownUrl}`);
  }, 40_000);
  afterAll(() => {
    app?.kill();
    rmSync(dir, { recursive: true, force: true });
  });

  it("sits after the credits and before the buttons, inside the column, with the buttons in the frame", async () => {
    const { players, code } = await startedGame(ownUrl);
    ready(players);
    const player = players[1] as Player;
    const eq = player.cookie.indexOf("=");
    const context = await browser.newContext({ viewport });
    await context.addCookies([
      { name: player.cookie.slice(0, eq), value: player.cookie.slice(eq + 1), url: ownUrl },
    ]);
    await context.addInitScript((n) => localStorage.setItem("heist.nickname", n), "Bo");
    const page = await context.newPage();
    try {
      await page.goto(new URL(`/lobby/${code}`, ownUrl).href);
      await page.locator(".frame canvas").waitFor();
      await clearTinyRoom(players);
      const tile = page.locator(".side-job-tile");
      await tile.waitFor();
      const box = async (sel: string) => {
        const b = await page.locator(sel).first().boundingBox();
        if (!b) throw new Error(`no box for ${sel}`);
        return b;
      };
      const card = await box(".overlay > .cleared");
      const credits = await box(".credits");
      const t = await box(".side-job-tile");
      const actions = await box(".cleared-actions");
      const frame = await box(".frame");
      expect(t.y, "after the credits").toBeGreaterThanOrEqual(credits.y + credits.height - 1);
      expect(t.y + t.height, "before the buttons").toBeLessThanOrEqual(actions.y + 1);
      expect(t.x).toBeGreaterThanOrEqual(card.x - 1);
      expect(t.x + t.width).toBeLessThanOrEqual(card.x + card.width + 1);
      expect(actions.y + actions.height, "the buttons stay in the frame").toBeLessThanOrEqual(
        frame.y + frame.height + 1,
      );
      // text not clipped: the tile's own text fits its box
      const clipped = await tile
        .locator(".side-job-tile-text")
        .evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(clipped).toBe(false);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `/tmp/cleared-tile-${name}.png` });
    } finally {
      await context.close();
      await closeAll(players);
    }
  }, 120_000);
});
