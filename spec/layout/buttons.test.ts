import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { launch } from "../browser.ts";

const baseUrl = inject("baseUrl");
let browser: Browser;
let page: Page;

// The app's real stylesheet, as shipped, loaded into a bare page with one of each
// button the game uses, so the cascade is exactly what a player gets.
beforeAll(async () => {
  browser = await launch();
  const html = await (await fetch(new URL("/", baseUrl))).text();
  const hrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"/g)].map(
    (m) => m[1],
  );
  const css = (
    await Promise.all(hrefs.map(async (h) => (await fetch(new URL(h as string, baseUrl))).text()))
  ).join("\n");
  page = await browser.newPage();
  await page.setContent(
    `<body style="margin:0;padding:24px;background:#0b1220;color:#e8eef9">${CLASSES.map(
      (c, i) => `<p><button id="b${i}" type="button" class="${c}">Sure? Restart room</button></p>`,
    ).join("")}</body>`,
  );
  await page.addStyleTag({ content: css });
  // The buttons ease their background over 150 ms; read where it settles, not mid-way.
  await page.addStyleTag({ content: "*{transition:none !important}" });
});
afterAll(async () => {
  await browser.close();
});

// every look a button has: resting, primary, destructive, and the one that has asked "Sure?"
const CLASSES = [
  "btn",
  "btn primary",
  "btn asking",
  "btn danger",
  "btn danger asking",
  "hud-btn",
  "hud-btn asking",
  "hud-btn danger",
  "hud-btn danger asking",
];

const PAGE_BG = [11, 18, 32]; // --bg
const parse = (css: string): number[] => (css.match(/[\d.]+/g) ?? []).map(Number);
// a transparent background shows the page behind it
function over(fg: number[], bg: number[]): number[] {
  const a = fg[3] ?? 1;
  return [0, 1, 2].map((i) => (fg[i] ?? 0) * a + (bg[i] ?? 0) * (1 - a));
}
function luminance([r, g, b]: number[]): number {
  const lin = (v: number) => {
    const s = (v ?? 0) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r ?? 0) + 0.7152 * lin(g ?? 0) + 0.0722 * lin(b ?? 0);
}
function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe("every button's text can be read, resting and on hover", () => {
  for (const [i, cls] of CLASSES.entries()) {
    for (const state of ["resting", "hover"] as const) {
      it(`"${cls}" ${state}`, async () => {
        await page.mouse.move(0, 0);
        if (state === "hover") await page.hover(`#b${i}`);
        const { color, background } = await page.$eval(`#b${i}`, (el) => {
          const s = getComputedStyle(el);
          return { color: s.color, background: s.backgroundColor };
        });
        const bg = over(parse(background), PAGE_BG);
        const ratio = contrast(over(parse(color), bg), bg);
        expect(ratio, `${cls} ${state}: text ${color} on ${background}`).toBeGreaterThanOrEqual(
          4.5,
        );
      });
    }
  }
});
