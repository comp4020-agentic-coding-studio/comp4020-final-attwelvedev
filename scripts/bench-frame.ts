// node scripts/bench-frame.ts [--compare [baseline.json]] — the renderer's frame time on a phone-class
// profile (plan diorama-look §4.4). Spawns its own app with BENCH=1, opens /bench in Playwright's
// Chromium under CPU throttling ×4, and draws rooms 05 and 09 for 300 frames at 375×667 dpr 3 and at
// 1280×800 dpr 2, reading one pixel back each frame so the raster is timed too. Prints
// { room, viewport, p50, p95 }[] as JSON: with --runs N, the median of N runs per row. --compare runs 3
// (one run varies by about 10 %, as much as the slack) and exits 1 if any p95 is more than 10 % worse
// than the baseline's (review/diorama/bench-baseline.json by default). Runs on one machine are
// compared, never absolute numbers.
import { type ChildProcess, execSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 8282;
const URL_BASE = `http://127.0.0.1:${PORT}`;
const ROOMS = ["05", "09"] as const;
const VIEWPORTS = [
  { name: "375x667@3", width: 375, height: 667, dpr: 3 },
  { name: "1280x800@2", width: 1280, height: 800, dpr: 2 },
] as const;
const SLACK = 1.1; // a p95 more than 10 % over the baseline fails the compare

export interface Row {
  room: string;
  viewport: string;
  p50: number;
  p95: number;
}

// The bench page is built only with BENCH=1, into dist-bench/ (astro.config.ts), which is stale when
// any source file is newer than its server entry
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
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`the bench app never came up on ${url}`);
}

async function run(): Promise<Row[]> {
  const dir = mkdtempSync(join(tmpdir(), "bench-frame-"));
  const app: ChildProcess = spawn("node", ["server.ts"], {
    env: { ...process.env, BENCH: "1", PORT: String(PORT), DATABASE_PATH: join(dir, "app.db") },
    stdio: "ignore",
  });
  const browser = await chromium.launch();
  try {
    await up(`${URL_BASE}/bench?room=05`);
    const rows: Row[] = [];
    for (const vp of VIEWPORTS) {
      for (const room of ROOMS) {
        const page = await browser.newPage({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: vp.dpr,
        });
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        await page.goto(`${URL_BASE}/bench?room=${room}`);
        const result = (await page.waitForFunction(
          () => (window as unknown as { __bench?: unknown }).__bench,
          undefined,
          { timeout: 120_000 },
        )) as { jsonValue(): Promise<{ p50: number; p95: number }> };
        const { p50, p95 } = await result.jsonValue();
        rows.push({ room, viewport: vp.name, p50: round(p50), p95: round(p95) });
        await page.close();
      }
    }
    return rows;
  } finally {
    await browser.close();
    app.kill();
    rmSync(dir, { recursive: true, force: true });
  }
}

const round = (n: number) => Math.round(n * 100) / 100;

// Every row of `now` whose p95 is more than SLACK × the baseline's same row.
export function worse(now: Row[], baseline: Row[]): string[] {
  return now.flatMap((r) => {
    const b = baseline.find((x) => x.room === r.room && x.viewport === r.viewport);
    if (!b) return [`no baseline for room ${r.room} at ${r.viewport}`];
    return r.p95 > b.p95 * SLACK
      ? [`room ${r.room} at ${r.viewport}: p95 ${r.p95} ms > ${b.p95} ms × ${SLACK}`]
      : [];
  });
}

// The median of each row's p50 and p95 over several runs.
export function median(runs: Row[][]): Row[] {
  const mid = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  return (runs[0] ?? []).map((r, i) => ({
    ...r,
    p50: mid(runs.map((x) => x[i]?.p50 ?? 0)),
    p95: mid(runs.map((x) => x[i]?.p95 ?? 0)),
  }));
}

const args = process.argv.slice(2);
const at = args.indexOf("--compare");
const runsAt = args.indexOf("--runs");
const n = runsAt >= 0 ? Number(args[runsAt + 1]) : at >= 0 ? 3 : 1;
buildIfStale(); // once, before any run: every run of one compare times the same build
const runs: Row[][] = [];
for (let i = 0; i < n; i++) runs.push(await run());
const rows = median(runs);
console.log(JSON.stringify(rows, null, 2));
if (at >= 0) {
  const next = args[at + 1];
  const file = next && !next.startsWith("--") ? next : "review/diorama/bench-baseline.json";
  const baseline = JSON.parse(readFileSync(file, "utf8")) as { rows: Row[] };
  const bad = worse(rows, baseline.rows);
  if (bad.length) {
    console.error(`frame time is worse than ${file}:\n${bad.join("\n")}`);
    process.exit(1);
  }
  console.error(`frame time is within ${Math.round((SLACK - 1) * 100)} % of ${file}`);
}
