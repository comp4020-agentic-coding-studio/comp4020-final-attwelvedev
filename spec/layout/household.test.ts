import type { Browser, BrowserContext, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  axeViolations,
  DESKTOP,
  horizontalOverflow,
  launch,
  PHONE,
  type Viewport,
} from "../browser.ts";
import { client } from "../http.ts";

const baseUrl = inject("baseUrl");

let browser: Browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});

// A browser context that is signed in as a fresh household's only member.
async function signedInContext(viewport: Viewport): Promise<BrowserContext> {
  const me = client(baseUrl);
  await me.post("/households", { householdName: "Unit 4", memberName: "Sam" });
  const context = await browser.newContext({
    viewport,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.addCookies([
    { name: "pantry_device", value: me.cookie("pantry_device") ?? "", url: baseUrl },
  ]);
  return context;
}

async function expectClean(page: Page): Promise<void> {
  expect(await horizontalOverflow(page)).toBe(0);
  expect(await axeViolations(page)).toEqual([]);
}

describe.each([
  ["phone", PHONE],
  ["desktop", DESKTOP],
])("household pages at %s width", (_name, viewport) => {
  it("/household, with and without a fresh invite link, is clean", async () => {
    const context = await signedInContext(viewport);
    const page = await context.newPage();
    await page.goto(new URL("/household", baseUrl).href, { waitUntil: "networkidle" });
    await expectClean(page);

    await page.getByRole("button", { name: /invite link/i }).click();
    await page.waitForURL("**/household/invite-link");
    expect(await page.locator("#invite-link").inputValue()).toMatch(/\/join\/[A-Za-z0-9_-]{22}$/);
    await expectClean(page);
    await context.close();
  });

  it("/household/devices with a minted link and QR is clean", async () => {
    const context = await signedInContext(viewport);
    const page = await context.newPage();
    await page.goto(new URL("/household/devices", baseUrl).href, { waitUntil: "networkidle" });
    await expectClean(page);

    await page.getByRole("button", { name: /device link/i }).click();
    await page.waitForURL("**/household/device-link");
    expect(await page.locator("#device-link").inputValue()).toMatch(
      /\/device\/[A-Za-z0-9_-]{22,}$/,
    );
    await expect(page.getByRole("img", { name: /qr/i }).isVisible()).resolves.toBe(true);
    await expectClean(page);
    await context.close();
  });

  it("/join and /join/<token> are clean", async () => {
    const sam = client(baseUrl);
    await sam.post("/households", { householdName: "Unit 4", memberName: "Sam" });
    const html = await (await sam.post("/household/invite-link")).text();
    const path = html.match(/\/join\/[A-Za-z0-9_-]{22}/)?.[0] ?? "";

    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    for (const target of ["/join", path]) {
      await page.goto(new URL(target, baseUrl).href, { waitUntil: "networkidle" });
      await expectClean(page);
    }
    await context.close();
  });
});

describe("Copy button", () => {
  it.each([
    ["invite link", /invite link/i, "#invite-link", "invite-link"],
    ["device link", /device link/i, "#device-link", "device-link"],
  ])("puts the %s on the clipboard", async (_label, buttonName, field, route) => {
    const context = await signedInContext(DESKTOP);
    const page = await context.newPage();
    const from = route === "invite-link" ? "/household" : "/household/devices";
    await page.goto(new URL(from, baseUrl).href, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: buttonName }).click();
    await page.waitForURL(`**/household/${route}`);

    await page.getByRole("button", { name: /^copy/i }).click();
    const link = await page.locator(field).inputValue();
    expect(link).toMatch(/^https?:\/\//);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
    await context.close();
  });
});
