import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { axeViolations, DESKTOP, horizontalOverflow, launch } from "../browser.ts";
import { joinAsWatcher, lobbyCodeOf } from "../lobbyUi.ts";
import { playRoom, settledHash, type Table } from "../playUi.ts";

const baseUrl = inject("baseUrl");
let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser.close();
});

const closeAll = async (pages: Page[]) => {
  for (const page of pages) await page.context().close();
};

// The menu holds the vote proposals; each asks twice.
async function proposeFrom(page: Page, what: "room" | "heist" = "room") {
  await page.getByRole("button", { name: "Menu" }).click();
  const label = what === "room" ? "Restart room" : "Restart heist";
  await page.getByRole("button", { name: label, exact: true }).click();
  await page
    .getByRole("button", { name: `Sure? Ask to ${label.toLowerCase()}`, exact: true })
    .click();
}
const card = (page: Page) => page.getByRole("alertdialog").filter({ hasText: /wants to restart/ });

describe("the top bar", () => {
  it("lists every crew member with their role shape and name, and how many are watching", async () => {
    const table = await playRoom(browser, baseUrl);
    const { blind: ana, deaf: bo, mute: cy } = table.byRole;
    for (const page of table.pages) {
      const chips = page.locator(".hud-top .hud-crew li");
      expect(await chips.count()).toBe(3);
      expect(await page.locator(".hud-top .hud-crew li svg").count()).toBe(3);
      const text = await page.locator(".hud-top .hud-crew").innerText();
      for (const name of ["Ana", "Bo", "Cy"]) expect(text).toContain(name);
      expect(await page.locator(".hud-top .hud-crew li.you").count()).toBe(1);
      expect(await page.getByRole("button", { name: /watching/ }).count()).toBe(0);
    }
    // each page says who "you" is, in words
    expect(await ana.locator(".hud-crew li.you").innerText()).toMatch(/Ana\s+you/);
    expect(await bo.locator(".hud-crew li.you").innerText()).toMatch(/Bo\s+you/);
    expect(await cy.locator(".hud-crew li.you").innerText()).toMatch(/Cy\s+you/);

    const wes = await joinAsWatcher(browser, baseUrl, lobbyCodeOf(ana), "Wes", DESKTOP);
    for (const page of table.pages) {
      const watching = page.getByRole("button", { name: /1 watching/ });
      await watching.waitFor({ timeout: 3000 });
      await watching.click();
      expect(await page.getByRole("list", { name: "Watching" }).innerText()).toContain("Wes");
      // The list closes on Escape once the page has attached its key listener, a frame after the
      // list draws: a key pressed inside that frame is lost. Press until the list goes.
      await expect
        .poll(
          async () => {
            await page.keyboard.press("Escape");
            return page.getByRole("list", { name: "Watching" }).count();
          },
          { timeout: 3000 },
        )
        .toBe(0);
    }
    await closeAll([...table.pages, wes]);
  });

  it("shows the loot and the clock, and says Live", async () => {
    const table = await playRoom(browser, baseUrl);
    for (const page of table.pages) {
      expect(await page.locator(".hud-top .hud-clock").innerText()).toMatch(/^\d+:\d\d$/);
      expect(await page.locator(".hud-top .hud-loot").innerText()).toMatch(/^◆\s*\d+$/);
      expect(await page.locator(".hud-top .conn").innerText()).toContain("Live");
    }
    await closeAll(table.pages);
  });

  it("pulses the live light once a second, and holds it still under reduced motion", async () => {
    const table = await playRoom(browser, baseUrl);
    const page = table.byRole.blind;
    const dot = page.locator(".hud-top .conn-dot");
    await dot.waitFor();
    const style = () =>
      dot.evaluate((el) => {
        const s = getComputedStyle(el);
        return { name: s.animationName, duration: s.animationDuration };
      });
    expect((await style()).name).not.toBe("none");
    expect((await style()).duration).toBe("1s");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect((await style()).name).toBe("none");
    await closeAll(table.pages);
  });

  it("keeps the menu a 48 px target on a phone, and opens settings from it", async () => {
    const table = await playRoom(browser, baseUrl);
    const box = await table.phone.getByRole("button", { name: "Menu" }).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(48);
    expect(box?.height).toBeGreaterThanOrEqual(48);
    await table.phone.getByRole("button", { name: "Menu" }).click();
    await table.phone.getByRole("button", { name: "Settings" }).click();
    await table.phone.getByLabel("High contrast").waitFor();
    await table.phone.keyboard.press("Escape");
    expect(await table.phone.getByRole("button", { name: "Restart room" }).count()).toBe(0);
    await closeAll(table.pages);
  });
});

describe("restart votes", () => {
  const move = async (page: Page) => {
    await page.keyboard.down("d");
    await page.waitForTimeout(700);
    await page.keyboard.up("d");
  };

  it("any player proposes Restart room from the menu; the others see the card with a countdown, can still move, and all Yes restarts", async () => {
    const table: Table = await playRoom(browser, baseUrl);
    const { blind: ana, deaf: bo, mute: cy } = table.byRole;
    await proposeFrom(cy);
    for (const page of [ana, bo]) {
      const prompt = card(page);
      await prompt.waitFor({ timeout: 2000 });
      expect(await prompt.innerText()).toMatch(/Cy wants to restart the room/);
      expect(await prompt.getByRole("timer").innerText()).toMatch(/^0:(1[0-5]|0\d)$/);
      expect(await prompt.locator(".vote-bar").count()).toBe(1);
      expect(await prompt.getByRole("button").allInnerTexts()).toEqual([
        "Restart room",
        "Keep playing",
      ]);
    }
    // the proposer is asked nothing: their yes is counted
    expect(await card(cy).getByRole("button").count()).toBe(0);
    // movement continues under the card
    const before = await settledHash(bo);
    await move(bo);
    expect(await settledHash(bo)).not.toBe(before);
    await card(ana).getByRole("button", { name: "Restart room" }).click();
    await card(bo).getByRole("button", { name: "Restart room" }).click();
    for (const page of table.pages) {
      await page.getByText("Restarting the room.").waitFor({ timeout: 3000 });
      await expect.poll(() => card(page).count(), { timeout: 3000 }).toBe(0);
    }
    await closeAll(table.pages);
  });

  it("one No shows 'Not restarted: <name> kept playing.' to everyone, then it goes", async () => {
    const table = await playRoom(browser, baseUrl);
    const { blind: ana, deaf: bo, mute: cy } = table.byRole;
    await proposeFrom(ana);
    await card(bo).getByRole("button", { name: "Keep playing" }).click();
    for (const page of [ana, bo, cy]) {
      await page.getByText("Not restarted: Bo kept playing.").waitFor({ timeout: 3000 });
    }
    // one line, for 3 s
    await expect
      .poll(() => ana.getByText("Not restarted: Bo kept playing.").count(), { timeout: 6000 })
      .toBe(0);
    await closeAll(table.pages);
  });

  it("a heist restart says so on the card", async () => {
    const table = await playRoom(browser, baseUrl);
    await proposeFrom(table.byRole.blind, "heist");
    const prompt = card(table.byRole.deaf);
    await prompt.waitFor({ timeout: 2000 });
    expect(await prompt.innerText()).toMatch(/restart the heist from room 1/);
    expect(await prompt.getByRole("button").allInnerTexts()).toEqual([
      "Restart heist",
      "Keep playing",
    ]);
    await closeAll(table.pages);
  });
});

describe("leaving mid-game", () => {
  it("asks first from the menu; Stay keeps you in, Leave heist takes you home and a bot takes the seat", async () => {
    const table = await playRoom(browser, baseUrl);
    const { blind: ana, mute: cy } = table.byRole;
    await cy.getByRole("button", { name: "Menu" }).click();
    await cy.getByRole("button", { name: "Leave game", exact: true }).click();
    const modal = cy.getByRole("dialog", { name: "Leave the heist?" });
    await modal.getByText(/Your crew carries on with a bot or a teammate in your place/).waitFor();
    await modal.getByRole("button", { name: "Stay" }).click();
    expect(await modal.count()).toBe(0);
    expect(await cy.locator(".frame canvas").count()).toBe(1);
    // nobody was told anything
    expect(await ana.locator(".hud-alert", { hasText: /Cy left/ }).count()).toBe(0);

    await cy.getByRole("button", { name: "Menu" }).click();
    await cy.getByRole("button", { name: "Leave game", exact: true }).click();
    await cy.getByRole("dialog").getByRole("button", { name: "Leave heist" }).click();
    await cy.waitForURL((url) => url.pathname === "/", { timeout: 5000 });
    await ana.locator(".hud-alert", { hasText: /Cy left the game/ }).waitFor({ timeout: 3000 });
    expect(await ana.locator(".hud-crew").innerText()).toMatch(/Bot/);
    await closeAll(table.pages);
  });

  it("asks before a link of the page takes you away", async () => {
    const table = await playRoom(browser, baseUrl);
    const { blind: ana } = table.byRole;
    await ana.evaluate(() => {
      const a = document.createElement("a");
      a.href = "/stats";
      a.textContent = "Elsewhere";
      document.body.append(a);
    });
    await ana.getByRole("link", { name: "Elsewhere" }).click();
    await ana.getByRole("dialog", { name: "Leave the heist?" }).waitFor();
    await ana.getByRole("dialog").getByRole("button", { name: "Stay" }).click();
    expect(new URL(ana.url()).pathname).toMatch(/^\/lobby\//);
    await closeAll(table.pages);
  });
});

describe("the HUD with the vote card open", () => {
  it("has no overflow and no axe violations, and the phone's controls keep clear of each other", async () => {
    const table = await playRoom(browser, baseUrl);
    await proposeFrom(table.byRole.blind);
    for (const page of [table.phone, table.byRole.mute])
      await card(page).waitFor({ timeout: 2000 });
    for (const page of [table.phone, table.byRole.mute, table.byRole.blind]) {
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      expect(await axeViolations(page)).toEqual([]);
    }
    // the card sits inside the map and clear of the controls under it
    const frame = await table.phone.locator(".frame").boundingBox();
    const vote = await card(table.phone).boundingBox();
    expect(frame && vote).toBeTruthy();
    if (frame && vote) {
      expect(vote.x).toBeGreaterThanOrEqual(frame.x);
      expect(vote.x + vote.width).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
      expect(vote.y).toBeGreaterThanOrEqual(frame.y);
    }
    const boxes = await table.phone.evaluate(() =>
      ["[data-joystick]", "[data-act]", ".wheel-btn", ".quick-btn", ".talk-bar"].map((sel) => {
        const r = document.querySelector(sel)?.getBoundingClientRect();
        return { sel, x: r?.x ?? 0, y: r?.y ?? 0, w: r?.width ?? 0, h: r?.height ?? 0 };
      }),
    );
    for (const a of boxes) {
      expect(a.w, a.sel).toBeGreaterThan(0);
      for (const b of boxes) {
        if (a.sel >= b.sel) continue;
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart, `${a.sel} overlaps ${b.sel}`).toBe(true);
      }
    }
    await closeAll(table.pages);
  });
});
