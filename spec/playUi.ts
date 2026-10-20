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
    await page.getByRole("heading", { name: /^Players \d of 6/ }).waitFor();
  }
  // The button reads plain "Start" only once all three are seated; before that it
  // reads "Start (n bots fill)" and would start a game with bots. click waits for the
  // plain one, up to 5 s; a plain wait rather than expect.poll, so a spec may call
  // this from beforeAll
  const start = host.getByRole("button", { name: "Start", exact: true });
  await start.click({ timeout: 5000 });
  const pages = [host, phone, third];
  for (const page of pages) await page.getByRole("button", { name: "I'm ready" }).click();
  for (const page of pages) await page.locator(".frame canvas").waitFor();
  // seats rotate by room: room 1 is seat 0 blind, seat 1 deaf, seat 2 mute
  return { pages, phone, byRole: { blind: host, deaf: phone, mute: third } };
}

export const canvasHash = (page: Page) =>
  page.locator(".frame canvas").evaluate((c) => (c as HTMLCanvasElement).toDataURL());

// The canvas once it has stopped changing: two frames in a row that are identical. A single
// frame is a moving picture (the camera eases, effects play out), so comparing a later
// frame to one taken a fixed time after something happened is a race. Gives up after
// `timeoutMs` and returns the last frame.
export async function settledHash(page: Page, timeoutMs = 3000): Promise<string> {
  // The sea drifts unless motion is reduced, so a canvas never holds still to be compared. The
  // drift is not what any caller is measuring, so take it out (idempotent, and the pages are ours).
  await page.emulateMedia({ reducedMotion: "reduce" });
  const deadline = Date.now() + timeoutMs;
  let last = await canvasHash(page);
  while (Date.now() < deadline) {
    await page.waitForTimeout(120);
    const next = await canvasHash(page);
    if (next === last) return next;
    last = next;
  }
  return last;
}
