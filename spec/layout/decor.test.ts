import { type ChildProcess, execSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DecorItem } from "../../src/client/render/decor.ts";
import { TILT } from "../../src/client/render/project.ts";
import { launch } from "../browser.ts";

// Decor never paints a floor pixel (FR11, plan diorama-look Task 115). The real renderer draws a room
// on a real canvas twice, with and without its decor; every pixel that differs must lie on the face
// of a wall that carries an item (its top or its front, as the item says). A glow that left its clip
// would light the floor or the rest of the wall. Its own app, built with BENCH=1 for the /bench page.
const port = 28080 + Math.floor(Math.random() * 1000);
const url = `http://127.0.0.1:${port}`;
const dir = mkdtempSync(join(tmpdir(), "decor-spec-"));
let app: ChildProcess;
let browser: Browser;

// dist-bench is stale when any source file is newer than its server entry (scripts/bench-frame.ts)
function buildIfStale() {
  const entry = "dist-bench/server/entry.mjs";
  let built = 0;
  try {
    built = statSync(entry).mtimeMs;
  } catch {}
  const newer = Number(
    execSync(`find src rooms -type f -newer ${entry} 2>/dev/null | head -1 | wc -l`).toString(),
  );
  if (!built || newer > 0)
    execSync("pnpm build", { stdio: "ignore", env: { ...process.env, BENCH: "1" } });
}

beforeAll(async () => {
  buildIfStale();
  app = spawn("node", ["server.ts"], {
    env: { ...process.env, BENCH: "1", PORT: String(port), DATABASE_PATH: join(dir, "app.db") },
    stdio: "ignore",
  });
  for (let attempt = 0; ; attempt++) {
    try {
      if ((await fetch(`${url}/bench`)).ok) break;
    } catch {}
    if (attempt >= 150) throw new Error(`the spec's own bench app never came up on ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await launch();
}, 240_000);
afterAll(async () => {
  await browser?.close();
  app?.kill();
  rmSync(dir, { recursive: true, force: true });
});

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 375, height: 667 },
] as const;

describe("decor stays on its wall's face", () => {
  for (const room of ["05", "08", "09"])
    for (const vp of VIEWPORTS)
      it(`room ${room} at ${vp.width}: every pixel decor changes is on a wall face`, async () => {
        const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2 });
        await page.goto(`${url}/bench?room=${room}&still=1`);
        await page.waitForFunction(() => document.getElementById("bench")?.dataset.ready === "1");
        const out = await page.evaluate(
          ({ depth, wall }) => {
            const c = document.getElementById("bench") as HTMLCanvasElement;
            const ctx = c.getContext("2d") as CanvasRenderingContext2D;
            const still = (window as unknown as { __still: (d: boolean) => void }).__still;
            const read = () => ctx.getImageData(0, 0, c.width, c.height).data;
            still(true);
            const a = read();
            still(false);
            const b = read();
            const dpr = c.width / c.clientWidth;
            const [scale, ox, oy] = (c.dataset.camera ?? "").split(",").map(Number) as number[];
            const s = scale as number;
            const tiles = JSON.parse(c.dataset.tiles ?? "[]") as string[];
            const items = JSON.parse(c.dataset.decor ?? "[]") as DecorItem[];
            // each item's face in device px, with 2 px of slack: the atlas copies a tile onto whole
            // device pixels (render/atlas.ts), which moves a face's edge by up to half a pixel, and
            // that edge is anti-aliased. A glow out of its clip spills far further (a painting's, about
            // a quarter of a tile up into the wall's top).
            const faces = items.map((it) => {
              const x0 = (ox as number) + it.x * s;
              const top = (oy as number) + it.y * s * depth - wall * s;
              const y0 = it.face === "top" ? top : top + s * depth;
              const h = it.face === "top" ? s * depth : wall * s;
              return {
                x0: x0 * dpr - 2,
                x1: (x0 + s + 0.5) * dpr + 2,
                y0: y0 * dpr - 2,
                y1: (y0 + h + 0.5) * dpr + 2,
              };
            });
            let changed = 0;
            const stray: string[] = [];
            for (let i = 0; i < a.length; i += 4) {
              if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2]) continue;
              changed++;
              const px = (i / 4) % c.width;
              const py = Math.floor(i / 4 / c.width);
              if (faces.some((f) => px >= f.x0 && px <= f.x1 && py >= f.y0 && py <= f.y1)) continue;
              if (stray.length < 3) {
                // the floor tile under that pixel (a wall's faces stand above their own tile)
                const tx = Math.floor((px / dpr - (ox as number)) / s);
                const ty = Math.floor((py / dpr - (oy as number)) / (s * depth));
                stray.push(`(${px}, ${py}) on floor tile ${tx},${ty} '${tiles[ty]?.[tx] ?? "?"}'`);
              }
            }
            return { changed, stray, items: items.length };
          },
          { depth: TILT.depth, wall: TILT.wall },
        );
        await page.close();
        expect(out.items, "the room has decor").toBeGreaterThan(0);
        expect(out.changed, "decor changed some pixel in view").toBeGreaterThan(0);
        expect(out.stray, "pixels decor changed off its face").toEqual([]);
      }, 60_000);
});
