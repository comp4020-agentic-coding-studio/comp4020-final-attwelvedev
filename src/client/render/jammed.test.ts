import { describe, expect, it } from "vitest";
import type { EntityView } from "../../net/protocol.ts";
import type { Scene } from "../render.ts";
import { WORLD } from "../tokens.ts";
import { drawStationStanding } from "./stations.ts";

// The canvas calls a draw makes, by name, with the colour each fill or stroke used.
function recorder() {
  const calls: { name: string; style: string }[] = [];
  const state: Record<string, unknown> = { fillStyle: "", strokeStyle: "", globalAlpha: 1 };
  const ctx = new Proxy(
    {},
    {
      get: (_t, name) => {
        const key = String(name);
        if (key in state) return state[key];
        if (key === "measureText") return () => ({ width: 10 });
        return () =>
          calls.push({
            name: key,
            style: String(key === "stroke" ? state.strokeStyle : state.fillStyle),
          });
      },
      set: (_t, name, value) => {
        state[String(name)] = value;
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  return { ctx, calls };
}

const safe = (jammed: boolean): EntityView => ({
  id: "Q1",
  kind: "station",
  pos: { x: 4.5, y: 2.5 },
  station: {
    type: "dial",
    shows: [3, 0],
    solved: false,
    teach: true,
    parts: [
      { key: "anchor", at: [{ x: 4, y: 2 }] },
      {
        key: "pads",
        at: [
          { x: 3, y: 2 },
          { x: 5, y: 2 },
        ],
      },
    ],
    ...(jammed ? { jammed: true as const } : {}),
  },
});

describe("a jammed station's look (FR13)", () => {
  it("clips a hatched bar over the face only while jammed", () => {
    const cam = { scale: 48, ox: 0, oy: 0 };
    const scene = { players: [] } as unknown as Scene;
    const free = recorder();
    drawStationStanding(free.ctx, safe(false), cam, scene, 2);
    const jam = recorder();
    drawStationStanding(jam.ctx, safe(true), cam, scene, 2);
    const clips = (c: { name: string }[]) => c.filter((x) => x.name === "clip").length;
    expect(clips(jam.calls)).toBe(clips(free.calls) + 1);
    const mist = (c: { name: string; style: string }[]) =>
      c.filter((x) => x.name === "fill" && x.style === WORLD.mist).length;
    expect(mist(jam.calls)).toBeGreaterThan(mist(free.calls));
  });
});
