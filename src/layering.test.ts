import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The layering rules in CLAUDE.md, as a check. Each rule names a layer, the imports
// it may not make, and why; a violation is reported as `file: import`.

const SRC = resolve(import.meta.dirname);

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });

const imports = (source: string): string[] =>
  [...source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)].map((m) => m[1]);

// Where an import points: a path under src/ for a relative one, else the bare specifier.
const target = (file: string, spec: string): string =>
  spec.startsWith(".") ? relative(SRC, resolve(dirname(file), spec)) : spec;

interface Rule {
  layer: string;
  why: string;
  allowed: (file: string, to: string) => boolean;
}

const RULES: Rule[] = [
  {
    layer: "game",
    why: "src/game/ is pure: no DOM, no ws, no node: (except rooms/load.ts), and it never reaches into the other layers",
    allowed: (file, to) =>
      relative(SRC, file) === "game/rooms/load.ts"
        ? !/^(ws$|astro|net\/|client\/|pages\/)/.test(to)
        : !/^(node:|ws$|astro|net\/|client\/|pages\/)/.test(to),
  },
  {
    layer: "net",
    why: "src/net/ is the server side of the socket: it imports game/ and lib/, never Astro, pages or the client",
    allowed: (file, to) =>
      !/^(astro|client\/|pages\/)/.test(to) || relative(SRC, file) === "net/devSocket.ts",
  },
  {
    layer: "client",
    why: "src/client/ is browser-only: it imports game/ and net/protocol.ts, never the rest of net/, lib/ or node:",
    allowed: (_file, to) =>
      !/^(node:|ws$|astro|lib\/|pages\/)/.test(to) &&
      (!/^net\//.test(to) || to === "net/protocol.ts"),
  },
  {
    layer: "pages",
    why: "src/pages/ stays thin and never imports src/net/: the socket server is a separate module instance, so shared state goes on globalThis behind one accessor",
    allowed: (_file, to) => !/^net\//.test(to),
  },
];

// Test files are exempt: they may read fixtures and cross layers. `devSocket.ts` is the Astro integration that loads net/attach.ts in dev, so it is the
// one place under net/ allowed to import "astro".
const violations = (layer: string, rule: Rule): string[] =>
  files(join(SRC, layer))
    .filter((f) => /\.(ts|tsx|astro)$/.test(f) && !/\.test\.ts$/.test(f))
    .flatMap((f) =>
      imports(readFileSync(f, "utf8"))
        .map((spec) => ({ spec, to: target(f, spec) }))
        .filter(({ to }) => !rule.allowed(f, to))
        .map(({ spec }) => `${relative(SRC, f)}: ${spec}`),
    );

describe("layering", () => {
  for (const rule of RULES) {
    it(`${rule.layer}: ${rule.why}`, () => {
      expect(violations(rule.layer, rule)).toEqual([]);
    });
  }

  it("catches what it is meant to catch", () => {
    const game = RULES[0];
    expect(game.allowed(join(SRC, "game/x.ts"), "node:fs")).toBe(false);
    expect(game.allowed(join(SRC, "game/rooms/load.ts"), "node:fs")).toBe(true);
    expect(game.allowed(join(SRC, "game/x.ts"), "net/protocol.ts")).toBe(false);
    expect(RULES[2].allowed(join(SRC, "client/x.ts"), "net/game.ts")).toBe(false);
    expect(RULES[3].allowed(join(SRC, "pages/x.astro"), "net/attach.ts")).toBe(false);
  });
});
