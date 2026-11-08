import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("refuses to start without --yes: exit 2, an estimate, no call", () => {
  const dir = mkdtempSync(join(tmpdir(), "review-run-"));
  mkdirSync(join(dir, "01-first-steps", "prior"), { recursive: true });
  mkdirSync(join(dir, "prior"));
  writeFileSync(join(dir, "run.json"), JSON.stringify({ rooms: ["01-first-steps"] }));
  const seats = [
    [0, "blind", 1280],
    [1, "deaf", 375],
    [2, "mute", 1280],
  ] as const;
  for (const [seat, role, width] of seats) {
    writeFileSync(join(dir, "prior", `${seat}-home.txt`), "home");
    writeFileSync(join(dir, "01-first-steps", "prior", `${role}-reveal.txt`), "reveal");
    for (const beat of ["start", "1", "end"]) {
      writeFileSync(join(dir, "01-first-steps", `${role}-${width}-${beat}.txt`), "seen");
    }
  }
  const r = spawnSync("node", ["scripts/playtest-review.ts", dir, "--room", "01"], {
    encoding: "utf8",
    env: {
      ...process.env,
      ANTHROPIC_BASE_URL: "http://127.0.0.1:1",
      ANTHROPIC_MODEL: "claude-sonnet-5-5",
    },
  });
  expect(r.status).toBe(2);
  expect(r.stdout).toContain("estimated");
  expect(r.stdout).toContain("6 items");
});
