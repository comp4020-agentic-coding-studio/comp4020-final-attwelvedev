import { afterEach, describe, expect, it } from "vitest";
import { STATION_TYPES } from "../../game/rooms/format.ts";
import type { EntityView } from "../../net/protocol.ts";
import { setContrast, WORLD } from "../tokens.ts";
import { drawBackdrop } from "./backdrop.ts";
import { drawGoggles } from "./gear.ts";
import { draw, type Scene } from "./index.ts";
import {
  paintAo,
  paintCrate,
  paintCrateShadow,
  paintDoor,
  paintFloor,
  paintGlass,
  paintSteel,
  paintVent,
  paintWallFront,
  paintWallTop,
} from "./materials.ts";
import { setRise } from "./project.ts";
import { codeSwatch, drawStationStanding } from "./stations.ts";

// A small recorder (from render.test.ts): every canvas call with the state it was made in, and every
// gradient with its colour stops.
interface Op {
  name: string;
  args: unknown[];
  fillStyle: unknown;
  strokeStyle: unknown;
  globalAlpha: number;
}
function recorder() {
  const ops: Op[] = [];
  const gradients: { kind: string; stops: [number, string][] }[] = [];
  const state = {
    fillStyle: "" as unknown,
    strokeStyle: "" as unknown,
    globalAlpha: 1,
    lineWidth: 1,
  };
  const saved: (typeof state)[] = [];
  const ctx = new Proxy(
    {},
    {
      get: (_t, name) => {
        if (String(name) in state) return state[String(name) as keyof typeof state];
        if (name === "save") return () => saved.push({ ...state });
        if (name === "restore") return () => Object.assign(state, saved.pop());
        if (name === "createLinearGradient" || name === "createRadialGradient")
          return () => {
            const g = { kind: String(name), stops: [] as [number, string][] };
            gradients.push(g);
            return { addColorStop: (at: number, c: string) => g.stops.push([at, c]) };
          };
        if (name === "measureText") return () => ({ width: 10 });
        return (...args: unknown[]) => {
          ops.push({
            name: String(name),
            args,
            fillStyle: state.fillStyle,
            strokeStyle: state.strokeStyle,
            globalAlpha: state.globalAlpha,
          });
        };
      },
      set: (_t, name, value) => {
        (state as Record<string, unknown>)[String(name)] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, ops, gradients };
}
const isGradient = (o: Op) => typeof o.fillStyle === "object";

afterEach(() => {
  setContrast(false);
  setRise(1);
});

describe("floor materials", () => {
  it("a stone floor tile draws a gradient-free fill, a groove and speckle; in high contrast only today's fill and seam", () => {
    const { ctx, ops, gradients } = recorder();
    paintFloor(ctx, 40, 32, 2, "stone");
    expect(gradients).toHaveLength(0);
    expect(ops.every((o) => !isGradient(o))).toBe(true);
    const groove = ops.filter((o) => o.fillStyle === WORLD.seam && o.globalAlpha === 1);
    expect(groove.length).toBeGreaterThanOrEqual(2);
    expect(groove.some((o) => o.args[3] === 1.5)).toBe(true); // a 1.5 px groove along the north edge
    const speckle = ops.filter(
      (o) => o.fillStyle === WORLD.seam && Math.abs(o.globalAlpha - 0.08) < 1e-9,
    );
    expect(speckle).toHaveLength(6);

    setContrast(true);
    const hc = recorder();
    paintFloor(hc.ctx, 40, 32, 2, "stone");
    expect(hc.ops.map((o) => o.fillStyle)).toEqual([WORLD.floor, WORLD.seam, WORLD.seam]);
  });

  it("room 04's floor is drawn as boards", () => {
    const s: Scene = {
      w: 200,
      h: 200,
      role: "deaf",
      seat: 1,
      roles: ["blind", "deaf", "mute"],
      tiles: ["....", "....", "...."],
      entities: [],
      self: null,
      layout: "fit",
      roomId: "04-the-safe",
    };
    const boards = (roomId: string) => {
      const { ctx, ops } = recorder();
      draw(ctx, { ...s, roomId });
      // a board's gap: a full-width seam line 1 px tall, three to a tile
      return ops.filter(
        (o) => o.name === "fillRect" && o.fillStyle === WORLD.seam && o.args[3] === 1,
      ).length;
    };
    expect(boards("04-the-safe")).toBeGreaterThanOrEqual(3 * 12);
    expect(boards("05-the-gallery")).toBe(0);
  });

  it("a floor tile south of a wall gets an AO gradient of wallShade at no more than 16 % alpha; in high contrast none", () => {
    const { ctx, ops, gradients } = recorder();
    paintAo(ctx, 40, 32, true, false);
    expect(gradients).toHaveLength(1);
    expect(gradients[0]?.stops[0]).toEqual([0, WORLD.wallShade]);
    const fills = ops.filter((o) => o.name === "fillRect");
    expect(fills).toHaveLength(1);
    expect(fills.every((o) => isGradient(o) && o.globalAlpha > 0 && o.globalAlpha <= 0.16)).toBe(
      true,
    );

    setContrast(true);
    const hc = recorder();
    paintAo(hc.ctx, 40, 32, true, true);
    expect(hc.ops).toHaveLength(0);
    expect(hc.gradients).toHaveLength(0);
  });

  it("a wall top draws a gradient and a lip; a wall front a gradient and a bevel", () => {
    const top = recorder();
    paintWallTop(top.ctx, 40, 32);
    expect(top.gradients).toHaveLength(1);
    expect(
      top.ops.some((o) => o.args[3] === 1.5 && !isGradient(o) && o.fillStyle !== WORLD.wallTop),
    ).toBe(true);
    const front = recorder();
    paintWallFront(front.ctx, 40, 44, true);
    expect(front.gradients).toHaveLength(1);
    expect(front.gradients[0]?.stops[0]).toEqual([0, WORLD.wallFront]);
    expect(
      front.ops.some((o) => o.args[3] === 1 && !isGradient(o) && o.fillStyle !== WORLD.wallFront),
    ).toBe(true);
    expect(front.ops.some((o) => o.fillStyle === WORLD.wallShade && o.args[3] === 3)).toBe(true);

    setContrast(true);
    const flat = recorder();
    paintWallTop(flat.ctx, 40, 32);
    paintWallFront(flat.ctx, 40, 44, false);
    expect(flat.gradients).toHaveLength(0);
    expect(flat.ops.map((o) => o.fillStyle)).toEqual([WORLD.wallTop, WORLD.wallFront]);
  });
});

describe("the backdrop", () => {
  const cam = { scale: 40, ox: 20, oy: 60 };
  const backdrop = (over: Partial<Scene> = {}) => {
    const rec = recorder();
    const s: Scene = {
      w: 400,
      h: 400,
      role: "deaf",
      seat: 1,
      roles: ["blind", "deaf", "mute"],
      tiles: ["....", "....", "...."],
      entities: [],
      self: null,
      layout: "fit",
      ...over,
    };
    drawBackdrop(rec.ctx, s, cam);
    return rec;
  };
  // the ripples: thin 2 px rects in the ripple colour, half see-through
  const ripples = (ops: Op[]) =>
    ops.filter((o) => o.fillStyle === WORLD.ripple && o.globalAlpha === 0.5).map((o) => o.args[0]);

  it("the backdrop draws a radial sun glow and a slab reflection at 12 %; the ripples still drift; in high contrast neither glow nor reflection", () => {
    const { ops, gradients } = backdrop({ nowMs: 0 });
    expect(gradients.filter((g) => g.kind === "createRadialGradient")).toHaveLength(1);
    const reflection = gradients.find(
      (g) => g.kind === "createLinearGradient" && g.stops[1]?.[1] === `${WORLD.cliffHi}00`,
    );
    expect(reflection?.stops[0]).toEqual([0, WORLD.cliffHi]);
    const faded = ops.filter((o) => o.name === "fillRect" && isGradient(o) && o.globalAlpha < 1);
    expect(faded.map((o) => o.globalAlpha)).toEqual([0.12]);
    expect(ripples(ops)).toHaveLength(7);
    expect(ripples(backdrop({ nowMs: 5000 }).ops)).not.toEqual(ripples(ops));

    setContrast(true);
    const hc = backdrop({ nowMs: 0 });
    expect(hc.gradients.filter((g) => g.kind === "createRadialGradient")).toHaveLength(0);
    expect(hc.ops.some((o) => o.name === "fillRect" && isGradient(o) && o.globalAlpha < 1)).toBe(
      false,
    );
  });
});

describe("object materials: doors, crates, glass, vents", () => {
  it("a vent still draws exactly 4 slats, each with a highlight", () => {
    const { ctx, ops } = recorder();
    paintVent(ctx, 40, 32, 44);
    const slats = ops.filter((o) => o.name === "fillRect" && o.fillStyle === WORLD.ventSlat);
    expect(slats).toHaveLength(4);
    const lips = ops.filter(
      (o) => o.name === "fillRect" && o.args[3] === 1 && o.globalAlpha === 1 && !isGradient(o),
    );
    expect(lips).toHaveLength(4);
    // each lip sits 1 px above its slat
    expect(lips.map((o) => o.args[1])).toEqual(slats.map((o) => (o.args[1] as number) - 1));
  });

  it("glass keeps its WORLD.line outline and adds a sheen band", () => {
    const { ctx, ops, gradients } = recorder();
    paintGlass(ctx, 40, 32, 44);
    expect(ops.some((o) => o.name === "strokeRect")).toBe(true);
    expect(gradients).toHaveLength(1);
    // the sheen: a filled slanted band (a closed path), 18 % white
    expect(ops.some((o) => o.name === "closePath")).toBe(true);
    expect(ops.some((o) => o.name === "fill" && o.fillStyle === "#ffffff")).toBe(true);
  });

  it("a crate draws a drop shadow under it before its body", () => {
    const { ctx, ops } = recorder();
    paintCrateShadow(ctx, 50, 50, 14, 12, 40);
    paintCrate(ctx, 34, 28, 28);
    const shadow = ops.findIndex((o) => o.name === "ellipse");
    const body = ops.findIndex((o) => o.name === "fillRect" && o.fillStyle === WORLD.crate);
    expect(shadow).toBeGreaterThan(-1);
    expect(shadow).toBeLessThan(body);
    const fill = ops.find((o) => o.name === "fill");
    expect(fill?.fillStyle).toBe(WORLD.line);
    expect(fill?.globalAlpha).toBeCloseTo(0.18);
    // its brace is kept, and it has three grain lines
    expect(ops.some((o) => o.name === "stroke")).toBe(true);
    expect(ops.filter((o) => o.name === "fillRect" && o.args[3] === 1)).toHaveLength(3);
  });

  it("a door draws two inset panels and keeps its seam", () => {
    const { ctx, ops } = recorder();
    paintDoor(ctx, 40, 32, 28);
    // four insets (two per leaf), each with its bevel
    const bevels = ops.filter((o) => o.name === "fillRect" && o.args[3] === 1);
    expect(bevels).toHaveLength(4);
    const seam = ops.filter((o) => o.fillStyle === WORLD.doorSeam);
    expect(seam).toHaveLength(1);
    expect(seam[0]?.args[2]).toBe(2);
  });

  it("in high contrast, each of the four draws no gradient and no shadow", () => {
    setContrast(true);
    const r = recorder();
    paintDoor(r.ctx, 40, 32, 28);
    paintCrate(r.ctx, 34, 28, 28);
    paintCrateShadow(r.ctx, 50, 50, 14, 12, 40);
    paintGlass(r.ctx, 40, 32, 44);
    paintVent(r.ctx, 40, 32, 44);
    expect(r.gradients).toHaveLength(0);
    expect(r.ops.some((o) => o.name === "ellipse")).toBe(false);
    expect(r.ops.every((o) => !isGradient(o))).toBe(true);
    expect(r.ops.some((o) => o.name === "closePath")).toBe(false);
  });
});

describe("station bodies in brushed steel", () => {
  const cam = { scale: 48, ox: 0, oy: 0 };
  const scene = { players: [] } as unknown as Scene;
  const safe: EntityView = {
    id: "Q1",
    kind: "station",
    pos: { x: 4.5, y: 2.5 },
    station: {
      type: "dial",
      shows: [7, 3],
      solved: false,
      parts: [{ key: "anchor", at: [{ x: 4, y: 2 }] }],
    },
  };

  it("a safe's body is a banded gradient; its number and swatches are flat fills drawn after it", () => {
    const { ctx, ops, gradients } = recorder();
    drawStationStanding(ctx, safe, cam, scene, 2);
    expect(gradients.length).toBeGreaterThanOrEqual(1);
    const band = gradients[0];
    expect(band?.stops.length).toBeGreaterThanOrEqual(4); // lit edge, base, dark band, second light
    const body = ops.findIndex((o) => o.name === "fillRect" && isGradient(o));
    const number = ops.findIndex((o) => o.name === "fillText");
    expect(body).toBeGreaterThan(-1);
    expect(number).toBeGreaterThan(body);
    expect(ops[number]?.fillStyle).toBe(WORLD.line);
    expect(isGradient(ops[number] as Op)).toBe(false);
    // the outline of its dial face is still the plain line colour
    expect(ops.some((o) => o.name === "stroke")).toBe(true);
  });

  it("a code swatch is never drawn with a gradient, for every code and every station type", () => {
    for (let code = 0; code < 6; code++) {
      const { ctx, ops, gradients } = recorder();
      codeSwatch(ctx, code, 0, 0, 20, 20);
      expect(gradients, `code ${code}`).toHaveLength(0);
      expect(ops.every((o) => !isGradient(o))).toBe(true);
    }
    for (const type of STATION_TYPES) {
      const e: EntityView = {
        id: "Q9",
        kind: "station",
        pos: { x: 4.5, y: 2.5 },
        station: {
          type,
          shows: [1, 2, 3, 4],
          solved: false,
          parts: [
            { key: "anchor", at: [{ x: 4, y: 2 }] },
            { key: "wires", at: [{ x: 4, y: 2 }] },
            { key: "bells", at: [{ x: 4, y: 2 }] },
          ] as never,
        },
      };
      const { ctx, ops } = recorder();
      drawStationStanding(ctx, e, cam, scene, 2);
      // a swatch is a rect path filled with a code colour: that fill is a plain colour
      const codeFills = ops.filter((o) => o.name === "fill" && typeof o.fillStyle === "string");
      expect(
        codeFills.every((o) => !isGradient(o)),
        type,
      ).toBe(true);
    }
  });

  it("in high contrast a station body is a flat fill", () => {
    setContrast(true);
    const { ctx, ops, gradients } = recorder();
    drawStationStanding(ctx, safe, cam, scene, 2);
    paintSteel(ctx, { x: 0, y: 0, w: 10, h: 10 }, true);
    expect(gradients).toHaveLength(0);
    expect(ops.every((o) => !isGradient(o))).toBe(true);
  });
});

describe("figures in material, and the goggles' grain", () => {
  const me: EntityView = {
    id: "P1",
    kind: "player",
    pos: { x: 2.5, y: 3.5 },
    seat: 1,
    facing: { x: 0, y: 1 },
  } as EntityView;
  const frame = () => {
    const scene: Scene = {
      w: 300,
      h: 300,
      role: "deaf",
      seat: 1,
      roles: ["blind", "deaf", "mute"],
      tiles: ["....", "....", "....", "....", "...."],
      entities: [me],
      self: { x: 2.5, y: 3.5 },
      layout: "fit",
    };
    const r = recorder();
    draw(r.ctx, scene);
    return r;
  };

  it("a figure keeps its 2 px WORLD.line outline and its hat shape, and its shadow is a radial gradient", () => {
    const { ops, gradients } = frame();
    const radials = gradients.filter(
      (g) => g.kind === "createRadialGradient" && g.stops[0]?.[1] === WORLD.line,
    );
    expect(radials).toHaveLength(1);
    expect(radials[0]?.stops[1]?.[1]).toBe(`${WORLD.line}00`);
    // the shadow: a floor ellipse filled with it at 22 %
    const shadow = ops.find((o) => o.name === "fill" && isGradient(o) && o.globalAlpha === 0.22);
    expect(shadow).toBeDefined();
    // the body: a pill in the role colour, then the soft gradient over it, then the outline
    const pill = ops.findIndex((o) => o.name === "roundRect" && o.args.length === 5);
    expect(pill).toBeGreaterThan(-1);
    const body = ops.findIndex((o, i) => i > pill && o.name === "fill" && isGradient(o));
    expect(body).toBeGreaterThan(pill);
    expect(ops.slice(pill).some((o) => o.name === "stroke")).toBe(true);
    // the hat keeps its fill and outline, and gets a sheen arc: a stroke in white after it
    const sheen = ops.findIndex(
      (o) => o.name === "stroke" && o.strokeStyle === "#ffffff" && o.globalAlpha < 1,
    );
    expect(sheen).toBeGreaterThan(body);
  });

  it("in high contrast a figure is flat", () => {
    setContrast(true);
    const { ops, gradients } = frame();
    expect(gradients.filter((g) => g.stops[0]?.[1] === WORLD.line)).toHaveLength(0);
    expect(ops.some((o) => o.name === "fill" && isGradient(o))).toBe(false);
  });

  it("the goggles' grain changes at most 6 times a second", () => {
    const grain = (nowMs: number) => {
      const { ctx, ops } = recorder();
      drawGoggles(ctx, {
        w: 120,
        h: 120,
        nowMs,
        role: "blind",
        seat: 0,
        roles: ["blind", "deaf", "mute"],
        tiles: [],
        entities: [],
        self: null,
        layout: "fit",
      } as Scene);
      return JSON.stringify(ops.filter((o) => o.name === "fillRect").map((o) => o.args));
    };
    expect(grain(0)).toBe(grain(100));
    expect(grain(0)).not.toBe(grain(170));
  });
});
