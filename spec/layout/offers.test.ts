import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { launch } from "../browser.ts";
import { offerNamed, trio } from "../neighbours.ts";
import { type Person, row } from "../people.ts";

const baseUrl = inject("baseUrl");

let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});

const close = (...people: Person[]) => Promise.all(people.map((p) => p.context.close()));

describe("the offers feed, live", () => {
  it("shows a new offer in a neighbour's feed within 1000 ms", async () => {
    const { offerer, claimer, other, http } = await trio(browser, baseUrl);
    await offerNamed(http, "soup");
    await row(claimer.page, "soup").waitFor({ timeout: 1000 });
    await row(other.page, "soup").waitFor({ timeout: 1000 });
    expect(await row(offerer.page, "soup").first().textContent()).toContain("Offered");
    await close(offerer, claimer, other);
  }, 30_000);

  it("shows Taken to a third household, Claimed by to the offerer, and the note only to the claimer", async () => {
    const { offerer, claimer, other, http } = await trio(browser, baseUrl);
    await offerNamed(http, "soup", "Porch, after 5");
    await row(claimer.page, "soup").waitFor({ timeout: 1000 });
    await row(other.page, "soup").waitFor({ timeout: 1000 });

    await row(claimer.page, "soup")
      .getByRole("button", { name: /^Claim/ })
      .click();
    await row(other.page, "soup").getByText("Taken").waitFor({ timeout: 1000 });
    await row(offerer.page, "soup").getByText("Claimed by House 9").waitFor({ timeout: 1000 });
    await claimer.page.getByText("Pickup: Porch, after 5").waitFor({ timeout: 1000 });

    expect(await other.page.content()).not.toContain("House 9");
    expect(await other.page.content()).not.toContain("Porch, after 5");
    expect(await offerer.page.content()).not.toContain("Porch, after 5");
    await row(other.page, "soup").waitFor({ state: "detached", timeout: 7000 });
    await close(offerer, claimer, other);
  }, 30_000);

  it("removes an offer everywhere when the claimer marks it collected", async () => {
    const { offerer, claimer, other, http } = await trio(browser, baseUrl);
    await offerNamed(http, "soup");
    await row(claimer.page, "soup")
      .getByRole("button", { name: /^Claim/ })
      .click();
    await claimer.page.getByText("Pickup:").waitFor({ timeout: 1000 });

    await claimer.page.getByRole("button", { name: /^Collected/ }).click();
    await row(claimer.page, "soup").waitFor({ state: "detached", timeout: 1000 });
    await row(offerer.page, "soup").waitFor({ state: "detached", timeout: 1000 });
    await row(other.page, "soup").waitFor({ state: "detached", timeout: 7000 });
    await close(offerer, claimer, other);
  }, 30_000);

  it("removes an offer everywhere when the offerer marks it collected", async () => {
    const { offerer, claimer, http } = await trio(browser, baseUrl);
    await offerNamed(http, "bread");
    await row(claimer.page, "bread")
      .getByRole("button", { name: /^Claim/ })
      .click();
    await row(offerer.page, "bread").getByText("Claimed by House 9").waitFor({ timeout: 1000 });

    await row(offerer.page, "bread")
      .getByRole("button", { name: /^Collected/ })
      .click();
    await row(offerer.page, "bread").waitFor({ state: "detached", timeout: 1000 });
    await claimer.page.getByText("Pickup:").waitFor({ state: "detached", timeout: 1000 });
    await close(offerer, claimer);
  }, 30_000);

  it("returns a released offer to the other households' feeds within 1000 ms", async () => {
    const { offerer, claimer, other, http } = await trio(browser, baseUrl);
    await offerNamed(http, "soup");
    await row(claimer.page, "soup")
      .getByRole("button", { name: /^Claim/ })
      .click();
    await row(other.page, "soup").getByText("Taken").waitFor({ timeout: 1000 });
    await row(other.page, "soup").waitFor({ state: "detached", timeout: 7000 });

    await claimer.page.getByRole("button", { name: /^Release/ }).click();
    await row(other.page, "soup")
      .getByRole("button", { name: /^Claim/ })
      .waitFor({ timeout: 1000 });
    await row(offerer.page, "soup").getByText("Offered").waitFor({ timeout: 1000 });
    await close(offerer, claimer, other);
  }, 30_000);

  it("lets the offerer release a claim and withdraw an offer", async () => {
    const { offerer, claimer, other, http } = await trio(browser, baseUrl);
    await offerNamed(http, "soup");
    await row(claimer.page, "soup")
      .getByRole("button", { name: /^Claim/ })
      .click();
    await row(offerer.page, "soup").getByText("Claimed by House 9").waitFor({ timeout: 1000 });

    await row(offerer.page, "soup")
      .getByRole("button", { name: /^Release/ })
      .click();
    await row(other.page, "soup")
      .getByRole("button", { name: /^Claim/ })
      .waitFor({ timeout: 1000 });
    await claimer.page.getByText("Pickup:").waitFor({ state: "detached", timeout: 1000 });

    await row(offerer.page, "soup")
      .getByRole("button", { name: /^Withdraw/ })
      .click();
    await row(other.page, "soup").waitFor({ state: "detached", timeout: 1000 });
    await close(offerer, claimer, other);
  }, 30_000);

  it("gives the loser of a simultaneous claim a message in place, with no error toast", async () => {
    const { offerer, claimer, other, http } = await trio(browser, baseUrl);
    await offerNamed(http, "soup");
    await row(claimer.page, "soup").waitFor({ timeout: 1000 });
    await row(other.page, "soup").waitFor({ timeout: 1000 });

    // pressed at once, in the page itself: a Playwright click would wait for a button
    // that the winner's "taken" event can remove from the loser's page first
    const press = (page: Page) =>
      row(page, "soup")
        .getByRole("button", { name: /^Claim/ })
        .evaluate((button) => (button as HTMLButtonElement).click());
    await Promise.all([press(claimer.page), press(other.page)]);
    const lost = (page: Page) => page.getByText("Someone claimed this first.").count();
    await expect
      .poll(async () => (await lost(claimer.page)) + (await lost(other.page)), { timeout: 3000 })
      .toBe(1);
    expect(await claimer.page.getByRole("alert").count()).toBe(0);
    expect(await other.page.getByRole("alert").count()).toBe(0);
    await expect
      .poll(
        async () =>
          (await claimer.page.getByText("Pickup:").count()) +
          (await other.page.getByText("Pickup:").count()),
      )
      .toBe(1);
    await close(offerer, claimer, other);
  }, 30_000);
});
