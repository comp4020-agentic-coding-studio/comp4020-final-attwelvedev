import { type ChildProcess, execSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DESKTOP, horizontalOverflow, launch, PHONE, type Viewport } from "../browser.ts";
import { createLobbyAs, joinWithCode, leaveGameAndClose } from "../lobbyUi.ts";
import { settledHash } from "../playUi.ts";

// The real room 4, which hides a chamber below it, in a real game at both widths. It runs against its
// own app whose rooms dir holds only that room, so the game starts there. The chamber's logic is
// proved headless (spec/caches.test.ts); this is what only a browser shows: the taller map still fits
// its frame, the hidden chamber leaves no mark on any screen before it opens, and only the owner's
// screen carries the side-job chip.
let browser: Browser;
let app: ChildProcess;
const port = 22080 + Math.floor(Math.random() * 1000);
const url = `http://127.0.0.1:${port}`;
const dir = mkdtempSync(join(tmpdir(), "chamber-spec-"));

beforeAll(async () => {
  if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "ignore" });
  mkdirSync(join(dir, "rooms"));
  copyFileSync("rooms/04-the-safe.room", join(dir, "rooms", "04-the-safe.room"));
  app = spawn("node", ["server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: join(dir, "app.db"),
      ROOMS_DIR: join(dir, "rooms"),
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

async function threePlayers(viewport: Viewport): Promise<Page[]> {
  const host = await createLobbyAs(browser, url, "Ana", viewport);
  const pages = [host.page];
  for (const name of ["Bo", "Cy"])
    pages.push(await joinWithCode(browser, url, host.code, name, viewport));
  await host.page.getByRole("heading", { name: /^Players 3 of 6/ }).waitFor();
  await host.page.getByRole("button", { name: /^Start/ }).click();
  for (const page of pages) await page.locator(".reveal").waitFor();
  for (const page of pages) await page.getByRole("button", { name: "I'm ready" }).click();
  for (const page of pages) await page.locator(".frame canvas").waitFor();
  return pages;
}
const close = async (pages: Page[]) => {
  for (const page of pages) await leaveGameAndClose(page, url).catch(() => {});
};

describe.each([
  ["1280 desktop", DESKTOP],
  ["375 phone", PHONE],
])("room 4's hidden chamber at %s", (_name, viewport) => {
  it("fits the taller map in its frame, and the same screen is drawn for all three seats' map size", async () => {
    const pages = await threePlayers(viewport);
    try {
      for (const page of pages) {
        const frame = await page.locator(".frame").boundingBox();
        const canvas = await page.locator(".frame canvas").boundingBox();
        expect(frame && canvas).toBeTruthy();
        if (frame && canvas) {
          expect(canvas.x).toBeGreaterThanOrEqual(frame.x - 1);
          expect(canvas.x + canvas.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
          expect(canvas.y + canvas.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
        }
        expect(await horizontalOverflow(page)).toBe(0);
        // not blank: a settled frame differs from an empty canvas of the same size
        const blank = await page
          .locator(".frame canvas")
          .evaluate(
            (c) =>
              document.createElement("canvas").toDataURL() === (c as HTMLCanvasElement).toDataURL(),
          );
        expect(blank).toBe(false);
        expect((await settledHash(page)).length).toBeGreaterThan(1000);
      }
    } finally {
      await close(pages);
    }
  }, 60_000);

  it("shows the side-job chip to the owner's screen only, at least 48 px tall and inside the frame", async () => {
    const pages = await threePlayers(viewport);
    try {
      await Promise.any(pages.map((p) => p.locator(".side-job").waitFor()));
      const counts = await Promise.all(pages.map((p) => p.locator(".side-job").count()));
      expect(counts.filter((n) => n === 1)).toHaveLength(1);
      const owner = pages[counts.indexOf(1)] as Page;
      const box = await owner.locator(".side-job").boundingBox();
      expect(box && box.height >= 48).toBe(true);
      expect(box && box.x >= 0 && box.x + box.width <= viewport.width).toBe(true);
      // the chamber is wall: nothing on any screen names a chamber, a vault or a plate before it opens
      for (const page of pages) {
        const text = (await page.locator("body").innerText()).toLowerCase();
        expect(text).not.toMatch(/chamber|vault|inspection plate|hollow/);
      }
    } finally {
      await close(pages);
    }
  }, 60_000);
});
