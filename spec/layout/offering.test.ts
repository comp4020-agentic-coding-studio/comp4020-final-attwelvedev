import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { launch } from "../browser.ts";
import {
  feedRow,
  joinCommunityVia,
  offerPair,
  openOffers,
  pantryRow,
  startCommunity,
} from "../neighbours.ts";
import { addItem, type Person, startHousehold, streamOpen } from "../people.ts";

const baseUrl = inject("baseUrl");

let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});

const url = (path: string) => new URL(path, baseUrl).href;
const close = (...people: Person[]) => Promise.all(people.map((p) => p.context.close()));
const offerButton = (page: Page, item: string) =>
  pantryRow(page, item).getByRole("button", { name: `Offer ${item}`, exact: true });

// Counts dialogs: this app never opens one, whatever the tap.
function watchDialogs(page: Page): () => number {
  let seen = 0;
  page.on("dialog", () => {
    seen += 1;
  });
  return () => seen;
}

async function addAndSee(page: Page, name: string) {
  await addItem(page, name);
  await pantryRow(page, name).waitFor({ timeout: 2000 });
}

const noteField = (page: Page) => page.getByLabel("Pickup note");
const noteButton = (page: Page, item: string) =>
  pantryRow(page, item).getByRole("button", { name: `Note ${item}`, exact: true });

// The sheet opens a moment after the tap (it is shown from an effect), so wait
// for the field to be visible before reading it or pressing a key.
async function sheetNote(page: Page): Promise<string> {
  await noteField(page).waitFor();
  return noteField(page).inputValue();
}

// Every offer goes through the sheet: tap Offer, write or keep the note, Post.
async function postOffer(page: Page, item: string, note?: string) {
  await offerButton(page, item).click();
  await noteField(page).waitFor();
  if (note !== undefined) await noteField(page).fill(note);
  await page.getByRole("button", { name: "Post offer" }).click();
  await page.locator("dialog[open]").waitFor({ state: "detached" });
}

describe("offering from the pantry", () => {
  it("opens the sheet on every Offer, prefilled with the previous note and ready to overwrite", async () => {
    const { offerer, claimer } = await offerPair(browser, baseUrl);
    const dialogs = watchDialogs(offerer.page);
    await addAndSee(offerer.page, "soup");

    await offerButton(offerer.page, "soup").click();
    await noteField(offerer.page).waitFor();
    expect(await noteField(offerer.page).evaluate((el) => el === document.activeElement)).toBe(
      true,
    );
    expect(await sheetNote(offerer.page)).toBe("");
    await noteField(offerer.page).fill("Porch, after 5");
    await offerer.page.getByRole("button", { name: "Post offer" }).click();
    await offerer.page.locator("dialog[open]").waitFor({ state: "detached" });
    expect(await pantryRow(offerer.page, "soup").textContent()).toContain("Offered");
    await feedRow(claimer.page, "soup").waitFor({ timeout: 1000 });

    // the second offer is not one tap: the sheet opens with the last note, selected
    await addAndSee(offerer.page, "bread");
    await offerButton(offerer.page, "bread").click();
    await noteField(offerer.page).waitFor();
    expect(await sheetNote(offerer.page)).toBe("Porch, after 5");
    expect(
      await noteField(offerer.page).evaluate((el: HTMLInputElement) => [
        el.selectionStart,
        el.selectionEnd,
        el.value.length,
      ]),
    ).toEqual([0, 14, 14]);
    await noteField(offerer.page).fill("Side gate");
    await noteField(offerer.page).press("Enter");
    await offerer.page.locator("dialog[open]").waitFor({ state: "detached" });
    await offerer.page.getByText("bread offered to 1 community.").waitFor();
    await offerer.page.getByRole("button", { name: "Undo", exact: true }).last().waitFor();
    await offerer.page.getByRole("button", { name: "Edit note", exact: true }).last().waitFor();

    // that offer carries its own note, and the next sheet starts from it
    await feedRow(claimer.page, "bread")
      .getByRole("button", { name: /^Claim/ })
      .click();
    await claimer.page.getByText("Pickup: Side gate").waitFor({ timeout: 2000 });
    await addAndSee(offerer.page, "jam");
    await offerButton(offerer.page, "jam").click();
    expect(await sheetNote(offerer.page)).toBe("Side gate");
    await offerer.page.keyboard.press("Escape");

    const tab = await offerer.context.newPage();
    await tab.goto(url("/household"));
    expect(await tab.getByLabel("Last pickup note").inputValue()).toBe("Side gate");
    expect(dialogs()).toBe(0);
    await close(offerer, claimer);
  }, 30_000);

  it("withdraws on Undo, and Edit note opens that offer's note", async () => {
    const { offerer, claimer } = await offerPair(browser, baseUrl);
    await addAndSee(offerer.page, "bread");
    await postOffer(offerer.page, "bread", "Porch, after 5");
    await feedRow(claimer.page, "bread").waitFor({ timeout: 1000 });
    await offerer.page.getByRole("button", { name: "Undo", exact: true }).click();
    await feedRow(claimer.page, "bread").waitFor({ state: "detached", timeout: 1000 });
    expect(await pantryRow(offerer.page, "bread").textContent()).not.toContain("Offered");

    await addAndSee(offerer.page, "jam");
    await postOffer(offerer.page, "jam", "Back door");
    await offerer.page.getByRole("button", { name: "Edit note", exact: true }).click();
    expect(await sheetNote(offerer.page)).toBe("Back door");
    await noteField(offerer.page).fill("Side gate");
    expect(await offerer.page.getByText("Send to").count()).toBe(0);
    await noteField(offerer.page).press("Enter");
    await offerer.page.locator("dialog[open]").waitFor({ state: "detached" });

    await feedRow(claimer.page, "jam")
      .getByRole("button", { name: /^Claim/ })
      .click();
    await claimer.page.getByText("Pickup: Side gate").waitFor({ timeout: 2000 });
    await pantryRow(offerer.page, "jam").getByText("Claimed by House 9").waitFor({ timeout: 1000 });
    await close(offerer, claimer);
  }, 30_000);

  it("lets the offerer view and edit the note of one item from its row, before and after a claim", async () => {
    const { offerer, claimer } = await offerPair(browser, baseUrl);
    await addAndSee(offerer.page, "jam");
    await addAndSee(offerer.page, "tea");
    await postOffer(offerer.page, "jam", "Back door");
    await postOffer(offerer.page, "tea", "Letterbox");
    await offerer.page.getByRole("button", { name: "Undo", exact: true }).first().waitFor();

    // each row shows its own note, and only offered rows have the button
    await noteButton(offerer.page, "jam").click();
    expect(await sheetNote(offerer.page)).toBe("Back door");
    await offerer.page.getByRole("button", { name: "Save note" }).waitFor();
    expect(await offerer.page.getByRole("button", { name: "Post offer" }).count()).toBe(0);
    await offerer.page.keyboard.press("Escape");
    await noteButton(offerer.page, "tea").click();
    expect(await sheetNote(offerer.page)).toBe("Letterbox");
    await offerer.page.keyboard.press("Escape");
    expect(
      await noteButton(offerer.page, "tea").evaluate((el) => el === document.activeElement),
    ).toBe(true);

    // edited before a claim: the claimer reads the new text
    await noteButton(offerer.page, "jam").click();
    await noteField(offerer.page).fill("Side gate");
    await offerer.page.getByRole("button", { name: "Save note" }).click();
    await offerer.page.locator("dialog[open]").waitFor({ state: "detached" });
    await noteButton(offerer.page, "jam").click();
    expect(await sheetNote(offerer.page)).toBe("Side gate");
    await offerer.page.keyboard.press("Escape");
    await feedRow(claimer.page, "jam")
      .getByRole("button", { name: /^Claim/ })
      .click();
    await claimer.page.getByText("Pickup: Side gate").waitFor({ timeout: 2000 });

    // edited after a claim: the claimer's page updates live
    await pantryRow(offerer.page, "jam").getByText("Claimed by House 9").waitFor({ timeout: 1000 });
    await noteButton(offerer.page, "jam").click();
    await noteField(offerer.page).fill("Under the mat");
    await noteField(offerer.page).press("Enter");
    await claimer.page.getByText("Pickup: Under the mat").waitFor({ timeout: 1500 });
    await close(offerer, claimer);
  }, 40_000);

  it("withdraws an offer from its row", async () => {
    const { offerer, claimer } = await offerPair(browser, baseUrl);
    await addAndSee(offerer.page, "bread");
    await postOffer(offerer.page, "bread", "Porch, after 5");
    await feedRow(claimer.page, "bread").waitFor({ timeout: 1000 });
    await pantryRow(offerer.page, "bread")
      .getByRole("button", { name: "Withdraw bread", exact: true })
      .click();
    await feedRow(claimer.page, "bread").waitFor({ state: "detached", timeout: 1000 });
    await offerButton(offerer.page, "bread").waitFor();
    await close(offerer, claimer);
  }, 30_000);

  it("offers to the ticked communities only", async () => {
    const a = await startHousehold(browser, baseUrl, { name: "Sam", household: "Unit 4" });
    const b = await startHousehold(browser, baseUrl, { name: "Priya", household: "Flat 2" });
    const c = await startHousehold(browser, baseUrl, { name: "Quinn", household: "House 9" });
    const x = await startCommunity(a, baseUrl, "Elm Street");
    const y = await startCommunity(c, baseUrl, "Oak Lane");
    await joinCommunityVia(b, baseUrl, x.code);
    await joinCommunityVia(a, baseUrl, y.code);
    await openOffers(b, baseUrl);
    await openOffers(c, baseUrl);
    await a.page.goto(baseUrl);
    await streamOpen(a.page);
    await addAndSee(a.page, "jam");

    expect(
      await pantryRow(a.page, "jam")
        .getByRole("button", { name: /^Offer to/ })
        .count(),
    ).toBe(0);
    await offerButton(a.page, "jam").click();
    await a.page.getByLabel("Pickup note").fill("Porch, after 5");
    expect(await a.page.getByLabel("Oak Lane").isChecked()).toBe(true);
    await a.page.getByLabel("Oak Lane").uncheck();
    expect(await a.page.getByLabel("Elm Street").isChecked()).toBe(true);
    await a.page.getByRole("button", { name: "Post offer" }).click();

    await feedRow(b.page, "jam").waitFor({ timeout: 1000 });
    await a.page.getByText("jam offered to 1 community.").waitFor();
    await c.page.waitForTimeout(1500);
    expect(await feedRow(c.page, "jam").count()).toBe(0);
    await close(a, b, c);
  }, 40_000);

  it("withdraws an offered item that is marked Used", async () => {
    const { offerer, claimer } = await offerPair(browser, baseUrl);
    await addAndSee(offerer.page, "bread");
    await postOffer(offerer.page, "bread", "Porch, after 5");
    await feedRow(claimer.page, "bread").waitFor({ timeout: 1000 });
    await pantryRow(offerer.page, "bread").getByRole("button", { name: "Used bread" }).click();
    await feedRow(claimer.page, "bread").waitFor({ state: "detached", timeout: 1000 });
    await close(offerer, claimer);
  }, 30_000);

  it("shows Given to a neighbour when the claimer collects, and lists it under Given in History", async () => {
    const { offerer, claimer } = await offerPair(browser, baseUrl);
    await addAndSee(offerer.page, "bread");
    await postOffer(offerer.page, "bread", "Porch, after 5");
    await feedRow(claimer.page, "bread")
      .getByRole("button", { name: /^Claim/ })
      .click();
    await claimer.page.getByText("Pickup:").first().waitFor({ timeout: 1000 });
    await claimer.page
      .getByRole("button", { name: /^Collected/ })
      .first()
      .click();

    await pantryRow(offerer.page, "bread")
      .getByText("Given to a neighbour")
      .waitFor({ timeout: 1000 });
    const tab = await offerer.context.newPage();
    await tab.goto(url("/history?outcome=given"));
    await tab.getByText("bread").first().waitFor();
    const pages = [await tab.content(), await offerer.page.content()];
    await tab.goto(url("/household"));
    pages.push(await tab.content());
    for (const html of pages) {
      expect(html).not.toContain("Quinn");
      expect(html).not.toContain("House 9");
    }
    await close(offerer, claimer);
  }, 30_000);

  it("shows a link to join a community, and no Offer button, without one", async () => {
    const lone = await startHousehold(browser, baseUrl, { name: "Sam", household: "Unit 4" });
    await addAndSee(lone.page, "soup");
    await lone.page
      .getByRole("link", { name: "Join a community to offer food to neighbours" })
      .waitFor();
    expect(await lone.page.getByRole("button", { name: /^Offer/ }).count()).toBe(0);
    await close(lone);
  }, 30_000);
});
