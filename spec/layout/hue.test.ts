import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HUE_WALLS } from "../../src/client/tokens.ts";
import { launch } from "../browser.ts";
import { leaveGameAndClose } from "../lobbyUi.ts";
import { playRoom } from "../playUi.ts";

// A room's walls are drawn in the colour its `hue` names (FR1). Its own app: the one room in
// spec/fixtures/rooms-teal says "hue": "teal", where every shipped room-01 is rose.
const port = 27080 + Math.floor(Math.random() * 1000);
const url = `http://127.0.0.1:${port}`;
const dir = mkdtempSync(join(tmpdir(), "hue-spec-"));
let app: ChildProcess;

beforeAll(async () => {
  if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "ignore" });
  app = spawn("node", ["server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: join(dir, "app.db"),
      ROOMS_DIR: "spec/fixtures/rooms-teal",
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
}, 40_000);
afterAll(() => {
  app?.kill();
  rmSync(dir, { recursive: true, force: true });
});

const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
// how many sampled canvas pixels are exactly this colour
const pixels = (page: Page, hex: string) =>
  page.locator(".frame canvas").evaluate((el, want) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext("2d");
    if (!ctx) return -1;
    let hits = 0;
    for (let x = 0; x < c.width; x += 2)
      for (let y = 0; y < c.height; y += 2) {
        const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
        if (r === want[0] && g === want[1] && b === want[2]) hits++;
      }
    return hits;
  }, rgb(hex));

describe("room hue", () => {
  it("a teal room's wall front is drawn in the teal front colour, and none is rose", async () => {
    const browser = await launch();
    const table = await playRoom(browser, url);
    const deaf = table.byRole.deaf;
    await expect
      .poll(() => pixels(deaf, HUE_WALLS.teal.wallFront), { timeout: 5000 })
      .toBeGreaterThan(0);
    expect(await pixels(deaf, "#dc8fa6")).toBe(0);
    for (const page of table.pages) await leaveGameAndClose(page, url);
    await browser.close();
  }, 60_000);
});
