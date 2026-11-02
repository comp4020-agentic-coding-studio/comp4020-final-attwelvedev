// @vitest-environment jsdom
import { h, render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import type { RoleView } from "../game/perception.ts";
import type { Seat } from "../game/types.ts";
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
const NAMES = ["Ana", "Bo", "Cy"];
const mount = (cache: Cache | undefined, me: Seat = 0) =>
  render(h(SideJob, { cache, names: NAMES, me }), document.body);
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
      expect(chip().textContent).not.toMatch(/gold watch|Found by/);
      expect(chip().querySelector(".keepsake")).toBeNull();
    },
  );

  it("solved: the plate, the item's name, a tick and who found it, never the riddle", () => {
    mount({ ...base, state: "found", by: 1 });
    expect(chip().querySelector(".keepsake")).not.toBeNull();
    expect(chip().textContent).toContain("gold watch");
    expect(chip().textContent).toContain("Found by Bo");
    expect(chip().querySelector(".side-job-tick")).not.toBeNull();
    expect(chip().textContent).not.toContain(base.riddle);
    expect(chip().getAttribute("aria-label")).toBe("Side job found: gold watch, with Bo");
  });

  it("says Found by you when you pressed it", () => {
    mount({ ...base, state: "found", by: 0 }, 0);
    expect(chip().textContent).toContain("Found by you");
    expect(chip().getAttribute("aria-label")).toBe("Side job found: gold watch, with you");
  });

  it("an unsolved chip expands on a tap; a solved one does not", async () => {
    mount(base);
    expect(chip().getAttribute("aria-expanded")).toBe("false");
    chip().click();
    await new Promise((r) => setTimeout(r, 0)); // preact re-renders after the click, not during it
    expect(document.querySelector(".side-job-text.is-open")).not.toBeNull();
    mount({ ...base, state: "found", by: 1 });
    expect(chip().hasAttribute("aria-expanded")).toBe(false);
  });
});
