import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { DESKTOP, launch, PHONE } from "../browser.ts";
import { playRoom, type Table } from "../playUi.ts";

// Review F3 (Task 292): a transient alert ("Voice lagging", a new host, a vote's end) was a zero-height layer
// over the frame's top, at z 5, taking clicks: a wide one covered the open vote card, the side-job chip and Can't
// see's braille card, and took their clicks. Its neighbours at the frame's top, named here: `.vote-prompt`,
// `.side-job` (in `.top-stack`) and `.braille-card` (Can't see). None may overlap another, and each control
// takes a click at its centre. A real vote is open; the chip, the plate and the alert are the real classes put
// where the app puts them (the chip and plate need a cache or plate room, the alert a lagging voice).

const baseUrl = inject("baseUrl");
let browser: Browser;
let table: Table;
beforeAll(async () => {
  browser = await launch();
  table = await playRoom(browser, baseUrl);
  const { mute: cy } = table.byRole;
  await cy.getByRole("button", { name: "Menu" }).click();
  await cy.getByRole("button", { name: "Restart room", exact: true }).click();
  await cy.getByRole("button", { name: "Sure? Ask to restart room", exact: true }).click();
  for (const page of table.pages) await page.locator(".vote-prompt").waitFor({ timeout: 5000 });
}, 60_000);
afterAll(async () => {
  for (const page of table?.pages ?? []) await page.context().close();
  await browser.close();
});

interface Seen {
  boxes: Record<string, { x: number; y: number; w: number; h: number } | null>;
  clickable: Record<string, boolean>;
}

// Puts the probes in, measures every box and what a click at each control's centre lands on, takes them out.
const measure = (page: Page, braille: boolean): Promise<Seen> =>
  page.evaluate((braille) => {
    const alerts = document.querySelector(".hud-alerts") as HTMLElement;
    alerts.insertAdjacentHTML(
      "beforeend",
      `<p class="hud-alert" role="status" id="probe-alert">Voice lagging</p>`,
    );
    const stack = document.querySelector(".top-stack") as HTMLElement;
    stack.insertAdjacentHTML(
      "afterbegin",
      `<button type="button" class="side-job" id="probe-chip"><span class="side-job-lines"><span class="side-job-label">Side job</span><span class="side-job-text">Where the moon sits low, listen twice.</span></span></button>`,
    );
    if (braille) {
      stack
        .querySelector("#probe-chip")
        ?.insertAdjacentHTML(
          "afterend",
          `<fieldset class="braille-card" id="probe-braille"><p class="braille-title">Plate under your hand</p><p class="braille-teach">Raised dots, read left to right. Match each to the key.</p></fieldset>`,
        );
    }
    const els: Record<string, Element | null> = {
      alert: document.getElementById("probe-alert"),
      vote: document.querySelector(".vote-prompt"),
      chip: document.getElementById("probe-chip"),
      braille: document.getElementById("probe-braille"),
    };
    const boxes: Seen["boxes"] = {};
    for (const [k, el] of Object.entries(els)) {
      const r = el?.getBoundingClientRect();
      boxes[k] = r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    }
    // the control: the vote's first button where this seat may vote, else the card itself
    const targets: Record<string, Element | null> = {
      vote: document.querySelector(".vote-prompt button") ?? els.vote,
      chip: els.chip,
      braille: els.braille,
    };
    const clickable: Seen["clickable"] = {};
    for (const [k, el] of Object.entries(targets)) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      clickable[k] = hit !== null && (hit === el || el.contains(hit));
    }
    for (const id of ["probe-alert", "probe-chip", "probe-braille"])
      document.getElementById(id)?.remove();
    return { boxes, clickable };
  }, braille);

const overlap = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("an alert at the frame's top and its neighbours (Task 292)", () => {
  it("never overlap, and each neighbour's control takes its click, for every role at 375 and 1280", async () => {
    const results = await Promise.all(
      (["blind", "deaf", "mute"] as const).map(async (role) => {
        const page = table.byRole[role];
        const out: [string, Seen][] = [];
        for (const viewport of [DESKTOP, PHONE]) {
          await page.setViewportSize(viewport);
          out.push([`${role}@${viewport.width}`, await measure(page, role === "blind")]);
        }
        return out;
      }),
    );
    for (const [label, seen] of results.flat()) {
      const names = Object.keys(seen.boxes).filter((k) => seen.boxes[k]);
      expect(names, label).toEqual(expect.arrayContaining(["alert", "vote", "chip"]));
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const [a, b] = [names[i] as string, names[j] as string];
          const [ba, bb] = [seen.boxes[a], seen.boxes[b]];
          if (!ba || !bb) continue;
          expect(
            overlap(ba, bb),
            `${label}: ${a} ${JSON.stringify(ba)} and ${b} ${JSON.stringify(bb)}`,
          ).toBe(false);
        }
      }
      for (const [k, ok] of Object.entries(seen.clickable))
        expect(ok, `${label}: a click at the ${k}'s centre reaches it`).toBe(true);
    }
  }, 30_000);
});
