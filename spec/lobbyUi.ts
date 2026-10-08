import type { Browser, Page } from "playwright";
import { openPage, type Viewport } from "./browser.ts";
import { connect } from "./ws.ts";

// Drives the home page the way a person does, so the layout specs share one
// path to "I'm in a lobby".

export async function createLobbyAs(
  browser: Browser,
  baseUrl: string,
  nickname: string,
  viewport: Viewport,
): Promise<{ page: Page; code: string }> {
  const page = await openPage(browser, baseUrl, viewport);
  await page.getByLabel("Nickname").fill(nickname);
  await page.getByRole("button", { name: "Create lobby" }).click();
  await page.waitForURL(/\/lobby\/[A-Z]{4}$/);
  const code = new URL(page.url()).pathname.split("/").pop() ?? "";
  return { page, code };
}

export async function joinWithCode(
  browser: Browser,
  baseUrl: string,
  code: string,
  nickname: string,
  viewport: Viewport,
): Promise<Page> {
  const page = await openPage(browser, baseUrl, viewport);
  await page.getByLabel("Nickname").fill(nickname);
  await page.getByLabel("Lobby code").fill(code);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await page.waitForURL(new RegExp(`/lobby/${code}$`));
  return page;
}

// Closing a tab leaves the seat held for a while (a reload must be able to
// come back), so specs press Leave first or abandoned lobbies fill the server.
export async function leaveAndClose(page: Page): Promise<void> {
  if (page.url().includes("/lobby/")) {
    const leave = page.getByRole("button", { name: "Leave" });
    if (await leave.isVisible()) {
      await leave.click();
      await page.waitForURL((url) => url.pathname === "/", { timeout: 5000 }).catch(() => {});
    }
  }
  await page.context().close();
}

// A game screen has no Leave button yet, so leave over a socket that carries
// the page's device cookie, then close the context. Keeps specs from leaving
// lobbies behind to fill the server.
export async function leaveGameAndClose(page: Page, baseUrl: string): Promise<void> {
  const cookie = (await page.context().cookies())
    .filter((c) => c.name === "heist_device")
    .map((c) => `${c.name}=${c.value}`)[0];
  if (cookie) await (await connect(baseUrl, cookie)).close();
  await page.context().close();
}
