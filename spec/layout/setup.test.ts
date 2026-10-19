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
])("the lobby's setup form at %s width", (_name, viewport) => {
  it("has no horizontal overflow and no axe violations", async () => {
    const { page } = await createLobbyAs(browser, baseUrl, "Ana", viewport);
    await page.getByRole("heading", { name: "Your setup" }).waitFor();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(await axeViolations(page)).toEqual([]);
    await leaveAndClose(page);
  });

  it("is saved as it is answered, and a later lobby shows Set up with the same answers and no clicks", async () => {
    const first = await createLobbyAs(browser, baseUrl, "Ana", viewport);
    await first.page.getByLabel("In the same room as the others").check();
    await first.page.getByLabel("No headphones").check();
    await first.page.getByLabel("I have a sleep mask or blindfold").check();
    await first.page
      .getByRole("listitem")
      .filter({ hasText: "Ana" })
      .getByText("set up")
      .waitFor({ timeout: 1500 });

    // the same browser, a new lobby: nothing is clicked
    const context = first.page.context();
    await first.page.getByRole("button", { name: "Leave" }).click();
    await first.page.waitForURL((url) => url.pathname === "/");
    await first.page.getByRole("button", { name: "Start a new team" }).click();
    await first.page.waitForURL(/\/lobby\/[A-Z]{4}$/);
    await first.page
      .getByRole("listitem")
      .filter({ hasText: "Ana" })
      .getByText("set up")
      .waitFor({ timeout: 1500 });
    expect(await first.page.getByLabel("In the same room as the others").isChecked()).toBe(true);
    expect(await first.page.getByLabel("No headphones").isChecked()).toBe(true);
    expect(await first.page.getByLabel("I have a sleep mask or blindfold").isChecked()).toBe(true);
    expect(await first.page.getByLabel("I have earplugs").isChecked()).toBe(false);
    await context.close();
  });

  it("shows a person who never answered as not set up, and others see the answer when it is made", async () => {
    const { page: host, code } = await createLobbyAs(browser, baseUrl, "Ana", viewport);
    const guest = await joinWithCode(browser, baseUrl, code, "Bo", viewport);
    await guest.getByRole("heading", { name: "Your setup" }).waitFor();
    const boRow = host.getByRole("listitem").filter({ hasText: "Bo" });
    await boRow.waitFor();
    expect(await boRow.getByText("set up").count()).toBe(0);
    await guest.getByLabel("I have earplugs").check();
    await boRow.getByText("set up").waitFor({ timeout: 1000 });
    await leaveAndClose(host);
    await leaveAndClose(guest);
  });
});
