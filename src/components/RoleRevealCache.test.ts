// @vitest-environment jsdom
import { h, render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoleReveal } from "./RoleReveal.tsx";

afterEach(() => {
  render(null, document.body);
  document.body.innerHTML = "";
});

const crew = [
  { seat: 0, role: "blind", nickname: "Ana" },
  { seat: 1, role: "deaf", nickname: "Bo" },
  { seat: 2, role: "mute", nickname: "Cy" },
] as never;
const mount = (cache?: { motif: "moon"; riddle: string; item: "watch" }) =>
  render(
    h(RoleReveal, {
      name: "The safe",
      index: 3,
      rooms: 9,
      role: "blind",
      crew,
      ready: false,
      readySeats: [],
      onReady: vi.fn(),
      real: { lines: [] } as never,
      cues: [],
      played: {},
      sittingOut: [],
      watching: [],
      me: 0,
      host: true,
      onSwap: vi.fn(),
      audio: { current: null },
      cache,
    }),
    document.body,
  );

describe("RoleReveal's side-job row", () => {
  it("shows the motif at 48 px, the riddle and who may read it, only when given a cache", () => {
    mount({ motif: "moon", riddle: "Where the moon watches, listen twice.", item: "watch" });
    const row = document.querySelector(".reveal-cache") as HTMLElement;
    expect(row.textContent).toContain("Your side job");
    expect(row.textContent).toContain("Where the moon watches, listen twice.");
    expect(row.textContent).toContain("Only you can read this");
    expect(row.querySelector("svg")?.getAttribute("width")).toBe("48");
    expect(row.textContent).not.toContain("watch,"); // never what it hides
  });

  it("has no row without one", () => {
    mount();
    expect(document.querySelector(".reveal-cache")).toBeNull();
    expect(document.body.textContent).not.toContain("Your side job");
  });
});
