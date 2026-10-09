import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { axeViolations, DESKTOP, horizontalOverflow, launch, PHONE } from "../browser.ts";
import { createLobbyAs, leaveAndClose } from "../lobbyUi.ts";
import { canvasHash, playRoom } from "../playUi.ts";

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
])("the real-life wizard at %s width", (_name, viewport) => {
  it("has no horizontal overflow or axe violations once opened", async () => {
    const { page } = await createLobbyAs(browser, baseUrl, "Ana", viewport);
    await page.getByRole("button", { name: "Real-life setup" }).click();
    await page.getByText("Are you all playing in the same room?").waitFor();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(await axeViolations(page)).toEqual([]);
    await leaveAndClose(page);
  });

  it("each implication row shows a toggle with its sentence, and applies on request", async () => {
    const { page } = await createLobbyAs(browser, baseUrl, "Ana", viewport);
    await page.getByRole("button", { name: "Real-life setup" }).click();
    await page.getByRole("button", { name: "Yes, same room" }).click();
    await page.locator('input[name="deaf-headphones"][value="yes"]').check();
    await page.locator('input[name="others-headphones"][value="no"]').check();
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByText("Can't speak is on your honour").waitFor();
    const rows = page.locator(".wizard-rows li");
    expect(await rows.count()).toBe(3);
    for (let i = 0; i < 3; i++) {
      const row = rows.nth(i);
      expect(await row.locator('input[type="checkbox"]').count()).toBe(1);
      expect((await row.locator("p").textContent())?.length ?? 0).toBeGreaterThan(0);
    }
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(await axeViolations(page)).toEqual([]);

    await page.getByRole("button", { name: "Use these settings" }).click();
    await page.getByRole("button", { name: "Real-life setup" }).waitFor();
    await leaveAndClose(page);
  });

  it("is keyboard-operable end to end", async () => {
    const { page } = await createLobbyAs(browser, baseUrl, "Ana", viewport);
    const toggle = page.getByRole("button", { name: "Real-life setup" });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await page.getByText("Are you all playing in the same room?").waitFor();
    await page.getByRole("button", { name: "No, remote" }).focus();
    await page.keyboard.press("Enter");
    // remote: no honour line (nobody is at a shared table to keep quiet)
    await page.getByRole("button", { name: "Use these settings" }).waitFor();
    expect(await page.getByText("Can't speak is on your honour").count()).toBe(0);
    await page.getByRole("button", { name: "Use these settings" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Real-life setup" }).waitFor();
    await leaveAndClose(page);
  });

  it("shows the quiet-table caution only when masking noise isn't playing", async () => {
    const { page } = await createLobbyAs(browser, baseUrl, "Ana", viewport);
    await page.getByRole("button", { name: "Real-life setup" }).click();
    await page.getByRole("button", { name: "Yes, same room" }).click();
    await page.locator('input[name="deaf-headphones"][value="no"]').check();
    await page.locator('input[name="others-headphones"][value="yes"]').check();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText("Can't speak is on your honour").waitFor();
    await page.getByText(/keep the table quiet/i).waitFor();
    await leaveAndClose(page);
  });

  it("offers only in-app voice for a remote team, worded for remote", async () => {
    const { page } = await createLobbyAs(browser, baseUrl, "Ana", viewport);
    await page.getByRole("button", { name: "Real-life setup" }).click();
    await page.getByRole("button", { name: "No, remote" }).click();
    await page.getByRole("button", { name: "Use these settings" }).waitFor();
    const rows = page.locator(".wizard-rows li");
    expect(await rows.count()).toBe(1);
    expect(await rows.textContent()).toMatch(/in-app voice/i);
    expect(await page.getByText(/talks in person/i).count()).toBe(0);
    await page.locator(".wizard-rows input[type=checkbox]").uncheck();
    await page.getByText(/another way to talk/i).waitFor();
    await leaveAndClose(page);
  });

  it("keeps progress when closed with its own button, but not with Start over", async () => {
    const { page } = await createLobbyAs(browser, baseUrl, "Ana", viewport);
    await page.getByRole("button", { name: "Real-life setup" }).click();
    await page.getByRole("button", { name: "Yes, same room" }).click();
    await page.locator('input[name="deaf-headphones"][value="yes"]').check();
    await page.locator('input[name="others-headphones"][value="yes"]').check();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText("Can't speak is on your honour").waitFor();

    await page.getByRole("button", { name: "Close real-life setup" }).click();
    await page.getByRole("button", { name: "Real-life setup" }).click();
    await page.getByText("Can't speak is on your honour").waitFor(); // still on review, not back to the first question

    await page.getByRole("button", { name: "Start over" }).click();
    await page.getByText("Are you all playing in the same room?").waitFor();
    await leaveAndClose(page);
  });
});

describe("high contrast", () => {
  it("passes axe contrast checks in the HUD chrome, at both viewports", async () => {
    const table = await playRoom(browser, baseUrl);
    for (const page of [table.byRole.blind, table.byRole.deaf, table.byRole.mute]) {
      await page.getByRole("button", { name: "Settings" }).click();
      await page.getByLabel("High contrast").check();
      await page.getByRole("button", { name: "Settings" }).click(); // close the panel
    }
    await canvasHash(table.byRole.blind); // let one frame draw with the new palette
    for (const page of [table.byRole.blind, table.byRole.deaf, table.byRole.mute]) {
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      expect(await axeViolations(page)).toEqual([]);
    }
    for (const page of table.pages) await page.context().close();
  });
});
