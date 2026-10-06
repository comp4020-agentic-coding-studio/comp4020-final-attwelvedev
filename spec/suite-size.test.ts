import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// vitest runs a file's tests one after another and only runs files in
// parallel, so the slowest browser file sets pnpm check's wall time. Past
// this many lines, split the file by area (spec/layout/<area>.test.ts)
// instead of letting the whole check slow down.
const MAX_BROWSER_FILE_LINES = 1000;

function testFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return testFiles(path);
    return entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("spec suite size", () => {
  it(`keeps every browser spec file under ${MAX_BROWSER_FILE_LINES} lines, so files run in parallel`, () => {
    const oversized = testFiles("spec")
      .map((path) => ({ path, source: readFileSync(path, "utf-8") }))
      .filter(({ source }) => /\blaunch\(\)/.test(source))
      .map(({ path, source }) => ({ path, lines: source.split("\n").length }))
      .filter(({ lines }) => lines > MAX_BROWSER_FILE_LINES)
      .map(({ path, lines }) => `${path}: ${lines} lines — split it by area`);
    expect(oversized).toEqual([]);
  });
});
