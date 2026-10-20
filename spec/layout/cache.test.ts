import { type Browser, chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { DESKTOP } from "../browser.ts";
import { createLobbyAs, joinWithCode, leaveGameAndClose } from "../lobbyUi.ts";

const baseUrl = inject("baseUrl");

// Playwright turns off Chrome's back/forward cache, but a person's Chrome has it on: a game
// page that is navigated away from can be kept alive, socket open. Leaving has to work then
// too, so this runs with the cache on, as a person's browser does.
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch({
    channel: "chrome",
    ignoreDefaultArgs: ["--disable-back-forward-cache"],
    args: ["--enable-features=BackForwardCache"],
  });
});
afterAll(async () => {
  await browser.close();
});

describe("leaving a game by going to another page, with the back/forward cache on", () => {
  it.each([
    ["About", "/readme/"],
    ["Credits", "/credits/"],
    ["the landing page", "/"],
  ])(
    "a person who opens %s has left: the others see a bot take their seat",
    async (_name, path) => {
      const { page: host, code } = await createLobbyAs(browser, baseUrl, "Ana", DESKTOP);
      let guest: Page | null = null;
      // Whatever goes wrong below, the contexts are closed and the seat released, so one case
      // that stalls cannot leave a lobby and two browsers behind for the next to run beside.
      try {
        guest = await joinWithCode(browser, baseUrl, code, "Bo", DESKTOP);
        await host.getByRole("heading", { name: /^Players \d of 6/ }).waitFor();
        await host.getByRole("button", { name: /^Start/ }).click();
        for (const page of [host, guest]) {
          await page.getByRole("button", { name: "I'm ready" }).click();
        }
        await host.locator(".frame canvas").waitFor();

        await guest.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
        await host.getByText(/Bo left the game/).waitFor({ timeout: 8000 });
        expect(await host.getByText(/Bo left the game\. A bot took their seat/).count()).toBe(1);
      } finally {
        await leaveGameAndClose(host, baseUrl).catch(() => {});
        await guest
          ?.context()
          .close()
          .catch(() => {});
      }
    },
    60_000,
  );
});
