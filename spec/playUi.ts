// Shared by the layout specs: three people in a started room, through the real screens.
import type { Browser, Page } from "playwright";
import type { Role } from "../src/game/types.ts";
import { DESKTOP, openPage, PHONE } from "./browser.ts";
import { createLobbyAs } from "./lobbyUi.ts";

export interface Table {
  pages: Page[];
  byRole: Record<Role, Page>;
  phone: Page;
}

// Host and a third player on desktop, one touch phone in between, all through
// the real screens: create, join, Start, reveal, Ready.
export async function playRoom(browser: Browser, baseUrl: string): Promise<Table> {
  const { page: host, code } = await createLobbyAs(browser, baseUrl, "Ana", DESKTOP);
  const phoneContext = await browser.newContext({
    viewport: PHONE,
    hasTouch: true,
    isMobile: true,
  });
  const phone = await phoneContext.newPage();
  const third = await openPage(browser, baseUrl, DESKTOP);
  for (const [page, name] of [
    [phone, "Bo"],
    [third, "Cy"],
  ] as const) {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByLabel("Nickname").fill(name);
    await page.getByLabel("Lobby code").fill(code);
    await page.getByRole("button", { name: "Join", exact: true }).click();
    await page.waitForURL(new RegExp(`/lobby/${code}$`));
    await page.getByText("Seats").waitFor();
  }
  const start = host.getByRole("button", { name: "Start" });
  // click waits for the button to be enabled (all three seated), up to 5 s; a
  // plain wait rather than expect.poll, so a spec may call this from beforeAll
  await start.click({ timeout: 5000 });
  const pages = [host, phone, third];
  for (const page of pages) await page.getByRole("button", { name: "Ready" }).click();
  for (const page of pages) await page.locator(".frame canvas").waitFor();
  // seats rotate by room: room 1 is seat 0 blind, seat 1 deaf, seat 2 mute
  return { pages, phone, byRole: { blind: host, deaf: phone, mute: third } };
}

export const canvasHash = (page: Page) =>
  page.locator(".frame canvas").evaluate((c) => (c as HTMLCanvasElement).toDataURL());
