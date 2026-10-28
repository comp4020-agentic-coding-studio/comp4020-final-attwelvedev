import { describe, expect, it } from "vitest";
import type { EntityView } from "../net/protocol.ts";
import { detectFx, FX_MS } from "./fx.ts";

const e = (over: Partial<EntityView> & Pick<EntityView, "id" | "kind">): EntityView => ({
  pos: { x: 5.5, y: 2.5 },
  ...over,
});

describe("detectFx: small effects for what just changed between two views", () => {
  it("shows nothing for the very first view, or when nothing changed", () => {
    const plate = e({ id: "p1", kind: "plate", state: "up" });
    expect(detectFx([], [plate])).toEqual([]);
    expect(detectFx([plate], [plate])).toEqual([]);
  });

  it("rings a plate pressed (goal) and released (muted)", () => {
    const up = e({ id: "p1", kind: "plate", state: "up" });
    const down = { ...up, state: "pressed" as const };
    expect(detectFx([up], [down])).toMatchObject([{ kind: "ring", tone: "goal", pos: up.pos }]);
    expect(detectFx([down], [up])).toMatchObject([{ kind: "ring", tone: "muted" }]);
  });

  it("rings a door the moment it opens", () => {
    const closed = e({ id: "D1", kind: "door", state: "closed" });
    expect(detectFx([closed], [{ ...closed, state: "open" }])).toMatchObject([
      { kind: "ring", tone: "ui" },
    ]);
  });

  it("puffs dust where a crate was when it moves a tile", () => {
    const crate = e({ id: "B1", kind: "crate" });
    const moved = { ...crate, pos: { x: 6.5, y: 2.5 } };
    expect(detectFx([crate], [moved])).toMatchObject([{ kind: "dust", pos: crate.pos }]);
  });

  it("sparks where loot was when it is taken", () => {
    const loot = e({ id: "$1", kind: "loot" });
    expect(detectFx([loot], [])).toMatchObject([{ kind: "spark", tone: "goal", pos: loot.pos }]);
  });

  it("makes a big ring when a checkpoint is set", () => {
    const flag = e({ id: "K1", kind: "checkpoint", state: "up", present: 3 });
    expect(detectFx([flag], [{ ...flag, state: "reached" }])).toMatchObject([
      { kind: "ring", tone: "goal", big: true },
    ]);
  });

  it("rings a sign green for a right plate and red for a reset", () => {
    const sign = e({ id: "S1", kind: "sign", progress: 1 });
    expect(detectFx([sign], [{ ...sign, progress: 2 }])).toMatchObject([{ tone: "goal" }]);
    expect(detectFx([sign], [{ ...sign, progress: 0 }])).toMatchObject([{ tone: "danger" }]);
  });

  it("rings a finished sign green too: finishing is a success", () => {
    const sign = e({ id: "S1", kind: "sign", progress: 2 });
    const done = detectFx([sign], [{ ...sign, progress: 3 }]);
    expect(done).toMatchObject([{ tone: "goal" }]);
  });

  // escape-room objects (phase 02 Task 8)
  const parts = [{ key: "anchor" as const, at: [{ x: 5, y: 2 }] }];
  const safe = (solved: boolean) =>
    e({ id: "Q1", kind: "station", station: { type: "dial", shows: [3], solved, parts } });

  it("rings a station goal the moment it is solved, and not again", () => {
    expect(detectFx([safe(false)], [safe(true)])).toMatchObject([
      { kind: "ring", tone: "goal", big: true, pos: { x: 5.5, y: 2.5 } },
    ]);
    expect(detectFx([safe(true)], [safe(true)])).toEqual([]);
  });

  it("arcs gear from one figure to another when it is handed over", () => {
    const a = e({ id: "P0", kind: "player", seat: 0, pos: { x: 2.5, y: 2.5 }, item: "uv" });
    const b = e({ id: "P1", kind: "player", seat: 1, pos: { x: 3.5, y: 2.5 } });
    const [arc] = detectFx(
      [a, b],
      [
        { ...a, item: undefined },
        { ...b, item: "uv" },
      ],
    );
    expect(arc).toMatchObject({ kind: "arc", tone: "ui", pos: a.pos, to: b.pos, item: "uv" });
  });

  it("swings a bell the tick it is rung", () => {
    const bell = e({ id: "b1", kind: "bell" });
    expect(detectFx([bell], [{ ...bell, state: "on" }])).toMatchObject([{ kind: "swing" }]);
  });

  it("puffs a dye cloud from the station when the team is splattered", () => {
    const p = e({ id: "P0", kind: "player", seat: 0, pos: { x: 2.5, y: 2.5 } });
    const [cloud] = detectFx([p, safe(false)], [{ ...p, dyed: true }, safe(false)]);
    expect(cloud).toMatchObject({ kind: "cloud", tone: "muted", pos: { x: 5.5, y: 2.5 } });
  });

  it("lasts well under a second, so effects never pile into flashing", () => {
    expect(FX_MS).toBeLessThan(800);
  });
});
