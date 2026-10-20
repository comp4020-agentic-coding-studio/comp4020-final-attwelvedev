import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { axeViolations, DESKTOP, horizontalOverflow, launch, PHONE } from "../browser.ts";
import { createLobbyAs, joinAsWatcher, joinWithCode } from "../lobbyUi.ts";

const baseUrl = inject("baseUrl");
let browser: Browser;
beforeAll(async () => {
  browser = await launch([
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ]);
});
afterAll(async () => {
  await browser.close();
});

const closeAll = async (pages: Page[]) => {
  for (const page of pages) await page.context().close();
};

// Four people, started: Ana, Bo and Cy play room 1, Di sits it out and watches. Everyone has
// pressed I'm ready, so the room is running.
async function started(): Promise<{ players: [Page, Page, Page]; di: Page; code: string }> {
  const host = await createLobbyAs(browser, baseUrl, "Ana", DESKTOP);
  const pages = [host.page];
  for (const name of ["Bo", "Cy", "Di"]) {
    pages.push(await joinWithCode(browser, baseUrl, host.code, name, DESKTOP));
  }
  await host.page
    .locator(".player-row")
    .filter({ has: host.page.getByText("Di", { exact: true }) })
    .waitFor();
  await host.page.getByRole("button", { name: /^Start/ }).click();
  const players = pages.slice(0, 3) as [Page, Page, Page];
  for (const page of players) await page.getByRole("button", { name: "I'm ready" }).click();
  for (const page of players) await page.locator(".frame canvas").waitFor();
  return { players, di: pages[3] as Page, code: host.code };
}

const chatLine = (page: Page, text: string) =>
  page.locator(".spectator-chat-lines li", { hasText: text });
const say = async (page: Page, text: string) => {
  await page.getByLabel("Say something to the other watchers").fill(text);
  await page.getByRole("button", { name: "Say", exact: true }).click();
};

describe("the spectator panel", () => {
  it("says what it is, and its chat reaches another spectator and a sitting-out person, never a player's page", async () => {
    const { players, di, code } = await started();
    const wes = await joinAsWatcher(browser, baseUrl, code, "Wes", DESKTOP);
    const panel = wes.getByRole("region", { name: /^Spectators/ });
    expect(await panel.innerText()).toMatch(/only spectators see and hear this/i);
    await say(wes, "nice one");
    for (const page of [wes, di]) await chatLine(page, "nice one").waitFor({ timeout: 2000 });
    expect(await chatLine(di, "nice one").innerText()).toContain("Wes");
    await say(di, "thanks from Di");
    await chatLine(wes, "thanks from Di").waitFor({ timeout: 2000 });
    for (const player of players) {
      expect(await player.getByText("nice one").count()).toBe(0);
      expect(await player.getByText("thanks from Di").count()).toBe(0);
      expect(await player.locator(".spectator-chat").count()).toBe(0);
    }
    await closeAll([...players, di, wes]);
  });

  it("a spectator follows Ana and hears what Ana hears (captions shown), then Whole room", async () => {
    const { players, code, di } = await started();
    const [ana, bo] = players;
    const wes = await joinAsWatcher(browser, baseUrl, code, "Wes", DESKTOP);
    await wes.evaluate(() => {
      (window as unknown as { __cuesPlayed: string[] }).__cuesPlayed = [];
    });
    const cues = () =>
      wes.evaluate(() => (window as unknown as { __cuesPlayed: string[] }).__cuesPlayed);
    // the whole room has no sound
    await bo.keyboard.down("d");
    await bo.waitForTimeout(900);
    await bo.keyboard.up("d");
    expect(await cues()).toEqual([]);
    await wes.getByRole("button", { name: "Ana" }).click();
    expect(await wes.getByRole("button", { name: "Ana" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    // Ana is Can't see: she hears Bo's footsteps, so the spectator hears them and reads a caption
    await ana.waitForTimeout(200);
    await bo.keyboard.down("d");
    await expect.poll(cues, { timeout: 4000 }).toContain("footsteps");
    await wes
      .getByRole("log", { name: "Captions" })
      .getByText(/footsteps/i)
      .first()
      .waitFor({
        timeout: 4000,
      });
    await bo.keyboard.up("d");
    await wes.getByRole("button", { name: "Whole room" }).click();
    expect(await wes.getByRole("button", { name: "Whole room" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    await wes.evaluate(() => {
      (window as unknown as { __cuesPlayed: string[] }).__cuesPlayed = [];
    });
    await bo.keyboard.down("a");
    await bo.waitForTimeout(700);
    await bo.keyboard.up("a");
    expect(await cues()).toEqual([]);
    await closeAll([...players, di, wes]);
  });

  it("says who sits out and which room they play, and has a hold-to-talk button with V", async () => {
    const { players, di } = await started();
    const text = await di.locator(".spectator-panel").innerText();
    expect(text).toMatch(/Sitting out this room/i);
    expect(text).toMatch(/Di/);
    const talk = di.getByRole("button", { name: /Hold to talk/ });
    expect(await talk.getAttribute("aria-keyshortcuts")).toBe("V");
    await di.keyboard.down("v");
    await di.getByText("Mic live").waitFor({ timeout: 2000 });
    await di.keyboard.up("v");
    expect(await di.getByText("Mic live").count()).toBe(0);
    await closeAll([...players, di]);
  });

  it("has a Menu with Leave that asks first, and Start a new team in the panel", async () => {
    const { players, di } = await started();
    await di.getByRole("button", { name: "Start a new team" }).waitFor();
    await di.getByRole("button", { name: "Menu" }).click();
    await di.getByRole("button", { name: "Leave", exact: true }).click();
    await di
      .getByRole("dialog", { name: "Stop watching?" })
      .getByRole("button", { name: "Stay" })
      .click();
    expect(await di.locator(".spectator-frame canvas").count()).toBe(1);
    await closeAll([...players, di]);
  });

  it("is a side panel at desktop width and a bottom sheet with Chat and Players tabs on a phone", async () => {
    const { players, di, code } = await started();
    // desktop: the panel sits to the right of the map
    const map = await di.locator(".spectator-frame").boundingBox();
    const side = await di.locator(".spectator-panel").boundingBox();
    expect(map && side).toBeTruthy();
    if (map && side) expect(side.x).toBeGreaterThanOrEqual(map.x + map.width - 1);
    expect(await di.getByRole("tab").count()).toBe(0);

    const phone = await joinAsWatcher(browser, baseUrl, code, "Pia", PHONE, { hasTouch: true });
    const frame = await phone.locator(".spectator-frame").boundingBox();
    const sheet = await phone.locator(".spectator-panel").boundingBox();
    expect(frame && sheet).toBeTruthy();
    if (frame && sheet) {
      expect(sheet.y).toBeGreaterThanOrEqual(frame.y + frame.height - 1);
      expect(frame.height).toBeGreaterThanOrEqual(812 * 0.5);
    }
    await phone.getByRole("tab", { name: "Chat" }).waitFor();
    await phone.getByRole("tab", { name: "Players" }).click();
    expect(await phone.getByRole("tabpanel").innerText()).toMatch(/Di/);
    await phone.getByRole("tab", { name: "Chat" }).click();
    await say(di, "peek");
    await chatLine(phone, "peek").waitFor({ timeout: 2000 });
    await closeAll([...players, di, phone]);
  });

  it("has no overflow and no axe violations, at both widths, with chat lines and the vote bar's absence", async () => {
    const { players, di, code } = await started();
    const phone = await joinAsWatcher(browser, baseUrl, code, "Pia", PHONE, { hasTouch: true });
    // the server takes one line a second from a person: pace it as a person would, and wait for each
    for (let i = 0; i < 2; i++) {
      await say(di, `a fairly long line of chat number ${i} that wraps on a phone`);
      await chatLine(phone, `number ${i}`).waitFor({ timeout: 3000 });
      await phone.waitForTimeout(1000);
    }
    for (const page of [di, phone]) {
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      expect(await axeViolations(page)).toEqual([]);
    }
    // every control a phone watcher presses is a 48 px target: the chat tab's, then the players tab's
    const target = async (name: string, role: "button" | "tab" = "button") => {
      const box = await phone.getByRole(role, { name, exact: true }).first().boundingBox();
      expect(box?.height, name).toBeGreaterThanOrEqual(48);
      expect(box?.width, name).toBeGreaterThanOrEqual(48);
    };
    for (const name of ["Chat", "Players"]) await target(name, "tab");
    for (const name of ["Menu", "Say", "Start a new team"]) await target(name);
    await phone.getByRole("tab", { name: "Players" }).click();
    for (const name of ["Whole room", "Ana", "Bo", "Cy"]) await target(name);
    await closeAll([...players, di, phone]);
  });
});
