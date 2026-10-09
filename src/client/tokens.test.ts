import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { COLOR, ROLE_COLOR, setContrast } from "./tokens.ts";

// Canvas code can't read CSS variables cheaply every frame, so tokens.ts
// mirrors the ones it draws with. This keeps the two from drifting apart.
const css = readFileSync("src/styles/tokens.css", "utf8");
// The first `--name:` in the file is the base `:root` block; the high-contrast
// values live in a later `[data-contrast="high"]` block, so this is every one.
const cssTokens = (name: string): string[] =>
  [...css.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`, "g"))].map((m) =>
    (m[1] as string).toLowerCase(),
  );
const cssToken = (name: string): string | undefined => cssTokens(name)[0];

afterEach(() => setContrast(false));

describe("canvas tokens", () => {
  it.each([
    ["bg", COLOR.bg],
    ["panel", COLOR.panel],
    ["ink", COLOR.ink],
    ["ui", COLOR.ui],
    ["ui-muted", COLOR.uiMuted],
    ["danger", COLOR.danger],
    ["goal", COLOR.goal],
    ["camera-light", COLOR.cameraLight],
    ["solid", COLOR.solid],
    ["floor", COLOR.floor],
    ["crate", COLOR.crate],
    ["role-blind", ROLE_COLOR.blind],
    ["role-deaf", ROLE_COLOR.deaf],
    ["role-mute", ROLE_COLOR.mute],
  ])("--%s matches tokens.css", (name, value) => {
    expect(cssToken(name)).toBe(value.toLowerCase());
  });
});

describe("setContrast(true)", () => {
  it("swaps COLOR and ROLE_COLOR to the second (high-contrast) value in tokens.css", () => {
    setContrast(true);
    for (const [name, value] of [
      ["bg", COLOR.bg],
      ["ui", COLOR.ui],
      ["solid", COLOR.solid],
      ["floor", COLOR.floor],
      ["role-blind", ROLE_COLOR.blind],
      ["role-deaf", ROLE_COLOR.deaf],
      ["role-mute", ROLE_COLOR.mute],
    ] as const) {
      expect(cssTokens(name)[1], name).toBe(value.toLowerCase());
    }
  });

  it("swaps back on setContrast(false)", () => {
    const base = { ...COLOR };
    setContrast(true);
    expect(COLOR).not.toEqual(base);
    setContrast(false);
    expect(COLOR).toEqual(base);
  });
});
