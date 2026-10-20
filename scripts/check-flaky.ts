// Runs the whole test suite several times, each on a fresh server, some of them with the CPU
// kept busy, and says which tests failed and how often. A test that fails in every run is a
// bug; one that fails in some runs is flaky, and it is the second kind that costs retries.
//
//   pnpm check:flaky            4 runs (2 idle, 2 under load), on port 8091
//   pnpm check:flaky 8          8 runs
//   PORT=8092 pnpm check:flaky  somewhere else
//
// It builds first, never touches the server on :8080, and uses a throwaway database.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RUNS = Number(process.argv[2] ?? 4);
const PORT = Number(process.env.PORT ?? 8091);
const LOAD_PROCESSES = 4; // busy loops running beside the suite on the "under load" runs
const out = (name: string): string => join(tmpdir(), `flaky-${name}`);

interface Failure {
  name: string;
  message: string;
}

function startServer(): ChildProcess {
  rmSync(out("app.db"), { force: true });
  const server = spawn("node", ["server.ts"], {
    env: { ...process.env, PORT: String(PORT), DATABASE_PATH: out("app.db") },
    stdio: "ignore",
  });
  return server;
}

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://localhost:${PORT}/`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`nothing answered on :${PORT}`);
}

function runSuite(file: string): Failure[] {
  try {
    execFileSync("npx", ["vitest", "run", "--reporter=json", `--outputFile=${file}`], {
      env: { ...process.env, APP_URL: `http://localhost:${PORT}` },
      stdio: "ignore",
    });
  } catch {
    // a failing run exits non-zero; its results are in the file
  }
  const report = JSON.parse(readFileSync(file, "utf-8"));
  return report.testResults.flatMap(
    (f: { assertionResults: { status: string; fullName: string; failureMessages?: string[] }[] }) =>
      f.assertionResults
        .filter((t) => t.status === "failed")
        .map((t) => ({
          name: t.fullName,
          message: (t.failureMessages?.[0] ?? "").split("\n")[0]?.slice(0, 140) ?? "",
        })),
  );
}

console.log("building...");
execFileSync("pnpm", ["build"], { stdio: "ignore" });

const seen = new Map<string, { runs: number[]; message: string }>();
for (let run = 1; run <= RUNS; run++) {
  const server = startServer();
  await waitForServer();
  const loaded = run % 2 === 0; // alternate, so a failure can be placed on one side or both
  const burners = loaded
    ? Array.from({ length: LOAD_PROCESSES }, () => spawn("yes", { stdio: "ignore" }))
    : [];
  const failures = runSuite(out(`run${run}.json`));
  for (const b of burners) b.kill();
  server.kill();
  console.log(`run ${run} (${loaded ? "under load" : "idle"}): ${failures.length} failed`);
  for (const f of failures) {
    const entry = seen.get(f.name) ?? { runs: [], message: f.message };
    entry.runs.push(run);
    seen.set(f.name, entry);
  }
}

if (seen.size === 0) {
  console.log(`\nclean: ${RUNS} of ${RUNS} runs passed`);
  process.exit(0);
}
console.log("\nfailed in some runs:");
for (const [name, { runs, message }] of [...seen].sort(
  (a, b) => b[1].runs.length - a[1].runs.length,
)) {
  const kind =
    runs.length === RUNS ? "EVERY RUN (a bug, not a flake)" : `${runs.length} of ${RUNS} (flaky)`;
  console.log(`\n  ${kind}: runs ${runs.join(", ")}\n  ${name}\n  ${message}`);
}
process.exit(1);
