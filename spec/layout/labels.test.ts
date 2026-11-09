import { type ChildProcess, execSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launch } from "../browser.ts";
import { playRoom } from "../playUi.ts";

// Label chips (task 34, 35): the layout itself, every chip and plaque from every floor tile of rooms 3, 5 and 7, is
// src/client/render/labels-layout.test.ts, a unit test on a recording canvas. This file used to walk a real browser
// through each room for 30 s a leg and read `data-label-boxes` at every step; the walk failed in CI in ten different
// ways (a camera in room 3 that sends the team back, a late key-up, a dropped connection, a stall in a one-tile gap
// that was never explained) and none of them was the layout.
//
// What a unit test cannot see is the page: that it publishes the boxes it drew, in the canvas's own pixels, with the
// real Archivo font's widths. So this stands the page at its spawn in room 5, with no walk, and checks that. At the
// spawn the wires chip is in view and no plaque is (probed), so it proves the plumbing and the real-font placement at
// one point; the plaques are the unit test's.

const port = 21080 + Math.floor(Math.random() * 1000);
const url = `http://127.0.0.1:${port}`;
const dir = mkdtempSync(join(tmpdir(), "labels-spec-"));
let app: ChildProcess;
let browser: Browser;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

beforeAll(async () => {
  if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "ignore" });
  copyFileSync("rooms/05-the-gallery.room", join(dir, "05-the-gallery.room"));
  app = spawn("node", ["server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: join(dir, "app.db"),
      ROOMS_DIR: dir,
    },
    stdio: "ignore",
  });
  for (let attempt = 0; ; attempt++) {
    try {
      await fetch(url);
      break;
    } catch {
      if (attempt >= 150) throw new Error(`the spec's own app never came up on ${url}`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  browser = await launch();
}, 60_000);

afterAll(async () => {
  app?.kill();
  rmSync(dir, { recursive: true, force: true });
  await browser?.close();
}, 30_000);

describe("the page publishes the label boxes it drew", () => {
  it("at the spawn of room 5, at 1280 and 375: well-formed, inside the canvas, and no chip on a plaque", async () => {
    const table = await playRoom(browser, url);
    try {
      // the mute seat is on desktop and the deaf seat on the phone (playRoom): both are sighted
      for (const [name, page] of [
        ["1280", table.byRole.mute],
        ["375", table.byRole.deaf],
      ] as const) {
        const canvas = page.locator("canvas[data-camera]");
        let boxes: { chips: Box[]; plaques: Box[] } | null = null;
        await expect
          .poll(
            async () => {
              const raw = await canvas.getAttribute("data-label-boxes");
              boxes = raw ? JSON.parse(raw) : null;
              return boxes?.chips.length ?? 0;
            },
            { timeout: 10_000, message: `${name}: the page published a chip` },
          )
          .toBeGreaterThan(0);
        const size = await canvas.evaluate((c) => ({
          w: (c as HTMLCanvasElement).clientWidth,
          h: (c as HTMLCanvasElement).clientHeight,
        }));
        const { chips, plaques } = boxes as unknown as { chips: Box[]; plaques: Box[] };
        for (const chip of chips) {
          expect(chip.w, `${name}: a chip has a width`).toBeGreaterThan(40);
          expect(chip.h, `${name}: a chip has a height`).toBeGreaterThan(16);
          expect(chip.x, `${name}: a chip is inside the canvas`).toBeGreaterThanOrEqual(0);
          expect(chip.y).toBeGreaterThanOrEqual(0);
          expect(chip.x + chip.w).toBeLessThanOrEqual(size.w);
          expect(chip.y + chip.h).toBeLessThanOrEqual(size.h);
          for (const plate of plaques)
            expect(
              chip.x + chip.w <= plate.x ||
                plate.x + plate.w <= chip.x ||
                chip.y + chip.h <= plate.y ||
                plate.y + plate.h <= chip.y,
              `${name}: chip ${JSON.stringify(chip)} on plaque ${JSON.stringify(plate)}`,
            ).toBe(true);
        }
      }
    } finally {
      for (const p of table.pages) await p.context().close();
    }
  }, 120_000);
});
