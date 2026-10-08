import type { Browser, Page } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from "vitest";
import { CHANNEL_RULES, type Family, ROLE_LABEL, type Role } from "../../src/game/types.ts";
import { axeViolations, launch } from "../browser.ts";
import { leaveGameAndClose } from "../lobbyUi.ts";
import { playRoom, type Table } from "../playUi.ts";

const baseUrl = inject("baseUrl");
let browser: Browser;
// One room for the whole file: setting up three sessions through the real
// screens takes seconds, and these tests only read the tray or send harmless
// messages. `afterEach` puts the screens back as they were found.
let table: Table;
beforeAll(async () => {
  browser = await launch();
  table = await playRoom(browser, baseUrl);
});
afterAll(async () => {
  for (const page of table.pages) await leaveGameAndClose(page, baseUrl);
  await browser.close();
});

// Leaves nothing open and nothing cooling down, so the next test starts clean:
// a sheet or the settings panel left open would change what its keys do, and a
// cooldown left running would turn its first send into a "Wait" toast.
afterEach(async () => {
  for (const page of table.pages) {
    await page.keyboard.press("Escape");
    if (await page.locator("#settings").count()) {
      await page.locator(".hud-btn", { hasText: "Settings" }).click();
    }
  }
  for (const page of table.pages) {
    await page.waitForFunction(
      () => document.querySelector(".cd, .sheet, #settings") === null,
      null,
      { timeout: 5000 },
    );
  }
});

const FAMILIES: Family[] = ["say", "sound", "show"];
const KEY: Record<Family, string> = { say: "1", sound: "2", show: "3" };
const tile = (page: Page, family: Family) =>
  page.locator(".tray .tile").nth(FAMILIES.indexOf(family));

describe("the comms tray", () => {
  it("hatches what a role can't send, and says so", async () => {
    const say = tile(table.byRole.mute, "say");
    await expect(say.innerText()).resolves.toContain("Can't send");
    expect(await say.getAttribute("class")).toContain("cant");
    expect(await say.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("gradient");
    for (const role of ["blind", "deaf"] as const) {
      await expect(tile(table.byRole[role], "say").innerText()).resolves.not.toContain(
        "Can't send",
      );
    }
  });

  it("tells a tap on a hatched tile why, in one line", async () => {
    await tile(table.byRole.mute, "say").click({ force: true }); // aria-disabled: Playwright won't click it unforced
    await expect(table.byRole.mute.locator(".toast").innerText()).resolves.toBe(
      "Can't speak: no voice, text or callouts",
    );
  });

  it("shows, on every tile, who receives it as CHANNEL_RULES says", async () => {
    for (const role of ["blind", "deaf", "mute"] as const satisfies Role[]) {
      for (const family of FAMILIES) {
        const el = tile(table.byRole[role], family);
        const rule = CHANNEL_RULES[family];
        if (!rule.send.includes(role)) {
          await expect(el.innerText()).resolves.toContain("Can't send");
          continue;
        }
        const goesTo = rule.receive.map((r) => ROLE_LABEL[r]).join(" and ");
        await expect(el.locator(".sr-only").innerText()).resolves.toBe(`goes to ${goesTo}`);
        // your own shape is outlined exactly when you receive it
        expect(await el.locator(".glyph.me").count()).toBe(rule.receive.includes(role) ? 1 : 0);
      }
    }
  });

  it("a callout from Can't hear (1 then 4) shows to Can't speak as the sender's shape and name, within a second", async () => {
    const { deaf, mute } = table.byRole;
    await deaf.keyboard.press("1");
    await deaf.keyboard.press("4");
    const line = mute.locator(".captions p", { hasText: "Bo: Left" });
    await line.waitFor({ timeout: 1000 });
    expect(await line.locator("svg.role-shape").count()).toBe(1); // the sender's shape
    expect(await deaf.locator(".sheet").count()).toBe(0); // sending closes the sheet
  });

  it("written text reaches Can't speak by name, and the typing badge shows while writing", async () => {
    const { deaf, mute } = table.byRole;
    await deaf.keyboard.press("1");
    await deaf.keyboard.press("Enter");
    await deaf.locator(".typing-badge").waitFor({ timeout: 1000 });
    await deaf.keyboard.type("door is east");
    await deaf.keyboard.press("Enter");
    const line = mute.locator(".captions p", { hasText: "Bo: door is east" });
    await line.waitFor({ timeout: 1000 });
    expect(await line.locator("svg.role-shape").count()).toBe(1);
  });

  it("a sent face starts a cooldown the tile shows as a number", async () => {
    const { deaf } = table.byRole;
    await deaf.keyboard.press("3");
    await deaf.keyboard.press("1");
    const cd = tile(deaf, "show").locator(".cd");
    await cd.waitFor({ timeout: 1000 });
    expect(await cd.innerText()).toMatch(/^[12]$/);
    await expect.poll(() => cd.count(), { timeout: 4000 }).toBe(0);
  });

  it("0 moves the face hotbar between the first six and the other six", async () => {
    const { deaf } = table.byRole;
    await deaf.keyboard.press("3");
    const hint = (face: string) => deaf.locator(`.cell[aria-label="${face}"] kbd`);
    await expect(hint("OK").innerText()).resolves.toBe("1");
    expect(await hint("Laughing").count()).toBe(0);
    await deaf.keyboard.press("0");
    await expect(hint("Laughing").innerText()).resolves.toBe("1");
    expect(await hint("OK").count()).toBe(0);
    await deaf.keyboard.press("1"); // sends the seventh face, so the tile cools down
    await tile(deaf, "show").locator(".cd").waitFor({ timeout: 1000 });
    await deaf.keyboard.press("3");
    await expect(hint("OK").innerText()).resolves.toBe("1"); // reopening starts on the first six
  });

  it("the soundboard sends a clip with the same 1–6 and 0 keys as the faces", async () => {
    const { deaf } = table.byRole;
    await deaf.keyboard.press("2");
    const hint = (clip: string) => deaf.locator(`.cell[aria-label="${clip}"] kbd`);
    await expect(hint("Air horn").innerText()).resolves.toBe("1");
    await expect(hint("Scream").innerText()).resolves.toBe("6");
    await deaf.keyboard.press("0");
    await expect(hint("Fah").innerText()).resolves.toBe("1");
    expect(await hint("Air horn").count()).toBe(0);
    await deaf.keyboard.press("Escape");
    await deaf.keyboard.press("2");
    await deaf.keyboard.press("1"); // reopening starts on the first six, so this is the air horn
    const cd = tile(deaf, "sound").locator(".cd");
    await cd.waitFor({ timeout: 1000 });
    expect(await cd.innerText()).toMatch(/^[123]$/);
  });

  it("F and T switch between Faces and Stamps, and Show says you see replies", async () => {
    const { deaf } = table.byRole;
    await deaf.keyboard.press("3");
    await expect(deaf.locator(".sheet-note").first().innerText()).resolves.toBe(
      "You see replies here",
    );
    await deaf.keyboard.press("t");
    expect(await deaf.getByRole("button", { name: "Stamps" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    await deaf.keyboard.press("f");
    expect(await deaf.getByRole("button", { name: "Faces" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    // reopening Show starts on Faces again, so "3 then 1" always means the first face
    await deaf.keyboard.press("t");
    await deaf.keyboard.press("Escape");
    await deaf.keyboard.press("3");
    expect(await deaf.getByRole("button", { name: "Faces" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("makes no 'ready in' remark about stamps", async () => {
    const { deaf } = table.byRole;
    await deaf.keyboard.press("3");
    await deaf.keyboard.press("t");
    await deaf.keyboard.press("1"); // a stamp: starts the 1 s stamp clock
    await tile(deaf, "show").waitFor();
    await deaf.keyboard.press("3");
    await deaf.keyboard.press("t");
    await deaf.waitForTimeout(200);
    expect(await deaf.getByText(/ready in/i).count()).toBe(0);
  });

  it("draws faces at least 56 px in cells at least 72 px tall on the phone", async () => {
    await table.phone.keyboard.press("3");
    await table.phone.locator(".cell img").first().waitFor();
    const sizes = await table.phone.locator(".cell img").evaluateAll((els) =>
      els.map((el) => {
        const cell = el.closest(".cell")?.getBoundingClientRect();
        return { img: el.getBoundingClientRect().width, cell: cell?.height ?? 0 };
      }),
    );
    expect(sizes).toHaveLength(12);
    expect(sizes.filter((s) => s.img < 56 || s.cell < 72)).toEqual([]);
  });

  it("keeps every soundboard label whole on the phone: no word is wider than its button", async () => {
    await table.phone.keyboard.press("2");
    await table.phone.locator(".cell").first().waitFor();
    const clipped = await table.phone
      .locator(".sheet .cell")
      .evaluateAll((els) =>
        els
          .filter((el) => el.scrollWidth > el.clientWidth)
          .map((el) => el.getAttribute("aria-label")),
      );
    expect(clipped).toEqual([]);
    // and no label breaks inside a word: one line per word at most
    const words = await table.phone.locator(".sheet .cell-label").evaluateAll((els) =>
      els.map((el) => {
        const range = document.createRange();
        const broken: string[] = [];
        for (const word of (el.textContent ?? "").split(" ")) {
          const node = el.firstChild as Text;
          const at = (el.textContent ?? "").indexOf(word);
          range.setStart(node, at);
          range.setEnd(node, at + word.length);
          if (range.getClientRects().length > 1) broken.push(word);
        }
        return broken;
      }),
    );
    expect(words.flat()).toEqual([]);
  });

  it("faces can't be selected or dragged", async () => {
    await table.phone.keyboard.press("3");
    const img = table.phone.locator(".cell img").first();
    await img.waitFor();
    expect(await img.evaluate((el: HTMLImageElement) => el.draggable)).toBe(false);
    const css = await img.evaluate((el) => {
      const s = getComputedStyle(el);
      return { select: s.userSelect, events: s.pointerEvents };
    });
    expect(css).toEqual({ select: "none", events: "none" });
  });

  it("gives a right-click or long-press on a face no save-or-copy menu", async () => {
    await table.phone.keyboard.press("3");
    const img = table.phone.locator(".cell img").first();
    await img.waitFor();
    // the picture takes no pointer events, so a click lands on the button, never on an image
    const hit = await img.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.tagName;
    });
    expect(hit).toBe("BUTTON");
    // and the button's own context menu is suppressed
    const prevented = await img.evaluate((el) => {
      const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      el.closest(".cell")?.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(prevented).toBe(true);
    // while the other buttons keep the browser's normal menu
    const other = await table.phone
      .locator(".tray .tile")
      .first()
      .evaluate((el) => {
        const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
        el.dispatchEvent(e);
        return e.defaultPrevented;
      });
    expect(other).toBe(false);
  });

  it("styles the Faces and Stamps key hints like the tray's own", async () => {
    const { blind } = table.byRole; // desktop
    await blind.keyboard.press("3");
    const style = (loc: ReturnType<Page["locator"]>) =>
      loc.evaluate((el) => {
        const s = getComputedStyle(el);
        return { color: s.color, size: s.fontSize, weight: s.fontWeight, display: s.display };
      });
    const tabHint = await style(blind.locator(".tab kbd").first());
    expect(tabHint).toEqual(await style(blind.locator(".tile kbd").first()));
  });

  it("tells Can't hear their sound and caption settings are off because they can't hear", async () => {
    const { deaf, blind } = table.byRole;
    await deaf.locator(".hud-btn", { hasText: "Settings" }).click();
    for (const name of ["Captions", "Game sound", "Spoken lines"]) {
      const box = deaf.getByRole("checkbox", { name });
      expect(await box.isDisabled(), name).toBe(true);
      expect(await box.isChecked(), name).toBe(false);
    }
    await expect(deaf.locator(".settings-note").innerText()).resolves.toMatch(/can't hear/i);
    await blind.locator(".hud-btn", { hasText: "Settings" }).click();
    for (const name of ["Captions", "Game sound", "Spoken lines"]) {
      expect(await blind.getByRole("checkbox", { name }).isDisabled(), name).toBe(false);
    }
    expect(await blind.locator(".settings-note").count()).toBe(0);
  });

  it("has no axe violations with any sheet open, on a phone and on desktop", async () => {
    for (const role of ["blind", "deaf", "mute"] as const) {
      const page = table.byRole[role];
      for (const family of FAMILIES) {
        if (!CHANNEL_RULES[family].send.includes(role)) continue;
        await page.keyboard.press(KEY[family]);
        await page.locator(".sheet").waitFor();
        expect(await axeViolations(page), `${role} ${family}`).toEqual([]);
        if (family === "show") {
          await page.getByRole("button", { name: "Stamps" }).click();
          expect(await axeViolations(page), `${role} stamps`).toEqual([]);
        }
        await page.keyboard.press("Escape");
      }
    }
  });

  it("keeps every tray and sheet control at least 48 px on the phone", async () => {
    const phone = table.phone;
    const small: string[] = [];
    for (const family of FAMILIES) {
      await phone.keyboard.press(KEY[family]);
      await phone.locator(".sheet").waitFor();
      const boxes = await phone
        .locator(".sheet button, .sheet input, .tray button")
        .evaluateAll((els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return {
              name: el.textContent?.trim() || el.getAttribute("aria-label") || "?",
              w: r.width,
              h: r.height,
            };
          }),
        );
      for (const b of boxes)
        if (b.w < 48 || b.h < 48) small.push(`${family}: ${b.name} ${b.w}×${b.h}`);
      await phone.keyboard.press("Escape");
    }
    expect(small).toEqual([]);
  });

  it("does not overflow sideways on the phone with a sheet open", async () => {
    await table.phone.keyboard.press("3");
    await table.phone.locator(".sheet").waitFor();
    const over = await table.phone.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over).toBeLessThanOrEqual(0);
  });
});
