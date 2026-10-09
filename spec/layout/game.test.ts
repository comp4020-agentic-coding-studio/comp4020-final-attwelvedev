import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { ROLE_LABEL } from "../../src/game/types.ts";
import { axeViolations, horizontalOverflow, launch } from "../browser.ts";
import { leaveGameAndClose } from "../lobbyUi.ts";
import { canvasHash, playRoom } from "../playUi.ts";

const baseUrl = inject("baseUrl");
let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser.close();
});

const SOLID = [0x3a, 0x4d, 0x7a]; // --solid, the wall colour (src/client/tokens.ts)

describe("the game screen", () => {
  it("shows each role's frame, and only the sighted roles' canvas has walls", async () => {
    const table = await playRoom(browser, baseUrl);
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
    const table = await playRoom(browser, baseUrl);
    for (const page of table.pages) {
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      expect(await axeViolations(page)).toEqual([]);
    }
    await leaveGameAndClose(table.byRole.blind, baseUrl);
    await leaveGameAndClose(table.byRole.deaf, baseUrl);
    await leaveGameAndClose(table.byRole.mute, baseUrl);
  });

  it("puts the joystick and Act on touch, clear of the tray, and no key hints there", async () => {
    const table = await playRoom(browser, baseUrl);
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

  it("keeps a held joystick or Act from selecting text or raising a menu", async () => {
    const table = await playRoom(browser, baseUrl);
    const { phone } = table;
    for (const control of ["[data-joystick]", "[data-act]"]) {
      const el = phone.locator(control);
      await el.waitFor();
      expect(await el.evaluate((e) => getComputedStyle(e).userSelect), control).toBe("none");
      const prevented = await el.evaluate((e) => {
        const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
        e.dispatchEvent(ev);
        return ev.defaultPrevented;
      });
      expect(prevented, control).toBe(true);
    }
    for (const page of table.pages) await leaveGameAndClose(page, baseUrl);
  });

  it("moves the deaf player's avatar within 500 ms of pressing D", async () => {
    const table = await playRoom(browser, baseUrl);
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
    const table = await playRoom(browser, baseUrl);
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

    await host.getByRole("button", { name: "Restart room", exact: true }).click();
    await host.getByRole("button", { name: "Sure? Restart room", exact: true }).click();
    await expect.poll(() => canvasHash(deaf), { timeout: 3000 }).toBe(spawn);
    await leaveGameAndClose(host, baseUrl);
    await leaveGameAndClose(deaf, baseUrl);
    await leaveGameAndClose(mute, baseUrl);
  });

  it("lets a player move again after a restart, the one who pressed it and the others", async () => {
    const table = await playRoom(browser, baseUrl);
    const { blind: host, deaf, mute } = table.byRole;
    await deaf.keyboard.down("d");
    await deaf.waitForTimeout(600);
    await deaf.keyboard.up("d");
    await host.getByRole("button", { name: "Restart room", exact: true }).click();
    await host.getByRole("button", { name: "Sure? Restart room", exact: true }).click();
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
    const table = await playRoom(browser, baseUrl);
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

    // leaving on purpose puts a bot in the seat, and the others are told
    await leaveGameAndClose(mute, baseUrl);
    await expect.poll(() => crew(host), { timeout: 3000 }).toMatch(/Bot triangle/);
    await expect(
      host
        .getByRole("status")
        .filter({ hasText: /Cy left the game/ })
        .innerText(),
    ).resolves.toMatch(/A bot took their seat/);
    await leaveGameAndClose(host, baseUrl);
  });
});
