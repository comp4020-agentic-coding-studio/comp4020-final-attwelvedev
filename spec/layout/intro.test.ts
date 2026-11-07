import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launch } from "../browser.ts";
import { playRoom, type Table } from "../playUi.ts";

// The start of a room (FR14) through the real screens: Can't see and Can't speak at 1280, Can't
// hear on a 375 phone (playRoom). Its own app holds the first tick 1500 ms (INTRO_MS), so the
// sequence really plays and the input lock can be seen; the timeline itself is unit-tested
// (src/client/intro.test.ts).
const port = 26080 + Math.floor(Math.random() * 1000);
const dir = mkdtempSync(join(tmpdir(), "intro-spec-"));
const url = `http://127.0.0.1:${port}`;
let app: ChildProcess;
let browser: Browser;
let table: Table;

// The moment the intro starts playing, the page presses ArrowRight and keeps it down (the game's key
// listener only exists from then on). Every value its own figure is drawn at (`data-self`) while
// the intro plays is recorded as it changes, so a move that happens and is corrected still shows.
const holdRightThroughIntro = (page: Page) =>
  page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __selfDuring: string[] }).__selfDuring = seen;
    let pressed = false;
    new MutationObserver(() => {
      const game = document.querySelector(".game");
      if (!pressed && game?.getAttribute("data-intro") === "playing") {
        pressed = true;
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
      }
      const self = document.querySelector("canvas[data-self]")?.getAttribute("data-self");
      if (game?.getAttribute("data-intro") === "playing" && self && seen.at(-1) !== self)
        seen.push(self);
    }).observe(document.body, { subtree: true, childList: true, attributes: true });
  });
const releaseRight = (page: Page) =>
  page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight" })));

beforeAll(async () => {
  if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "ignore" });
  app = spawn("node", ["server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: join(dir, "app.db"),
      INTRO_MS: "1500",
    },
    stdio: "ignore",
  });
  for (let attempt = 0; ; attempt++) {
    try {
      await fetch(url);
      break;
    } catch {
      if (attempt >= 150) throw new Error(`the spec's own app never came up on ${url}`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  browser = await launch();
  // Can't speak holds an arrow key through the whole intro
  table = await playRoom(browser, url, ({ mute }) => holdRightThroughIntro(mute));
}, 60_000);

afterAll(async () => {
  await browser?.close();
  app?.kill();
  rmSync(dir, { recursive: true, force: true });
});

describe("the start of a room (FR14)", () => {
  it("an arrow key held during the intro does not move you", async () => {
    const mute = table.byRole.mute;
    const during = await mute.evaluate(
      () => (window as unknown as { __selfDuring: string[] }).__selfDuring,
    );
    // the figure was drawn while the intro played, and only ever where it spawned
    expect(during.length).toBeGreaterThan(0);
    expect(new Set(during).size, `drawn at ${during.join(" | ")}`).toBe(1);
    // and once it is done, the same key moves you
    const start = Number(during[0]?.split(",")[0]);
    await expect
      .poll(
        async () =>
          Number(
            (await mute.locator("canvas[data-self]").getAttribute("data-self"))?.split(",")[0],
          ),
        {
          timeout: 3000,
        },
      )
      .toBeGreaterThan(start + 0.5);
    await releaseRight(mute);
  });

  it("after ready, .game reaches data-intro=done and Act works", async () => {
    for (const page of table.pages)
      expect(await page.locator(".game").getAttribute("data-intro")).toBe("done");
    // Can't hear (the phone) stands where they spawned, beside Can't see: Act is live on its button
    const deaf = table.byRole.deaf;
    await expect
      .poll(() => deaf.locator("[data-act]").textContent(), { timeout: 3000 })
      .toContain("Hold hands");
    // Act is read when the client samples input (20 Hz): hold it until it took
    await deaf.keyboard.down(" ");
    try {
      await expect
        .poll(() => deaf.locator("[data-act]").textContent(), { timeout: 3000 })
        .toContain("Let go");
    } finally {
      await deaf.keyboard.up(" ");
    }
  });
});
