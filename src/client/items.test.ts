// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { h, render } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ItemGlyph } from "../components/ItemGlyph.tsx";
import { KeepsakePlate } from "../components/KeepsakePlate.tsx";
import { ITEMS } from "../game/rooms/format.ts";
import { ITEM_NAME } from "../game/sim/credits.ts";
import {
  ITEM_LAYERS,
  ITEM_NAMES,
  ITEM_VIEW,
  inkWidth,
  MIN_INK_PX,
  shadowPath,
  visibleLayers,
} from "./items.ts";
import { drawItem } from "./render/items.ts";
import { setContrast, WORLD } from "./tokens.ts";

afterEach(() => {
  render(null, document.body);
  document.body.innerHTML = "";
});

// every path the glyph draws, in order, with the shadow first
const drawn = (item: (typeof ITEMS)[number], size: number) => {
  render(h(ItemGlyph, { item, size }), document.body);
  return [...document.querySelectorAll("svg > path, svg > g > path")].map((p) =>
    p.getAttribute("d"),
  );
};

describe("the six items", () => {
  it("each has a name and layers: bodies, lights and ink", () => {
    expect(Object.keys(ITEM_LAYERS).sort()).toEqual([...ITEMS].sort());
    for (const item of ITEMS) {
      expect(ITEM_NAMES[item], item).toMatch(/\w/);
      const looks = new Set(ITEM_LAYERS[item].layers.map((l) => l.look));
      expect(looks.has("shine"), `${item}: a shine`).toBe(true);
      expect(
        [...looks].some((l) => l !== "shine" && l !== "shade" && l !== "ink"),
        `${item}: a body`,
      ).toBe(true);
      for (const l of ITEM_LAYERS[item].layers) expect(l.d, item).toMatch(/^M/);
    }
  });

  it("the HUD glyph draws exactly the strings the canvas reads", () => {
    for (const item of ITEMS) {
      expect(drawn(item, 64), item).toEqual([
        shadowPath(item),
        ...visibleLayers(item, 64).map((l) => l.d),
      ]);
    }
  });

  it("its names are the server's, without the article", () => {
    for (const item of ITEMS) expect(`the ${ITEM_NAMES[item]}`, item).toBe(ITEM_NAME[item]);
  });

  it("small sizes keep the layers that carry the item and drop only fine ones", () => {
    for (const item of ITEMS) {
      const big = visibleLayers(item, 64).length;
      const at24 = visibleLayers(item, 24);
      expect(at24.length, item).toBeLessThanOrEqual(big);
      // what makes each item itself survives at 24 px: its first body, a shine, the main ink
      expect(
        at24.some((l) => l.look === "shine"),
        `${item}: shine at 24`,
      ).toBe(true);
    }
    const watchAt24 = visibleLayers("watch", 24).filter((l) => l.look === "ink");
    expect(
      watchAt24.some((l) => l.d.includes("L37.4 36.6")),
      "the watch's hands at 24",
    ).toBe(true);
    const neck24 = visibleLayers("necklace", 24).filter((l) => l.look === "ink");
    expect(neck24.length, "the necklace's chain at 24").toBeGreaterThan(0);
  });

  it("an ink line is thickened so it is at least 1.4 px on screen", () => {
    for (const size of [16, 24, 32, 48, 64]) {
      expect((inkWidth(0.5, size) * size) / ITEM_VIEW, `${size}px`).toBeGreaterThanOrEqual(
        MIN_INK_PX - 1e-9,
      );
    }
  });

  it("colours are token names, never a raw colour, outside the white and black of light", () => {
    const src = readFileSync("src/client/items.ts", "utf8");
    expect(src.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? []).toEqual([]);
    for (const item of ITEMS)
      for (const l of ITEM_LAYERS[item].layers)
        if (l.token) expect(WORLD, `${item}: ${l.token}`).toHaveProperty(l.token);
  });

  it("the HUD ties its light to --item-shade, and high contrast zeroes it and hides the lights", () => {
    const css = readFileSync("src/styles/game.css", "utf8");
    expect(css).toMatch(/--item-shade: 1;/);
    expect(css).toMatch(/\[data-contrast="high"\]\s*\{\s*--item-shade: 0;/);
    expect(css).toMatch(/\[data-contrast="high"\] \.item-shadow/);
    expect(css).toMatch(/\[data-contrast="high"\] \.item-light/);
  });

  it("the canvas draws flat in high contrast: no gradient, no shadow, no lights", () => {
    const calls: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, k: string) => {
        if (k === "createLinearGradient" || k === "createRadialGradient")
          return () => {
            calls.push("gradient");
            return { addColorStop() {} };
          };
        return () => {};
      },
      set: (_t, k: string) => {
        calls.push(`set:${k}`);
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    vi.stubGlobal("Path2D", class {});
    try {
      setContrast(false);
      drawItem(ctx, "watch", 0, 0, 48);
      expect(calls.filter((c) => c === "gradient").length, "normal: shaded").toBeGreaterThan(0);
      calls.length = 0;
      setContrast(true);
      drawItem(ctx, "watch", 0, 0, 48);
      expect(
        calls.filter((c) => c === "gradient"),
        "high contrast: flat",
      ).toEqual([]);
    } finally {
      setContrast(false);
      vi.unstubAllGlobals();
    }
  });

  it("the pen is drawn level and turned, the shadow turned with it", () => {
    expect(ITEM_LAYERS.pen.turn).toBeDefined();
    render(h(ItemGlyph, { item: "pen", size: 48 }), document.body);
    expect(document.querySelector("g")?.getAttribute("transform")).toContain("rotate(");
    expect(document.querySelector(".item-shadow")?.getAttribute("transform")).toContain("rotate(");
  });
});

describe("KeepsakePlate", () => {
  it("shows the item on a plate, with its name for screen readers", () => {
    render(h(KeepsakePlate, { item: "watch" }), document.body);
    const plate = document.querySelector(".keepsake");
    expect(plate?.classList.contains("is-missed")).toBe(false);
    expect(plate?.querySelector("svg")).not.toBeNull();
    expect(plate?.textContent).toContain("gold watch");
  });

  it("a missed plate is empty: dashed, no item and no name", () => {
    render(h(KeepsakePlate, { item: "watch", missed: true }), document.body);
    const plate = document.querySelector(".keepsake");
    expect(plate?.classList.contains("is-missed")).toBe(true);
    expect(plate?.querySelector("svg path")).toBeNull();
    expect(plate?.textContent).not.toContain("watch");
  });
});

// ---- the drop shadow and the lights, checked as geometry ----

type Pt = [number, number];

// A path flattened to polylines. `strict` throws on a command it cannot flatten; otherwise null.
function flatten(d: string, strict: boolean): Pt[][] | null {
  const subs: Pt[][] = [];
  let cur: Pt[] = [];
  let x = 0;
  let y = 0;
  for (const m of d.matchAll(/([MLHVQCAaZz])([^MLHVQCAaZz]*)/g)) {
    const c = m[1] as string;
    const n = (m[2]?.match(/-?\d*\.?\d+/g) ?? []).map(Number) as number[];
    const at = (i: number) => n[i] as number;
    if (c === "M") {
      [x, y] = [at(0), at(1)];
      cur = [[x, y]];
      subs.push(cur);
    } else if (c === "L") {
      for (let i = 0; i < n.length; i += 2) {
        x = at(i);
        y = at(i + 1);
        cur.push([x, y]);
      }
    } else if (c === "H") {
      x = at(0);
      cur.push([x, y]);
    } else if (c === "V") {
      y = at(0);
      cur.push([x, y]);
    } else if (c === "Q" || c === "C") {
      const k = c === "Q" ? 4 : 6;
      const p = [
        [x, y],
        ...Array.from({ length: k / 2 }, (_, i) => [at(2 * i), at(2 * i + 1)]),
      ] as Pt[];
      for (let s = 1; s <= 12; s++) {
        const t = s / 12;
        const u = 1 - t;
        const w =
          c === "Q" ? [u * u, 2 * u * t, t * t] : [u ** 3, 3 * u * u * t, 3 * u * t * t, t ** 3];
        cur.push([
          w.reduce((a, wi, i) => a + wi * (p[i] as Pt)[0], 0),
          w.reduce((a, wi, i) => a + wi * (p[i] as Pt)[1], 0),
        ]);
      }
      [x, y] = p[p.length - 1] as Pt;
    } else if (c === "a") {
      // the half-ellipses `ell` draws: a diameter along x
      const [rx, ry, , , sweep, dx, dy] = n as [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      if (dy !== 0) throw new Error("arc with a rise");
      const cx = x + dx / 2;
      const start = dx > 0 ? Math.PI : 0;
      const dir = sweep ? 1 : -1;
      for (let s = 1; s <= 24; s++) {
        const a = start + (dir * Math.PI * s) / 24;
        cur.push([cx + rx * Math.cos(a), y + ry * Math.sin(a)]);
      }
      x += dx;
    } else if (c === "Z" || c === "z") {
      // closed implicitly
    } else {
      if (strict) throw new Error(`cannot flatten ${c}`);
      return null;
    }
  }
  return subs;
}
// positive: clockwise on screen (y runs down)
const area = (p: Pt[]) =>
  p.reduce((a, q, i) => {
    const r = p[(i + 1) % p.length] as Pt;
    return a + q[0] * r[1] - r[0] * q[1];
  }, 0) / 2;
function winding(pt: Pt, subs: Pt[][]): number {
  let w = 0;
  for (const poly of subs)
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length] as Pt;
      const left = (b[0] - a[0]) * (pt[1] - a[1]) - (pt[0] - a[0]) * (b[1] - a[1]);
      if (a[1] <= pt[1]) {
        if (b[1] > pt[1] && left > 0) w++;
      } else if (b[1] <= pt[1] && left < 0) w--;
    });
  return w;
}
const silhouette = (item: (typeof ITEMS)[number]) => flatten(shadowPath(item), true) as Pt[][];
const inside = (item: (typeof ITEMS)[number], pt: Pt) => winding(pt, silhouette(item)) !== 0;

describe("the drop shadow", () => {
  it("every shape in it is wound the same way, so overlaps never cancel to a hole", () => {
    for (const item of ITEMS)
      ITEM_LAYERS[item].layers.forEach((l, i) => {
        if (!l.shadow) return;
        const subs = flatten(l.d, true) as Pt[][];
        expect(area(subs[0] as Pt[]), `${item} layer ${i}`).toBeGreaterThan(0);
      });
  });

  it("has no gap down the middle of the watch or the goblet", () => {
    for (const [item, x, y0, y1] of [
      ["watch", 32, 6, 61],
      ["goblet", 32, 10, 58],
    ] as const)
      for (let y = y0; y <= y1; y += 0.5)
        expect(inside(item, [x, y]), `${item} at y=${y}`).toBe(true);
  });

  it("falls under the ledger's ribbon and the necklace's chain too", () => {
    expect(inside("ledger", [33, 61.5]), "the ribbon").toBe(true);
    expect(inside("necklace", [45.6, 19.8]), "the right chain").toBe(true);
    expect(inside("necklace", [18.4, 19.8]), "the left chain").toBe(true);
  });

  it("a cast layer is in the shadow only: neither renderer draws it", () => {
    expect(ITEM_LAYERS.necklace.layers.some((l) => l.look === "cast")).toBe(true);
    for (const item of ITEMS)
      expect(
        visibleLayers(item, 64).some((l) => l.look === "cast"),
        item,
      ).toBe(false);
  });
});

describe("the shine", () => {
  it("stays inside the item it lights (a vertex off the body is a glint over the edge)", () => {
    for (const item of ITEMS)
      for (const l of ITEM_LAYERS[item].layers) {
        if (l.look !== "shine") continue;
        const subs = flatten(l.d, false);
        if (!subs) continue; // curved shines are looked at, not measured
        for (const poly of subs)
          for (const p of poly) expect(inside(item, p), `${item}: ${l.d} at ${p}`).toBe(true);
      }
  });

  it("the ring's band lights end clear of its seal, and keep off both rims", () => {
    const lights = ITEM_LAYERS.ring.layers.filter(
      (l) => (l.look === "shine" || l.look === "shade") && l.d.includes("L") && !l.d.includes("H"),
    );
    expect(lights.length).toBeGreaterThanOrEqual(2);
    for (const l of lights)
      for (const [x, y] of (flatten(l.d, true) as Pt[][])[0] as Pt[]) {
        const r = Math.hypot(x - 32, y - 41);
        // the band runs r 11 (the hole) to 17, each edge a line about 1 wide
        if (r > 10 && r < 18) {
          expect(r, `${x},${y} off the inner rim`).toBeGreaterThan(12);
          expect(r, `${x},${y} off the outer rim`).toBeLessThan(16);
          expect(y, `${x},${y} clear of the seal`).toBeGreaterThan(28.4);
        }
      }
  });

  it("the ring's band glint and the watch's band glints are measured, not skipped", () => {
    const measured = (item: (typeof ITEMS)[number]) =>
      ITEM_LAYERS[item].layers.filter((l) => l.look === "shine" && flatten(l.d, false)).length;
    expect(measured("ring"), "ring").toBeGreaterThanOrEqual(2);
    expect(measured("watch"), "watch").toBeGreaterThanOrEqual(2);
  });

  it("a band glint on the watch is tapered like the band, not a straight stripe", () => {
    for (const [name, from, to] of [
      ["upper", 5, 22],
      ["lower", 46, 62],
    ] as const) {
      const glint = ITEM_LAYERS.watch.layers.find((l) => {
        const subs = l.look === "shine" ? flatten(l.d, false) : null;
        return subs?.[0]?.every((p) => p[1] >= from && p[1] <= to && p[0] < 32);
      });
      expect(glint, `${name} band glint`).toBeDefined();
      const xs = (flatten(glint?.d ?? "", true) as Pt[][])[0] as Pt[];
      // a straight vertical stripe has two x values; a tapered one has four
      expect(new Set(xs.map((p) => p[0])).size, name).toBeGreaterThanOrEqual(3);
    }
  });
});
