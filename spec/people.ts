import type { Browser, BrowserContext, Page } from "playwright";
import { DESKTOP, type Viewport } from "./browser.ts";

// Housemates in a real browser: each person is their own context (their own
// cookies), so two of them are two devices that can only hear each other
// through the server.

export interface Person {
  name: string;
  context: BrowserContext;
  page: Page;
}

// Waits until the page's live stream is open, i.e. until the island is
// hydrated and anything that happens next will reach it.
export async function streamOpen(page: Page): Promise<void> {
  await page.locator('[data-stream="open"]').first().waitFor({ timeout: 10_000 });
}

export async function startHousehold(
  browser: Browser,
  baseUrl: string,
  opts: { name?: string; household?: string; viewport?: Viewport } = {},
): Promise<Person> {
  const { name = "Sam", household = "Unit 4", viewport = DESKTOP } = opts;
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.getByLabel("Household name").fill(household);
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Your name").press("Enter");
  await page.waitForURL(new URL("/", baseUrl).href);
  await streamOpen(page);
  return { name, context, page };
}

// Mints an invite link from the host's household page, on a throwaway tab so
// the host's own page stays where the test left it.
export async function inviteLinkFrom(host: Person, baseUrl: string): Promise<string> {
  const tab = await host.context.newPage();
  await tab.goto(new URL("/household", baseUrl).href);
  await tab.getByRole("button", { name: /invite link/i }).click();
  const link = await tab.locator("#invite-link").inputValue();
  await tab.close();
  return link;
}

export async function joinHousehold(
  browser: Browser,
  baseUrl: string,
  host: Person,
  opts: { name?: string; viewport?: Viewport } = {},
): Promise<Person> {
  const { name = "Alex", viewport = DESKTOP } = opts;
  const link = await inviteLinkFrom(host, baseUrl);
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(link);
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Your name").press("Enter");
  await page.waitForURL(new URL("/", baseUrl).href);
  await streamOpen(page);
  return { name, context, page };
}

// The pantry row for an item, not every element that mentions it.
export const row = (page: Page, name: string) =>
  page.getByRole("listitem").filter({ hasText: name });

export async function addItem(page: Page, name: string): Promise<void> {
  await page.getByLabel("Add an item").fill(name);
  await page.getByLabel("Add an item").press("Enter");
}
