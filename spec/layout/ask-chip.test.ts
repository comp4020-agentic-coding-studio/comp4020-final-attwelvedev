import { type ChildProcess, execSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DESKTOP, horizontalOverflow, launch, PHONE, type Viewport } from "../browser.ts";
import { createLobbyAs, joinWithCode, leaveGameAndClose } from "../lobbyUi.ts";

// The ask chip (BT2, Task 301): a bot's ask of the person, drawn on the bot's figure. A real game of the
// fixture room whose cache belongs to seat 1 (spec/fixtures/rooms-cache/01-cache-a), so the side-job chip
// (the neighbour that shares the frame's top corner) is there too. The bots do not ask in this room, so
// every view the pages receive is given an ask from the next seat, as the server's view would carry it.
// Its own app, because the shared one loads the real rooms.
let browser: Browser;
let app: ChildProcess;
const port = 21080 + Math.floor(Math.random() * 1000);
const url = `http://127.0.0.1:${port}`;
const dir = mkdtempSync(join(tmpdir(), "ask-chip-spec-"));

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
      await fetch(url);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  browser = await launch();
}, 40_000);
afterAll(async () => {
  await browser?.close();
  app?.kill();
  rmSync(dir, { recursive: true, force: true });
});

async function withAsk(page: Page): Promise<void> {
  await page.routeWebSocket(/\/ws$/, (ws) => {
    const server = ws.connectToServer();
    server.onMessage((frame) => {
      if (typeof frame !== "string" || !frame.includes('"t":"view"')) return ws.send(frame);
      const msg = JSON.parse(frame);
      const seat = msg.view.you.seat as number;
      msg.view.you.asks = [{ from: (seat + 1) % 3, kind: "stop-on-click", saidAt: 1 }];
      ws.send(JSON.stringify(msg));
    });
  });
  await page.reload(); // the lobby's socket was open before the route: reconnect through it
}

async function threePlayers(viewport: Viewport): Promise<Page[]> {
  const host = await createLobbyAs(browser, url, "Ana", viewport);
  const pages = [host.page];
  await withAsk(host.page);
  for (const name of ["Bo", "Cy"]) {
    const page = await joinWithCode(browser, url, host.code, name, viewport);
    await withAsk(page);
    pages.push(page);
  }
  await host.page.getByRole("heading", { name: /^3 here · 3 play each room/ }).waitFor();
  await host.page.getByRole("button", { name: /^Start/ }).click();
  for (const page of pages) await page.locator(".reveal").waitFor();
  return pages;
}
const close = async (pages: Page[], at = url) => {
  for (const page of pages) await leaveGameAndClose(page, at).catch(() => {});
};
const inside = (box: { x: number; y: number; width: number; height: number }, vp: Viewport) =>
  box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height;

describe.each([
  ["1280 desktop", DESKTOP],
  ["375 phone", PHONE],
])("the ask chip at %s", (_name, viewport) => {
  it("is not clipped and sits clear of the side-job chip, for Can't speak and Can't hear", async () => {
    const pages = await threePlayers(viewport);
    try {
      const names = await Promise.all(
        pages.map(
          async (p) =>
            /Can.t (see|hear|speak)/i
              .exec(await p.locator(".reveal").innerText())?.[1]
              ?.toLowerCase() ?? "?",
        ),
      );
      for (const page of pages) await page.getByRole("button", { name: "I'm ready" }).click();
      for (const page of pages) await page.locator(".frame canvas").waitFor();
      const roles: string[] = [];
      for (const [i, page] of pages.entries()) {
        await page
          .locator(".frame canvas[data-labels~='ask']")
          .waitFor({ timeout: 10_000 })
          .catch(() => {});
        const role = names[i] as string;
        const canvas = page.locator(".frame canvas");
        const labels = (await canvas.getAttribute("data-labels")) ?? "";
        if (role === "see") {
          // Can't see's frame draws no labels: the ask is spoken to them instead
          expect(labels).not.toContain("ask");
          continue;
        }
        roles.push(role);
        expect(labels.split(" "), `${role} sees the ask chip`).toContain("ask");
        // the side-job chip belongs to the cache's owner, who may be Can't see here: give this seat one in
        // the frame's top corner, where the real one sits, so the ask has its neighbour to keep clear of
        if (!(await page.locator(".side-job").count()))
          await page.evaluate(() => {
            const host = document.querySelector(".frame") as HTMLElement;
            host.insertAdjacentHTML(
              "beforeend",
              '<div class="side-job" style="position:absolute;top:8px;left:8px;width:200px;height:48px"></div>',
            );
          });
        await page.waitForTimeout(300); // a few frames, so the chip is placed around it
        const job = await page.locator(".side-job").boundingBox();
        expect(job, "a side-job chip to keep clear of").toBeTruthy();
        const report = JSON.parse((await canvas.getAttribute("data-label-boxes")) ?? "{}") as {
          chips: { x: number; y: number; w: number; h: number }[];
        };
        const frame = await canvas.boundingBox();
        expect(report.chips.length).toBeGreaterThan(0);
        for (const c of report.chips) {
          // not clipped: wholly inside the canvas
          expect(c.x >= 0 && c.y >= 0, `${role} chip starts inside`).toBe(true);
          expect(
            frame && c.x + c.w <= frame.width && c.y + c.h <= frame.height,
            `${role} chip ends inside`,
          ).toBe(true);
          if (frame && job) {
            const mine = { x: frame.x + c.x, y: frame.y + c.y, w: c.w, h: c.h };
            const apart =
              mine.x + mine.w <= job.x ||
              job.x + job.width <= mine.x ||
              mine.y + mine.h <= job.y ||
              job.y + job.height <= mine.y;
            expect(apart, `${role} chip clear of .side-job`).toBe(true);
          }
        }
      }
      expect(roles.sort(), "both roles were checked").toEqual(["hear", "speak"]);
    } finally {
      await close(pages);
    }
  }, 60_000);
});
