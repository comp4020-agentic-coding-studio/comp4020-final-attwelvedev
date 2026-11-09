// Review screenshots for plans/2026-11-08-los-cut-fixes.md Task 4: the real renderer, one settled frame per viewer spot,
// through the bench page's __still hook (node scripts/los-shots.mjs; needs a BENCH=1 build in dist-bench/).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 8285;
const BASE = `http://127.0.0.1:${PORT}`;
const SPOTS = [
  // L4, room 8's music hall: the music box (24, 5) is lit, bell 3 (24, 1) is dark: its number must not be drawn
  { name: "l4-hall-dark-bell", room: "08", at: { x: 19.2, y: 5.1 } },
  // control: from here the bells (22..25, 1) are lit and must be drawn whole
  { name: "l4-hall-lit-bells", room: "08", at: { x: 23.5, y: 3.5 } },
  // L6, room 8's chamber: bells at (6..9, 9) with bell 2 dark: no number, no body
  { name: "l6-chamber-dark-bell", room: "08", at: { x: 3.0, y: 5.2 } },
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
      const file = `review/n7-los-task4-${spot.name}-${process.argv[2] ?? "after"}-${vp.name}.png`;
      await page.screenshot({ path: file });
      console.log(file);
      await page.close();
    }
  await browser.close();
} finally {
  app.kill();
  rmSync(dir, { recursive: true, force: true });
}
