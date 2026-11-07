import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { brailleCells } from "../../src/game/sim/braille.ts";
import { axeViolations, DESKTOP, launch, PHONE, type Viewport } from "../browser.ts";
import { joinWithCode, leaveGameAndClose } from "../lobbyUi.ts";
import { settledHash } from "../playUi.ts";

// The braille card (Task 75, FR6 to FR8): Can't see, beside the plate in the fixture room
// (spec/fixtures/rooms-braille: the plate is one tile from Can't see's spawn), presses Space and
// reads the plate's cells against the key; Can't hear sees the plate light up. Its own app, because
// the shared one serves the real rooms.
let browser: Browser;
let app: ChildProcess;
const port = 22080 + Math.floor(Math.random() * 1000);
const url = `http://127.0.0.1:${port}`;
const dir = mkdtempSync(join(tmpdir(), "braille-spec-"));

beforeAll(async () => {
  if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "ignore" });
  app = spawn("node", ["server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: join(dir, "app.db"),
      ROOMS_DIR: "spec/fixtures/rooms-braille",
    },
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      await fetch(url);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  browser = await launch();
}, 40_000);
afterAll(async () => {
  await browser?.close();
  app?.kill();
  rmSync(dir, { recursive: true, force: true });
});

// The host (seat 1, Can't see in the first room) on `viewport`, a phone with touch; Bo (Can't hear)
// on a desktop. The third seat is a bot.
async function twoPlayers(viewport: Viewport): Promise<{ blind: Page; deaf: Page }> {
  const phone = viewport.width < 600;
  const context = await browser.newContext({ viewport, hasTouch: phone, isMobile: phone });
  const blind = await context.newPage();
  await blind.goto(url, { waitUntil: "networkidle" });
  await blind.getByLabel("Nickname").fill("Ana");
  await blind.getByRole("button", { name: "Start a new team" }).click();
  await blind.waitForURL(/\/lobby\/[A-Z]{4}$/);
  const code = new URL(blind.url()).pathname.split("/").pop() ?? "";
  const deaf = await joinWithCode(browser, url, code, "Bo", DESKTOP);
  await blind.getByRole("heading", { name: /^Players 2 of 6/ }).waitFor();
  await blind.getByRole("button", { name: /^Start/ }).click();
  for (const page of [blind, deaf]) await page.locator(".reveal").waitFor();
  for (const page of [blind, deaf]) await page.getByRole("button", { name: "I'm ready" }).click();
  for (const page of [blind, deaf]) await page.locator(".frame canvas").waitFor();
  await blind
    .locator(".hud-hint", { hasText: "No map. Listen. Get to the exit with the others." })
    .waitFor();
  return { blind, deaf };
}

// Whether the role tab paints over the card: at the middle of where their boxes overlap (none: they
// do not meet), read in one go so an animating card cannot move between the measure and the hit.
const tabCoversCard = (page: Page) =>
  page.evaluate(() => {
    const tab = document.querySelector(".frame .notch") as HTMLElement;
    const card = document.querySelector('[aria-label="Braille plate"]') as HTMLElement;
    const t = tab.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const x0 = Math.max(t.x, c.x);
    const x1 = Math.min(t.x + t.width, c.x + c.width);
    const y0 = Math.max(t.y, c.y);
    const y1 = Math.min(t.y + t.height, c.y + c.height);
    if (x0 >= x1 || y0 >= y1) return false;
    // the tab, the card and its stack ignore the pointer; let them be hit so paint order can be read
    const hit = [tab, card, card.parentElement as HTMLElement];
    for (const el of hit) el.style.pointerEvents = "auto";
    const top = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
    for (const el of hit) el.style.pointerEvents = "";
    return top?.closest(".notch") != null;
  });
const card = (page: Page) => page.getByRole("group", { name: "Braille plate" });
const decode = (cells: number[][]) =>
  Array.from({ length: 10 }, (_, n) => n).find(
    (n) => JSON.stringify(brailleCells(n)) === JSON.stringify(cells),
  );
// the cells as the hidden line spells them: "Cell 1: dots 3 4 5 6. Cell 2: dots 1 2."
const cellsOf = (said: string) =>
  [...said.matchAll(/Cell \d+: dots ([\d ]+)\./g)].map((m) =>
    (m[1] as string).split(" ").map(Number),
  );
// Space is held until the card shows, and pressed afresh if it does not: the input loop samples held
// keys (a press and release inside one task can fall between two samples), and Act acts on its edge,
// so a press that landed before the seat was live is spent and only a new one counts
const read = async (page: Page) => {
  await expect
    .poll(
      async () => {
        await page.keyboard.down(" ");
        const open = await card(page)
          .waitFor({ timeout: 1500 })
          .then(() => true)
          .catch(() => false);
        await page.keyboard.up(" ");
        return open;
      },
      { timeout: 20_000, interval: 100 },
    )
    .toBe(true);
};

describe.each([
  ["1280 desktop", DESKTOP],
  ["375 phone", PHONE],
])("the braille card at %s", (_name, viewport) => {
  it("opens on Space at the plate, says only dots, and closes on stepping off", async () => {
    const { blind, deaf } = await twoPlayers(viewport);
    try {
      await read(blind);
      const group = card(blind);
      expect(await group.locator(".braille-cells svg").count()).toBe(2); // the number sign and a digit
      expect(await group.locator(".braille-key li").count()).toBe(11);
      await expect
        .poll(() => blind.getByRole("status").filter({ hasText: "Plate: 2 cells" }).count())
        .toBe(1);
      expect(await group.innerText()).toContain(
        "Raised dots, read left to right. Match each to the key.",
      );
      // the hidden line names dots and nothing else: no decoded number
      const said = await group.locator(".braille-cells .sr-only").innerText();
      const cells = cellsOf(said);
      expect(cells).toHaveLength(2);
      expect(decode(cells)).toBeDefined();
      expect(said).toBe(cells.map((c, i) => `Cell ${i + 1}: dots ${c.join(" ")}.`).join(" "));
      expect(await group.getAttribute("aria-label")).toBe("Braille plate");

      // no visible text clipped (the hidden lines are 1 px boxes on purpose), and on a phone the
      // comms button is never under the card
      const clipped = await group.evaluate((el) =>
        [el, ...el.querySelectorAll("p, li, .braille-label")]
          .filter((x) => !x.closest(".sr-only"))
          .map((x) => `${x.className}:${x.scrollHeight - x.clientHeight}`)
          .filter((x) => Number(x.split(":").pop()) > 1),
      );
      expect(clipped).toEqual([]);
      const box = await group.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= viewport.width).toBe(true);
      // the role tab (decorative, at the frame's top-left) never paints over the card
      expect(await tabCoversCard(blind), "the tab covers the card").toBe(false);
      // the whole card, key and all, inside the game frame, clear of the captions under it
      const frame = await blind.locator(".frame").boundingBox();
      expect(box && frame && box.y + box.height <= frame.y + frame.height).toBe(true);
      // this fixture room has no cache, so no chip: when there is one the card is under its real box, and either
      // way the card shares one column with the chip, so it sits under it at whatever height the chip has
      if ((await blind.locator(".side-job").count()) > 0) {
        const chip = await blind.locator(".side-job").boundingBox();
        if (chip && box)
          expect(box.y >= chip.y + chip.height, "the card is under the chip").toBe(true);
      }
      expect(await group.evaluate((el) => el.parentElement?.className)).toBe("top-stack");
      // the empty gap between two cells of the key is wider than the dot pitch inside one cell, or a row of
      // cells reads as one even row of dots (the user, Task 75 review)
      const gaps = await group.locator(".braille-key li").evaluateAll((els) => {
        const r = els.map((e) => (e.querySelector("svg") as SVGElement).getBoundingClientRect());
        const first = els[0]?.querySelector("svg");
        const dots = first
          ? [...first.querySelectorAll("circle")].map((c) => c.getBoundingClientRect())
          : [];
        const pitch =
          dots.length > 1 ? Math.abs((dots[3] as DOMRect).left - (dots[0] as DOMRect).left) : 0;
        const between: number[] = [];
        for (let i = 1; i < r.length; i++) {
          const a = r[i - 1] as DOMRect;
          const b = r[i] as DOMRect;
          if (Math.abs(a.top - b.top) < 2) between.push(b.left - a.right);
        }
        return { pitch, min: Math.min(...between) };
      });
      expect(gaps.min, `cell gap ${gaps.min} vs dot pitch ${gaps.pitch}`).toBeGreaterThan(
        gaps.pitch,
      );
      // the key's rows are apart: the two rows of a phone key never touch
      const rows = await group
        .locator(".braille-key li")
        .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
      const tops = [...new Set(rows.map((r) => Math.round(r.top)))].sort((a, b) => a - b);
      for (let i = 1; i < tops.length; i++) {
        const above = rows.find((r) => Math.round(r.top) === tops[i - 1]);
        if (above) expect(tops[i] - above.bottom >= 6).toBe(true);
      }
      const caps = await blind.locator(".captions").boundingBox();
      if (caps && box) expect(box.y + box.height <= caps.y).toBe(true);
      const wheel = blind.locator(".wheel-btn");
      if (await wheel.count()) {
        const w = await wheel.boundingBox();
        const apart =
          !box ||
          !w ||
          w.x >= box.x + box.width ||
          w.x + w.width <= box.x ||
          w.y >= box.y + box.height ||
          w.y + w.height <= box.y;
        expect(apart).toBe(true);
      }
      expect(await axeViolations(blind, ".braille-card")).toEqual([]);

      // two tiles away it closes; back at the wall beside the plate, Space opens it again
      await blind.keyboard.down("ArrowRight");
      await expect.poll(() => card(blind).count(), { timeout: 5000 }).toBe(0);
      await blind.keyboard.up("ArrowRight");
      await blind.keyboard.down("ArrowLeft");
      await blind.waitForTimeout(2500); // walk back against the west wall, beside the plate
      await blind.keyboard.up("ArrowLeft");
      await read(blind);
      expect(await card(blind).count()).toBe(1);
      void deaf;
    } finally {
      for (const page of [blind, deaf]) await leaveGameAndClose(page, url).catch(() => {});
    }
  }, 90_000);

  it("shows every cell at once with reduced motion, staggered without", async () => {
    const { blind, deaf } = await twoPlayers(viewport);
    try {
      await read(blind);
      const delays = () =>
        card(blind)
          .locator(".braille-at")
          .evaluateAll((els) => els.map((e) => getComputedStyle(e).animationName));
      expect(await delays()).toEqual(["braille-in", "braille-in"]);
      await blind.emulateMedia({ reducedMotion: "reduce" });
      expect(await delays()).toEqual(["none", "none"]);
    } finally {
      for (const page of [blind, deaf]) await leaveGameAndClose(page, url).catch(() => {});
    }
  }, 90_000);
});

describe("the plate for the sighted", () => {
  it("Can't hear's canvas changes at the plate when Can't see reads it", async () => {
    const { blind, deaf } = await twoPlayers(DESKTOP);
    try {
      // the bot walks to the shut door and stops there: wait for the picture to hold still
      const before = await settledHash(deaf, 20_000);
      await read(blind);
      await expect.poll(() => settledHash(deaf), { timeout: 10_000 }).not.toBe(before);
    } finally {
      for (const page of [blind, deaf]) await leaveGameAndClose(page, url).catch(() => {});
    }
  }, 90_000);
});
