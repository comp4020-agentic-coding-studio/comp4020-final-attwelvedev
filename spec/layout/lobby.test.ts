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
  it("has no horizontal overflow and no axe violations, with people and spectators listed", async () => {
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
    await page.getByRole("button", { name: "Start a new team" }).waitFor();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(await axeViolations(page)).toEqual([]);
    await leaveAndClose(page);
  });
});

describe("typing another lobby's code into the address bar", () => {
  it("says there is no such lobby, and that counts as leaving the one you were in", async () => {
    const { page, code } = await createLobbyAs(browser, baseUrl, "Ana", DESKTOP);
    await page.goto(`${baseUrl}/lobby/ZZZX`, { waitUntil: "networkidle" });
    await page.getByText("No lobby ZZZX.").waitFor({ timeout: 5000 });
    expect(new URL(page.url()).pathname).toBe("/lobby/ZZZX");
    // they were alone in it, so it is gone: going back says so rather than seating them again
    await page.goto(`${baseUrl}/lobby/${code}`, { waitUntil: "networkidle" });
    await page
      .getByText(new RegExp(`No lobby ${code}|Lobby ${code} has closed`))
      .waitFor({ timeout: 5000 });
  });
});

describe("the lobby over the socket", () => {
  it("shows the second seat on the first page within 1 s of the join being accepted", async () => {
    const { page: first, code } = await createLobbyAs(browser, baseUrl, "Ana", DESKTOP);
    const second = await joinWithCode(browser, baseUrl, code, "Bo", PHONE);
    await second.getByText("Bo").first().waitFor(); // the server has accepted the join
    const started = Date.now();
    await first.locator(".player-row").filter({ hasText: "Bo" }).waitFor({ timeout: 1000 });
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

  it("lists everyone in the lobby, and offers Watch or Start a new team to a seventh joiner", async () => {
    const { page: host, code } = await createLobbyAs(browser, baseUrl, "Ana", DESKTOP);
    const crew = [];
    for (const name of ["Bo", "Cy", "Di", "Ed", "Flo"]) {
      crew.push(await joinWithCode(browser, baseUrl, code, name, PHONE));
    }
    for (const name of ["Bo", "Cy", "Di", "Ed", "Flo"]) {
      await host
        .locator(".player-row")
        .filter({ has: host.getByText(name, { exact: true }) })
        .waitFor({ timeout: 1500 });
    }
    expect(await host.locator(".player-row").count()).toBe(6);
    const seventh = await joinWithCode(browser, baseUrl, code, "Gus", PHONE);
    await seventh.getByRole("button", { name: "Watch" }).click();
    await host.getByText("Spectators: Gus").waitFor({ timeout: 1500 });
    for (const p of [host, seventh, ...crew]) await leaveAndClose(p);
  });

  it("takes someone back home when they leave", async () => {
    const { page, code } = await createLobbyAs(browser, baseUrl, "Ana", PHONE);
    expect(code).toMatch(/^[A-Z]{4}$/);
    await page.getByRole("button", { name: "Leave lobby" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Leave lobby" }).click();
    await page.waitForURL(`${baseUrl}/`);
    await leaveAndClose(page);
  });
});
