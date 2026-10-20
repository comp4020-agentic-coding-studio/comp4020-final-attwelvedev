import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { COLOR, DUSK, ROLE_COLOR, setContrast, setDusk, WORLD } from "./tokens.ts";

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
const kebab = (key: string) => key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

afterEach(() => {
  setContrast(false);
  setDusk(false, 0, true);
});

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
    ["role-blind", ROLE_COLOR.blind],
    ["role-deaf", ROLE_COLOR.deaf],
    ["role-mute", ROLE_COLOR.mute],
  ])("--%s matches tokens.css", (name, value) => {
    expect(cssToken(name)).toBe(value.toLowerCase());
  });

  it("every world token has a --w-* variable with the same base value", () => {
    for (const [key, value] of Object.entries(WORLD)) {
      expect(cssToken(`w-${kebab(key)}`), key).toBe(value.toLowerCase());
    }
  });

  it("every alarm dusk token has a --dusk-* variable with the same value", () => {
    for (const [key, value] of Object.entries(DUSK)) {
      expect(cssToken(`dusk-${kebab(key)}`), key).toBe(value.toLowerCase());
    }
  });
});

describe("setContrast(true)", () => {
  it("swaps COLOR and ROLE_COLOR to the second (high-contrast) value in tokens.css", () => {
    setContrast(true);
    for (const [name, value] of [
      ["bg", COLOR.bg],
      ["ui", COLOR.ui],
      ["role-blind", ROLE_COLOR.blind],
      ["role-deaf", ROLE_COLOR.deaf],
      ["role-mute", ROLE_COLOR.mute],
    ] as const) {
      expect(cssTokens(name)[1], name).toBe(value.toLowerCase());
    }
  });

  it("swaps every world token to its high-contrast value", () => {
    setContrast(true);
    for (const [key, value] of Object.entries(WORLD)) {
      expect(cssTokens(`w-${kebab(key)}`)[1], key).toBe(value.toLowerCase());
    }
  });

  it("swaps back on setContrast(false)", () => {
    const base = { ...COLOR };
    const world = { ...WORLD };
    setContrast(true);
    expect(COLOR).not.toEqual(base);
    expect(WORLD).not.toEqual(world);
    setContrast(false);
    expect(COLOR).toEqual(base);
    expect(WORLD).toEqual(world);
  });
});

describe("setDusk", () => {
  it("blends the world toward the dusk set over 600 ms, and back", () => {
    const day = { ...WORLD };
    setDusk(false, 1000);
    setDusk(true, 1000);
    expect(WORLD.wallTop).toBe(day.wallTop);
    setDusk(true, 1300); // half way
    expect(WORLD.wallTop).not.toBe(day.wallTop);
    expect(WORLD.wallTop).not.toBe(DUSK.wallTop);
    setDusk(true, 1600);
    expect(WORLD.wallTop).toBe(DUSK.wallTop);
    expect(WORLD.laser).toBe(day.laser); // lasers do not change
    setDusk(false, 1600); // the alarm ends: nothing has elapsed yet, so still dusk
    expect(WORLD.wallTop).toBe(DUSK.wallTop);
    setDusk(false, 1900); // half way back
    expect(WORLD.wallTop).not.toBe(DUSK.wallTop);
    expect(WORLD.wallTop).not.toBe(day.wallTop);
    setDusk(false, 2200);
    expect(WORLD.wallTop).toBe(day.wallTop);
  });

  it("is instant when asked (reduced motion)", () => {
    setDusk(true, 5000, true);
    expect(WORLD.skyHi).toBe(DUSK.skyHi);
  });

  it("leaves high contrast alone", () => {
    setContrast(true);
    const high = { ...WORLD };
    setDusk(true, 0, true);
    expect(WORLD).toEqual(high);
  });
});
