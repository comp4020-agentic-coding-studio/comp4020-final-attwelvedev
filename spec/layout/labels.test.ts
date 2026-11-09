import { type ChildProcess, execSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launch } from "../browser.ts";
import { playRoom } from "../playUi.ts";

// Task 34: no label chip sits on a plaque's plate or on lit ink, in rooms 3, 5 and 7, at desktop and
// phone width. The picture cannot say where a chip went, so the game page publishes the boxes it
// drew (`data-label-boxes`: chips and plaques, canvas px) and this measures them while a sighted
// player walks east. Each room runs alone in its own app (ROOMS_DIR), so it is room index 0.
// `route` is where the sighted player walks: room 3 east along its hall; room 5 down the first gap
// (x 9), west to the plaque S2, east along the corridor and up the gap at x 25 to the plaque S1 over the keypad nook; room
// 7 down and east along its corridor. Rooms 3 and 7 have no plaque in view without a torch, so for
// them this proves only that chips are published and none sits on anything drawn.
const ROOMS: { n: string; plaques: boolean; route: [number, number][] }[] = [
  { n: "03", plaques: false, route: [[28.5, 5.5]] },
  {
    n: "05",
    plaques: true,
    route: [
      [9.5, 1.5],
      [9.5, 5.5],
      [4.5, 5.5], // under S2, the first plaque, in the wall at (4, 6)
      [25.5, 5.5],
      [25.5, 2.5],
      [29.5, 2.5],
    ],
  },
  {
    n: "07",
    plaques: false,
    route: [
      [5.5, 3.5],
      [5.5, 5.5],
      [21.5, 5.5],
    ],
  },
];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Boxes {
  chips: Box[];
  plaques: Box[];
}

const apart = (a: Box, b: Box) =>
  a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;

async function boxesOf(page: Page): Promise<Boxes | null> {
  const raw = await page.locator("canvas[data-camera]").getAttribute("data-label-boxes");
  return raw ? (JSON.parse(raw) as Boxes) : null;
}

// Where this page's own figure is drawn, in tiles (the game page publishes it as data-self).
async function selfAt(page: Page): Promise<{ x: number; y: number } | null> {
  const raw = await page.locator("canvas[data-camera]").getAttribute("data-self");
  const [x, y] = (raw ?? "").split(",").map(Number);
  return x === undefined || y === undefined || Number.isNaN(x) || Number.isNaN(y) ? null : { x, y };
}

// Steers through `route` (tile centres) one short key press at a time, reading the drawn boxes after
// each, and returns every distinct sample. A leg runs along its longer axis once the other is within
// 0.1 of the waypoint's line, so a one-tile gap is passed rather than pushed at.
async function walkAndSample(page: Page, route: [number, number][]): Promise<Boxes[]> {
  const seen = new Map<string, Boxes>();
  const take = async () => {
    const b = await boxesOf(page);
    if (b) seen.set(JSON.stringify(b), b);
  };
  const press = async (key: string) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(45);
    await page.keyboard.up(key);
  };
  // Each leg has its own deadline, generous because three browser files run at once under the full
  // check, and a leg that is not reached is an error: a walk that quietly stopped short would skip
  // the plaque it was sent to look at and prove nothing.
  for (const [tx, ty] of route) {
    const legEnd = Date.now() + 30_000;
    // how long each pass of this leg took and where the figure was after it, so a stall says whether
    // the walk ran out of passes (slow ones) or the figure stopped moving (the same x again and again)
    const passes: { ms: number; take: number; read: number; press: number; x: number }[] = [];
    for (;;) {
      if (Date.now() > legEnd) {
        const at = await selfAt(page);
        // what the page said when it stalled, so a failure that only happens on a loaded runner explains
        // itself: is it connected, past its intro, still painting, and did the clock keep running?
        const state = await page
          .evaluate(
            () =>
              new Promise((resolve) => {
                // frames the page paints in 500 ms: 0 is a frozen page, ~30 a live one
                let frames = 0;
                const t0 = performance.now();
                const frame = () => {
                  frames++;
                  if (performance.now() - t0 < 500) requestAnimationFrame(frame);
                  else
                    resolve({
                      conn: document.querySelector(".hud-top .conn")?.textContent ?? null,
                      intro: document.querySelector(".game")?.getAttribute("data-intro") ?? null,
                      clock: document.querySelector(".hud-clock")?.textContent ?? null,
                      hint: document.querySelector(".act-hint")?.textContent ?? null,
                      net:
                        document.querySelector("canvas[data-net]")?.getAttribute("data-net") ??
                        null,
                      self:
                        document.querySelector("canvas[data-self]")?.getAttribute("data-self") ??
                        null,
                      visible: document.visibilityState,
                      focus: document.hasFocus(),
                      framesIn500ms: frames,
                    });
                };
                requestAnimationFrame(frame);
              }),
          )
          .catch((error) => ({ unreadable: String(error) }));
        const slowest = [...passes].sort((a, b) => b.ms - a.ms).slice(0, 3);
        const walk = {
          passes: passes.length,
          medianMs: [...passes].map((q) => q.ms).sort((a, b) => a - b)[passes.length >> 1] ?? null,
          slowest,
          xFirst: passes[0]?.x ?? null,
          xLast: passes[passes.length - 1]?.x ?? null,
          // distinct x values seen: few of them means the figure stopped, many means it kept going
          distinctX: new Set(passes.map((q) => q.x)).size,
        };
        throw new Error(
          `never reached ${tx},${ty} within 30 s; stuck at ${JSON.stringify(at)}; walk ${JSON.stringify(walk)}; page ${JSON.stringify(state)}`,
        );
      }
      const t0 = Date.now();
      await take();
      const t1 = Date.now();
      const me = await selfAt(page);
      const t2 = Date.now();
      if (!me) {
        await page.waitForTimeout(60);
        continue;
      }
      const dx = tx - me.x;
      const dy = ty - me.y;
      if (Math.abs(dx) < 0.2 && Math.abs(dy) < 0.2) break;
      // a leg runs along one axis, so first get the other within 0.1 of the waypoint's line: a gap in
      // a wall is one tile wide and a body that is a fifth of a tile off its middle pushes at the wall
      const alongX = Math.abs(dx) >= Math.abs(dy);
      const off = alongX ? dy : dx;
      if (Math.abs(off) > 0.1) await press(alongX ? (dy > 0 ? "s" : "w") : dx > 0 ? "d" : "a");
      else if (alongX) await press(dx > 0 ? "d" : "a");
      else await press(dy > 0 ? "s" : "w");
      const t3 = Date.now();
      passes.push({ ms: t3 - t0, take: t1 - t0, read: t2 - t1, press: t3 - t2, x: me.x });
    }
    // at the waypoint, read what is drawn over a few frames (a count of samples, not a clock)
    for (let i = 0; i < 8; i++) {
      await take();
      await page.waitForTimeout(40);
    }
  }
  await take();
  return [...seen.values()];
}

describe.each(ROOMS)("labels never cover a plaque (room $n)", ({ n, plaques, route }) => {
  const port = 21080 + Math.floor(Math.random() * 1000);
  const url = `http://127.0.0.1:${port}`;
  const dir = mkdtempSync(join(tmpdir(), `labels-spec-${n}-`));
  let app: ChildProcess;
  let browser: Browser;

  beforeAll(async () => {
    if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "ignore" });
    const file = readdirSync("rooms").find((f) => f.startsWith(`${n}-`));
    if (!file) throw new Error(`no room ${n}`);
    copyFileSync(join("rooms", file), join(dir, file));
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

  it("keeps every chip off every plaque, at 1280 and 375", async () => {
    const table = await playRoom(browser, url);
    try {
      // the mute seat is on desktop and the deaf seat on the phone (playRoom): both are sighted. They walk
      // AT ONCE: two pages, two seats, no plate or station worked, so neither waits on the other, and one
      // after the other doubled the test (the phone walk alone is 7 to 15 s, 21 to 36 s for the test).
      const walked = await Promise.all(
        (
          [
            ["1280", table.byRole.mute],
            ["375", table.byRole.deaf],
          ] as const
        ).map(async ([name, page]) => ({ name, samples: await walkAndSample(page, route) })),
      );
      for (const { name, samples } of walked) {
        expect(samples.length, `${name}: boxes were published`).toBeGreaterThan(0);
        let plaquesSeen = 0;
        for (const s of samples) {
          plaquesSeen += s.plaques.length;
          for (const chip of s.chips)
            for (const plate of s.plaques)
              expect(
                apart(chip, plate),
                `${name}: chip ${JSON.stringify(chip)} on plaque ${JSON.stringify(plate)}`,
              ).toBe(true);
        }
        // a room with plaques must have shown one, or the check above proved nothing
        if (plaques) expect(plaquesSeen, `${name}: a plaque was in view`).toBeGreaterThan(0);
      }
    } finally {
      for (const p of table.pages) await p.context().close();
    }
  }, 300_000); // two pages, each up to five 30 s legs; a walk takes about 5 s alone, far longer beside two other browser files

  // Task 35: a plaque's plate is measured inside the canvas it is drawn on, at three window heights.
  // Only room 5 has a plaque in view without a torch. The player walks the whole route to the
  // keypad nook, where S1 is in the top wall row: its plate floats above row 0, so it only stays in
  // the canvas if it is slid back in. Then the window is made shorter and the plate's box is read
  // from what was drawn. (Made red by removing the clamp; S2, mid-wall, did not catch it.)
  it.runIf(plaques)(
    "keeps a plaque's whole plate inside the canvas at three heights",
    async () => {
      const table = await playRoom(browser, url);
      try {
        const page = table.byRole.mute;
        await walkAndSample(page, route);
        const canvas = page.locator("canvas[data-camera]");
        for (const height of [800, 420, 260]) {
          await page.setViewportSize({ width: 1280, height });
          const size = () =>
            canvas.evaluate((c) => ({
              w: (c as HTMLCanvasElement).clientWidth,
              h: (c as HTMLCanvasElement).clientHeight,
            }));
          // Wait for the canvas itself to be the new size, so no frame drawn before the resize can
          // stand in for one drawn after it (the old canvas was taller, so its plate was "inside").
          await expect
            .poll(async () => (await size()).h, { message: `canvas at window height ${height}` })
            .toBeLessThanOrEqual(height);
          const { w, h } = await size();
          // then read the plates over a run of frames, and every one must sit inside the canvas
          const seen: Boxes[] = [];
          for (let i = 0; i < 12; i++) {
            const b = await boxesOf(page);
            if (b && b.plaques.length > 0) seen.push(b);
            await page.waitForTimeout(40);
          }
          expect(seen.length, `${height}: a plaque was drawn after the resize`).toBeGreaterThan(0);
          for (const b of seen)
            for (const q of b.plaques)
              expect(
                q.x >= 0 && q.y >= 0 && q.x + q.w <= w && q.y + q.h <= h,
                `${height}: plate ${JSON.stringify(q)} outside the ${w}x${h} canvas`,
              ).toBe(true);
        }
      } finally {
        for (const p of table.pages) await p.context().close();
      }
    },
    300_000,
  );
});
