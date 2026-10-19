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
    await first.page.getByRole("group", { name: "Where" }).getByLabel("In the room").check();
    await first.page.getByRole("group", { name: "Headphones" }).getByLabel("No").check();
    await first.page.getByLabel("Sleep mask or blindfold").check();
    await first.page
      .locator(".player-row")
      .filter({ hasText: "Ana" })
      .getByText("Set up", { exact: true })
      .waitFor({ timeout: 1500 });

    // the same browser, a new lobby: nothing is clicked
    const context = first.page.context();
    await first.page.getByRole("button", { name: "Leave lobby", exact: true }).click();
    await first.page
      .getByRole("dialog")
      .getByRole("button", { name: "Leave lobby", exact: true })
      .click();
    await first.page.waitForURL((url) => url.pathname === "/");
    await first.page.getByRole("button", { name: "Start a new team" }).click();
    await first.page.waitForURL(/\/lobby\/[A-Z]{4}$/);
    await first.page
      .locator(".player-row")
      .filter({ hasText: "Ana" })
      .getByText("Set up", { exact: true })
      .waitFor({ timeout: 1500 });
    expect(
      await first.page.getByRole("group", { name: "Where" }).getByLabel("In the room").isChecked(),
    ).toBe(true);
    expect(
      await first.page.getByRole("group", { name: "Headphones" }).getByLabel("No").isChecked(),
    ).toBe(true);
    expect(await first.page.getByLabel("Sleep mask or blindfold").isChecked()).toBe(true);
    expect(await first.page.getByLabel("Earplugs or earmuffs").isChecked()).toBe(false);
    await context.close();
  });

  it("shows a person who never answered as not set up, and others see the answer when it is made", async () => {
    const { page: host, code } = await createLobbyAs(browser, baseUrl, "Ana", viewport);
    const guest = await joinWithCode(browser, baseUrl, code, "Bo", viewport);
    await guest.getByRole("heading", { name: "Your setup" }).waitFor();
    const boRow = host.locator(".player-row").filter({ hasText: "Bo" });
    await boRow.waitFor();
    expect(await boRow.getByText("Set up", { exact: true }).count()).toBe(0);
    await guest.getByLabel("Earplugs or earmuffs").check();
    await boRow.getByText("Set up", { exact: true }).waitFor({ timeout: 1000 });
    await leaveAndClose(host);
    await leaveAndClose(guest);
  });
});
