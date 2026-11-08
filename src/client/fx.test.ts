import { describe, expect, it } from "vitest";
import { viewFor } from "../game/perception.ts";
import { step } from "../game/sim/step.ts";
import { input, place, worldWith } from "../game/sim/testing.ts";
import { TICK_MS } from "../game/sim/world.ts";
import type { EntityView } from "../net/protocol.ts";
import {
  activeFx,
  capSparks,
  DURATION,
  detectFx,
  FX_MS,
  fxMs,
  fxOfCacheEvent,
  fxOfCaught,
  fxOfCleared,
  fxOfCuts,
  openedDoors,
} from "./fx.ts";

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

  it("plate press emits a press fx targeting the plate, release a release fx", () => {
    const up = e({ id: "p1", kind: "plate", state: "up" });
    const down = { ...up, state: "pressed" as const };
    expect(detectFx([up], [down])).toMatchObject([{ kind: "press", targetId: "p1", pos: up.pos }]);
    expect(detectFx([down], [up])).toMatchObject([{ kind: "release", targetId: "p1" }]);
  });

  // Can't hear: two events never differ only by colour or size
  it("plate press and release emit different kinds of motion, not one in two colours", () => {
    const up = e({ id: "p1", kind: "plate", state: "up" });
    const down = { ...up, state: "pressed" as const };
    const [press] = detectFx([up], [down]);
    const [release] = detectFx([down], [up]);
    expect(press?.kind).not.toBe(release?.kind);
  });

  // ADR 0025: every ordinary door's true state is sent, so a door opening out of sight moves as well
  it("door opening emits a door fx targeting the door, marked to draw out of sight", () => {
    const closed = e({ id: "D1", kind: "door", state: "closed", pos: { x: 5.5, y: 2.5 } });
    expect(detectFx([closed], [{ ...closed, state: "open" }])).toMatchObject([
      { kind: "door", targetId: "D1", pos: closed.pos, door: true },
    ]);
    // a secret door (a cache's) seen opening is not marked: its motion keeps to the light
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
    // a door of two tiles moves on both: each tile's leaves part (playtest fixes, Task 5)
    const tile = (y: number, state: "closed" | "open") =>
      e({ id: "D9", kind: "door", state, pos: { x: 1.5, y } });
    expect(
      detectFx(
        [tile(1.5, "closed"), tile(2.5, "closed")],
        [tile(1.5, "open"), tile(2.5, "open")],
      ).map((f) => f.pos.y),
    ).toEqual([1.5, 2.5]);
    expect(openedDoors(before, after).map((d) => d.id)).toEqual(["D1", "D2"]);
  });

  it("crate moved emits a crate fx targeting the crate, from where it was", () => {
    const crate = e({ id: "B1", kind: "crate" });
    const moved = { ...crate, pos: { x: 6.5, y: 2.5 } };
    expect(detectFx([crate], [moved])).toMatchObject([
      { kind: "crate", targetId: "B1", pos: crate.pos, to: moved.pos },
    ]);
  });

  it("loot taken emits a loot fx that flies to the nearest figure", () => {
    const loot = e({ id: "$1", kind: "loot" });
    const p = e({ id: "P0", kind: "player", seat: 0, pos: { x: 6.5, y: 2.5 } });
    expect(detectFx([loot, p], [p])).toMatchObject([
      { kind: "loot", tone: "goal", pos: loot.pos, to: p.pos },
    ]);
  });

  it("checkpoint set emits an unfurl fx targeting the flag, and a figure arriving a pip fx", () => {
    const flag = e({ id: "K1", kind: "checkpoint", state: "up", present: 2 });
    expect(detectFx([flag], [{ ...flag, state: "reached", present: 3 }])).toMatchObject([
      { kind: "unfurl", targetId: "K1" },
    ]);
    expect(detectFx([flag], [{ ...flag, present: 3 }])).toMatchObject([
      { kind: "pip", targetId: "K1" },
    ]);
  });

  it("exit occupied emits a march fx targeting the exit", () => {
    const exit = e({ id: "X1", kind: "exit", state: "idle" });
    expect(detectFx([exit], [{ ...exit, state: "occupied" }])).toMatchObject([
      { kind: "march", targetId: "X1" },
    ]);
  });

  it("braille read emits a read fx targeting the plate", () => {
    const plate = e({ id: "o1", kind: "braille" });
    expect(detectFx([plate], [{ ...plate, flash: "ok" }])).toMatchObject([
      { kind: "read", targetId: "o1" },
    ]);
  });

  it("lever thrown emits a lever fx, a camera waking a camera fx, a laser on a laser fx", () => {
    const lever = e({ id: "L1", kind: "lever", state: "off" });
    expect(detectFx([lever], [{ ...lever, state: "on" }])).toMatchObject([
      { kind: "lever", targetId: "L1" },
    ]);
    const camera = e({ id: "C1", kind: "camera", state: "idle" });
    expect(detectFx([camera], [{ ...camera, state: "watching" }])).toMatchObject([
      { kind: "camera", targetId: "C1" },
    ]);
    const laser = e({ id: "Z1", kind: "laser", state: "off" });
    expect(detectFx([laser], [{ ...laser, state: "on" }])).toMatchObject([
      { kind: "laser", targetId: "Z1" },
    ]);
  });

  it("hide, hands joining and letting go, and dye each emit their own fx on the figure", () => {
    const a = e({ id: "P0", kind: "player", seat: 0, pos: { x: 2.5, y: 2.5 } });
    const b = e({ id: "P1", kind: "player", seat: 1, pos: { x: 3.5, y: 2.5 } });
    expect(detectFx([a, b], [{ ...a, state: "hidden" }, b])).toMatchObject([
      { kind: "hide", targetId: "P0" },
    ]);
    expect(detectFx([a, b], [{ ...a, heldBy: 1 }, b])).toMatchObject([
      { kind: "join", targetId: "P0", to: b.pos },
    ]);
    expect(detectFx([{ ...a, heldBy: 1 }, b], [a, b])).toMatchObject([
      { kind: "unjoin", targetId: "P0", to: b.pos },
    ]);
    expect(detectFx([a, b], [{ ...a, dyed: true }, b])[0]).toMatchObject({
      kind: "dye",
      targetId: "P0",
    });
  });

  it("gear picked up emits a take fx on the figure, and put down a drop fx on the gear", () => {
    const a = e({ id: "P0", kind: "player", seat: 0, pos: { x: 2.5, y: 2.5 } });
    const gear = e({ id: "g1", kind: "gear", item: "uv", pos: { x: 2.5, y: 2.5 } });
    expect(detectFx([a, gear], [{ ...a, item: "uv" }])).toMatchObject([
      { kind: "take", targetId: "P0" },
    ]);
    expect(detectFx([{ ...a, item: "uv" }], [a, gear])).toMatchObject([
      { kind: "drop", targetId: "g1" },
    ]);
  });

  it("room cleared emits a hop fx on every figure in view", () => {
    const a = e({ id: "P0", kind: "player", seat: 0 });
    const b = e({ id: "P1", kind: "player", seat: 1 });
    expect(fxOfCleared([a, b, e({ id: "K1", kind: "checkpoint" })])).toMatchObject([
      { kind: "hop", targetId: "P0" },
      { kind: "hop", targetId: "P1" },
    ]);
  });

  it("caught emits a caught fx on each figure that jumped 2 tiles or more, from where it was", () => {
    const a = e({ id: "P0", kind: "player", seat: 0, pos: { x: 9.5, y: 2.5 } });
    const b = e({ id: "P1", kind: "player", seat: 1, pos: { x: 3.5, y: 2.5 } });
    const back = { ...a, pos: { x: 2.5, y: 2.5 } };
    expect(fxOfCaught([a, b], [back, { ...b, pos: { x: 4.5, y: 2.5 } }])).toEqual([
      { kind: "caught", pos: a.pos, to: back.pos, tone: "danger", targetId: "P0" },
    ]);
  });

  it("seq ok emits a stamp fx on the sign, wrong a shake, the sequence done a ripple", () => {
    const sign = e({ id: "S1", kind: "sign", progress: 1, shows: ["p1", "p2", "p3"] });
    expect(detectFx([sign], [{ ...sign, progress: 2 }])).toMatchObject([
      { kind: "stamp", targetId: "S1" },
    ]);
    expect(detectFx([sign], [{ ...sign, progress: 0 }])).toMatchObject([
      { kind: "shake", targetId: "S1" },
    ]);
    expect(detectFx([sign], [{ ...sign, progress: 3 }])).toMatchObject([
      { kind: "ripple", targetId: "S1" },
    ]);
  });

  it("seq ok and wrong differ in kind", () => {
    const sign = e({ id: "S1", kind: "sign", progress: 1, shows: ["p1", "p2", "p3"] });
    const [ok] = detectFx([sign], [{ ...sign, progress: 2 }]);
    const [wrong] = detectFx([sign], [{ ...sign, progress: 0 }]);
    expect(ok?.kind).not.toBe(wrong?.kind);
  });

  // escape-room objects (phase 02 Task 8)
  const parts = [{ key: "anchor" as const, at: [{ x: 5, y: 2 }] }];
  const safe = (solved: boolean) =>
    e({ id: "Q1", kind: "station", station: { type: "dial", shows: [3], solved, parts } });

  it("rings a station goal the moment it is solved, and not again", () => {
    expect(detectFx([safe(false)], [safe(true)])).toMatchObject([
      { kind: "ring", tone: "goal", big: true, pos: { x: 5.5, y: 2.5 } },
      { kind: "tick", targetId: "Q1" },
    ]);
    expect(detectFx([safe(true)], [safe(true)])).toEqual([]);
  });

  it("station part changed emits a part fx, and jammed a jam fx, on the station", () => {
    const st = (shows: number[], jammed?: true) =>
      e({
        id: "Q1",
        kind: "station",
        station: { type: "dial", shows, solved: false, parts, ...(jammed ? { jammed } : {}) },
      });
    expect(detectFx([st([3])], [st([4])])).toMatchObject([{ kind: "part", targetId: "Q1" }]);
    expect(detectFx([st([3])], [st([3], true)])).toMatchObject([{ kind: "jam", targetId: "Q1" }]);
  });

  // G1 (wire cut and station bob, Task 2): a cut you see happen snips; one you walk into does not
  const wires = (cut?: number[], furniture?: true) =>
    e({
      id: "Q2",
      kind: "station",
      station: {
        type: "wires",
        shows: furniture ? [] : [0, 1, 2],
        solved: false,
        parts: [
          ...parts,
          {
            key: "wires" as const,
            at: [
              { x: 3, y: 2 },
              { x: 4, y: 2 },
              { x: 5, y: 2 },
            ],
          },
        ],
        ...(cut ? { cut } : {}),
        ...(furniture ? { furniture } : {}),
      },
    });

  it("a new cut starts one snip on the panel and one spark at that wire", () => {
    const fx = detectFx([wires()], [wires([1])]);
    expect(fx.filter((f) => f.kind === "snip")).toMatchObject([{ targetId: "Q2" }]);
    expect(fx.filter((f) => f.kind === "spark")).toMatchObject([
      { pos: { x: 4.5, y: 2.5 }, tone: "ui" },
    ]);
    expect(fx.filter((f) => f.kind === "part")).toEqual([]);
    expect(DURATION.snip).toBe(150);
  });

  it("a cut seen again, or walked into, starts no snip and no spark", () => {
    const quiet = (fx: { kind: string }[]) =>
      fx.filter((f) => f.kind === "snip" || f.kind === "spark");
    expect(quiet(detectFx([wires([1])], [wires([1])]))).toEqual([]);
    const other = e({ id: "P0", kind: "player", seat: 0, pos: { x: 2.5, y: 2.5 } });
    expect(quiet(detectFx([other], [other, wires([1])]))).toEqual([]);
    expect(quiet(detectFx([wires(undefined, true)], [wires([1])]))).toEqual([]);
  });

  // wire F2: the hand-built cases above never meet a right cut, which solves the panel in the same act
  it("a right cut made in real play snips and sparks for a sighted seat in sight (driven through step)", () => {
    const w = worldWith(["##########", "#1..Q....#", "#2.......#", "#3.......#", "##########"], {
      Q1: {
        type: "wires",
        wires: [
          [3, 2],
          [4, 2],
          [5, 2],
        ],
      },
    });
    const right = w.stations.Q1?.answer[0] as number;
    const before = viewFor(w, 1, "deaf", false).entities;
    place(w, 0, { x: 3 + right, y: 2 });
    step(w, { 0: input(0, 0, true) }, TICK_MS);
    const after = viewFor(w, 1, "deaf", false).entities;
    expect(w.stations.Q1?.solved).toBe(true);
    const fx = detectFx(before, after);
    expect(fx.filter((f) => f.kind === "snip")).toMatchObject([{ targetId: "Q1" }]);
    expect(fx.filter((f) => f.kind === "spark")).toMatchObject([
      { pos: { x: 3 + right + 0.5, y: 2.5 } },
    ]);
    expect(fx.filter((f) => f.kind === "ring" || f.kind === "tick")).toHaveLength(2);
  });

  // Task 241: a wrong cut is gone from the panel by the time the view is built; the view's `cuts` carry it
  for (const teach of [false, true]) {
    it(`a wrong cut made in real play sparks at its wire (${teach ? "teaching" : "ordinary"} panel)`, () => {
      const w = worldWith(["##########", "#1..Q....#", "#2.......#", "#3.......#", "##########"], {
        Q1: {
          type: "wires",
          wires: [
            [3, 2],
            [4, 2],
            [5, 2],
          ],
          ...(teach ? { teach: true } : {}),
        },
      });
      const wrong = [0, 1, 2].find((i) => i !== w.stations.Q1?.answer[0]) as number;
      const before = viewFor(w, 1, "deaf", false).entities;
      place(w, 0, { x: 3 + wrong, y: 2 });
      step(w, { 0: input(0, 0, true) }, TICK_MS);
      const view = viewFor(w, 1, "deaf", false);
      const fx = detectFx(before, view.entities);
      fx.push(...fxOfCuts(view.cuts, fx));
      expect(fx.filter((f) => f.kind === "spark")).toMatchObject([
        { pos: { x: 3 + wrong + 0.5, y: 2.5 }, tone: "ui" },
      ]);
    });
  }

  it("a right cut made in real play gets exactly one spark, not one from the panel and one from cuts", () => {
    const w = worldWith(["##########", "#1..Q....#", "#2.......#", "#3.......#", "##########"], {
      Q1: {
        type: "wires",
        wires: [
          [3, 2],
          [4, 2],
          [5, 2],
        ],
      },
    });
    const right = w.stations.Q1?.answer[0] as number;
    const before = viewFor(w, 1, "deaf", false).entities;
    place(w, 0, { x: 3 + right, y: 2 });
    step(w, { 0: input(0, 0, true) }, TICK_MS);
    const view = viewFor(w, 1, "deaf", false);
    expect(view.cuts).toHaveLength(1);
    const fx = detectFx(before, view.entities);
    fx.push(...fxOfCuts(view.cuts, fx));
    expect(fx.filter((f) => f.kind === "spark")).toHaveLength(1);
  });

  it("a panel that comes back into sight already solved and cut starts no snip", () => {
    const solvedCut = (furniture?: true) => {
      const v = wires(furniture ? undefined : [1], furniture);
      return { ...v, station: { ...v.station, solved: !furniture } } as EntityView;
    };
    const fx = detectFx([solvedCut(true)], [solvedCut()]);
    expect(fx.filter((f) => f.kind === "snip" || f.kind === "spark")).toEqual([]);
  });

  it("at most three sparks start in any second", () => {
    const spark = { kind: "spark" as const, pos: { x: 1, y: 1 }, tone: "ui" as const };
    const ring = { kind: "ring" as const, pos: { x: 1, y: 1 }, tone: "goal" as const };
    const gate: number[] = [];
    expect(capSparks(gate, [spark, spark], 0)).toHaveLength(2);
    expect(capSparks(gate, [spark, spark, ring], 500)).toEqual([spark, ring]);
    expect(capSparks(gate, [spark], 999)).toEqual([]);
    expect(capSparks(gate, [spark], 1001)).toEqual([spark]);
  });

  // G3 (Task 4): the radio coming back into line of sight dipped as if a part had been set
  it("a station going from furniture-only to full, or back, starts no part dip", () => {
    const radio = (shows: number[], furniture?: true) =>
      e({
        id: "Q3",
        kind: "station",
        station: {
          type: "radio",
          shows,
          solved: false,
          parts,
          ...(furniture ? { furniture } : {}),
        },
      });
    expect(detectFx([radio([], true)], [radio([3])])).toEqual([]);
    expect(detectFx([radio([3])], [radio([], true)])).toEqual([]);
    expect(detectFx([radio([3])], [radio([4])])).toMatchObject([{ kind: "part", targetId: "Q3" }]);
  });

  it("makes no ring for a solved station that comes back into sight (Task 46)", () => {
    const other = e({ id: "P0", kind: "player", seat: 0, pos: { x: 2.5, y: 2.5 } });
    // absent from prev (out of sight), present and already solved in next: not newly solved
    expect(detectFx([other], [other, safe(true)])).toEqual([]);
    // unsolved in view, then solved in view: still exactly one ring
    expect(
      detectFx([other, safe(false)], [other, safe(true)]).filter((f) => f.kind === "ring"),
    ).toHaveLength(1);
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

  it("bell rung emits a bell fx targeting the bell, once", () => {
    const bell = e({ id: "b1", kind: "bell" });
    expect(detectFx([bell], [{ ...bell, state: "on" }])).toMatchObject([
      { kind: "bell", targetId: "b1" },
    ]);
    expect(detectFx([{ ...bell, state: "on" }], [{ ...bell, state: "on" }])).toEqual([]);
  });

  it("puffs a dye cloud from the station when the team is splattered", () => {
    const p = e({ id: "P0", kind: "player", seat: 0, pos: { x: 2.5, y: 2.5 } });
    const fx = detectFx([p, safe(false)], [{ ...p, dyed: true }, safe(false)]);
    const cloud = fx.find((f) => f.kind === "cloud");
    expect(cloud).toMatchObject({ kind: "cloud", tone: "muted", pos: { x: 5.5, y: 2.5 } });
  });

  it("lasts well under a second, so effects never pile into flashing", () => {
    expect(FX_MS).toBeLessThan(800);
  });

  describe("a cache's doors and keepsake come from cacheEvent (caches FR9 to FR11)", () => {
    const at = { x: 3.5, y: 5.5 };
    const other = e({ id: "P0", kind: "player", seat: 0 });

    it("slides the door with a curtain of dust at the event, for an uncover and for a solve", () => {
      for (const result of ["uncover", "solved"] as const) {
        expect(fxOfCacheEvent({ result, at, owner: 1 }).map((f) => f.kind)).toEqual([
          "slide",
          "curtain",
        ]);
        expect(fxOfCacheEvent({ result, at, owner: 1 })[0]).toMatchObject({ pos: at, tone: "ui" });
      }
    });

    it("lifts the item off the plinth on a take: no ring, no spark", () => {
      const fx = fxOfCacheEvent({ result: "taken", at, owner: 1, item: "watch" });
      expect(fx).toEqual([{ kind: "lift", keep: "watch", pos: at, tone: "goal" }]);
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

describe("activeFx: the live effect on one thing (FR15)", () => {
  const at = { x: 1.5, y: 1.5 };
  it("finds the newest live effect for its target, and none once its life is over", () => {
    const old = {
      kind: "dust" as const,
      pos: at,
      tone: "muted" as const,
      targetId: "C1",
      age: 0.9,
    };
    const young = { ...old, age: 0.1 };
    const other = { ...old, targetId: "C2", age: 0.2 };
    expect(activeFx([old, other, young], "C1")).toBe(young);
    expect(activeFx([{ ...old, age: 1 }], "C1")).toBeUndefined();
    expect(activeFx([other], "C1")).toBeUndefined();
    expect(activeFx(undefined, "C1")).toBeUndefined();
  });

  it("reads each kind's life from the DURATION table", () => {
    for (const kind of Object.keys(DURATION) as (keyof typeof DURATION)[])
      expect(fxMs({ kind, pos: at, tone: "ui" }), kind).toBe(DURATION[kind]);
  });
});
