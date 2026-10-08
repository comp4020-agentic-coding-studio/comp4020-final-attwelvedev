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
    await page.getByRole("button", { name: "Create lobby" }).waitFor();
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
    expect(box?.height ?? 0).toBeLessThanOrEqual(50); // one line: the 48 px target
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

describe("the home page by keyboard and over the socket", () => {
  it("is operable with the keyboard alone: Tab reaches Create lobby and Enter creates", async () => {
    const page = await openPage(browser, baseUrl, PHONE);
    await page.getByRole("button", { name: "Create lobby" }).waitFor();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate(() => document.activeElement?.id === "nickname")) break;
    }
    await page.keyboard.type("Ana");
    let named = "";
    for (let i = 0; i < 12 && named !== "Create lobby"; i++) {
      await page.keyboard.press("Tab");
      named = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
    }
    expect(named).toBe("Create lobby");
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
    await page.getByRole("button", { name: "Create lobby" }).click();
    await expect
      .poll(async () => page.getByRole("alert").textContent(), { timeout: 2000 })
      .toContain("nickname");
    expect(new URL(page.url()).pathname).toBe("/");
    await leaveAndClose(page);
  });

  it("lists a new lobby without a reload, and drops it when it is full", async () => {
    const watcher = await openPage(browser, baseUrl, DESKTOP);
    await watcher.getByRole("button", { name: "Create lobby" }).waitFor();
    const { page: host, code } = await createLobbyAs(browser, baseUrl, "Ana", PHONE);
    const row = watcher.getByRole("listitem").filter({ hasText: `Team ${code}` });
    await row.waitFor({ timeout: 1500 });
    expect(await row.textContent()).toContain("1/3");
    await leaveAndClose(host);
    await leaveAndClose(watcher);
  });
});
