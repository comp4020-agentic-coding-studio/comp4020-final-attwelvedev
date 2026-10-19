import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Spec shapes that have already made this suite flaky, found by reading the spec files, so a
// new one is caught when it is written and not at the fifth retry. Only patterns precise
// enough to be right every time belong here: a check that cries wolf gets suppressed. The
// broader tool is `pnpm check:flaky`, which runs the whole suite repeatedly and says which
// tests fail and how often. The rules of thumb behind both are in CLAUDE.md ("Flaky tests").

interface Rule {
  name: string;
  why: string;
  // the 1-based numbers of the lines that break the rule, given a file's lines
  find: (lines: string[]) => number[];
}

const isComment = (line: string): boolean => /^\s*\/\//.test(line);

const RULES: Rule[] = [
  {
    name: "one canvas frame compared with expect",
    why: "A single frame is a moving picture (the camera eases, a reveal fades into the scene, a face pops). Compare settledHash(page), which waits for the picture to stop changing, or poll for a change in a loop.",
    find: (lines) =>
      lines.flatMap((line, i) =>
        !isComment(line) && /expect\(\s*await canvasHash\(/.test(line) ? [i + 1] : [],
      ),
  },
  {
    name: "an exact count asserted straight after a fixed sleep",
    why: "A sleep decides what has arrived by then, so the count depends on the machine's speed. Wait for the thing, with expect.poll(...) or waitFor. (A count of zero after a sleep is fine: a sleep can only make 'nothing arrived' less likely.)",
    find: (lines) =>
      lines.flatMap((line, i) =>
        !isComment(line) &&
        /await \w+\.waitForTimeout\(/.test(line) &&
        /expect\(await [^)]*\.count\(\)\)\.toBe\((?!0\))/.test(lines[i + 1] ?? "")
          ? [i + 2]
          : [],
      ),
  },
];

function findProblems(source: string): string[] {
  const lines = source.split("\n");
  return RULES.flatMap((rule) => rule.find(lines).map((n) => `line ${n}: ${rule.name}`));
}

const specFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return specFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });

describe("flaky spec patterns", () => {
  it("catches the shapes it exists for", () => {
    expect(findProblems("expect(await canvasHash(page)).not.toBe(spawn);")).toHaveLength(1);
    expect(
      findProblems("await page.waitForTimeout(300);\nexpect(await rows.count()).toBe(4);"),
    ).toHaveLength(1);
  });

  it("leaves the safe forms alone", () => {
    expect(findProblems("expect(await settledHash(page)).not.toBe(spawn);")).toEqual([]);
    expect(findProblems("const before = await canvasHash(page);")).toEqual([]);
    expect(findProblems("changed = (await canvasHash(page)) !== before;")).toEqual([]);
    expect(
      findProblems("await page.waitForTimeout(300);\nexpect(await rows.count()).toBe(0);"),
    ).toEqual([]);
    expect(findProblems("// expect(await canvasHash(page)) is the shape to avoid")).toEqual([]);
  });

  it("finds none in the specs", () => {
    const problems = specFiles("spec")
      .filter((path) => !path.endsWith("flaky-patterns.test.ts"))
      .flatMap((path) => findProblems(readFileSync(path, "utf-8")).map((p) => `${path} ${p}`));
    const why = RULES.map((r) => `- ${r.name}: ${r.why}`).join("\n");
    expect(problems, `\n${why}\n`).toEqual([]);
  });
});
