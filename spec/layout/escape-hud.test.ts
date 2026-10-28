import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Locator, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { axeViolations, DESKTOP, horizontalOverflow, launch, PHONE } from "../browser.ts";
import { playRoom, type Table } from "../playUi.ts";

// The escape-room HUD (phase 02 Task 10): your gear slot, the Act hint, the lamp. Its own app on the
// stations draft (spec/fixtures/drafts), the one room with gear and stations in it; the shared
// server's rooms have neither. The table: Can't see on desktop, Can't hear on a phone, Can't speak
// on desktop (playRoom). Each page is also measured at the other width.
const ROOMS = "spec/fixtures/drafts";
const port = 20080 + Math.floor(Math.random() * 1000);
const dir = mkdtempSync(join(tmpdir(), "escape-hud-spec-"));
const url = `http://127.0.0.1:${port}`;
let app: ChildProcess;
let browser: Browser;
let table: Table;

const COLOUR = /\b(red|blue|yellow|green|white|black)\b/i;

// Walk with a key held until the predicate holds (the server decides where you are; the view says).
async function walk(page: Page, key: string, until: () => Promise<boolean>, maxMs = 8000) {
  await page.keyboard.down(key);
  try {
    await expect.poll(until, { timeout: maxMs, interval: 50 }).toBe(true);
  } finally {
    await page.keyboard.up(key);
  }
}

const box = async (l: Locator) => {
  const b = await l.boundingBox();
  if (!b) throw new Error("not laid out");
  return b;
};
const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

beforeAll(async () => {
  if (!existsSync("dist/server/entry.mjs")) execSync("pnpm build", { stdio: "ignore" });
  app = spawn("node", ["server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: join(dir, "app.db"),
      ROOMS_DIR: ROOMS,
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
  table = await playRoom(browser, url);
}, 60_000);

afterAll(async () => {
  app?.kill();
  rmSync(dir, { recursive: true, force: true });
  await browser?.close();
}, 30_000);

describe("the Act hint", () => {
  it("says what Act will do where you stand, and to Can't see never names a colour", async () => {
    // Can't speak spawns at (1, 3) beside Can't hear at (1, 2): holding hands is on offer
    const mute = table.byRole.mute;
    await expect
      .poll(() => mute.locator(".act-hint").textContent(), { timeout: 5000 })
      .toContain("Hold hands");
    // Can't see's hint is a status line too; whatever it says, it says no colour
    const blind = table.byRole.blind;
    const said = (await blind.locator(".act-hint").textContent()) ?? "";
    expect(said).not.toMatch(COLOUR);
  });

  it("is the Act button's label on a phone", async () => {
    const phone = table.byRole.deaf;
    await expect
      .poll(() => phone.locator("[data-act]").textContent(), { timeout: 5000 })
      .toMatch(/Hold hands|Let go|Act/);
    const act = await box(phone.locator("[data-act]"));
    // the label fits inside the button: no text spills past it
    const spill = await phone
      .locator("[data-act]")
      .evaluate(
        (el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
      );
    expect(spill).toBe(false);
    expect(act.width).toBeGreaterThanOrEqual(48);
  });
});

describe("the gear slot", () => {
  it("shows what you carry, once you pick it up", async () => {
    const mute = table.byRole.mute;
    // up to row 2, then east until standing on the first gear (the UV torch at x 22)
    const at = async () =>
      (await mute.locator("canvas[data-self]").getAttribute("data-self")) ?? "";
    await walk(mute, "w", async () => Number((await at()).split(",")[1]) < 3);
    await walk(mute, "d", async () => Number((await at()).split(",")[0]) >= 22.2, 10_000);
    await expect
      .poll(() => mute.locator(".act-hint").textContent(), { timeout: 3000 })
      .toMatch(/^Space Take the /);
    // Act is read when the client samples input: hold Space until the slot shows the gear
    await mute.keyboard.down(" ");
    try {
      await expect
        .poll(() => mute.locator(".gear-slot").textContent(), { timeout: 3000 })
        .toMatch(/UV torch|Stethoscope|Earpiece|Goggles/);
    } finally {
      await mute.keyboard.up(" ");
    }
    expect(await mute.locator(".gear-slot").textContent()).toContain("G give or drop");
    // the crew row shows it on Can't speak's own chip, on every page that can see them
    await expect
      .poll(() => mute.locator(".hud-crew li.you .hud-gear").count(), { timeout: 3000 })
      .toBe(1);
  });

  it("is a 48 px button on a phone that never touches the joystick, comms, Act or the notch", async () => {
    const phone = table.byRole.deaf;
    const slot = await box(phone.locator(".gear-btn"));
    expect(slot.width).toBeGreaterThanOrEqual(48);
    expect(slot.height).toBeGreaterThanOrEqual(48);
    for (const other of [".joystick", "[data-act]", ".quick-btn", ".wheel-btn", ".notch"]) {
      expect(overlaps(slot, await box(phone.locator(other))), other).toBe(false);
    }
  });
});

describe("the HUD at both widths, for every role", () => {
  it.each([
    ["desktop", DESKTOP],
    ["phone", PHONE],
  ] as const)(
    "has no horizontal scroll, keeps its pieces apart, and passes axe (%s)",
    async (_, vp) => {
      for (const page of table.pages) {
        await page.setViewportSize(vp);
        expect(await horizontalOverflow(page)).toBe(0);
        const dock = page.locator(".hud-dock");
        if ((await dock.count()) > 0) {
          // the dock and the captions never cover each other
          const captions = page.locator(".captions");
          const d = await box(dock);
          if ((await captions.count()) > 0 && (await captions.boundingBox())) {
            const c = await box(captions);
            if (c.height > 0)
              expect(overlaps(d, { ...c, y: c.y + c.height - 1, height: 1 })).toBe(false);
          }
        }
        expect(await axeViolations(page)).toEqual([]);
      }
      for (const [page, own] of [
        [table.byRole.blind, DESKTOP],
        [table.byRole.deaf, PHONE],
        [table.byRole.mute, DESKTOP],
      ] as const)
        await page.setViewportSize(own);
    },
  );
});
