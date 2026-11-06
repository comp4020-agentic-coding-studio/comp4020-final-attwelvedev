import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WORLD } from "../../src/client/tokens.ts";
import { DESKTOP, launch, PHONE } from "../browser.ts";
import { playRoom, type Table } from "../playUi.ts";

// A door opening off screen is a pill at the edge toward it (ADR 0025, plan 2026-11-07-team-wide-doors
// Task 89). spec/fixtures/rooms-door has one door 28 tiles east of the spawns, which opens once all three
// stand on their plates beside the spawns: far past either camera. Its own app, since the rooms come
// from ROOMS_DIR. The pill is measured by its stroke, the door's colour, on the canvas: nothing else
// in this room is that colour while the door is off screen.
const port = 19080 + Math.floor(Math.random() * 1000);
const dir = mkdtempSync(join(tmpdir(), "door-pill-spec-"));
const url = `http://127.0.0.1:${port}`;
let app: ChildProcess;
let browser: Browser;
let table: Table;

beforeAll(async () => {
  if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "ignore" });
  app = spawn("node", ["server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: join(dir, "app.db"),
      ROOMS_DIR: "spec/fixtures/rooms-door",
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
  table = await playRoom(browser, url);
  for (const page of table.pages) await page.emulateMedia({ reducedMotion: "reduce" });
}, 60_000);

afterAll(async () => {
  app?.kill();
  rmSync(dir, { recursive: true, force: true });
  await browser?.close();
}, 30_000);

const door = [0xf6, 0xcf, 0x63];

// the bounding box, in CSS px on the canvas, of every pixel in the door's colour (null if none)
const pillBox = (page: Page) =>
  page.locator(".frame canvas").evaluate((el, want) => {
    const c = el as HTMLCanvasElement;
    const d = c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data;
    const k = c.width / c.clientWidth;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    for (let i = 0; d && i < d.length; i += 4) {
      if (d[i] === want[0] && d[i + 1] === want[1] && d[i + 2] === want[2]) {
        const px = (i / 4) % c.width;
        const py = Math.floor(i / 4 / c.width);
        x0 = Math.min(x0, px);
        x1 = Math.max(x1, px);
        y0 = Math.min(y0, py);
        y1 = Math.max(y1, py);
      }
    }
    return x1 < 0 ? null : { x0: x0 / k, y0: y0 / k, x1: x1 / k, y1: y1 / k };
  }, door);

const boxOf = async (page: Page, selector: string) => {
  const loc = page.locator(selector).first();
  return (await loc.count()) ? await loc.boundingBox() : null;
};

// "stand on the plate": a short step east of the spawn, onto the plate one tile along
const standOn = async (page: Page) => {
  await page.keyboard.down("d");
  await page.waitForTimeout(150);
  await page.keyboard.up("d");
};

describe("a door opening off screen, drawn as an edge pill", () => {
  const cases: [string, "deaf" | "mute", { width: number; height: number }][] = [
    ["Can't hear at 1280", "deaf", DESKTOP],
    ["Can't hear at 375", "deaf", PHONE],
    ["Can't speak at 1280", "mute", DESKTOP],
    ["Can't speak at 375", "mute", PHONE],
  ];

  it("shows a pill at the edge toward the door, clear of the captions and the top bar", async () => {
    for (const [, role, size] of cases) await table.byRole[role].setViewportSize(size);
    // the whole table stands on its plates; the door opens at the far end
    for (const page of table.pages) await standOn(page);
    for (const [label, role, size] of cases) {
      const page = table.byRole[role];
      await page.setViewportSize(size);
      // 4 s of pill: poll until it is on this canvas (the first role to read it spends the time)
      await expect
        .poll(() => pillBox(page), { timeout: 3500, message: `${label}: the door pill is drawn` })
        .not.toBeNull();
      const box = await pillBox(page);
      if (!box) continue;
      const canvas = await page.locator(".frame canvas").boundingBox();
      if (!canvas) throw new Error("no canvas");
      const w = canvas.width;
      expect(box.x0, `${label}: on the east side, toward the door`).toBeGreaterThan(w / 2);
      expect(box.x1, `${label}: inside the canvas`).toBeLessThanOrEqual(w);
      expect(box.y1 - box.y0, `${label}: a pill, 24 px or more tall`).toBeGreaterThanOrEqual(24);
      expect(box.x1 - box.x0, `${label}: wide enough to read "Door"`).toBeGreaterThanOrEqual(40);
      // its neighbours: the caption strip and the top bar never touch it. (The face pills for
      // the other seats sit on the west side, toward them, so they are at least half a canvas away.)
      for (const sel of [".captions", ".hud-top"]) {
        const other = await boxOf(page, sel);
        if (!other || other.height === 0) continue;
        const top = canvas.y + box.y0;
        const bottom = canvas.y + box.y1;
        const left = canvas.x + box.x0;
        const right = canvas.x + box.x1;
        const apart =
          bottom <= other.y ||
          top >= other.y + other.height ||
          right <= other.x ||
          left >= other.x + other.width;
        expect(apart, `${label}: the door pill clears ${sel}`).toBe(true);
      }
      expect(WORLD.door.toLowerCase()).toBe("#f6cf63"); // the colour this reads is the token's
    }
  }, 30_000);
});
