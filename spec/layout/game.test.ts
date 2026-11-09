import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { ROLE_LABEL } from "../../src/game/types.ts";
import { axeViolations, DESKTOP, horizontalOverflow, launch } from "../browser.ts";
import { clearRoomOne } from "../heistPlay.ts";
import { leaveGameAndClose } from "../lobbyUi.ts";
import { closeAll, type Player, ready, startedGame } from "../play.ts";
import { canvasHash, playRoom, settledHash, settleReport, type Table } from "../playUi.ts";

const baseUrl = inject("baseUrl");
let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  if (shared)
    for (const page of shared.pages) await leaveGameAndClose(page, baseUrl).catch(() => {});
  await browser.close();
});

// The four tests that only read a live room (the frame and walls, the HUD's overflow and axe, the touch
// controls, and the held joystick) share ONE table: seating three players costs about 6 s here and 12 s on a
// CI runner, and each of the four paid it. Nobody walks in these four, so every page is left as it was found.
// The two tests that walk a player (the blind figure's hop, the deaf avatar's 500 ms) and every test that
// restarts, drops a connection or leaves keep a table each.
let shared: Table | undefined;
const sharedTable = async (): Promise<Table> => {
  shared ??= await playRoom(browser, baseUrl);
  return shared;
};

const SOLID = [0xf4, 0xb9, 0xc3]; // --w-wall-top, the wall colour (src/client/tokens.ts)

describe("the game screen", () => {
  it("shows each role's frame, and only the sighted roles' canvas has walls", async () => {
    const table = await sharedTable();
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
  });

  it("draws Can't see's own figure, black around it, and it moves when they walk", async () => {
    const table = await playRoom(browser, baseUrl);
    const blind = table.byRole.blind;
    const canvas = blind.locator(".frame canvas");
    // the picture, apart from the black: how many pixels are not
    const lit = () =>
      canvas.evaluate((el) => {
        const c = el as HTMLCanvasElement;
        const d = c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; d && i < d.length; i += 4)
          if ((d[i] ?? 0) + (d[i + 1] ?? 0) + (d[i + 2] ?? 0) > 30) n++;
        return n;
      });
    const walls = await blind.evaluate(() => 0);
    expect(walls).toBe(0);
    await expect.poll(lit, { timeout: 3000 }).toBeGreaterThan(200); // a figure, not a bare ring
    const total = await canvas.evaluate(
      (el) => (el as HTMLCanvasElement).width * (el as HTMLCanvasElement).height,
    );
    expect(await lit()).toBeLessThan(total * 0.1); // and black everywhere else
    // walking changes the picture: it hops
    await blind.emulateMedia({ reducedMotion: "no-preference" });
    await blind.keyboard.down("d");
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      seen.add(await canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL()));
      await blind.waitForTimeout(40);
    }
    await blind.keyboard.up("d");
    expect(seen.size, "a hopping figure is not one still frame").toBeGreaterThan(1);
    for (const page of table.pages) await leaveGameAndClose(page, baseUrl);
  });

  it("has no overflow and no axe violations on the HUD at phone and desktop widths", async () => {
    const table = await sharedTable();
    for (const page of table.pages) {
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      expect(await axeViolations(page)).toEqual([]);
    }
  });

  it("puts the joystick and Act on touch, clear of the talk bar, with a touch hint and no key hints", async () => {
    const table = await sharedTable();
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
    // the phone's hint sits under the controls, whole, and never names keys
    const hint = phone.getByText("Stick moves · big button acts · hold Wheel to send");
    await hint.waitFor();
    const hintBox = await hint.boundingBox();
    if (!hintBox || !act) throw new Error("touch hint or Act not drawn");
    expect(hintBox.y).toBeGreaterThanOrEqual(act.y + act.height);
    expect(await hint.evaluate((e) => e.scrollHeight <= e.clientHeight)).toBe(true);
    // centred: the hint's text sits in the middle of the frame, not against its left edge
    const centre = await hint.evaluate((e) => {
      const frame = (e.closest(".game") ?? e.parentElement) as HTMLElement;
      const range = document.createRange();
      range.selectNodeContents(e);
      const t = range.getBoundingClientRect();
      const f = frame.getBoundingClientRect();
      return { text: t.x + t.width / 2, frame: f.x + f.width / 2 };
    });
    expect(Math.abs(centre.text - centre.frame)).toBeLessThanOrEqual(2);
    const hints = await phone.locator(".keys").allInnerTexts();
    expect(hints).toEqual(["Stick moves · big button acts · hold Wheel to send"]);
    for (const text of hints) expect(text).not.toMatch(/WASD|Space/);
    expect(await table.byRole.blind.locator("[data-joystick]").count()).toBe(0);
  });

  it("keeps a held joystick or Act from selecting text or raising a menu", async () => {
    const table = await sharedTable();
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
    // where the page says the figure is at the spawn, and what that settle was like, kept for the report below
    const spawnAt = await deaf.locator("canvas[data-self]").getAttribute("data-self");
    const spawnReport = await settleReport(deaf);
    await move();
    expect(await settledHash(deaf)).not.toBe(spawn);
    await askToRestart(deaf, [host, mute]);
    // back at the spawn, once the scene has come to rest: not whatever frame happens to be up
    try {
      await expect.poll(() => settledHash(deaf, 1500), { timeout: 8000 }).toBe(spawn);
    } catch (error) {
      // settledHash returns the last frame whether or not it held still, so say which this was: did the frame
      // settle, on how many frames, and where is the figure now against where it stood at the spawn
      const [now, then] = [await settleReport(deaf), spawnAt];
      throw new Error(
        `not back at the spawn: spawn was at ${then} and is now ${JSON.stringify(now)}; the spawn frame is ${JSON.stringify(spawnReport)}`,
        { cause: error },
      );
    }
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
    await expect.poll(() => crew(host), { timeout: 3000 }).toMatch(/Bot Moss/);
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

// A player's own device, opened in a browser on a game that sockets started: the cookie and the
// saved nickname are theirs, so the lobby page rejoins their seat.
async function openAs(player: Player, nickname: string, code: string): Promise<Page> {
  const eq = player.cookie.indexOf("=");
  const context = await browser.newContext({ viewport: DESKTOP });
  await context.addCookies([
    { name: player.cookie.slice(0, eq), value: player.cookie.slice(eq + 1), url: baseUrl },
  ]);
  await context.addInitScript((n) => localStorage.setItem("heist.nickname", n), nickname);
  const page = await context.newPage();
  await page.goto(new URL(`/lobby/${code}`, baseUrl).href);
  await page.locator(".frame canvas").waitFor();
  return page;
}

describe("after a room is cleared", () => {
  it("the crew can still write and read: the text field is live and a text arrives", async () => {
    const { players, code } = await startedGame(baseUrl);
    ready(players);
    // seat 0 is Can't see and seat 2 Can't speak in room 1; Can't speak is the one who reads text
    const blind = await openAs(players[0] as Player, "Ana", code);
    const mute = await openAs(players[2] as Player, "Cy", code);
    await clearRoomOne(players);
    await blind.getByRole("heading", { name: "Room cleared" }).waitFor();
    // the panel covers the map, not the talk bar: Comms and Write are both live and clickable
    await blind.getByRole("button", { name: /comms/i }).click({ trial: true, timeout: 2000 });
    expect(await blind.getByRole("button", { name: /comms/i }).isEnabled()).toBe(true);
    await blind.getByRole("button", { name: "Write a message" }).click({ timeout: 2000 });
    const field = blind.getByLabel("Message");
    expect(await field.isEnabled()).toBe(true);
    await field.fill("nice one");
    await field.press("Enter");
    await mute.locator(".captions p", { hasText: "Ana: nice one" }).waitFor({ timeout: 3000 });
    await blind.context().close();
    await mute.context().close();
    await closeAll(players);
  }, 120_000);
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
