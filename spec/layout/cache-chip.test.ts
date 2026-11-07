import { type ChildProcess, execSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DESKTOP, horizontalOverflow, launch, PHONE, type Viewport } from "../browser.ts";
import { createLobbyAs, joinWithCode, leaveGameAndClose } from "../lobbyUi.ts";

// The side-job chip and the reveal's side-job row, in a real game of the fixture room whose cache
// belongs to seat 1 (spec/fixtures/rooms-cache/01-cache-a). It runs against its own app, because
// the shared one loads the real rooms, which have no cache until phase 14-04.
let browser: Browser;
let app: ChildProcess;
const port = 21080 + Math.floor(Math.random() * 1000);
const url = `http://127.0.0.1:${port}`;
const dir = mkdtempSync(join(tmpdir(), "cache-chip-spec-"));

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

async function threePlayers(viewport: Viewport): Promise<Page[]> {
  const host = await createLobbyAs(browser, url, "Ana", viewport);
  const pages = [host.page];
  for (const name of ["Bo", "Cy"])
    pages.push(await joinWithCode(browser, url, host.code, name, viewport));
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
])("the side job at %s", (_name, viewport) => {
  it("shows its owner a reveal row and a chip, and the other two seats neither", async () => {
    const pages = await threePlayers(viewport);
    try {
      const rows = await Promise.all(pages.map((p) => p.locator(".reveal-cache").count()));
      expect(rows.filter((n) => n === 1)).toHaveLength(1);
      const owner = pages[rows.indexOf(1)] as Page;
      const row = owner.locator(".reveal-cache");
      expect(await row.innerText()).toContain("Only you can read this");
      const glyph = await row.locator("svg").boundingBox();
      expect(glyph?.width).toBe(48);
      // the reveal scrolls on a phone, so the row may sit below the fold; it must sit inside the
      // card and inside the page's width
      const box = await row.boundingBox();
      const card = await owner.locator(".reveal").boundingBox();
      expect(box && card && box.x >= card.x && box.x + box.width <= card.x + card.width).toBe(true);
      expect(box && box.x >= 0 && box.x + box.width <= viewport.width).toBe(true);
      expect(await horizontalOverflow(owner)).toBe(0);

      for (const page of pages) await page.getByRole("button", { name: "I'm ready" }).click();
      for (const page of pages) await page.locator(".frame canvas").waitFor();
      await owner.locator(".side-job").waitFor(); // the first view has to land
      const chips = await Promise.all(pages.map((p) => p.locator(".side-job").count()));
      expect(chips.filter((n) => n === 1)).toHaveLength(1);
      expect(chips[rows.indexOf(1)]).toBe(1); // the owner's, not someone else's

      // the chip: its target is at least 48 px, its motif and text sit inside the frame
      const chip = owner.locator(".side-job");
      const cb = await chip.boundingBox();
      expect(cb && cb.height >= 48).toBe(true);
      expect(cb && inside(cb, viewport)).toBe(true);
      const g = await chip.locator("svg").first().boundingBox();
      expect(g && cb && g.x >= cb.x && g.x + g.width <= cb.x + cb.width).toBe(true);
      // the riddle is shown whole from the start: nothing is clipped by the chip's own box
      const text = chip.locator(".side-job-text");
      expect(await text.innerText()).toContain("moon");
      const clipped = await text.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
      expect(clipped).toBe(false);
      // a click hides it down to the label (and the chip stays a 48 px target), another shows it again
      await chip.click();
      expect(await text.count()).toBe(0);
      expect((await chip.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
      await chip.click();
      expect(await text.count()).toBe(1);
      expect(
        await owner
          .locator(".side-job")
          .boundingBox()
          .then((b) => b && inside(b, viewport)),
      ).toBe(true);
      expect(await horizontalOverflow(owner)).toBe(0);
    } finally {
      await close(pages);
    }
  }, 60_000);

  it("the cache moment never covers the side-job chip, and a long moment caption does not squeeze the other cues", async () => {
    const pages = await threePlayers(viewport);
    try {
      for (const page of pages) await page.getByRole("button", { name: "I'm ready" }).click();
      for (const page of pages) await page.locator(".frame canvas").waitFor();
      await Promise.any(pages.map((p) => p.locator(".side-job").waitFor()));
      const owner = (
        await Promise.all(
          pages.map(async (p) => ((await p.locator(".side-job").count()) ? p : null)),
        )
      ).find(Boolean) as Page;
      // the page's own classes, with the longest words each can carry: the solved chip, the moment
      // card for the longest item and a long nickname, and a cue line with short cues beside it
      await owner.evaluate(() => {
        const chip = document.querySelector(".side-job") as HTMLElement;
        chip.outerHTML = `<div class="side-job is-found is-vault"><span class="keepsake" style="--keep:32px"></span><span class="side-job-found"><span class="side-job-name">pearl necklace</span><span class="side-job-text">Waiting in the vault</span></span></div>`;
        const frame = document.querySelector(".side-job")?.parentElement as HTMLElement;
        frame.insertAdjacentHTML(
          "beforeend",
          `<div class="cache-moment" id="moment"><p>Bartholomew-Maximilian's side job found: the pearl necklace</p></div>
           <div class="captions" id="caps"><p class="cue"><span class="cue-item">footsteps</span><span class="cue-item">footsteps</span><span class="cue-item">Solved</span><span class="cue-item">Bartholomew-Maximilian's side job found: the pearl necklace</span></p></div>`,
        );
      });
      const chip = await owner.locator(".side-job").boundingBox();
      const moment = await owner.locator("#moment").boundingBox();
      expect(chip && moment).toBeTruthy();
      if (chip && moment) {
        const apart =
          moment.y >= chip.y + chip.height ||
          moment.x >= chip.x + chip.width ||
          moment.x + moment.width <= chip.x;
        expect(apart, "the moment card sits clear of the side-job chip").toBe(true);
        expect(inside(moment, viewport)).toBe(true);
      }
      // each short cue stays on one line: a squeezed one wraps letter by letter and grows tall
      for (const item of await owner.locator("#caps .cue-item").all()) {
        const text = (await item.innerText()).trim();
        if (text.length > 12) continue;
        const box = await item.boundingBox();
        expect(box && box.height < 40, `"${text}" is on one line`).toBe(true);
      }
      expect(await horizontalOverflow(owner)).toBe(0);
    } finally {
      await close(pages);
    }
  }, 60_000);

  it("the taken chip is as wide as a long item name needs, wraps it, and pulses once; the vault chip does not pulse", async () => {
    const pages = await threePlayers(viewport);
    try {
      for (const page of pages) await page.getByRole("button", { name: "I'm ready" }).click();
      for (const page of pages) await page.locator(".frame canvas").waitFor();
      await Promise.any(pages.map((p) => p.locator(".side-job").waitFor()));
      const owner = (
        await Promise.all(
          pages.map(async (p) => ((await p.locator(".side-job").count()) ? p : null)),
        )
      ).find(Boolean) as Page;
      // The page's own stylesheet on a solved chip: the unsolved one is swapped for a copy in the
      // solved shape, with the longest item name and a long nickname, since the real solve is the
      // game's, not this spec's. What is measured is the CSS and the markup's classes.
      await owner.evaluate(() => {
        const chip = document.querySelector(".side-job") as HTMLElement;
        chip.outerHTML = `<div class="side-job is-found is-taken" id="solved"><span class="keepsake" style="--keep:32px"></span><span class="side-job-found"><span class="side-job-name">pearl necklace and a very long extra name</span><span class="side-job-text">Taken by Bartholomew-Maximilian Featherstonehaugh and then some more words</span></span></div>`;
      });
      const solved = owner.locator("#solved");
      const box = await solved.boundingBox();
      expect(box && inside(box, viewport)).toBe(true);
      expect(box && box.height >= 48).toBe(true);
      for (const sel of [".side-job-name", ".side-job-text"]) {
        const clipped = await solved
          .locator(sel)
          .evaluate(
            (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
          );
        expect(clipped, sel).toBe(false);
      }
      expect(await horizontalOverflow(owner)).toBe(0);
      const anim = () =>
        solved.evaluate((el) => {
          const s = getComputedStyle(el);
          return { name: s.animationName, count: s.animationIterationCount };
        });
      expect(await anim()).toEqual({ name: "side-job-pulse", count: "1" });
      await owner.emulateMedia({ reducedMotion: "reduce" });
      expect((await anim()).name).toBe("none");
      await owner.emulateMedia({ reducedMotion: "no-preference" });
      await owner.evaluate(() => {
        document.getElementById("solved")?.classList.replace("is-taken", "is-vault");
      });
      expect((await anim()).name).toBe("none"); // nothing counts yet: the vault chip stays still
    } finally {
      await close(pages);
    }
  }, 60_000);
});

// The user: the riddle chip is always open, and a label chip drawn under its corner was half hidden.
// The chip is DOM and the labels are canvas, so the page measures the chip and the canvas keeps clear.
// Its own app with only 02-cache-b, whose cache belongs to seat 3, the sighted one in room 1: the
// other fixture's owner is Can't see, who has no map and so no label chips to hide.
describe("the side-job chip and the label chips", () => {
  const ownPort = 22080 + Math.floor(Math.random() * 1000);
  const ownUrl = `http://127.0.0.1:${ownPort}`;
  const ownDir = mkdtempSync(join(tmpdir(), "cache-chip-labels-"));
  let ownApp: ChildProcess;
  let ownBrowser: Browser;

  beforeAll(async () => {
    if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "ignore" });
    copyFileSync("spec/fixtures/rooms-cache/02-cache-b.room", join(ownDir, "02-cache-b.room"));
    ownApp = spawn("node", ["server.ts"], {
      env: {
        ...process.env,
        PORT: String(ownPort),
        DATABASE_PATH: join(ownDir, "app.db"),
        ROOMS_DIR: ownDir,
      },
      stdio: "ignore",
    });
    for (let attempt = 0; ; attempt++) {
      try {
        await fetch(ownUrl);
        break;
      } catch {
        if (attempt >= 150) throw new Error(`the spec's own app never came up on ${ownUrl}`);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    ownBrowser = await launch();
  }, 60_000);
  afterAll(async () => {
    ownApp?.kill();
    rmSync(ownDir, { recursive: true, force: true });
    await ownBrowser?.close();
  }, 30_000);

  it.each([
    ["1280 desktop", DESKTOP],
    ["375 phone", PHONE],
  ])(
    "no label chip sits under the side-job chip at %s",
    async (_name, viewport) => {
      const host = await createLobbyAs(ownBrowser, ownUrl, "Ana", viewport);
      const pages = [host.page];
      for (const name of ["Bo", "Cy"])
        pages.push(await joinWithCode(ownBrowser, ownUrl, host.code, name, viewport));
      try {
        await host.page.getByRole("heading", { name: /^3 here · 3 play each room/ }).waitFor();
        await host.page.getByRole("button", { name: /^Start/ }).click();
        for (const page of pages) await page.getByRole("button", { name: "I'm ready" }).click();
        for (const page of pages) await page.locator(".frame canvas").waitFor();
        const owner = pages[2] as Page; // seat 3 in room 1: the one who sees
        await owner.locator(".side-job").waitFor();
        const canvas = owner.locator("canvas[data-camera]");
        let drawn = 0;
        // a count of samples, not a clock: each reads the chip and the labels as drawn at that moment.
        // At more than one window height, because where a label lands depends on the frame's height
        // and at one height the chip may happen to be clear.
        for (const height of [viewport.height, 700, 420, 300]) {
          await owner.setViewportSize({ width: viewport.width, height });
          // wait for the canvas to be the new size, so no frame from before the resize stands in
          await expect
            .poll(async () => ((await canvas.boundingBox())?.height ?? 0) <= height)
            .toBe(true);
          for (let i = 0; i < 6; i++) {
            const chip = await owner.locator(".side-job").boundingBox();
            const frame = await canvas.boundingBox();
            const raw = await canvas.getAttribute("data-label-boxes");
            if (chip && frame && raw) {
              const mine = {
                x: chip.x - frame.x,
                y: chip.y - frame.y,
                w: chip.width,
                h: chip.height,
              };
              const chips = (JSON.parse(raw) as { chips: Mine[] }).chips;
              drawn += chips.length;
              for (const c of chips)
                expect(
                  c.x + c.w <= mine.x ||
                    mine.x + mine.w <= c.x ||
                    c.y + c.h <= mine.y ||
                    mine.y + mine.h <= c.y,
                  `${height}: label ${JSON.stringify(c)} under riddle ${JSON.stringify(mine)}`,
                ).toBe(true);
            }
            await owner.waitForTimeout(50);
          }
        }
        expect(drawn, "a label chip was drawn, or this proved nothing").toBeGreaterThan(0);
      } finally {
        await close(pages, ownUrl);
      }
    },
    60_000,
  );
});
interface Mine {
  x: number;
  y: number;
  w: number;
  h: number;
}
