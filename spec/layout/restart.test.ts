import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { launch } from "../browser.ts";
import { playRoom, type Table } from "../playUi.ts";

// Playtest 3, B4 re-opened (Task 279): after a restart vote the whole view jumped. The vote's note ("Restarting
// the room.") sat in the HUD's column above the frame, so while it showed the frame was ~33 px shorter; it goes
// 3 s after the vote (Game.tsx), just after the restarted room's 2.4 s swoop lands, and the frame grew back in one
// frame, rescaling the camera. A transient alert overlays the frame now; nothing that comes or goes resizes it.

const baseUrl = inject("baseUrl");
let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser.close();
});

const card = (page: Page) => page.getByRole("alertdialog").filter({ hasText: /wants to restart/ });

// Samples the frame's and the canvas's height every animation frame, from now until the vote's note has come and
// gone (or 8 s pass), and returns every distinct value seen.
const sampleUntilNoteGone = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ frames: number[]; canvases: number[]; noteSeen: boolean }>((done) => {
        const frames = new Set<number>();
        const canvases = new Set<number>();
        const t0 = performance.now();
        let noteSeen = false;
        const look = () => {
          const f = document.querySelector(".frame")?.getBoundingClientRect();
          const c = document.querySelector<HTMLCanvasElement>(".frame canvas");
          if (f) frames.add(Math.round(f.height));
          if (c) canvases.add(c.clientHeight);
          const note = [...document.querySelectorAll(".hud-alert")].some((a) =>
            a.textContent?.includes("Restarting the room."),
          );
          if (note) noteSeen = true;
          if ((noteSeen && !note) || performance.now() - t0 > 8000)
            done({ frames: [...frames], canvases: [...canvases], noteSeen });
          else requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      }),
  );

describe("a restart by vote", () => {
  it("keeps the map frame one size while the vote's note comes and goes, for both sighted seats", async () => {
    const table: Table = await playRoom(browser, baseUrl);
    const { blind: ana, deaf: bo, mute: cy } = table.byRole;
    await cy.getByRole("button", { name: "Menu" }).click();
    await cy.getByRole("button", { name: "Restart room", exact: true }).click();
    await cy.getByRole("button", { name: "Sure? Ask to restart room", exact: true }).click();
    await card(ana).waitFor({ timeout: 3000 });
    await card(bo).waitFor({ timeout: 3000 });
    const samples = [sampleUntilNoteGone(cy), sampleUntilNoteGone(bo)];
    await card(ana).getByRole("button", { name: "Restart room" }).click();
    await card(bo).getByRole("button", { name: "Restart room" }).click();
    const [mute, deaf] = await Promise.all(samples);
    for (const [who, s] of [
      ["Can't speak (1280)", mute],
      ["Can't hear (375)", deaf],
    ] as const) {
      expect(s?.noteSeen, `${who}: the vote's note showed`).toBe(true);
      expect(s?.frames, `${who}: the frame's height`).toHaveLength(1);
      expect(s?.canvases, `${who}: the canvas's height`).toHaveLength(1);
    }
    for (const page of table.pages) await page.context().close();
  }, 60_000);
});
