// node scripts/decor-sheet.ts [01..09 …] — the decor contact sheet (plan decor-redesign Task 2): every
// look of every kind of a room's theme, on a wall tile in the room's tint, drawn by the real renderer
// at 1×, 2× and 3× in headless Chromium, written to review/decor/<room>.png. Spawns its own app with
// BENCH=1 (the /bench page's ?sheet=1 mode), as the frame bench does.
import { type ChildProcess, execSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 8283;
const URL_BASE = `http://127.0.0.1:${PORT}`;
const OUT = "review/decor";

function buildIfStale() {
  const entry = "dist-bench/server/entry.mjs";
  let built = 0;
  try {
    built = statSync(entry).mtimeMs;
  } catch {}
  const newest = Number(
    execSync(`find src rooms -type f -newer ${entry} 2>/dev/null | head -1 | wc -l`).toString(),
  );
  if (!built || newest > 0)
    execSync("pnpm build", { stdio: "inherit", env: { ...process.env, BENCH: "1" } });
}

async function up(url: string) {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`the bench app never came up on ${url}`);
}

const rooms = readdirSync("rooms")
  .filter((f) => f.endsWith(".room"))
  .map((f) => f.replace(/\.room$/, ""))
  .sort();
const want = process.argv.slice(2);
const pick = rooms.filter((r) => want.length === 0 || want.includes(r.slice(0, 2)));

buildIfStale();
const dir = mkdtempSync(join(tmpdir(), "decor-sheet-"));
const app: ChildProcess = spawn("node", ["server.ts"], {
  env: { ...process.env, BENCH: "1", PORT: String(PORT), DATABASE_PATH: join(dir, "app.db") },
  stdio: "ignore",
});
const browser = await chromium.launch();
try {
  await up(`${URL_BASE}/bench?room=01&sheet=1`);
  mkdirSync(OUT, { recursive: true });
  for (const id of pick) {
    const page = await browser.newPage({
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 1,
    });
    await page.goto(`${URL_BASE}/bench?room=${id.slice(0, 2)}&sheet=1`);
    await page.waitForFunction(() => document.getElementById("bench")?.dataset.ready === "1");
    const data = await page.evaluate(() =>
      (document.getElementById("bench") as HTMLCanvasElement).toDataURL("image/png"),
    );
    writeFileSync(join(OUT, `${id}.png`), Buffer.from(data.split(",")[1] as string, "base64"));
    console.log(`${OUT}/${id}.png`);
    await page.close();
  }
} finally {
  await browser.close();
  app.kill();
  rmSync(dir, { recursive: true, force: true });
}
