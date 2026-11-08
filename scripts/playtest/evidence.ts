import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Page } from "playwright";

// The perceived text of a page (FR6): the accessible text of the body, then "Captions:" and each
// caption line, each cue's direction arrow written as the words its own label carries ("from the
// upper right"). This is what a player who cannot see the screen is told.
export async function perceivedText(page: Page): Promise<string> {
  const body = await page.locator("body").ariaSnapshot();
  const lines = await page.evaluate(() => {
    const log = document.querySelector('[role="log"][aria-label="Captions"]');
    if (!log) return [] as string[];
    const copy = log.cloneNode(true) as HTMLElement;
    for (const arrow of copy.querySelectorAll("svg.dir-arrow")) {
      arrow.replaceWith(`(${arrow.getAttribute("aria-label") ?? "from somewhere"}) `);
    }
    return [...copy.querySelectorAll("p")].map((p) =>
      (p.textContent ?? "").replace(/\s+/g, " ").trim(),
    );
  });
  return `${body}\n\nCaptions:\n${lines.map((l) => `  ${l}`).join("\n")}\n`;
}

export function writeEvidence(file: string, content: string | Buffer): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

// `YYYY-MM-DDTHH-MM`, local time: the run's directory name.
export function runName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}T${p(now.getHours())}-${p(now.getMinutes())}`;
}

export const evidencePath = (...parts: string[]): string => join("review", "playtest", ...parts);
