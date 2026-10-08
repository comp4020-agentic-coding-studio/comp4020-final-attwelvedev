import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { ROLE_LABEL, type Role } from "../../src/game/types.ts";
import { axeViolations, DESKTOP, horizontalOverflow, launch, openPage, PHONE } from "../browser.ts";
import { createLobbyAs, leaveGameAndClose } from "../lobbyUi.ts";

const baseUrl = inject("baseUrl");
let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser.close();
});

const SOLID = [0x3a, 0x4d, 0x7a]; // --solid, the wall colour (src/client/tokens.ts)

interface Table {
  pages: Page[];
  byRole: Record<Role, Page>;
  phone: Page;
}

// Host and a third player on desktop, one touch phone in between, all through
// the real screens: create, join, Start, reveal, Ready.
async function playRoom(): Promise<Table> {
  const { page: host, code } = await createLobbyAs(browser, baseUrl, "Ana", DESKTOP);
  const phoneContext = await browser.newContext({
    viewport: PHONE,
    hasTouch: true,
    isMobile: true,
  });
  const phone = await phoneContext.newPage();
  const third = await openPage(browser, baseUrl, DESKTOP);
  for (const [page, name] of [
    [phone, "Bo"],
    [third, "Cy"],
  ] as const) {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByLabel("Nickname").fill(name);
    await page.getByLabel("Lobby code").fill(code);
    await page.getByRole("button", { name: "Join", exact: true }).click();
    await page.waitForURL(new RegExp(`/lobby/${code}$`));
    await page.getByText("Seats").waitFor();
  }
  const start = host.getByRole("button", { name: "Start" });
  await expect.poll(() => start.isEnabled(), { timeout: 5000 }).toBe(true);
  await start.click();
  const pages = [host, phone, third];
  for (const page of pages) await page.getByRole("button", { name: "Ready" }).click();
  for (const page of pages) await page.locator(".frame canvas").waitFor();
  // seats rotate by room: room 1 is seat 0 blind, seat 1 deaf, seat 2 mute
  return { pages, phone, byRole: { blind: host, deaf: phone, mute: third } };
}

const canvasHash = (page: Page) =>
  page.locator(".frame canvas").evaluate((c) => (c as HTMLCanvasElement).toDataURL());

describe("the game screen", () => {
  it("shows each role's frame, and only the sighted roles' canvas has walls", async () => {
    const table = await playRoom();
    for (const role of ["blind", "deaf", "mute"] as const) {
      const page = table.byRole[role];
      await expect(page.locator(".hud-role").innerText()).resolves.toContain(ROLE_LABEL[role]);
      expect(await page.locator(".hud-role svg").count()).toBe(1);
      expect(await page.locator(".frame .notch svg").count()).toBe(1);
      const frameColour = await page
        .locator(".frame")
        .evaluate((el) => getComputedStyle(el).borderTopColor);
      expect(frameColour).toMatch(/^rgb\(/);
    }

    // sample a grid of pixels from each canvas, looking for the wall colour
    const wallPixels = (page: Page) =>
      page.locator(".frame canvas").evaluate((el, solid) => {
        const c = el as HTMLCanvasElement;
        const ctx = c.getContext("2d");
        if (!ctx) return -1;
        let hits = 0;
        for (let x = 0; x < c.width; x += 3) {
          for (let y = 0; y < c.height; y += 3) {
            const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
            if (r === solid[0] && g === solid[1] && b === solid[2]) hits++;
          }
        }
        return hits;
      }, SOLID);
    expect(await wallPixels(table.byRole.blind)).toBe(0);
    await expect.poll(() => wallPixels(table.byRole.deaf), { timeout: 3000 }).toBeGreaterThan(0);
    await expect.poll(() => wallPixels(table.byRole.mute), { timeout: 3000 }).toBeGreaterThan(0);
    for (const page of table.pages) await leaveGameAndClose(page, baseUrl);
  });

  it("has no overflow and no axe violations on the HUD at phone and desktop widths", async () => {
    const table = await playRoom();
    for (const page of table.pages) {
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      expect(await axeViolations(page)).toEqual([]);
    }
    await leaveGameAndClose(table.byRole.blind, baseUrl);
    await leaveGameAndClose(table.byRole.deaf, baseUrl);
    await leaveGameAndClose(table.byRole.mute, baseUrl);
  });

  it("puts the joystick and Act on touch, clear of the tray, and no key hints there", async () => {
    const table = await playRoom();
    const { phone } = table;
    await phone.locator("[data-joystick]").waitFor();
    await phone.locator("[data-act]").waitFor();
    const tray = await phone.locator(".tray").boundingBox();
    const stick = await phone.locator("[data-joystick]").boundingBox();
    const act = await phone.locator("[data-act]").boundingBox();
    expect(tray && stick && act).toBeTruthy();
    if (tray && stick && act) {
      expect(stick.y).toBeGreaterThanOrEqual(tray.y + tray.height);
      expect(act.y).toBeGreaterThanOrEqual(tray.y + tray.height);
      expect(stick.x).toBeLessThan(act.x);
      expect(act.width).toBeGreaterThanOrEqual(48);
    }
    expect(await table.byRole.blind.locator("[data-joystick]").count()).toBe(0);
    await leaveGameAndClose(table.byRole.blind, baseUrl);
    await leaveGameAndClose(table.byRole.deaf, baseUrl);
    await leaveGameAndClose(table.byRole.mute, baseUrl);
  });

  it("moves the deaf player's avatar within 500 ms of pressing D", async () => {
    const table = await playRoom();
    const deaf = table.byRole.deaf;
    await deaf.waitForTimeout(300); // let the first frames settle
    const before = await canvasHash(deaf);
    await deaf.keyboard.down("d");
    const started = Date.now();
    let changed = false;
    while (!changed && Date.now() - started < 500) {
      changed = (await canvasHash(deaf)) !== before;
    }
    await deaf.keyboard.up("d");
    expect(changed).toBe(true);
    await leaveGameAndClose(table.byRole.blind, baseUrl);
    await leaveGameAndClose(table.byRole.deaf, baseUrl);
    await leaveGameAndClose(table.byRole.mute, baseUrl);
  });

  it("gives only the host a Restart that asks twice and then puts everyone back at spawn", async () => {
    const table = await playRoom();
    const { blind: host, deaf, mute } = table.byRole;
    expect(await deaf.getByRole("button", { name: /Restart/ }).count()).toBe(0);
    expect(await mute.getByRole("button", { name: /Restart/ }).count()).toBe(0);
    await deaf.waitForTimeout(300);
    const spawn = await canvasHash(deaf);
    await deaf.keyboard.down("d");
    await deaf.waitForTimeout(800);
    await deaf.keyboard.up("d");
    await deaf.waitForTimeout(300);
    expect(await canvasHash(deaf)).not.toBe(spawn);

    await host.getByRole("button", { name: "Restart" }).click();
    await host.getByRole("button", { name: "Sure? Restart" }).click();
    await expect.poll(() => canvasHash(deaf), { timeout: 3000 }).toBe(spawn);
    await leaveGameAndClose(host, baseUrl);
    await leaveGameAndClose(deaf, baseUrl);
    await leaveGameAndClose(mute, baseUrl);
  });

  it("lets a player move again after a restart, the one who pressed it and the others", async () => {
    const table = await playRoom();
    const { blind: host, deaf, mute } = table.byRole;
    await deaf.keyboard.down("d");
    await deaf.waitForTimeout(600);
    await deaf.keyboard.up("d");
    await host.getByRole("button", { name: "Restart" }).click();
    await host.getByRole("button", { name: "Sure? Restart" }).click();
    await deaf.waitForTimeout(500);
    for (const page of [deaf, mute]) {
      const before = await canvasHash(page);
      await page.keyboard.down("d");
      let changed = false;
      const started = Date.now();
      while (!changed && Date.now() - started < 800) changed = (await canvasHash(page)) !== before;
      await page.keyboard.up("d");
      expect(changed).toBe(true);
    }
    await leaveGameAndClose(host, baseUrl);
    await leaveGameAndClose(deaf, baseUrl);
    await leaveGameAndClose(mute, baseUrl);
  });

  it("tells the others when a player's connection drops, and when they leave", async () => {
    const table = await playRoom();
    const { blind: host, deaf, mute } = table.byRole;
    const crew = (page: Page) => page.locator(".hud-crew").innerText();
    expect(await crew(host)).not.toMatch(/away|left/);

    // a dropped connection (closing the tab) is "away": the seat is held
    await deaf.context().close();
    await expect.poll(() => crew(host), { timeout: 3000 }).toMatch(/Bo \(away\)/);
    await expect.poll(() => crew(mute), { timeout: 3000 }).toMatch(/Bo \(away\)/);
    await expect(host.getByRole("status").filter({ hasText: /Bo/ }).innerText()).resolves.toMatch(
      /Bo/,
    );

    // leaving on purpose frees the seat: "left"
    await leaveGameAndClose(mute, baseUrl);
    await expect.poll(() => crew(host), { timeout: 3000 }).toMatch(/Cy \(left\)/);
    await leaveGameAndClose(host, baseUrl);
  });
});
