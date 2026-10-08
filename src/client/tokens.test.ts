import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLOR, ROLE_COLOR } from "./tokens.ts";

// Canvas code can't read CSS variables cheaply every frame, so tokens.ts
// mirrors the ones it draws with. This keeps the two from drifting apart.
const css = readFileSync("src/styles/tokens.css", "utf8");
const cssToken = (name: string): string | undefined =>
  new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1]?.toLowerCase();

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
