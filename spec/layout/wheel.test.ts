import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { axeViolations, horizontalOverflow, launch } from "../browser.ts";
import { leaveGameAndClose } from "../lobbyUi.ts";
import {
  canvasHash as canvasPicture,
  playRoom,
  settledHash as settledPicture,
  type Table,
} from "../playUi.ts";

const baseUrl = inject("baseUrl");
const HOOK_MS = 30_000;
let browser: Browser;
// One room for the file: seating three players takes seconds. Room 1: seat 0
// Can't see on the host's desktop, seat 1 Can't hear on the phone, seat 2
// Can't speak on a second desktop.
let table: Table;
beforeAll(async () => {
  browser = await launch();
  table = await playRoom(browser, baseUrl);
}, HOOK_MS);
afterAll(async () => {
  for (const page of table?.pages ?? []) await leaveGameAndClose(page, baseUrl);
  await browser?.close();
}, HOOK_MS);

// The wheel's centre is the middle of the map frame for the Q key.
const frameCentre = async (page: Page) => {
  const box = await page.locator(".frame").boundingBox();
  if (!box) throw new Error("no frame");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

// Puts the real cursor over a drawn slot, by its accessible name (a word on it, or a
// face's alt text), as a person would. The cursor is what aims, so this is the test.
async function pointAt(page: Page, name: string): Promise<void> {
  const slot = page
    .locator(".wheel-slot")
    .filter({ has: page.getByText(name, { exact: true }) })
    .or(page.locator(`.wheel-slot:has(img[alt="${name}"])`))
    .first();
  const box = await slot.boundingBox();
  if (!box) throw new Error(`no slot ${name}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
}

// A flick, performed inside the page in one task: Q goes down, the pointer moves, Q goes up,
// a few ms apart. Done from the test runner, each step is a round trip that can take tens of
// milliseconds on a busy machine, so a "quick" flick would sometimes outlast the 200 ms the
// wheel waits before drawing, and the test would measure the runner and not the app.
async function flick(page: Page, dx: number, dy: number): Promise<void> {
  const c = await frameCentre(page);
  await page.mouse.move(c.x, c.y); // the pointer is somewhere on the map when Q goes down
  await page.evaluate(
    async ({ from, to }) => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const key = (type: string) =>
        window.dispatchEvent(new KeyboardEvent(type, { key: "q", code: "KeyQ", bubbles: true }));
      key("keydown");
      await wait(15);
      for (let i = 1; i <= 4; i++) {
        window.dispatchEvent(
          new PointerEvent("pointermove", {
            clientX: from.x + (to.x - from.x) * (i / 4),
            clientY: from.y + (to.y - from.y) * (i / 4),
            bubbles: true,
          }),
        );
        await wait(10);
      }
      key("keyup");
    },
    { from: c, to: { x: c.x + dx, y: c.y + dy } },
  );
}

// Waits out a cooldown so one test's send does not make the next one say "Wait".
const settle = (page: Page, ms: number) => page.waitForTimeout(ms);

describe("the comms wheel", () => {
  it("a Q flick up-right from Can't hear reaches Can't speak as 'Here' within a second, and the wheel never drew", async () => {
    const { deaf, mute } = table.byRole;
    let drew = false;
    await deaf.exposeFunction("__drew", () => {
      drew = true;
    });
    await deaf.evaluate(() => {
      new MutationObserver(() => {
        if (document.querySelector(".wheel")) (window as never as { __drew: () => void }).__drew();
      }).observe(document.body, { childList: true, subtree: true });
    });
    await flick(deaf, 40, -40);
    await mute.locator(".captions p", { hasText: "Bo: Here" }).waitFor({ timeout: 1000 });
    expect(drew).toBe(false);
  });

  it("holding Q draws the wheel with receivers named, and Can't speak's Talk page is hatched with who can", async () => {
    const { deaf, mute } = table.byRole;
    const c = await frameCentre(deaf);
    await deaf.mouse.move(c.x, c.y);
    await deaf.keyboard.down("q");
    await deaf.locator(".wheel").waitFor({ timeout: 1000 });
    const plate = await deaf.locator(".wheel-plate").innerText();
    expect(plate).toContain("Ana");
    expect(plate).toContain("Cy");
    expect(plate).toContain("hears this");
    await deaf.keyboard.up("q");
    await deaf.locator(".wheel").waitFor({ state: "detached" });

    // Can't speak opens on Faces; Talk is page 1 and every slot on it is hatched
    const m = await frameCentre(mute);
    await mute.mouse.move(m.x, m.y);
    await mute.keyboard.down("q");
    await mute.locator(".wheel").waitFor({ timeout: 1000 });
    await mute.keyboard.press("1");
    await mute.locator(".wheel-tab.is-page", { hasText: "Talk" }).waitFor();
    const slots = mute.locator(".wheel-slot");
    expect(await slots.count()).toBe(9);
    expect(await mute.locator(".wheel-slot.cant").count()).toBe(9);
    expect(await slots.first().evaluate((el) => getComputedStyle(el).backgroundImage)).toContain(
      "gradient",
    );
    const sorry = await mute.locator(".wheel-plate").innerText();
    expect(sorry).toMatch(/You can't send callouts/);
    expect(sorry).toContain("Ana");
    expect(sorry).toContain("Bo");
    expect(sorry).toMatch(/can\.$/);
    await mute.keyboard.press("Escape");
    await mute.keyboard.up("q");
    await mute.locator(".wheel").waitFor({ state: "detached" });
  });

  it("Esc cancels, and releasing beyond the rim sends nothing", async () => {
    const { deaf, mute } = table.byRole;
    const c = await frameCentre(deaf);
    // earlier tests' lines fade after 5 s: start from a quiet caption list so any new
    // "Bo: ..." line can only be from this test
    await mute.waitForFunction(() => document.querySelectorAll(".captions p").length === 0, null, {
      timeout: 7000,
    });
    await deaf.mouse.move(c.x, c.y);
    await deaf.keyboard.down("q");
    await deaf.locator(".wheel").waitFor({ timeout: 1000 });
    // the cursor aims, so leave the drawn ring: straight up, well past its rim
    const ring = await deaf.locator(".wheel").boundingBox();
    await deaf.mouse.move(c.x, (ring?.y ?? c.y) - 40, { steps: 4 });
    await deaf.keyboard.up("q");
    await deaf.locator(".wheel").waitFor({ state: "detached" });
    await deaf.waitForTimeout(400);
    expect(await mute.locator(".captions p", { hasText: /^Bo:/ }).count()).toBe(0);
    await deaf.keyboard.down("q");
    await deaf.locator(".wheel").waitFor({ timeout: 1000 });
    await deaf.keyboard.press("Escape");
    await deaf.locator(".wheel").waitFor({ state: "detached" });
    await deaf.keyboard.up("q");
  });

  it("a face picked from the wheel shows a cooldown number on its slot", async () => {
    const { deaf } = table.byRole;
    const c = await frameCentre(deaf);
    await deaf.mouse.move(c.x, c.y);
    await deaf.keyboard.down("q");
    await deaf.locator(".wheel").waitFor({ timeout: 1000 });
    await deaf.keyboard.press("2"); // Faces
    await deaf.locator(".wheel-tab.is-page", { hasText: "Faces" }).waitFor();
    await pointAt(deaf, "OK"); // the first face, under the real cursor
    await deaf.keyboard.up("q");
    // the slot is cooling: open the wheel again and read the number on it
    await deaf.waitForTimeout(100);
    await deaf.mouse.move(c.x, c.y);
    await deaf.keyboard.down("q");
    await deaf.locator(".wheel").waitFor({ timeout: 1000 });
    await deaf.keyboard.press("2");
    const cd = deaf.locator(".wheel-slot .wheel-cd").first();
    await cd.waitFor({ timeout: 1000 });
    expect(await cd.innerText()).toMatch(/^[12]$/);
    await deaf.keyboard.press("Escape");
    await deaf.keyboard.up("q");
    await settle(deaf, 1600);
  });

  it("remembers the page last used: Faces stays Faces next time", async () => {
    const { deaf } = table.byRole;
    const c = await frameCentre(deaf);
    await deaf.mouse.move(c.x, c.y);
    await deaf.keyboard.down("q");
    await deaf.locator(".wheel").waitFor({ timeout: 1000 });
    await deaf.keyboard.press("2");
    await deaf.keyboard.press("Escape");
    await deaf.keyboard.up("q");
    await deaf.keyboard.down("q");
    await deaf.locator(".wheel-tab.is-page", { hasText: "Faces" }).waitFor({ timeout: 1000 });
    await deaf.keyboard.press("1"); // back to Talk for the tests that follow
    await deaf.keyboard.press("Escape");
    await deaf.keyboard.up("q");
  });

  it("placing a mark on a visible tile shows it to Can't speak there; a wall tile says not in sight and sends nothing", async () => {
    const { deaf, mute } = table.byRole;
    const c = await frameCentre(deaf);
    await deaf.mouse.move(c.x, c.y);
    await deaf.keyboard.down("q");
    await deaf.locator(".wheel").waitFor({ timeout: 1000 });
    await deaf.keyboard.press("4"); // Marks
    await deaf.locator(".wheel-tab.is-page", { hasText: "Marks" }).waitFor();
    await pointAt(deaf, "→"); // the right arrow
    await deaf.keyboard.up("q");
    await deaf.locator(".comms-place-note").waitFor({ timeout: 1000 });
    // the top-left of the frame is the room's outer wall
    const box = await deaf.locator(".frame canvas").boundingBox();
    if (!box) throw new Error("no canvas");
    await deaf.mouse.click(box.x + 3, box.y + 3);
    await deaf.locator(".comms-toast", { hasText: "Not in sight" }).waitFor({ timeout: 1000 });
    // a floor tile a step from the player: the map is fitted on desktop, so click beside the centre
    await deaf.mouse.click(c.x + 6, c.y + 6);
    await deaf.locator(".comms-toast", { hasText: "Sent" }).waitFor({ timeout: 1500 });
    await expect
      .poll(
        () =>
          mute.evaluate(
            () => document.querySelectorAll(".frame canvas").length, // the mark itself is drawn on the canvas
          ),
        { timeout: 1000 },
      )
      .toBe(1);
    await mute.waitForTimeout(100);
    await settle(deaf, 1100);
  });

  it("a refused send says why on the wheel and never replaces the game with a Problem", async () => {
    const { blind, mute } = table.byRole;
    // Can't speak can't send callouts: pressing 4 sends a face instead, so go through the wheel's Talk page
    const c = await frameCentre(mute);
    await mute.mouse.move(c.x, c.y);
    await mute.keyboard.down("q");
    await mute.locator(".wheel").waitFor({ timeout: 1000 });
    await mute.keyboard.press("1");
    await pointAt(mute, "Here");
    await mute.keyboard.up("q");
    await mute.locator(".comms-toast", { hasText: "You can't send callouts" }).waitFor({
      timeout: 1000,
    });
    // a mark picked while Can't see can't send marks at all
    await blind.keyboard.down("q");
    await blind.locator(".wheel").waitFor({ timeout: 1000 });
    await blind.keyboard.press("4");
    await blind.keyboard.press("Escape");
    await blind.keyboard.up("q");
    for (const page of [blind, mute]) {
      expect(await page.locator(".error").count()).toBe(0);
      expect(await page.locator(".frame canvas").count()).toBe(1);
    }
  });

  it("an out-of-sight mark is refused as not in sight, and the game carries on", async () => {
    const { deaf } = table.byRole;
    const c = await frameCentre(deaf);
    await deaf.mouse.move(c.x, c.y);
    await deaf.keyboard.down("q");
    await deaf.locator(".wheel").waitFor({ timeout: 1000 });
    await deaf.keyboard.press("4");
    await pointAt(deaf, "→");
    await deaf.keyboard.up("q");
    await deaf.locator(".comms-place-note").waitFor({ timeout: 1000 });
    // the outer wall is on the map but not a tile you can see across
    const box = await deaf.locator(".frame canvas").boundingBox();
    if (!box) throw new Error("no canvas");
    await deaf.mouse.click(box.x + 3, box.y + 3);
    await deaf.locator(".comms-toast", { hasText: "Not in sight" }).waitFor({ timeout: 1000 });
    expect(await deaf.locator(".error").count()).toBe(0);
    expect(await deaf.locator(".frame canvas").count()).toBe(1);
    await deaf.keyboard.press("Escape");
  });

  it("the cursor itself aims: the slot under it is the one named and sent, with no steering dot", async () => {
    const { blind, mute } = table.byRole;
    const c = await frameCentre(blind);
    await blind.mouse.move(c.x - 300, c.y - 200); // the cursor starts nowhere near the middle
    await blind.keyboard.down("q");
    await blind.locator(".wheel").waitFor({ timeout: 1000 });
    expect(await blind.locator(".wheel-dot, .wheel-finger").count()).toBe(0);
    await blind.keyboard.press("1");
    expect(await blind.locator(".wheel-slot.is-aimed").count()).toBe(0); // off the wheel: nothing aimed
    await pointAt(blind, "Wait");
    await expect(blind.locator(".wheel-name").innerText()).resolves.toBe("Wait");
    await blind.keyboard.up("q");
    await mute.locator(".captions p", { hasText: "Ana: Wait" }).waitFor({ timeout: 1000 });
  });

  it("the plate names the item on its own line, with no dash, and each receiver's own verb", async () => {
    const { blind, deaf, mute } = table.byRole;
    const plate = async (page: Page, key: string, name: string) => {
      const c = await frameCentre(page);
      await page.mouse.move(c.x, c.y);
      await page.keyboard.down("q");
      await page.locator(".wheel").waitFor({ timeout: 1000 });
      await page.keyboard.press(key);
      await pointAt(page, name);
      const text = await page.locator(".wheel-plate").innerText();
      await page.keyboard.press("Escape");
      await page.keyboard.up("q");
      return text;
    };
    const face = await plate(blind, "2", "OK");
    expect(face).not.toContain("\u2014"); // no em dash
    expect(face).toMatch(/sees this/);
    expect(face).not.toMatch(/hears this/);
    const callout = await plate(deaf, "1", "Wait");
    expect(callout).not.toContain("\u2014");
    expect(callout).toMatch(/Ana hears this/); // Can't see hears it
    expect(callout).toMatch(/Cy hears this/); // Can't speak can't talk, but they hear
    const clip = await plate(mute, "3", "Bruh");
    expect(clip).toMatch(/Ana hears this/);
  });

  it("puts the Comms button in the same row as Write and Hold to talk, and says no more than it needs to", async () => {
    const { blind, deaf } = table.byRole;
    // the two desktop pages: the phone has its wheel and quick buttons beside Act instead
    const row = (page: Page) => page.locator(".talk-row");
    for (const page of [blind]) {
      const button = row(page).getByRole("button", { name: /comms/i });
      await expect(button.innerText()).resolves.toMatch(/Q/);
      const write = row(page).getByRole("button", { name: "Write a message" });
      const a = await button.boundingBox();
      const b = await write.boundingBox();
      if (!a || !b) throw new Error("missing button");
      expect(Math.abs(a.y - b.y), "same row").toBeLessThan(8);
    }
    // nothing repeats it: no "hold for comms, or click Comms" line
    for (const page of [blind, deaf]) {
      expect(await page.getByText(/hold for comms/i).count()).toBe(0);
    }
    expect(await blind.locator(".keys").innerText()).toMatch(/WASD/);
  });

  it("Can't speak has the Comms button too, beside its hatched Can't talk", async () => {
    const { mute } = table.byRole;
    const row = mute.locator(".talk-row");
    await expect(row.getByRole("button", { name: /comms/i }).innerText()).resolves.toMatch(/Q/);
    await expect(row.getByText("Can't talk").innerText()).resolves.toBe("Can't talk");
  });

  it("number keys no longer send anything: nobody has to remember a map of them", async () => {
    const { deaf, mute } = table.byRole;
    await mute.waitForFunction(() => document.querySelectorAll(".captions p").length === 0, null, {
      timeout: 7000,
    });
    for (const key of ["1", "4", "9"]) {
      await deaf.keyboard.press(key);
      await mute.keyboard.press(key);
    }
    await deaf.waitForTimeout(500);
    expect(await mute.locator(".captions p", { hasText: /^Bo:/ }).count()).toBe(0);
    expect(await deaf.locator(".comms-toast").count()).toBe(0);
  });

  it("the Comms button opens the wheel and stays open; clicking a slot sends and closes", async () => {
    const { blind, mute } = table.byRole;
    await mute.waitForFunction(() => document.querySelectorAll(".captions p").length === 0, null, {
      timeout: 7000,
    });
    // Can't see sends a face: a click opens, a click on the Faces label, a click on a face
    await blind.getByRole("button", { name: /comms/i }).click();
    await blind.locator(".wheel").waitFor({ timeout: 1000 });
    await blind.waitForTimeout(400); // still there: a click opened it, nobody is holding anything
    expect(await blind.locator(".wheel").count()).toBe(1);
    await blind.locator(".wheel-tab", { hasText: "Faces" }).click();
    await blind.locator(".wheel-tab.is-page", { hasText: "Faces" }).waitFor({ timeout: 1000 });
    await blind.locator(".wheel-slot").first().click();
    await blind.locator(".comms-toast", { hasText: "Sent" }).waitFor({ timeout: 1000 });
    await blind.locator(".wheel").waitFor({ state: "detached", timeout: 1000 });
  });

  it("a wheel opened by click closes on Esc, on a click outside it, and on the button again", async () => {
    const { blind } = table.byRole;
    const button = blind.getByRole("button", { name: /comms/i });
    await button.click();
    await blind.locator(".wheel").waitFor({ timeout: 1000 });
    await blind.keyboard.press("Escape");
    await blind.locator(".wheel").waitFor({ state: "detached", timeout: 1000 });
    await button.click();
    await blind.locator(".wheel").waitFor({ timeout: 1000 });
    const frame = await blind.locator(".frame").boundingBox();
    if (!frame) throw new Error("no frame");
    await blind.mouse.click(frame.x + 10, frame.y + 10); // empty corner, outside the outline
    await blind.locator(".wheel").waitFor({ state: "detached", timeout: 1000 });
    await button.click();
    await blind.locator(".wheel").waitFor({ timeout: 1000 });
    await button.click();
    await blind.locator(".wheel").waitFor({ state: "detached", timeout: 1000 });
  });

  it("a clicked slot Can't see can't send says why and keeps the wheel open to choose again", async () => {
    const { blind } = table.byRole;
    await blind.getByRole("button", { name: /comms/i }).click();
    await blind.locator(".wheel").waitFor({ timeout: 1000 });
    await blind.locator(".wheel-tab", { hasText: "Clips" }).click();
    await blind.locator(".wheel-slot").first().click();
    await blind.locator(".comms-toast", { hasText: "You can't send clips" }).waitFor({
      timeout: 1000,
    });
    expect(await blind.locator(".wheel").count()).toBe(1);
    await blind.keyboard.press("Escape");
  });

  it("never wraps a word or lets two slots overlap, on any page, on the phone or desktop", async () => {
    for (const page of [table.byRole.blind, table.phone]) {
      const c = await frameCentre(page);
      await page.mouse.move(c.x, c.y);
      await page.keyboard.down("q");
      await page.locator(".wheel").waitFor({ timeout: 1000 });
      for (const key of ["1", "2", "3", "4"]) {
        await page.keyboard.press(key);
        await page.waitForTimeout(60);
        const problems = await page.locator(".wheel-slot").evaluateAll((els) => {
          const boxes = els.map((e) => ({ r: e.getBoundingClientRect(), t: e.textContent }));
          const out: string[] = [];
          for (const e of els) {
            const label = e.querySelector(".wheel-label, .wheel-slot > :not(kbd)");
            if (label && label.getClientRects().length > 1) out.push(`wrapped: ${e.textContent}`);
            if (e.scrollWidth > e.clientWidth + 1) out.push(`overflows: ${e.textContent}`);
          }
          for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
              const a = boxes[i]?.r;
              const b = boxes[j]?.r;
              if (!a || !b) continue;
              const apart =
                a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
              if (!apart) out.push(`overlap: ${boxes[i]?.t} / ${boxes[j]?.t}`);
            }
          }
          return out;
        });
        expect(problems, `page ${key}`).toEqual([]);
      }
      await page.keyboard.press("Escape");
      await page.keyboard.up("q");
    }
  });

  it("keeps the plate and page labels inside the frame, for every role and page, aimed or not", async () => {
    for (const [role, page] of [
      ["blind", table.byRole.blind],
      ["deaf", table.phone],
      ["mute", table.byRole.mute],
    ] as const) {
      const c = await frameCentre(page);
      await page.mouse.move(c.x, c.y);
      await page.keyboard.down("q");
      await page.locator(".wheel").waitFor({ timeout: 1000 });
      const frame = await page.locator(".frame").boundingBox();
      if (!frame) throw new Error("no frame");
      for (const key of ["1", "2", "3", "4"]) {
        await page.keyboard.press(key);
        // once unaimed (the cursor is on the middle), once aimed at the first slot
        for (const aim of [false, true]) {
          if (aim) {
            const slot = await page.locator(".wheel-slot").first().boundingBox();
            if (slot) await page.mouse.move(slot.x + slot.width / 2, slot.y + slot.height / 2);
          } else {
            await page.mouse.move(c.x, c.y);
          }
          await page.waitForTimeout(50);
          for (const sel of [
            ".wheel-plate",
            ".wheel-tabs li:first-child",
            ".wheel-tabs li:last-child",
            ".wheel-outline",
          ]) {
            const box = await page.locator(sel).boundingBox();
            if (!box) throw new Error(`${role} ${key} ${sel}`);
            const where = `${role} page ${key} ${aim ? "aimed" : "idle"} ${sel}`;
            expect(box.y, where).toBeGreaterThanOrEqual(frame.y - 0.5);
            expect(box.y + box.height, where).toBeLessThanOrEqual(frame.y + frame.height + 0.5);
            expect(box.x, where).toBeGreaterThanOrEqual(frame.x - 0.5);
            expect(box.x + box.width, where).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
          }
          // the plate's text itself must not be cut off by its own box
          const clipped = await page
            .locator(".wheel-plate")
            .evaluate((el) => el.scrollHeight > el.clientHeight + 1);
          expect(clipped, `${role} page ${key} ${aim ? "aimed" : "idle"} plate text clipped`).toBe(
            false,
          );
        }
      }
      await page.keyboard.press("Escape");
      await page.keyboard.up("q");
    }
  });

  it("a face you send shows above your own character, for a role that has a map", async () => {
    const { mute } = table.byRole;
    // the pop is drawn on the canvas, so compare it with and without: a face adds pixels over the head
    await mute.waitForTimeout(1700); // any earlier face cooldown
    await settledPicture(mute);
    const before = await settledPicture(mute);
    const c = await frameCentre(mute);
    await mute.mouse.move(c.x, c.y);
    await mute.keyboard.down("q");
    await mute.locator(".wheel").waitFor({ timeout: 1000 });
    await mute.keyboard.press("2");
    await pointAt(mute, "OK");
    await mute.keyboard.up("q");
    await mute.locator(".comms-toast", { hasText: "Sent" }).waitFor({ timeout: 1000 });
    // within the 1.5 s the pop lasts, the canvas differs from the resting scene
    let differs = false;
    const until = Date.now() + 1200;
    while (!differs && Date.now() < until) {
      differs = (await canvasPicture(mute)) !== before;
      await mute.waitForTimeout(60);
    }
    expect(differs, "Can't speak sees their own face above their character").toBe(true);
    // and it goes away after 1.5 s
    await mute.waitForTimeout(1800);
    expect(await settledPicture(mute)).toBe(before);
  });

  it("Can't speak's captions show an arrow image with an accessible direction, and Can't hear's frame has no sound captions", async () => {
    const { blind, mute, deaf } = table.byRole;
    // Can't hear even asks for captions: nothing is played to them, so none are shown
    await deaf.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("heist.settings") ?? "{}");
      localStorage.setItem("heist.settings", JSON.stringify({ ...saved, captions: true }));
    });
    await deaf.reload({ waitUntil: "networkidle" });
    await deaf.locator(".frame canvas").waitFor({ timeout: 10_000 });
    // Can't see walks, so the others hear footsteps from somewhere
    await blind.keyboard.down("d");
    const arrow = mute.locator(".captions .cue .dir-arrow").first();
    await arrow.waitFor({ timeout: 4000 });
    expect(await arrow.getAttribute("role")).toBe("img");
    expect(await arrow.getAttribute("aria-label")).toMatch(
      /^from (above|below|the (upper |lower )?(left|right))$/,
    );
    expect(await mute.locator(".captions .cue").innerText()).not.toMatch(/\b(left|right|ahead)\b/);
    await deaf.waitForTimeout(600);
    expect(await deaf.locator(".captions .cue").count()).toBe(0);
    await blind.keyboard.up("d");
  });

  it("says nothing in the game UI about Say, Sound, Show or channels", async () => {
    for (const page of table.pages) {
      const text = await page.locator(".game").innerText();
      for (const word of ["Say", "Sound", "Show", "channel", "Channel"]) {
        expect(new RegExp(`\\b${word}\\b`).test(text), `${word} in the frame`).toBe(false);
      }
    }
  });

  it("has no axe violations with the wheel open, on a phone and on desktop", async () => {
    for (const page of [table.byRole.deaf, table.phone]) {
      const c = await frameCentre(page);
      await page.mouse.move(c.x, c.y);
      await page.keyboard.down("q");
      await page.locator(".wheel").waitFor({ timeout: 1000 });
      expect(await axeViolations(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await page.keyboard.up("q");
    }
  });
});

describe("the comms wheel on a phone", () => {
  it("holding the wheel button and dragging sends", async () => {
    const { phone } = table;
    const { mute } = table.byRole;
    const button = phone.locator(".wheel-btn");
    await button.waitFor();
    const b = await button.boundingBox();
    if (!b) throw new Error("no wheel button");
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    // the phone is Can't hear: a flick up-left is Push on the Talk page
    await phone.mouse.move(cx, cy);
    await phone.mouse.down();
    await phone.waitForTimeout(300); // hold still: the wheel draws, as it does under a thumb
    await phone.keyboard.press("1"); // Talk, whatever page an earlier test left it on
    await phone.mouse.move(cx - 60, cy - 60, { steps: 4 });
    await phone.mouse.up();
    await mute.locator(".captions p", { hasText: "Bo: Push" }).waitFor({ timeout: 1500 });
  });

  it("a quick tap on the wheel button opens the wheel to choose from, and a tap on a slot sends", async () => {
    const { phone } = table;
    const { mute } = table.byRole;
    await mute.waitForFunction(() => document.querySelectorAll(".captions p").length === 0, null, {
      timeout: 7000,
    });
    // a real touch tap: the page gets genuine pointer events, with a live pointer to capture
    await phone.locator(".wheel-btn").tap();
    await phone.locator(".wheel.is-click").waitFor({ timeout: 1000 });
    await phone.waitForTimeout(400); // still open: nothing is being held
    expect(await phone.locator(".wheel").count()).toBe(1);
    await phone.locator(".wheel-slot", { hasText: "Wait" }).tap();
    await mute.locator(".captions p", { hasText: "Bo: Wait" }).waitFor({ timeout: 1500 });
    await phone.locator(".wheel").waitFor({ state: "detached", timeout: 1000 });
  });

  it("every wheel and control target is at least 48 px, and none overlap", async () => {
    const { phone } = table;
    const named = [".wheel-btn", ".quick-btn", "[data-joystick]", "[data-act]"];
    const boxes = [];
    for (const sel of named) {
      const box = await phone.locator(sel).boundingBox();
      if (!box) throw new Error(`no ${sel}`);
      expect(box.width, sel).toBeGreaterThanOrEqual(48);
      expect(box.height, sel).toBeGreaterThanOrEqual(48);
      boxes.push({ sel, box });
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]?.box;
        const b = boxes[j]?.box;
        if (!a || !b) continue;
        const apart =
          a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y;
        expect(apart, `${boxes[i]?.sel} overlaps ${boxes[j]?.sel}`).toBe(true);
      }
    }
    // and on the wheel itself
    const b = await phone.locator(".wheel-btn").boundingBox();
    if (!b) throw new Error("no wheel button");
    await phone.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await phone.mouse.down();
    await phone.waitForTimeout(300);
    await phone.locator(".wheel").waitFor({ timeout: 1000 });
    const small = await phone.locator(".wheel-slot").evaluateAll((els) =>
      els
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width < 48 || r.height < 48)
        .map((r) => `${r.width}×${r.height}`),
    );
    expect(small).toEqual([]);
    expect(await horizontalOverflow(phone)).toBeLessThanOrEqual(0);
    await phone.mouse.move(b.x - 300, b.y - 300); // beyond the rim: cancels
    await phone.mouse.up();
    await phone.locator(".wheel").waitFor({ state: "detached" });
  });
});
