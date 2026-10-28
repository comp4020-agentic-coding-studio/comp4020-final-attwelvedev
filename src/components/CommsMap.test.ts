// @vitest-environment jsdom
import { h, render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import type { CommsEdge } from "../net/protocol.ts";
import { breakdown, CommsMap, commsSummary } from "./CommsMap.tsx";

afterEach(() => {
  render(null, document.body);
  document.body.innerHTML = "";
});

const crew = [
  { seat: 0, nickname: "Ana", role: "blind", bot: false },
  { seat: 1, nickname: "Bo", role: "deaf", bot: false },
  { seat: 2, nickname: "Cy", role: "mute", bot: false },
] as const;
const edges: CommsEdge[] = [
  { from: 0, to: 1, count: 14, by: { callout: 10, voice: 4 } },
  { from: 0, to: 2, count: 9, by: { voice: 9 } },
  { from: 1, to: 0, count: 6, by: { callout: 6 } },
  { from: 2, to: 0, count: 3, by: { clip: 3 } },
  { from: 2, to: 1, count: 2, by: { mark: 2 } },
];

describe("the comms map", () => {
  it("sums up the busiest direction and the quietest sender, by name", () => {
    expect(commsSummary(edges, crew)).toBe("Most messages went Ana → Bo. Cy sent 5 in total.");
    expect(commsSummary([], crew)).toBe("No messages this room.");
    expect(commsSummary(edges.slice(0, 2), crew)).toBe(
      "Most messages went Ana → Bo. Bo sent nothing.",
    );
  });

  it("breaks an arrow down by method, most first", () => {
    expect(breakdown({ callout: 10, voice: 4 })).toBe("callout 10 · voice 4");
  });

  it("draws an arrow each way between every two players, and a button for each that carried anything", () => {
    render(h(CommsMap, { edges, crew }), document.body);
    expect(document.querySelectorAll(".comms-edge")).toHaveLength(6);
    const chips = [...document.querySelectorAll<HTMLButtonElement>("button.comms-chip")];
    expect(chips.map((c) => c.textContent)).toEqual([
      "Ana → Bo 14",
      "Ana → Cy 9",
      "Bo → Ana 6",
      "Cy → Ana 3",
      "Cy → Bo 2",
    ]);
    expect(chips[0]?.getAttribute("aria-label")).toBe("Ana to Bo: 14 (callout 10 · voice 4)");
    expect(document.querySelector('[data-edge="0>1"] title')?.textContent).toBe(
      "Ana → Bo: callout 10 · voice 4",
    );
    expect(document.querySelector(".comms-summary")?.textContent).toBe(
      "Most messages went Ana → Bo. Cy sent 5 in total.",
    );
  });

  it("thickens an arrow by its share of the busiest", () => {
    render(h(CommsMap, { edges, crew }), document.body);
    const width = (k: string) =>
      Number(
        document.querySelector(`[data-edge="${k}"] .comms-arrow`)?.getAttribute("stroke-width"),
      );
    expect(width("0>1")).toBe(8);
    expect(width("2>1")).toBeLessThan(width("1>0"));
    expect(width("1>2")).toBe(1);
  });

  it("shows an arrow's breakdown, and lights the arrow, while its button has focus", async () => {
    render(h(CommsMap, { edges, crew }), document.body);
    const chip = document.querySelectorAll<HTMLButtonElement>("button.comms-chip")[1];
    chip?.focus();
    await Promise.resolve();
    expect(document.querySelector(".comms-detail")?.textContent).toBe("Ana → Cy: voice 9");
    expect(document.querySelector('[data-edge="0>2"]')?.classList.contains("active")).toBe(true);
    expect(chip?.getAttribute("aria-pressed")).toBe("true");
  });
});
