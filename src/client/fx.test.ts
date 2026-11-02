import { describe, expect, it } from "vitest";
import type { EntityView } from "../net/protocol.ts";
import { detectFx, FX_MS, fxMs } from "./fx.ts";

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

  it("makes no ring for a solved station that comes back into sight (Task 46)", () => {
    const other = e({ id: "P0", kind: "player", seat: 0, pos: { x: 2.5, y: 2.5 } });
    // absent from prev (out of sight), present and already solved in next: not newly solved
    expect(detectFx([other], [other, safe(true)])).toEqual([]);
    // unsolved in view, then solved in view: still exactly one ring
    expect(detectFx([other, safe(false)], [other, safe(true)])).toHaveLength(1);
  });

  it("makes no ring for a door already open, a bell already ringing or a sign already ahead on entering view (Task 46)", () => {
    const other = e({ id: "P0", kind: "player", seat: 0, pos: { x: 2.5, y: 2.5 } });
    const open = e({ id: "D1", kind: "door", state: "open" });
    const bell = e({ id: "b1", kind: "bell", state: "on" });
    const sign = e({ id: "S1", kind: "sign", progress: 2 });
    expect(detectFx([other], [other, open])).toEqual([]);
    expect(detectFx([other], [other, bell])).toEqual([]);
    expect(detectFx([other], [other, sign])).toEqual([]);
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

  describe("caches", () => {
    const station = (over: Partial<EntityView> = {}) =>
      e({
        id: "Q1",
        kind: "station",
        station: { type: "dial", shows: [], solved: false, parts: [] },
        ...over,
      });
    const stashed = (item: "watch" = "watch"): EntityView =>
      station({ station: { type: "dial", shows: [], solved: true, parts: [], stash: item } });
    const other = e({ id: "P0", kind: "player", seat: 0 });

    const tile = e({ id: "Q1.m0", kind: "motiftile", motif: "moon", pos: { x: 2.5, y: 2.5 } });

    it("shows the uncover moment once, when a station appears where its motif tiles were drawn", () => {
      expect(detectFx([other, tile], [other, tile, station()])).toMatchObject([
        { kind: "uncover", pos: station().pos },
      ]);
      expect(detectFx([other, tile, station()], [other, tile, station()])).toEqual([]);
    });

    it("shows nothing for a station that merely comes into sight, or on the first view", () => {
      expect(detectFx([other], [other, station()])).toEqual([]);
      expect(detectFx([], [other, tile, station()])).toEqual([]);
    });

    it("shows the stash moment once, when stash is set, with the item, and no plain solved ring", () => {
      const fx = detectFx([other, station()], [other, stashed()]);
      expect(fx).toMatchObject([{ kind: "stash", keep: "watch" }]);
      expect(detectFx([other, stashed()], [other, stashed()])).toEqual([]);
    });

    it("lets the stash live a second, for the reduced-motion star, and no other effect", () => {
      expect(fxMs({ kind: "stash", pos: { x: 0, y: 0 }, tone: "goal" })).toBe(1000);
      expect(fxMs({ kind: "ring", pos: { x: 0, y: 0 }, tone: "goal" })).toBe(FX_MS);
    });
  });
});
