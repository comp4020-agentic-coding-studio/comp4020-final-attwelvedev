import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// DESIGN.md is the design reference (overview A5). It keeps names, never values, so
// these read files and need no app: what it names has to exist, and the old draft
// has to point here.
const design = readFileSync("DESIGN.md", "utf8");
const tokensCss = readFileSync("src/styles/tokens.css", "utf8");

describe("DESIGN.md", () => {
  it("names only tokens that exist in tokens.css", () => {
    const named = new Set(design.match(/`--[a-z0-9-]+`/g)?.map((t) => t.slice(1, -1)));
    // a world token on a line marked "planned (Task N)" is not built yet; Task 18 adds the
    // variables and removes the marker, and from then on it is checked like the rest
    const planned = new Set(
      design
        .split("\n")
        .filter((line) => /planned \(Task \d+\)/.test(line))
        .flatMap((line) => line.match(/`--w-[a-z0-9-]+`/g)?.map((t) => t.slice(1, -1)) ?? []),
    );
    const missing = [...named].filter(
      (t) => !planned.has(t) && !new RegExp(`^\\s*${t}:`, "m").test(tokensCss),
    );
    expect(named.size, "it names some tokens").toBeGreaterThan(10);
    expect(missing).toEqual([]);
  });

  it("lists as built only components that exist under src/components/", () => {
    const section = design.split(/^## Components$/m)[1]?.split(/^## /m)[0] ?? "";
    const listed = [...section.matchAll(/^- `([A-Z][A-Za-z]+)`/gm)].map((m) => m[1]);
    expect(listed.length, "it lists some components").toBeGreaterThan(5);
    expect(listed.filter((name) => !existsSync(`src/components/${name}.tsx`))).toEqual([]);
  });

  it("holds no 6-digit hex: the values live in tokens.css", () => {
    expect(design.match(/#[0-9a-fA-F]{6}\b/g) ?? []).toEqual([]);
  });

  it("supersedes the old draft in doc/prompts/DESIGN.md", () => {
    const first = readFileSync("doc/prompts/DESIGN.md", "utf8").split("\n")[0];
    expect(first).toMatch(/superseded/i);
    expect(first).toContain("DESIGN.md");
  });

  it("no shell CSS or component holds the old navy (#0b1220, #141e36, rgb(11 18 32, rgb(20 30 54)", () => {
    const old = /#0b1220|#141e36|rgba?\(\s*11[ ,]+18[ ,]+32|rgba?\(\s*20[ ,]+30[ ,]+54/i;
    const files = [
      ...readdirSync("src/styles").map((f) => `src/styles/${f}`),
      ...readdirSync("src/components").map((f) => `src/components/${f}`),
      ...readdirSync("src/client/render")
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
        .map((f) => `src/client/render/${f}`),
    ];
    const holding = files.filter((f) => old.test(readFileSync(f, "utf8")));
    expect(holding).toEqual([]);
  });
});
