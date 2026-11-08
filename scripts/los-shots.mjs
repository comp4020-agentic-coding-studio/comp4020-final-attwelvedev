// Review screenshots for plans/2026-11-08-los-cut-fixes.md Task 3: the real renderer, one settled frame per viewer spot,
// through the bench page's __still hook (node scripts/los-shots.mjs; needs a BENCH=1 build in dist-bench/).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 8284;
const BASE = `http://127.0.0.1:${PORT}`;
const SPOTS = [
  // L2, room 6: the panes (row 4, x 8 to 11) before the blocking corner
  { name: "l2-room6-above", room: "06", at: { x: 9.5, y: 3.5 } },
  { name: "l2-room6-west", room: "06", at: { x: 6.0, y: 3.4 } },
  // L7, room 8: the music box (5, 5) under the pane (5, 4), the cone's edge crossing the glass behind it
  { name: "l7-room8-a", room: "08", at: { x: 6.79, y: 5.27 } },
  { name: "l7-room8-b", room: "08", at: { x: 7.61, y: 6.01 } },
];
const VIEWPORTS = [
  { name: "1280", width: 1280, height: 720, dpr: 1 },
  { name: "375", width: 375, height: 667, dpr: 2 },
];

const dir = mkdtempSync(join(tmpdir(), "los-shots-"));
const app = spawn("node", ["server.ts"], {
  env: { ...process.env, BENCH: "1", PORT: String(PORT), DATABASE_PATH: join(dir, "app.db") },
  stdio: "ignore",
});
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${BASE}/bench?room=06&still=1`)).ok) break;
    } catch {}
    if (i > 150) throw new Error("the bench app never came up");
    await new Promise((r) => setTimeout(r, 200));
  }
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS)
    for (const spot of SPOTS) {
      const page = await browser.newPage({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.dpr,
      });
      await page.goto(`${BASE}/bench?room=${spot.room}&still=1`);
      await page.waitForFunction(() => document.getElementById("bench")?.dataset.ready === "1");
      await page.evaluate((at) => window.__still(true, { self: at }), spot.at);
      const file = `review/n7-los-task3-${spot.name}-${vp.name}.png`;
      await page.screenshot({ path: file });
      console.log(file);
      await page.close();
    }
  await browser.close();
} finally {
  app.kill();
  rmSync(dir, { recursive: true, force: true });
}
