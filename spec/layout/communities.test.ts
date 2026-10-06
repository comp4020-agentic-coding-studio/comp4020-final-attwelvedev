import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  axeViolations,
  DESKTOP,
  horizontalOverflow,
  launch,
  PHONE,
  type Viewport,
} from "../browser.ts";
import { httpFor, joinCommunityVia, offerNamed, startCommunity } from "../neighbours.ts";
import { type Person, row, startHousehold, streamOpen } from "../people.ts";

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
const household = (name: string, home: string, viewport: Viewport = DESKTOP) =>
  startHousehold(browser, baseUrl, { name, household: home, viewport });

describe("a community page, live", () => {
  it("lists a household that joins within 1000 ms", async () => {
    const creator = await household("Sam", "Unit 4");
    const joiner = await household("Priya", "Flat 2");
    const { code } = await startCommunity(creator, baseUrl);
    await streamOpen(creator.page);

    await joinCommunityVia(joiner, baseUrl, code);
    await creator.page
      .locator("#community-households .who", { hasText: "Flat 2" })
      .waitFor({ timeout: 1000 });
    await close(creator, joiner);
  }, 30_000);

  it("drops a removed household from another open page within 1000 ms, and stops the removed one hearing the community", async () => {
    const creator = await household("Sam", "Unit 4");
    const removed = await household("Priya", "Flat 2");
    const watcher = await household("Quinn", "House 9");
    const { id, code } = await startCommunity(creator, baseUrl);
    await joinCommunityVia(removed, baseUrl, code);
    await joinCommunityVia(watcher, baseUrl, code);
    await watcher.page.goto(url(`/communities/${id}`));
    await streamOpen(watcher.page);
    await watcher.page.locator("#community-households .who", { hasText: "Flat 2" }).waitFor();
    await removed.page.goto(url("/offers"));
    await streamOpen(removed.page);

    await creator.page.goto(url(`/communities/${id}`));
    await creator.page.getByRole("button", { name: /Remove Flat 2/ }).click();
    await watcher.page
      .locator("#community-households .who", { hasText: "Flat 2" })
      .waitFor({ state: "detached", timeout: 1000 });

    // the removed household's feed notices it has no community left, and hears nothing more
    await removed.page
      .getByText("Join a community to see and share offers")
      .waitFor({ timeout: 2000 });
    await offerNamed(await httpFor(creator, baseUrl), "soup");
    await row(watcher.page, "soup")
      .waitFor({ state: "detached", timeout: 100 })
      .catch(() => {});
    await removed.page.waitForTimeout(1500);
    expect(await row(removed.page, "soup").count()).toBe(0);
    await close(creator, removed, watcher);
  }, 40_000);
});

describe.each([
  ["phone", PHONE],
  ["desktop", DESKTOP],
])("community pages at %s width", (_name, viewport) => {
  it("/communities and /communities/:id have no overflow and no axe violations", async () => {
    const creator = await household("Sam", "Unit 4", viewport);
    const { id } = await startCommunity(
      creator,
      baseUrl,
      "Elm Street, the long-named neighbourhood group",
    );
    await creator.page.goto(url("/communities"), { waitUntil: "networkidle" });
    expect(await horizontalOverflow(creator.page)).toBe(0);
    expect(await axeViolations(creator.page)).toEqual([]);

    await creator.page.goto(url(`/communities/${id}`), { waitUntil: "networkidle" });
    await streamOpen(creator.page);
    expect(await horizontalOverflow(creator.page)).toBe(0);
    expect(await axeViolations(creator.page)).toEqual([]);
    await close(creator);
  }, 30_000);
});
