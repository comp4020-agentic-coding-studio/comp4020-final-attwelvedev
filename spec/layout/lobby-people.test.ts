import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { axeViolations, DESKTOP, horizontalOverflow, launch, openPage, PHONE } from "../browser.ts";
import { createLobbyAs, joinWithCode, leaveAndClose, leaveGameAndClose } from "../lobbyUi.ts";

const baseUrl = inject("baseUrl");
let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser.close();
});

const row = (page: Page, name: string) =>
  page.locator(".player-row").filter({ has: page.getByText(name, { exact: true }) });

async function lobbyOf(names: string[], viewport = DESKTOP) {
  const [first, ...rest] = names;
  const host = await createLobbyAs(browser, baseUrl, first as string, viewport);
  const guests: Page[] = [];
  for (const name of rest)
    guests.push(await joinWithCode(browser, baseUrl, host.code, name, viewport));
  for (const name of rest) await row(host.page, name).waitFor({ timeout: 3000 });
  return { host: host.page, guests, code: host.code };
}
const closeAll = async (...pages: Page[]) => {
  for (const page of pages) await leaveAndClose(page);
};

describe("the lobby's people", () => {
  it("a guest edits their nickname and the host sees it within 1 s", async () => {
    const { host, guests } = await lobbyOf(["Ana", "Bo"]);
    const guest = guests[0] as Page;
    await row(guest, "Bo").getByRole("button", { name: "Edit" }).click();
    const field = guest.getByLabel("Your nickname");
    await field.fill("Robin");
    await field.press("Enter");
    await row(host, "Robin").waitFor({ timeout: 1000 });
    expect(await row(host, "Bo").count()).toBe(0);
    await closeAll(host, guest);
  });

  it("the host's private toggle hides the lobby from a watcher's open list", async () => {
    const { host, guests, code } = await lobbyOf(["Ana"]);
    const watcher = await openPage(browser, baseUrl, DESKTOP);
    const name = await host.getByLabel("Team name").inputValue();
    // Other spec files add and drop lobbies on this server, and the list shows four teams until
    // "Show all": so wait for this lobby's own row, opening the list when it is cut off, and never
    // for "some Join button" or a count read earlier.
    const listed = () =>
      watcher.evaluate(async (team) => {
        const more = [
          ...document.querySelectorAll<HTMLButtonElement>("#open-list ~ .list-more"),
        ].find((b) => /^Show all/.test(b.textContent ?? ""));
        more?.click();
        await new Promise((r) => setTimeout(r, 50));
        return [...document.querySelectorAll("#open-list .team")].some(
          (el) => el.textContent === team,
        );
      }, name);
    await expect.poll(listed, { timeout: 5000 }).toBe(true);
    await host.getByRole("switch", { name: "Private" }).click();
    await host.getByText("Hidden from open lobbies. Only people with the code can join.").waitFor();
    await expect.poll(listed, { timeout: 5000 }).toBe(false);
    // its code still joins
    const guest = await joinWithCode(browser, baseUrl, code, "Bo", DESKTOP);
    await row(host, "Bo").waitFor({ timeout: 3000 });
    await closeAll(host, guest, watcher, ...guests);
  });

  it("the host reorders people by keyboard (Move up) and the rotation table follows", async () => {
    const { host, guests } = await lobbyOf(["Ana", "Bo", "Cy", "Di", "Ed"]);
    const names = () => host.locator(".player-row .nick").allTextContents();
    expect((await names()).map((n) => n.replace(/\s*\(.*$/, ""))).toEqual([
      "Ana",
      "Bo",
      "Cy",
      "Di",
      "Ed",
    ]);
    const firstRoom = () => host.locator(".rotation li").first().innerText();
    expect(await firstRoom()).toContain("Ana");
    const move = host.getByRole("button", { name: "Move Ed up" });
    await move.focus();
    // each press is answered by the server before the next: it sends the order the page last saw
    for (let place = 3; place >= 0; place--) {
      await host.keyboard.press("Enter");
      await expect.poll(async () => (await names())[place]).toContain("Ed");
    }
    // Ed is first now, so the first room's crew starts with Ed and Ana is no longer in it
    await expect.poll(async () => (await names())[0]).toContain("Ed");
    await expect.poll(firstRoom).toContain("Ed");
    expect(await firstRoom()).not.toContain("Di sits out");
    await closeAll(host, ...guests);
  });

  it("a person's setup choices show as chips in everyone's lobby and their row says Set up", async () => {
    const { host, guests } = await lobbyOf(["Ana", "Bo"]);
    const guest = guests[0] as Page;
    expect(await row(host, "Bo").getByText("Setting up").count()).toBe(1);
    await guest.getByRole("group", { name: "Where" }).getByLabel("In the room").check();
    await guest.getByRole("group", { name: "Headphones" }).getByLabel("Yes").check();
    await guest.getByLabel("Sleep mask or blindfold").check();
    const bo = row(host, "Bo");
    await bo.getByText("Set up", { exact: true }).waitFor({ timeout: 1000 });
    const chips = await bo.locator(".chips").innerText();
    expect(chips).toContain("headphones");
    expect(chips).not.toContain("in room"); // alone in the room: nothing to share it with
    expect(chips).toContain("mask");
    await closeAll(host, guest);
  });

  it("with five people the rotation table shows who sits out each room and plays N", async () => {
    const { host, guests } = await lobbyOf(["Ana", "Bo", "Cy", "Di", "Ed"]);
    const rooms = host.locator(".rotation li");
    expect(await rooms.count()).toBeGreaterThanOrEqual(3);
    for (const text of await rooms.allInnerTexts()) expect(text).toMatch(/sit(s)? out/i);
    expect(await host.locator(".player-row .plays").count()).toBe(5);
    expect(await row(host, "Ana").locator(".plays").innerText()).toMatch(/^plays \d$/);
    await closeAll(host, ...guests);
  });

  it("clicking Home in a lobby asks before leaving; Stay keeps you in, Leave takes you home and out of the lobby", async () => {
    const { host, guests, code } = await lobbyOf(["Ana", "Bo"]);
    const guest = guests[0] as Page;
    await guest.getByRole("link", { name: "Sensory heist" }).click();
    const dialog = guest.getByRole("dialog", { name: "Leave the lobby?" });
    await dialog.getByText("You'll lose your spot.").waitFor();
    await dialog.getByRole("button", { name: "Stay" }).click();
    expect(await dialog.count()).toBe(0);
    expect(new URL(guest.url()).pathname).toBe(`/lobby/${code}`);
    expect(await row(host, "Bo").count()).toBe(1);

    await guest.getByRole("link", { name: "Sensory heist" }).click();
    await guest
      .getByRole("dialog")
      .getByRole("button", { name: "Leave lobby", exact: true })
      .click();
    await guest.waitForURL((url) => url.pathname === "/");
    await expect.poll(() => row(host, "Bo").count()).toBe(0);
    await closeAll(host, guest);
  });
});

describe.each([
  ["phone", PHONE],
  ["desktop", DESKTOP],
])("a full lobby at %s width", (name, viewport) => {
  it("has no overflow and no axe violations with six people, long nicknames and the setup form", async () => {
    const long = [
      "Ana the Magnif",
      "Bo the Brave 12",
      "Cy Cy Cy Cy Cy",
      "Dee Dee Dee Dee",
      "Eli Eli Eli Eli",
    ];
    const { host, guests } = await lobbyOf(
      ["Ana the Magnif", ...long.slice(1), "Fay Fay Fay Fay"],
      viewport,
    );
    await host.getByRole("heading", { name: "Your setup" }).waitFor();
    expect(await horizontalOverflow(host)).toBeLessThanOrEqual(0);
    expect(await axeViolations(host)).toEqual([]);
    const last = guests[guests.length - 1] as Page;
    expect(await horizontalOverflow(last)).toBeLessThanOrEqual(0);
    expect(await axeViolations(last)).toEqual([]);
    await closeAll(host, ...guests);
  });

  it.runIf(name === "phone")("every control is at least 48 px tall and wide", async () => {
    const { host, guests } = await lobbyOf(["Ana", "Bo", "Cy"], viewport);
    await host.getByRole("heading", { name: "Your setup" }).waitFor();
    const small = await host.evaluate(() => {
      const hit = (el: Element) => {
        const target = el.matches("input[type=checkbox], input[type=radio]")
          ? (el.closest("label") ?? el)
          : el;
        const r = target.getBoundingClientRect();
        return r.width < 48 - 0.5 || r.height < 48 - 0.5
          ? `${el.tagName} ${el.textContent?.trim().slice(0, 20) ?? ""} ${Math.round(r.width)}x${Math.round(r.height)}`
          : null;
      };
      const controls = [
        ...document.querySelectorAll("main button, main a[href], main input, main [role=switch]"),
      ];
      return controls
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .flatMap((el) => hit(el) ?? []);
    });
    expect(small).toEqual([]);
    await closeAll(host, ...guests);
  });
});

describe("preferences", () => {
  it("answers saved on /preferences prefill Your setup in the next lobby, and a change in the lobby shows on /preferences", async () => {
    const page = await openPage(browser, `${baseUrl}/preferences`, DESKTOP);
    await page.getByRole("group", { name: "Where" }).getByLabel("In the room").check();
    await page.getByLabel("Earplugs or earmuffs").check();
    await page
      .getByRole("status")
      .filter({ hasText: /^Saved/ })
      .waitFor();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByLabel("Nickname").fill("Ana");
    await page.getByRole("button", { name: "Start a new team" }).click();
    await page.waitForURL(/\/lobby\/[A-Z]{4}$/);
    await row(page, "Ana").getByText("Set up", { exact: true }).waitFor({ timeout: 1500 });
    expect(
      await page.getByRole("group", { name: "Where" }).getByLabel("In the room").isChecked(),
    ).toBe(true);
    expect(await page.getByLabel("Earplugs or earmuffs").isChecked()).toBe(true);

    await page.getByLabel("Always show captions").check();
    await leaveAndClose(page); // this one made a lobby: closing the tab would only hold its seat
  });

  it("the Preferences sheet edits setup inside the lobby, and the others see it", async () => {
    const { host, guests } = await lobbyOf(["Ana", "Bo"]);
    const guest = guests[0] as Page;
    await guest.getByRole("button", { name: "Preferences" }).click();
    const sheet = guest.getByRole("dialog", { name: "Preferences" });
    await sheet.getByRole("group", { name: "Headphones" }).getByLabel("No").check();
    await sheet.getByLabel("Sleep mask or blindfold").check();
    await row(host, "Bo").getByText("Set up", { exact: true }).waitFor({ timeout: 1000 });
    expect(await row(host, "Bo").locator(".chips").innerText()).toContain("mask");
    await sheet.getByRole("button", { name: "Done" }).click();
    expect(await sheet.count()).toBe(0);
    expect(new URL(guest.url()).pathname).toMatch(/^\/lobby\//);
    await closeAll(host, guest);
  });

  it("clicking outside the Preferences sheet closes it, and clicking inside does not", async () => {
    const { host, guests } = await lobbyOf(["Ana", "Bo"]);
    const guest = guests[0] as Page;
    await guest.getByRole("button", { name: "Preferences" }).click();
    const sheet = guest.getByRole("dialog", { name: "Preferences" });
    await sheet.getByRole("heading", { name: "Playing" }).click();
    expect(await sheet.count()).toBe(1);
    await guest.mouse.click(2, 2);
    await sheet.waitFor({ state: "detached" });
    await closeAll(host, guest);
  });

  it("a host who starts while a guest has the sheet open loses nothing: the answer made is kept", async () => {
    const { host, guests } = await lobbyOf(["Ana", "Bo"]);
    const guest = guests[0] as Page;
    await guest.getByRole("button", { name: "Preferences" }).click();
    const sheet = guest.getByRole("dialog", { name: "Preferences" });
    await sheet.getByLabel("Earplugs or earmuffs").check();
    await host.getByRole("button", { name: /^Start/ }).click();
    await guest
      .getByRole("button", { name: "I'm ready" })
      .or(guest.getByRole("button", { name: "Ready" }))
      .waitFor({ timeout: 4000 });
    expect(
      await guest.evaluate(() => JSON.parse(localStorage.getItem("heist.setup") ?? "{}").earplugs),
    ).toBe(true);
    await leaveGameAndClose(host, baseUrl);
    await leaveGameAndClose(guest, baseUrl);
  });

  it("'in room' shows only when someone else in the lobby is in the room too", async () => {
    const { host, guests } = await lobbyOf(["Ana", "Bo"]);
    const guest = guests[0] as Page;
    const room = (page: Page) =>
      page.getByRole("group", { name: "Where" }).getByLabel("In the room");
    await room(host).check();
    await row(host, "Ana").getByText("Set up", { exact: true }).waitFor({ timeout: 1000 });
    expect(await row(host, "Ana").locator(".chips").innerText()).not.toContain("in room");
    await room(guest).check();
    await expect.poll(() => row(host, "Ana").locator(".chips").innerText()).toContain("in room");
    await closeAll(host, guest);
  });

  it("the rotation table says roles are revealed before each room, and shows none", async () => {
    const { host, guests } = await lobbyOf(["Ana", "Bo", "Cy", "Di"]);
    await host.getByText("Your roles are revealed before each room.").waitFor();
    expect(await host.locator(".rotation svg").count()).toBe(0);
    await closeAll(host, ...guests);
  });

  it.each([
    ["phone", PHONE],
    ["desktop", DESKTOP],
  ])("/preferences has no overflow or axe violations at %s width", async (_name, viewport) => {
    const page = await openPage(browser, `${baseUrl}/preferences`, viewport);
    await page.getByRole("heading", { name: "Preferences" }).waitFor();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(await axeViolations(page)).toEqual([]);
    await page.context().close();
  });

  it("works by keyboard alone", async () => {
    const page = await openPage(browser, `${baseUrl}/preferences`, DESKTOP);
    await page.getByLabel("Nickname").focus();
    await page.keyboard.type("Keys");
    const earplugs = page.getByLabel("Earplugs or earmuffs");
    for (
      let i = 0;
      i < 40 && !(await earplugs.evaluate((el) => el === document.activeElement));
      i++
    ) {
      await page.keyboard.press("Tab");
    }
    await page.keyboard.press("Space");
    expect(await earplugs.isChecked()).toBe(true);
    await page.reload({ waitUntil: "networkidle" });
    expect(await page.getByLabel("Nickname").inputValue()).toContain("Keys");
    expect(await page.getByLabel("Earplugs or earmuffs").isChecked()).toBe(true);
    await page.context().close();
  });

  it("the home page links to /preferences", async () => {
    const page = await openPage(browser, baseUrl, DESKTOP);
    await page.getByRole("link", { name: "Preferences" }).click();
    await page.waitForURL(/\/preferences$/);
    await page.context().close();
  });
});
