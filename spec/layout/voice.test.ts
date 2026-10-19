import type { Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { launch } from "../browser.ts";
import { leaveGameAndClose } from "../lobbyUi.ts";
import { playRoom, settledHash, type Table } from "../playUi.ts";

const baseUrl = inject("baseUrl");
const HOOK_MS = 30_000;

// A fake microphone that is allowed without asking, as a person who clicked Allow would have it.
const FAKE_MIC = [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
];
// A fake microphone, but with the permission prompt left in place: headless Chrome turns it down.
const MIC_ASK = [
  "--use-fake-device-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
];

const frames = (page: Table["pages"][number]) =>
  page.evaluate(() => Number(document.querySelector(".game")?.getAttribute("data-voice-frames")));

describe("voice: the microphone allowed", () => {
  let browser: Browser;
  let table: Table;
  beforeAll(async () => {
    browser = await launch(FAKE_MIC);
    table = await playRoom(browser, baseUrl);
  }, HOOK_MS);
  afterAll(async () => {
    for (const page of table?.pages ?? []) await leaveGameAndClose(page, baseUrl);
    await browser?.close();
  }, HOOK_MS);

  it("holding V as Can't hear reaches Can't speak, and Can't hear hears nothing back", async () => {
    const { deaf, mute } = table.byRole;
    await deaf.getByRole("button", { name: /hold to talk/i }).waitFor();
    expect(await frames(mute)).toBe(0);
    await deaf.keyboard.down("v");
    await mute.waitForFunction(
      () => Number(document.querySelector(".game")?.getAttribute("data-voice-frames")) > 0,
      null,
      { timeout: 2000 },
    );
    await deaf.keyboard.up("v");
    // the speaker's own page has no counter: it is never sent voice
    expect(await deaf.locator(".game").getAttribute("data-voice-frames")).toBeNull();
    // and the one who heard it sees who was talking
    await mute.locator(".hud-crew .talking").first().waitFor({ timeout: 2000 });
  });

  it("the Hold to talk button stays readable while the mouse holds it down", async () => {
    const { blind: deaf } = table.byRole; // a desktop page: the phone has no hover
    const button = deaf.getByRole("button", { name: /hold to talk/i });
    await button.hover();
    await deaf.mouse.down();
    await deaf.waitForFunction(() => document.querySelector(".talk-mic.is-talking") !== null);
    await deaf.waitForTimeout(400); // past the button's colour transition
    const [text, background] = await button.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.color, style.backgroundColor];
    });
    await deaf.mouse.up();
    expect(text).not.toBe(background);
  });

  it("letting go of the Hold to talk button gives the keyboard back to the game", async () => {
    const { blind } = table.byRole;
    const button = blind.getByRole("button", { name: /hold to talk/i });
    await button.hover();
    await blind.mouse.down();
    await blind.mouse.up();
    // a focused button would turn Space (act) and Enter into presses of itself
    expect(await blind.evaluate(() => document.activeElement?.tagName)).toBe("BODY");
  });

  it("the key hint on the button is the same grey as the other key hints", async () => {
    const { blind } = table.byRole;
    const colour = (selector: string) =>
      blind.locator(selector).evaluate((el) => getComputedStyle(el).color);
    expect(await colour(".talk-mic kbd")).toBe(await colour(".talk-write kbd"));
  });

  it("Can't speak has no push to talk at all: the mic says Can't talk", async () => {
    const { mute } = table.byRole;
    expect(await mute.getByRole("button", { name: /hold to talk/i }).count()).toBe(0);
    await expect(mute.locator(".talk-mic.cant").innerText()).resolves.toBe("Can't talk");
    expect(await mute.getByRole("button", { name: "Write a message" }).count()).toBe(0);
  });

  it("Enter opens the text field, Enter sends to Can't speak, Esc closes, and keys don't move the avatar while typing", async () => {
    const { deaf, mute } = table.byRole;
    await deaf.keyboard.press("Enter");
    await deaf.getByRole("textbox", { name: "Message" }).waitFor({ timeout: 1000 });
    await deaf.locator(".typing-badge").waitFor({ timeout: 1000 });
    const still = await settledHash(deaf);
    await deaf.keyboard.type("wasd door is east");
    expect(await settledHash(deaf)).toBe(still); // typing w, a, s, d moved nobody
    await deaf.keyboard.press("Enter");
    await mute
      .locator(".captions p", { hasText: "Bo: wasd door is east" })
      .waitFor({ timeout: 1000 });
    await deaf.keyboard.press("Enter");
    await deaf.getByRole("textbox", { name: "Message" }).waitFor({ timeout: 1000 });
    await deaf.keyboard.press("Escape");
    expect(await deaf.getByRole("textbox", { name: "Message" }).count()).toBe(0);
  });

  it("says Voice lagging once voice arrives later than 400 ms", async () => {
    const { deaf, blind } = table.byRole;
    // hold every voice frame back 500 ms before the page sees it, as a slow network would
    await blind.addInitScript(() => {
      const set = Object.getOwnPropertyDescriptor(WebSocket.prototype, "onmessage")?.set;
      const get = Object.getOwnPropertyDescriptor(WebSocket.prototype, "onmessage")?.get;
      Object.defineProperty(WebSocket.prototype, "onmessage", {
        configurable: true,
        get,
        set(fn: (e: MessageEvent) => void) {
          set?.call(this, (e: MessageEvent) =>
            typeof e.data === "string" ? fn(e) : void setTimeout(() => fn(e), 500),
          );
        },
      });
    });
    await blind.reload({ waitUntil: "networkidle" });
    await blind.locator(".frame canvas").waitFor({ timeout: 10_000 });
    expect(await blind.getByText("Voice lagging").count()).toBe(0);
    await deaf.keyboard.down("v");
    await blind.getByText("Voice lagging").waitFor({ timeout: 12_000 }); // stats go out every 5 s
    await deaf.keyboard.up("v");
  }, 30_000);
});

describe("voice: the microphone refused, or no encoder", () => {
  let browser: Browser;
  let table: Table;
  beforeAll(async () => {
    browser = await launch(MIC_ASK);
    table = await playRoom(browser, baseUrl);
  }, HOOK_MS);
  afterAll(async () => {
    for (const page of table?.pages ?? []) await leaveGameAndClose(page, baseUrl);
    await browser?.close();
  }, HOOK_MS);

  it("says the microphone is blocked, keeps callouts and text, and offers no mic button", async () => {
    const { deaf } = table.byRole;
    await deaf
      .getByText("Microphone blocked: voice is off. Callouts and text still work.")
      .waitFor({ timeout: 5000 });
    expect(await deaf.getByRole("button", { name: /hold to talk/i }).count()).toBe(0);
    expect(await deaf.getByRole("button", { name: "Write a message" }).count()).toBe(1);
  });

  it("names the browser limit when there is no AudioEncoder", async () => {
    const { deaf } = table.byRole;
    await deaf.addInitScript(() => {
      (window as unknown as Record<string, unknown>).AudioEncoder = undefined;
    });
    await deaf.reload({ waitUntil: "networkidle" });
    await deaf.locator(".frame canvas").waitFor({ timeout: 10_000 });
    await deaf.getByText(/can't do voice \(it has no audio encoder\)/).waitFor({ timeout: 5000 });
    expect(await deaf.getByRole("button", { name: /hold to talk/i }).count()).toBe(0);
  });
});
