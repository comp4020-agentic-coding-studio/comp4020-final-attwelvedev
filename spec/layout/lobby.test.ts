import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { axeViolations, DESKTOP, horizontalOverflow, launch, PHONE } from "../browser.ts";
import { createLobbyAs, joinWithCode, leaveAndClose } from "../lobbyUi.ts";

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
])("the lobby page at %s width", (_name, viewport) => {
  it("has no horizontal overflow and no axe violations, with seats and spectators filled", async () => {
    const { page, code } = await createLobbyAs(browser, baseUrl, "Ana the Magnificent", viewport);
    const other = await joinWithCode(browser, baseUrl, code, "Bo", viewport);
    await page.getByText("Bo").first().waitFor();
    await page.getByRole("button", { name: "Show QR" }).click();
    await page.getByRole("img", { name: /QR code/ }).waitFor();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(await axeViolations(page)).toEqual([]);
    expect(await horizontalOverflow(other)).toBeLessThanOrEqual(0);
    expect(await axeViolations(other)).toEqual([]);
    await leaveAndClose(page);
    await leaveAndClose(other);
  });

  it("fits the widest possible code (W is the widest letter) without overflow", async () => {
    // codes are random, so a layout that only fits narrow letters fails now and then
    const { page } = await createLobbyAs(browser, baseUrl, "Ana", viewport);
    await page.locator(".code span[aria-hidden]").evaluateAll((spans) => {
      for (const span of spans) span.textContent = "W";
    });
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    // the letters must sit inside their own box, not spill past it
    const spill = await page.locator(".code").evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(spill).toBeLessThanOrEqual(0);
    await leaveAndClose(page);
  });

  it("shows the not-found state with a next action", async () => {
    const page = await (await import("../browser.ts")).openPage(
      browser,
      `${baseUrl}/lobby/ZZZY`,
      viewport,
    );
    await page.getByLabel("Nickname").fill("Ana");
    await page.getByRole("button", { name: "Join lobby" }).click();
    await page.getByText("No lobby ZZZY.").waitFor();
    await page.getByRole("link", { name: "Try another code" }).waitFor();
    await page.getByRole("button", { name: "Create lobby" }).waitFor();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(await axeViolations(page)).toEqual([]);
    await leaveAndClose(page);
  });
});

describe("typing another lobby's code into the address bar", () => {
  it("says there is no such lobby, rather than silently taking you back to your own", async () => {
    const { page, code } = await createLobbyAs(browser, baseUrl, "Ana", DESKTOP);
    await page.goto(`${baseUrl}/lobby/ZZZX`, { waitUntil: "networkidle" });
    await page.getByText("No lobby ZZZX.").waitFor({ timeout: 5000 });
    expect(new URL(page.url()).pathname).toBe("/lobby/ZZZX");
    // and nothing happened to the lobby they are in: it is still theirs to go back to
    await page.goto(`${baseUrl}/lobby/${code}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Seats" }).waitFor();
    await leaveAndClose(page);
  });
});

describe("the lobby over the socket", () => {
  it("shows the second seat on the first page within 1 s of the join being accepted", async () => {
    const { page: first, code } = await createLobbyAs(browser, baseUrl, "Ana", DESKTOP);
    const second = await joinWithCode(browser, baseUrl, code, "Bo", PHONE);
    await second.getByText("Bo").first().waitFor(); // the server has accepted the join
    const started = Date.now();
    await first.getByRole("listitem").filter({ hasText: "Bo" }).waitFor({ timeout: 1000 });
    expect(Date.now() - started).toBeLessThanOrEqual(1000);
    await leaveAndClose(first);
    await leaveAndClose(second);
  });

  it("lets the host rename the team and shows it to the others", async () => {
    const { page: host, code } = await createLobbyAs(browser, baseUrl, "Ana", DESKTOP);
    const other = await joinWithCode(browser, baseUrl, code, "Bo", DESKTOP);
    await host.getByLabel("Team name").fill("Night Owls");
    await host.getByLabel("Team name").press("Enter");
    await other.getByText("Night Owls").first().waitFor({ timeout: 1500 });
    await leaveAndClose(host);
    await leaveAndClose(other);
  });

  it("offers Watch or Start a new team to a fourth joiner", async () => {
    const { page: host, code } = await createLobbyAs(browser, baseUrl, "Ana", DESKTOP);
    const crew = [
      await joinWithCode(browser, baseUrl, code, "Bo", PHONE),
      await joinWithCode(browser, baseUrl, code, "Cy", PHONE),
    ];
    const fourth = await joinWithCode(browser, baseUrl, code, "Di", PHONE);
    await fourth.getByRole("button", { name: "Watch" }).click();
    await host.getByText("Spectators: Di").waitFor({ timeout: 1500 });
    for (const p of [host, fourth, ...crew]) await leaveAndClose(p);
  });

  it("takes someone back home when they leave", async () => {
    const { page, code } = await createLobbyAs(browser, baseUrl, "Ana", PHONE);
    expect(code).toMatch(/^[A-Z]{4}$/);
    await page.getByRole("button", { name: "Leave" }).click();
    await page.waitForURL(`${baseUrl}/`);
    await leaveAndClose(page);
  });
});
