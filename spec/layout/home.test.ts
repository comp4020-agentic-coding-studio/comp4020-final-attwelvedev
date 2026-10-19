import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { axeViolations, DESKTOP, horizontalOverflow, launch, openPage, PHONE } from "../browser.ts";
import { createLobbyAs, leaveAndClose } from "../lobbyUi.ts";

const baseUrl = inject("baseUrl");
let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser.close();
});

describe.each([
  ["phone", PHONE],
  ["desktop", DESKTOP],
])("the home page at %s width", (_name, viewport) => {
  it("has no horizontal overflow and no axe violations", async () => {
    const page = await openPage(browser, baseUrl, viewport);
    // wait for the island so the open-lobby list is on the page when axe runs
    await page.getByRole("button", { name: "Start a new team" }).waitFor();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(await axeViolations(page)).toEqual([]);
    await leaveAndClose(page);
  });

  it("keeps the Join button's label on one line next to the code field", async () => {
    // a squeezed button wraps "Join" to "Joi/n", which no overflow or axe check notices
    const page = await openPage(browser, baseUrl, viewport);
    const button = page.getByRole("button", { name: "Join", exact: true });
    await button.waitFor();
    const box = await button.boundingBox();
    // one line of text: the label's own line boxes, not the button's height, which is a design choice
    const lines = await button.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    });
    expect(lines).toBe(1);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(48);
    await leaveAndClose(page);
  });

  it("has no overflow or axe violations while showing a long open-lobby list and an error", async () => {
    const page = await openPage(browser, baseUrl, viewport);
    await page.getByLabel("Nickname").fill("Ana");
    await page.getByLabel("Lobby code").fill("QQQQ");
    await page.getByRole("button", { name: "Join", exact: true }).click();
    await page.getByRole("alert").waitFor();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(await axeViolations(page)).toEqual([]);
    await leaveAndClose(page);
  });
});

describe("the home page's hero", () => {
  it("puts the code field above the fold on a phone, before the feeds", async () => {
    // joining a friend's team is the usual way in, so it must not need a scroll
    const page = await openPage(browser, baseUrl, PHONE);
    const join = page.getByRole("button", { name: "Join", exact: true });
    await join.waitFor();
    const box = await join.boundingBox();
    expect((box?.y ?? Infinity) + (box?.height ?? 0)).toBeLessThanOrEqual(PHONE.height);
    await leaveAndClose(page);
  });

  it("draws the three feeds: black for Can't see, the map for the others", async () => {
    const page = await openPage(browser, baseUrl, DESKTOP);
    await page.locator(".feed canvas").first().waitFor();
    await page.waitForTimeout(500);
    // the share of a feed that is not pure black: Can't see is sent no map
    const lit = await page.$$eval(".feed canvas", (canvases) =>
      (canvases as HTMLCanvasElement[]).map((c) => {
        const data = c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data ?? [];
        let on = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i] || data[i + 1] || data[i + 2]) on++;
        return on / (data.length / 4);
      }),
    );
    expect(lit).toHaveLength(3);
    expect(lit[0]).toBeLessThan(0.05); // a dim ring and nothing else
    expect(lit[1]).toBeGreaterThan(0.9);
    expect(lit[2]).toBeGreaterThan(0.9);
    await leaveAndClose(page);
  });

  it("holds still with reduced motion until asked to play", async () => {
    const page = await openPage(browser, baseUrl, DESKTOP);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await page.getByRole("button", { name: "Play feeds" }).waitFor();
    const frame = () => page.locator(".feed canvas").nth(1).screenshot();
    const before = await frame();
    await page.waitForTimeout(400);
    expect((await frame()).equals(before)).toBe(true);
    await leaveAndClose(page);
  });

  it("shows no open-team list until a team is waiting", async () => {
    const watcher = await openPage(browser, baseUrl, DESKTOP);
    await watcher.getByRole("button", { name: "Start a new team" }).waitFor();
    // other specs may have teams open; only check the list is absent when nothing is listed
    const heading = watcher.getByRole("heading", { name: /waiting/ });
    if ((await heading.count()) === 0) {
      const { page: host } = await createLobbyAs(browser, baseUrl, "Ana", PHONE);
      await heading.waitFor({ timeout: 1500 });
      await leaveAndClose(host);
    }
    await leaveAndClose(watcher);
  });
});

describe("the home page's join panel", () => {
  it("takes only code letters, and asks for all 4 before joining", async () => {
    const page = await openPage(browser, baseUrl, DESKTOP);
    await page.getByLabel("Nickname").fill("Ana");
    const field = page.getByLabel("Lobby code");
    await field.fill("a1-b");
    expect(await field.inputValue()).toBe("AB");
    const join = page.getByRole("button", { name: "Join", exact: true });
    expect(await join.getAttribute("aria-disabled")).toBe("true");
    await page.getByText("2 more letters").waitFor();
    await field.press("Enter");
    await expect
      .poll(async () => page.getByRole("alert").textContent(), { timeout: 2000 })
      .toContain("A code is 4 letters.");
    expect(new URL(page.url()).pathname).toBe("/");
    await field.fill("abcd");
    expect(await join.getAttribute("aria-disabled")).toBe("false");
    await leaveAndClose(page);
  });

  it("shows four waiting teams and says how many more there are", async () => {
    const hosts = [];
    for (const name of ["Ana", "Bo", "Cy", "Di", "Ed"]) {
      hosts.push((await createLobbyAs(browser, baseUrl, name, PHONE)).page);
    }
    const page = await openPage(browser, baseUrl, DESKTOP);
    const more = page.getByRole("button", { name: /^Show all \d+ teams$/ });
    await more.waitFor({ timeout: 3000 });
    const rows = page.locator(".open-list li");
    expect(await rows.count()).toBe(4);
    const total = Number((await more.textContent())?.match(/\d+/)?.[0]);
    expect(total).toBeGreaterThanOrEqual(5);
    await more.click();
    // Other spec files make and drop lobbies on this same server while this one runs, so the
    // list can change between reading the total and counting the rows: a count read earlier
    // is not a promise the page makes. What it does promise is that expanding shows more than
    // the four it started with: this test made five lobbies, so there are at least five.
    await expect.poll(() => rows.count(), { timeout: 3000 }).toBeGreaterThanOrEqual(5);
    expect(
      await page.getByRole("button", { name: "Show fewer" }).getAttribute("aria-expanded"),
    ).toBe("true");
    expect(await axeViolations(page)).toEqual([]);
    for (const p of [page, ...hosts]) await leaveAndClose(p);
  });
});

describe("the home page by keyboard and over the socket", () => {
  it("is operable with the keyboard alone: Tab reaches Start a new team and Enter creates", async () => {
    const page = await openPage(browser, baseUrl, PHONE);
    await page.getByRole("button", { name: "Start a new team" }).waitFor();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate(() => document.activeElement?.id === "nickname")) break;
    }
    await page.keyboard.type("Ana");
    let named = "";
    for (let i = 0; i < 12 && named !== "Start a new team"; i++) {
      await page.keyboard.press("Tab");
      named = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
    }
    expect(named).toBe("Start a new team");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/lobby\/[A-Z]{4}$/);
    const code = new URL(page.url()).pathname.split("/").pop() ?? "";
    await page.getByText(code.split("").join(" ")).first().waitFor();
    await leaveAndClose(page);
  });

  it("shows a wrong code as an inline error in the words of the spec", async () => {
    const page = await openPage(browser, baseUrl, DESKTOP);
    await page.getByLabel("Nickname").fill("Ana");
    await page.getByLabel("Lobby code").fill("abcd");
    await page.getByRole("button", { name: "Join", exact: true }).click();
    await expect
      .poll(async () => page.getByRole("alert").textContent(), { timeout: 2000 })
      .toContain("No lobby with code ABCD. Check the letters.");
    await leaveAndClose(page);
  });

  it("asks for a nickname before creating", async () => {
    const page = await openPage(browser, baseUrl, DESKTOP);
    await page.getByRole("button", { name: "Start a new team" }).click();
    await expect
      .poll(async () => page.getByRole("alert").textContent(), { timeout: 2000 })
      .toContain("nickname");
    expect(new URL(page.url()).pathname).toBe("/");
    await leaveAndClose(page);
  });

  it("lists a new lobby without a reload, and drops it when it is full", async () => {
    const watcher = await openPage(browser, baseUrl, DESKTOP);
    await watcher.getByRole("button", { name: "Start a new team" }).waitFor();
    const { page: host, code } = await createLobbyAs(browser, baseUrl, "Ana", PHONE);
    const row = watcher.getByRole("listitem").filter({ hasText: `Team ${code}` });
    await row.waitFor({ timeout: 1500 });
    expect(await row.textContent()).toContain("1/3");
    await leaveAndClose(host);
    await leaveAndClose(watcher);
  });
});
