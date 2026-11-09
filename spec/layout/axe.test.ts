import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { axeViolations, launch } from "../browser.ts";

let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser.close();
});

// axe blends an element's opacity into the colours it checks, so a run that lands while something
// fades in reads washed-out text as a contrast failure. The comms wheel fades in over 100 ms, and on
// a busy machine the wheel spec's axe run kept landing inside that fade (color-contrast 4.11 on
// ".is-centre > .wheel-label", at full opacity it passes). `axeViolations` therefore waits for
// every finite animation to finish first.
describe("axeViolations", () => {
  const fading = (extra = "") => `
    <style>
      @keyframes fade { from { opacity: 0 } }
      p { margin: 0; padding: 8px; font: bold 18px sans-serif; color: #3a404c; background: #e8eef9; }
      .fade { animation: fade 1500ms linear both; }
      .loop { animation: blink 400ms linear infinite; }
      @keyframes blink { 50% { opacity: 0.99 } }
      ${extra}
    </style>
    <main><h1>t</h1><p class="fade">Fades in, passes once it has</p></main>`;

  it("does not read a fade-in as a contrast failure", async () => {
    const page = await (await browser.newContext()).newPage();
    await page.setContent(`<!doctype html><html lang="en"><title>t</title>${fading()}`);
    expect(await axeViolations(page)).toEqual([]);
    await page.context().close();
  });

  it("still reports a real contrast failure", async () => {
    const page = await (await browser.newContext()).newPage();
    await page.setContent(
      `<!doctype html><html lang="en"><title>t</title>${fading("p { color: #aaa; background: #bbb; }")}`,
    );
    expect((await axeViolations(page)).join("\n")).toContain("color-contrast");
    await page.context().close();
  });

  it("does not wait for an animation that never ends", async () => {
    const page = await (await browser.newContext()).newPage();
    await page.setContent(
      `<!doctype html><html lang="en"><title>t</title>${fading()}<main><p class="loop">Loops</p></main>`,
    );
    const started = Date.now();
    await axeViolations(page);
    expect(Date.now() - started, "ms").toBeLessThan(8000);
    await page.context().close();
  });
});
