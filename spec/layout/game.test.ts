import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { ROLE_LABEL } from "../../src/game/types.ts";
import { axeViolations, horizontalOverflow, launch } from "../browser.ts";
import { leaveGameAndClose } from "../lobbyUi.ts";
import { canvasHash, playRoom, settledHash } from "../playUi.ts";

const baseUrl = inject("baseUrl");
let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser.close();
});

const SOLID = [0xf4, 0xb9, 0xc3]; // --w-wall-top, the wall colour (src/client/tokens.ts)

describe("the game screen", () => {
  it("shows each role's frame, and only the sighted roles' canvas has walls", async () => {
    const table = await playRoom(browser, baseUrl);
    for (const role of ["blind", "deaf", "mute"] as const) {
      const page = table.byRole[role];
      // this page's own chip in the top bar: their shape, and their role in words for a screen reader
      await expect(page.locator(".hud-crew li.you").innerText()).resolves.toMatch(/\byou\b/);
      expect(await page.locator(".hud-crew li.you svg").count()).toBe(1);
      await expect(page.locator(".hud-crew li.you .sr-only").innerText()).resolves.toContain(
        ROLE_LABEL[role],
      );
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

  it("puts the joystick and Act on touch, clear of the talk bar, and no key hints there", async () => {
    const table = await playRoom(browser, baseUrl);
    const { phone } = table;
    await phone.locator("[data-joystick]").waitFor();
    await phone.locator("[data-act]").waitFor();
    const bar = await phone.locator(".talk-bar").boundingBox();
    const stick = await phone.locator("[data-joystick]").boundingBox();
    const act = await phone.locator("[data-act]").boundingBox();
    expect(bar && stick && act).toBeTruthy();
    if (bar && stick && act) {
      expect(stick.y).toBeGreaterThanOrEqual(bar.y + bar.height);
      expect(act.y).toBeGreaterThanOrEqual(bar.y + bar.height);
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

  // Anyone may ask for a restart; it happens only when the other two accept.
  const askToRestart = async (asker: Page, others: Page[]) => {
    await asker.getByRole("button", { name: "Menu" }).click();
    await asker.getByRole("button", { name: "Restart room", exact: true }).click();
    await asker.getByRole("button", { name: "Sure? Ask to restart room", exact: true }).click();
    for (const page of others) {
      const prompt = page.getByRole("alertdialog");
      await prompt.getByText(/wants to restart the room/).waitFor({ timeout: 2000 });
      await prompt.getByRole("button", { name: "Restart room" }).click();
    }
  };

  it("gives every player a Restart in the menu that asks twice, and puts everyone back at spawn once the others accept", async () => {
    const table = await playRoom(browser, baseUrl);
    const { blind: host, deaf, mute } = table.byRole;
    for (const page of [host, deaf, mute]) {
      // the old bar button is gone: the proposals live in the menu
      expect(await page.getByRole("button", { name: "Restart room", exact: true }).count()).toBe(0);
      await page.getByRole("button", { name: "Menu" }).click();
      expect(await page.getByRole("button", { name: "Restart room", exact: true }).count()).toBe(1);
      await page.getByRole("button", { name: "Menu" }).click();
    }
    const move = async () => {
      await deaf.keyboard.down("d");
      await deaf.waitForTimeout(800);
      await deaf.keyboard.up("d");
    };
    // The first frames of a new game are not the scene yet (a reveal fades into it), so a
    // picture taken then can never match the real spawn. A restart puts everyone at the
    // spawn with the page long since loaded: take the spawn from there, then move away,
    // restart again, and check the second restart looks like the first.
    await askToRestart(host, [deaf, mute]);
    await deaf.waitForTimeout(500); // the restart reaches the page; then wait for it to stop changing
    const spawn = await settledHash(deaf);
    await move();
    expect(await settledHash(deaf)).not.toBe(spawn);
    await askToRestart(deaf, [host, mute]);
    // back at the spawn, once the scene has come to rest: not whatever frame happens to be up
    await expect.poll(() => settledHash(deaf, 1500), { timeout: 8000 }).toBe(spawn);
    await leaveGameAndClose(host, baseUrl);
    await leaveGameAndClose(deaf, baseUrl);
    await leaveGameAndClose(mute, baseUrl);
  });

  it("leaves everyone where they are when one person says No: nobody goes back to spawn", async () => {
    const table = await playRoom(browser, baseUrl);
    const { blind: host, deaf, mute } = table.byRole;
    // the spawn picture, from a restart that was accepted (the same way the test above takes it)
    await askToRestart(host, [deaf, mute]);
    await deaf.waitForTimeout(500);
    const spawn = await settledHash(deaf);
    await deaf.keyboard.down("d");
    await deaf.waitForTimeout(800);
    await deaf.keyboard.up("d");
    expect(await settledHash(deaf)).not.toBe(spawn); // they have moved away

    await host.getByRole("button", { name: "Menu" }).click();
    await host.getByRole("button", { name: "Restart room", exact: true }).click();
    await host.getByRole("button", { name: "Sure? Ask to restart room", exact: true }).click();
    await deaf.getByRole("alertdialog").getByRole("button", { name: "Keep playing" }).click();
    await mute.getByText(/Not restarted: Bo kept playing/).waitFor({ timeout: 2000 });
    // the others hear it end at slightly different moments: wait for the bar to go, don't read it once
    await expect.poll(() => deaf.getByRole("alertdialog").count(), { timeout: 3000 }).toBe(0);
    // the room was not restarted: the player is still away from the spawn, and stays there
    await deaf.waitForTimeout(500);
    expect(await settledHash(deaf)).not.toBe(spawn);
    await leaveGameAndClose(host, baseUrl);
    await leaveGameAndClose(deaf, baseUrl);
    await leaveGameAndClose(mute, baseUrl);
  });

  it("lets a player move again after a restart, the one who asked and the others", async () => {
    const table = await playRoom(browser, baseUrl);
    const { blind: host, deaf, mute } = table.byRole;
    await deaf.keyboard.down("d");
    await deaf.waitForTimeout(600);
    await deaf.keyboard.up("d");
    await askToRestart(host, [deaf, mute]);
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

  it("says who the host is now when the host leaves", async () => {
    const table = await playRoom(browser, baseUrl);
    const { blind: host, deaf, mute } = table.byRole; // seat 0 is the host, seat 1 (Bo) is next
    await leaveGameAndClose(host, baseUrl);
    await expect(
      deaf
        .getByRole("status")
        .filter({ hasText: /now the host/ })
        .innerText(),
    ).resolves.toMatch(/You are now the host/);
    await expect(
      mute
        .getByRole("status")
        .filter({ hasText: /now the host/ })
        .innerText(),
    ).resolves.toMatch(/Bo is now the host/);
    await leaveGameAndClose(deaf, baseUrl);
    await leaveGameAndClose(mute, baseUrl);
  });

  it("says there is no such lobby when another code is typed into the address bar mid-game", async () => {
    const table = await playRoom(browser, baseUrl);
    const { blind: host, deaf, mute } = table.byRole;
    // the page for a code that does not exist must say so, not show the game we are in
    await deaf.goto(`${baseUrl}/lobby/ABCD`, { waitUntil: "networkidle" });
    await deaf.getByText("No lobby ABCD.").waitFor({ timeout: 5000 });
    expect(await deaf.locator(".frame canvas").count()).toBe(0);
    await leaveGameAndClose(host, baseUrl);
    await leaveGameAndClose(deaf, baseUrl);
    await leaveGameAndClose(mute, baseUrl);
  });
});

describe("high contrast", () => {
  it("passes axe contrast checks in the HUD chrome, at both viewports", async () => {
    const table = await playRoom(browser, baseUrl);
    for (const page of [table.byRole.blind, table.byRole.deaf, table.byRole.mute]) {
      await page.getByRole("button", { name: "Menu" }).click();
      await page.getByRole("button", { name: "Settings" }).click();
      await page.getByLabel("High contrast").check();
      await page.getByRole("button", { name: "Menu" }).click(); // close the menu
    }
    await canvasHash(table.byRole.blind); // let one frame draw with the new palette
    for (const page of [table.byRole.blind, table.byRole.deaf, table.byRole.mute]) {
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      expect(await axeViolations(page)).toEqual([]);
    }
    for (const page of table.pages) await page.context().close();
  });
});
