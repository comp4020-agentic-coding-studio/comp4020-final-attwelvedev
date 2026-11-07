import { describe, expect, it } from "vitest";
import type { EntityView } from "../net/protocol.ts";
import { detectFx, FX_MS, fxMs, fxOfCacheEvent, openedDoors } from "./fx.ts";

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

  // ADR 0025: every ordinary door's true state is sent, so a door opening out of sight rings as well.
  it("a door that opens out of sight rings", () => {
    const closed = e({ id: "D1", kind: "door", state: "closed", pos: { x: 5.5, y: 2.5 } });
    expect(detectFx([closed], [{ ...closed, state: "open" }])).toMatchObject([
      { kind: "ring", tone: "ui", pos: closed.pos, door: true },
    ]);
    // a secret door (a cache's) seen opening is not marked: its ring keeps to the light
    const secret = { ...closed, secret: true as const };
    expect(detectFx([secret], [{ ...secret, state: "open" }])[0]?.door).toBeUndefined();
  });

  it("a door of three tiles is one opening, not three", () => {
    const tile = (y: number, state: "closed" | "open") =>
      e({ id: "D1", kind: "door", state, pos: { x: 5.5, y } });
    const before = [tile(1.5, "closed"), tile(2.5, "closed"), tile(3.5, "closed")];
    const after = [tile(1.5, "open"), tile(2.5, "open"), tile(3.5, "open")];
    expect(openedDoors(before, after)).toHaveLength(1);
  });

  it("two doors in one view ring twice, and one that was already open does not ring", () => {
    const door = (id: string, x: number, state: "closed" | "open") =>
      e({ id, kind: "door", state, pos: { x, y: 2.5 } });
    const before = [door("D1", 5.5, "closed"), door("D2", 9.5, "closed"), door("D3", 12.5, "open")];
    const after = [door("D1", 5.5, "open"), door("D2", 9.5, "open"), door("D3", 12.5, "open")];
    expect(detectFx(before, after)).toHaveLength(2);
    expect(openedDoors(before, after).map((d) => d.id)).toEqual(["D1", "D2"]);
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

  describe("a cache's doors and keepsake come from cacheEvent (caches FR9 to FR11)", () => {
    const at = { x: 3.5, y: 5.5 };
    const other = e({ id: "P0", kind: "player", seat: 0 });

    it("slides the door and puffs dust at the event, for an uncover and for a solve", () => {
      for (const result of ["uncover", "solved"] as const) {
        expect(fxOfCacheEvent({ result, at, owner: 1 }).map((f) => f.kind)).toEqual([
          "slide",
          "dust",
        ]);
        expect(fxOfCacheEvent({ result, at, owner: 1 })[0]).toMatchObject({ pos: at, tone: "ui" });
      }
    });

    it("lifts the item, sparks and rings at the plinth on a take", () => {
      const fx = fxOfCacheEvent({ result: "taken", at, owner: 1, item: "watch" });
      expect(fx).toMatchObject([
        { kind: "lift", keep: "watch", pos: at, tone: "goal" },
        { kind: "spark", pos: at, tone: "goal" },
        { kind: "ring", pos: at, tone: "goal", big: true },
      ]);
    });

    it("lets the lift live a second and a slide the usual 600 ms", () => {
      expect(fxMs({ kind: "lift", pos: at, tone: "goal" })).toBe(1000);
      expect(fxMs({ kind: "slide", pos: at, tone: "ui" })).toBe(FX_MS);
    });

    it("makes nothing from a door or keepsake that merely comes into or leaves sight", () => {
      const door = e({ id: "Q1.d", kind: "door", state: "open", pos: at });
      const keep = e({ id: "Q1.keep", kind: "keepsake", keep: "watch" });
      expect(detectFx([other], [other, door, keep])).toEqual([]);
      expect(detectFx([other, door, keep], [other])).toEqual([]);
    });

    it("no longer makes an uncover or stash effect from a station", () => {
      const tile = e({ id: "Q1.m0", kind: "motiftile", motif: "moon" });
      const station = e({
        id: "Q1",
        kind: "station",
        station: { type: "dial", shows: [], solved: true, parts: [], stash: "watch" },
      });
      expect(detectFx([other, tile], [other, tile, station])).toEqual([]);
    });
  });
});
