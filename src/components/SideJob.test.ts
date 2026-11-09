// @vitest-environment jsdom
import { h, render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import type { RoleView } from "../game/perception.ts";
import { MotifGlyph } from "./MotifGlyph.tsx";
import { SideJob } from "./SideJob.tsx";

afterEach(() => {
  render(null, document.body);
  document.body.innerHTML = "";
});

type Cache = NonNullable<RoleView["cache"]>;
const base: Cache = {
  id: "Q1",
  motif: "moon",
  riddle: "Where the moon watches, listen twice.",
  item: "watch",
  state: "open",
};
const mount = (cache: Cache | undefined, keepsake?: Cache["item"]) =>
  render(h(SideJob, { cache, keepsake }), document.body);
const chip = () => document.querySelector(".side-job") as HTMLElement;

describe("MotifGlyph", () => {
  it("draws each of the six motifs as its own shape, in the text colour", async () => {
    const { MOTIFS } = await import("../game/rooms/format.ts");
    const shapes = new Set<string>();
    for (const motif of MOTIFS) {
      render(h(MotifGlyph, { motif, size: 48 }), document.body);
      const d = [...document.querySelectorAll("svg path")].map((p) => p.getAttribute("d"));
      expect(d.length, motif).toBeGreaterThan(0);
      expect(document.querySelector("svg")?.getAttribute("fill"), motif).toBe("currentColor");
      shapes.add(d.join("|"));
    }
    expect(shapes.size).toBe(MOTIFS.length);
  });
});

describe("SideJob", () => {
  it("is nothing when the room has no side job for you", () => {
    mount(undefined);
    expect(chip()).toBeNull();
  });

  it.each(["hidden", "open"] as const)(
    "unsolved (%s): the motif and the riddle, never the item",
    (state) => {
      mount({ ...base, state });
      expect(chip().querySelector("svg")).not.toBeNull();
      expect(chip().textContent).toContain("Side job");
      expect(chip().textContent).toContain(base.riddle);
      expect(chip().textContent).not.toMatch(/gold watch|Taken|vault/);
      expect(chip().querySelector(".keepsake")).toBeNull();
    },
  );

  it("vault: the plate, the item's name and 'Waiting in the vault', no tick, never the riddle", () => {
    mount({ ...base, state: "vault", by: 1 });
    expect(chip().querySelector(".keepsake")).not.toBeNull();
    expect(chip().textContent).toContain("gold watch");
    expect(chip().textContent).toContain("Waiting in the vault");
    expect(chip().querySelector(".side-job-tick")).toBeNull();
    expect(chip().textContent).not.toContain(base.riddle);
    expect(chip().getAttribute("aria-label")).toBe("Side job in the vault: gold watch");
  });

  it("taken: the plate with the item in your slot, its name, a tick and 'Taken by you'", () => {
    mount({ ...base, state: "taken", by: 1 }, "watch");
    expect(chip().querySelector(".keepsake")).not.toBeNull();
    expect(chip().textContent).toContain("gold watch");
    expect(chip().textContent).toContain("Taken by you");
    expect(chip().querySelector(".side-job-tick")).not.toBeNull();
    expect(chip().textContent).not.toContain(base.riddle);
    expect(chip().getAttribute("aria-label")).toBe("Side job taken: gold watch");
  });

  it("the plate shows the keepsake in the slot when there is one", () => {
    mount({ ...base, state: "taken" }, "ring");
    expect(chip().textContent).toContain("signet ring");
  });

  it("an unsolved chip shows the whole riddle at first, and a click hides it down to 'Side job' and back", async () => {
    mount(base);
    const text = () => document.querySelector(".side-job-text");
    expect(chip().getAttribute("aria-expanded")).toBe("true");
    expect(text()?.textContent).toBe(base.riddle);
    chip().click();
    await new Promise((r) => setTimeout(r, 0)); // preact re-renders after the click, not during it
    expect(chip().getAttribute("aria-expanded")).toBe("false");
    expect(text()).toBeNull();
    expect(chip().textContent).toContain("Side job");
    expect(chip().textContent).not.toContain(base.riddle);
    chip().click();
    await new Promise((r) => setTimeout(r, 0));
    expect(text()?.textContent).toBe(base.riddle);
  });

  it("carries a small drawn chevron that says the chip can be shown or hidden, pointing the way it will go", async () => {
    mount(base);
    const chevron = () => chip().querySelector(".side-job-chevron");
    expect(chevron()).not.toBeNull();
    expect(chevron()?.getAttribute("aria-hidden")).toBe("true");
    const shown = chevron()?.getAttribute("data-open");
    chip().click();
    await new Promise((r) => setTimeout(r, 0));
    expect(chevron()?.getAttribute("data-open")).not.toBe(shown);
  });

  it("the two later states are not toggles", () => {
    for (const state of ["vault", "taken"] as const) {
      mount({ ...base, state });
      expect(chip().hasAttribute("aria-expanded")).toBe(false);
      expect(chip().tagName).toBe("DIV");
      expect(chip().querySelector(".side-job-chevron")).toBeNull();
    }
  });
});
