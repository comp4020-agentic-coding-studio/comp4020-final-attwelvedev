import type { Browser, Page } from "playwright";
import { DESKTOP, PHONE } from "../../spec/browser.ts";
import { type Wire, wireOf } from "./wire.ts";

export interface Seat3 {
  page: Page;
  width: 375 | 1280;
  wire: Wire;
}

// Three people at a lobby, through the real screens (the model is spec/playUi.ts playRoom): seat 0
// creates the team, the others join with its code, the host presses Start. Stops at the reveal:
// nobody is ready yet. `onHome` is given each page's accessible text before it joins.
export async function openTable(
  browser: Browser,
  url: string,
  widths: [375 | 1280, 375 | 1280, 375 | 1280],
  options: { onHome?: (seat: number, text: string) => void } = {},
): Promise<Seat3[]> {
  const seats: Seat3[] = [];
  for (const [seat, width] of widths.entries()) {
    const context = await browser.newContext(
      width === 375 ? { viewport: PHONE, hasTouch: true, isMobile: true } : { viewport: DESKTOP },
    );
    const page = await context.newPage();
    const wire = wireOf(page);
    await page.goto(url, { waitUntil: "networkidle" });
    options.onHome?.(seat, await page.locator("body").ariaSnapshot());
    seats.push({ page, width, wire });
  }
  const [host, ...rest] = seats as [Seat3, Seat3, Seat3];
  const names = ["Ana", "Bo", "Cy"];
  await host.page.getByLabel("Nickname").fill(names[0] as string);
  await host.page.getByRole("button", { name: "Start a new team" }).click();
  await host.page.waitForURL(/\/lobby\/[A-Z]{4}$/);
  const code = new URL(host.page.url()).pathname.split("/").pop() ?? "";
  for (const [i, s] of rest.entries()) {
    await s.page.getByLabel("Nickname").fill(names[i + 1] as string);
    await s.page.getByLabel("Lobby code").fill(code);
    await s.page.getByRole("button", { name: "Join", exact: true }).click();
    await s.page.waitForURL(new RegExp(`/lobby/${code}$`));
    await s.page.getByRole("heading", { name: /^\d here · 3 play each room/ }).waitFor();
  }
  await host.page.getByRole("button", { name: "Start", exact: true }).click({ timeout: 5000 });
  for (const s of seats) await s.page.locator(".reveal").waitFor();
  return seats;
}

// Presses I'm ready on each tab and waits for the room to have started on all three.
export async function readyAll(table: Seat3[]): Promise<void> {
  for (const s of table) await s.page.getByRole("button", { name: "I'm ready" }).click();
  for (const s of table) await s.page.locator(".frame canvas").waitFor();
  for (const s of table) await s.page.locator('.game[data-intro="done"]').waitFor();
}
