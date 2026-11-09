import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// NFR-a11y: every text pair on the shell surfaces is AA (4.5:1) or better, in both modes.
const css = readFileSync("src/styles/tokens.css", "utf8");
const blocks = css.split(/:root\[data-contrast="high"\]\s*\{/);
const normalCss = blocks[0] as string;
const highCss = blocks.slice(1).join("\n");

type Rgb = [number, number, number];
const parse = (v: string): { rgb: Rgb; a: number } => {
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const n = Number.parseInt(hex[1] as string, 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], a: 1 };
  }
  const m = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*(\d+(?:\.\d+)?)%)?\s*\)$/.exec(v);
  if (!m) throw new Error(`cannot parse colour: ${v}`);
  return {
    rgb: [Number(m[1]), Number(m[2]), Number(m[3])],
    a: m[4] === undefined ? 1 : Number(m[4]) / 100,
  };
};
const read = (mode: "normal" | "high", name: string): string => {
  const own = new RegExp(`--${name}:\\s*([^;]+);`).exec(mode === "high" ? highCss : normalCss);
  const hit = own ?? new RegExp(`--${name}:\\s*([^;]+);`).exec(normalCss);
  if (!hit) throw new Error(`no --${name}`);
  return (hit[1] as string).trim();
};
const over = (top: { rgb: Rgb; a: number }, under: Rgb): Rgb =>
  top.rgb.map((c, i) => c * top.a + (under[i] as number) * (1 - top.a)) as Rgb;
const lum = (c: Rgb): number => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

for (const mode of ["normal", "high"] as const) {
  const solid = (name: string): Rgb => parse(read(mode, name)).rgb;
  const bg = solid("bg");
  const compose = (name: string): Rgb => over(parse(read(mode, name)), bg);
  const surfaces: [string, Rgb][] = [
    ["bg", bg],
    ["panel", solid("panel")],
    ["panel-hi", solid("panel-hi")],
    ["glass", compose("glass")],
  ];
  const pairs: [string, Rgb, Rgb][] = [];
  for (const text of ["ui", "ui-muted"]) {
    for (const [sn, s] of surfaces) pairs.push([`${text} on ${sn}`, solid(text), s]);
  }
  for (const text of ["danger", "goal", "role-blind", "role-deaf", "role-mute"]) {
    for (const [sn, s] of surfaces.slice(0, 3)) pairs.push([`${text} on ${sn}`, solid(text), s]);
  }
  pairs.push(["bg (primary button text) on ui", bg, solid("ui")]);
  for (const floor of ["w-floor", "dusk-floor"]) {
    const under = solid(floor);
    pairs.push([`ui on scrim over ${floor}`, solid("ui"), over(parse(read(mode, "scrim")), under)]);
  }

  describe(`AA contrast (${mode})`, () => {
    it.each(pairs)("%s", (name, t, s) => {
      expect(ratio(t, s), name).toBeGreaterThanOrEqual(4.5);
    });
  });
}
