import { describe, expect, it } from "vitest";
import type { EntityView } from "../../net/protocol.ts";
import type { Scene } from "./index.ts";
import { drawStationStanding } from "./stations.ts";

// F5 (Task 285): the radio drew ten ticks whatever its band count, so room 6's Q3 (range 8) showed
// ticks 9 and 10 that the needle never reaches. It draws its own `range` now; ten when none is sent.

// the band's ticks: the strokes drawn at line width 1 between the face and the needle (moveTo, lineTo
// pairs inside one path), recorded with the line width they were made at
function tickCount(range: number | undefined): number {
  let lineWidth = 1;
  let ticks = 0;
  const ctx = new Proxy(
    {},
    {
      get: (_t, name) => {
        if (name === "lineWidth") return lineWidth;
        if (name === "measureText") return () => ({ width: 10 });
        if (name === "createLinearGradient" || name === "createRadialGradient")
          return () => ({ addColorStop: () => {} });
        if (name === "lineTo") return () => (lineWidth === 1 ? ticks++ : undefined);
        return () => {};
      },
      set: (_t, name, value) => {
        if (name === "lineWidth") lineWidth = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  const radio: EntityView = {
    id: "Q1",
    kind: "station",
    pos: { x: 4.5, y: 2.5 },
    station: {
      type: "radio",
      shows: [2],
      solved: false,
      parts: [{ key: "anchor", at: [{ x: 4, y: 2 }] }],
      ...(range === undefined ? {} : { range }),
    },
  };
  drawStationStanding(
    ctx,
    radio,
    { scale: 48, ox: 0, oy: 0 },
    { players: [] } as unknown as Scene,
    2,
  );
  return ticks;
}

describe("the radio's band (F5)", () => {
  it("draws as many ticks as its range: 8 for range 8, 6 for range 6", () => {
    expect(tickCount(8)).toBe(8);
    expect(tickCount(6)).toBe(6);
  });
  it("draws ten when no range is sent", () => {
    expect(tickCount(undefined)).toBe(10);
  });
});
