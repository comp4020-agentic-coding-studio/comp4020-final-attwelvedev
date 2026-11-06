// @vitest-environment jsdom
import { h, render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import type { CommsEdge } from "../net/protocol.ts";
import { breakdown, CommsMap, commsSummary, voiceTime } from "./CommsMap.tsx";

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
  { from: 0, to: 1, count: 10, by: { callout: 10 }, voiceMs: 45_000 },
  { from: 0, to: 2, count: 0, by: {}, voiceMs: 25_000 },
  { from: 1, to: 0, count: 6, by: { callout: 6 } },
  { from: 2, to: 0, count: 3, by: { clip: 3 } },
  { from: 2, to: 1, count: 2, by: { mark: 2 } },
];

describe("the comms map", () => {
  it("names the busiest direction, voice counting by its time", () => {
    // 10 callouts plus 45 s of voice outweigh 25 s of voice alone; and a long talk outweighs a few texts
    expect(commsSummary(edges, crew)).toBe("Most went Ana → Bo.");
    expect(
      commsSummary(
        [
          { from: 1, to: 0, count: 3, by: { text: 3 } },
          { from: 2, to: 0, count: 0, by: {}, voiceMs: 120_000 },
        ],
        crew,
      ),
    ).toBe("Most went Cy → Ana.");
    expect(commsSummary([], crew)).toBe("No messages this room.");
  });

  it("says voice as time, never as a count of spurts", () => {
    expect(voiceTime(45_000)).toBe("45 s");
    expect(voiceTime(125_000)).toBe("2 min 5 s");
    expect(voiceTime(120_000)).toBe("2 min");
    expect(voiceTime(200)).toBe("1 s");
    expect(breakdown({ callout: 10 }, 45_000)).toBe("callout 10 · voice 45 s");
    expect(breakdown({}, 125_000)).toBe("voice 2 min 5 s");
  });

  it("draws an arrow each way between every two players, each a stop that says what it carried", () => {
    render(h(CommsMap, { edges, crew }), document.body);
    expect(document.querySelectorAll(".comms-edge")).toHaveLength(6);
    // the arrows are the way in: no separate buttons
    expect(document.querySelectorAll("button")).toHaveLength(0);
    const arrow = document.querySelector('[data-edge="0>1"]');
    expect(arrow?.getAttribute("tabindex") ?? arrow?.getAttribute("tabIndex")).toBe("0");
    expect(arrow?.getAttribute("role")).toBe("button");
    expect(arrow?.getAttribute("aria-label")).toBe("Ana to Bo: callout 10 · voice 45 s");
    expect(document.querySelector('[data-edge="0>2"]')?.getAttribute("aria-label")).toBe(
      "Ana to Cy: voice 25 s",
    );
    expect(document.querySelector('[data-edge="1>2"]')?.getAttribute("aria-label")).toBe(
      "Bo to Cy: nothing",
    );
    expect(document.querySelector(".comms-summary")?.textContent).toBe("Most went Ana → Bo.");
  });

  it("writes each arrow's count and voice time on it", () => {
    render(h(CommsMap, { edges, crew }), document.body);
    const text = (k: string) =>
      document.querySelector(`[data-edge="${k}"] .comms-count`)?.textContent;
    expect(text("0>1")).toBe("10 · 45 s");
    expect(text("0>2")).toBe("25 s");
    expect(text("2>1")).toBe("2");
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

  it("shows an arrow's breakdown, and lights the arrow, while it has focus or the pointer", async () => {
    render(h(CommsMap, { edges, crew }), document.body);
    const arrow = document.querySelector<SVGGElement>('[data-edge="0>2"]');
    arrow?.dispatchEvent(new FocusEvent("focus"));
    await Promise.resolve();
    expect(document.querySelector(".comms-detail")?.textContent).toBe("Ana → Cy: voice 25 s");
    expect(document.querySelector('[data-edge="0>2"]')?.classList.contains("active")).toBe(true);
    arrow?.dispatchEvent(new MouseEvent("mouseleave"));
    arrow?.dispatchEvent(new FocusEvent("blur"));
    await Promise.resolve();
    expect(document.querySelector('[data-edge="0>2"]')?.classList.contains("active")).toBe(false);
  });
});
