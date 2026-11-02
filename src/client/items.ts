import type { ItemId } from "../game/rooms/format.ts";
import type { WorldTokens } from "./tokens.ts";

// The six keepsakes a cache can hold (caches FR17), drawn once: each item is a stack of layers on a
// 64 grid, bottom to top, that the HUD's ItemGlyph (<path d>) and the canvas's drawItem (Path2D)
// both read, so the two can never drift. A layer is a body (metal, matte or pearl: a token filled
// with a lit-to-shaded gradient and an edge tinted from the same token), a light (a shine or a
// shade laid over the bodies) or an ink (a stroked line: a watch's hands, a necklace's chain).
// Light comes from the north-west (DESIGN.md 4.1), and the drop shadow falls south-east. High
// contrast is flat: plain token fills, `--w-line` edges and inks, no lights, no shadow. Colours are
// WorldTokens names, never a colour, so high contrast remaps them with the rest of the world.
//
// Drawn on a 64 grid, framed with a 2-unit margin all round so the drop shadow is never clipped.
export const ITEM_GRID = 64;
export const ITEM_MARGIN = 2;
export const ITEM_VIEW = ITEM_GRID + 2 * ITEM_MARGIN;
export const MIN_INK_PX = 1.4; // an ink line is never thinner than this on screen
export const inkWidth = (w: number, size: number): number =>
  Math.max(w, (MIN_INK_PX * ITEM_VIEW) / size);

export const GLOSS_ALPHA = 0.55;
export const SHADE_ALPHA = 0.34;
export const SHADOW = { dx: 2, dy: 2.5, alpha: 0.28 };
export const LIGHT = { from: [10, 6], to: [54, 58] } as const; // default gradient axis, NW to SE
export const EDGE_DARK = 0.6; // a body's edge: its token this far toward black
export const INK_CENTRE = 32; // a turned item turns about (32, 32)

// A gradient: stops along the axis, each the token mixed `amt` toward white (1) or black (0).
// Zero everywhere in high contrast.
export type Stop = readonly [at: number, toward: 0 | 1, amt: number];
export const STOPS = {
  // gold, steel and lacquer: a lit edge, a dark band, a second light, a heavy end
  metal: [
    [0, 1, 0.5],
    [0.18, 1, 0.12],
    [0.34, 0, 0.28],
    [0.5, 0, 0],
    [0.7, 1, 0.22],
    [0.85, 1, 0],
    [1, 0, 0.38],
  ],
  // leather, paper: one soft turn from the light to the shade
  matte: [
    [0, 1, 0.3],
    [0.5, 0, 0],
    [1, 0, 0.3],
  ],
  // a pearl, radial from its lit spot
  pearl: [
    [0, 1, 0.85],
    [0.5, 0, 0],
    [1, 0, 0.28],
  ],
} as const satisfies Record<string, readonly Stop[]>;

export type Look = keyof typeof STOPS | "shine" | "shade" | "ink" | "cast"; // cast: shadow only, never drawn
export interface Layer {
  d: string;
  look: Look;
  token?: keyof WorldTokens; // a body's fill; an ink's tone (the line colour if none)
  edge?: number; // a body's tinted outline, in grid units
  w?: number; // an ink's stroke, in grid units (see inkWidth)
  dark?: number; // an ink with a token: that far toward black
  axis?: readonly [number, number, number, number]; // this layer's gradient axis, in grid units
  radial?: readonly [cx: number, cy: number, r: number]; // a radial gradient instead of an axis
  minPx?: number; // left out when the item is drawn smaller than this
  shadow?: boolean; // part of the item's drop shadow (every shape in it is wound clockwise, so overlaps never cancel)
}
export interface ItemDef {
  layers: Layer[];
  turn?: number; // degrees, about (32, 32): the pen is drawn level and turned
}

// What a stash is called on a page. The server's ITEM_NAME (src/game/sim/credits.ts) is the same
// words with "the " in front: items.test.ts keeps the two in step.
export const ITEM_NAMES: Record<ItemId, string> = {
  watch: "gold watch",
  ledger: "ledger",
  ring: "signet ring",
  goblet: "silver goblet",
  pen: "fountain pen",
  necklace: "pearl necklace",
};

const r1 = (n: number): number => Math.round(n * 10) / 10;
const ell = (cx: number, cy: number, rx: number, ry: number, sweep: 0 | 1 = 1): string =>
  `M${r1(cx - rx)} ${cy}a${rx} ${ry} 0 1 ${sweep} ${2 * rx} 0a${rx} ${ry} 0 1 ${sweep} ${-2 * rx} 0Z`;
const circle = (cx: number, cy: number, r: number, sweep: 0 | 1 = 1): string =>
  ell(cx, cy, r, r, sweep);

// A thin quad along a line (the necklace's chain, for its shadow), wound clockwise.
const seg = (x1: number, y1: number, x2: number, y2: number, w: number): string => {
  const [dx, dy] = [x2 - x1, y2 - y1];
  const len = Math.hypot(dx, dy);
  const [nx, ny] = [(-dy / len) * (w / 2), (dx / len) * (w / 2)];
  const pts = [
    [x1 + nx, y1 + ny],
    [x2 + nx, y2 + ny],
    [x2 - nx, y2 - ny],
    [x1 - nx, y1 - ny],
  ].map(([x, y]) => [r1(x as number), r1(y as number)]);
  const area = pts.reduce((a, q, i) => {
    const r = pts[(i + 1) % 4] as number[];
    return a + (q[0] as number) * (r[1] as number) - (r[0] as number) * (q[1] as number);
  }, 0);
  const ordered = area >= 0 ? pts : pts.reverse();
  return `M${ordered.map((q) => q.join(" ")).join("L")}Z`;
};
// A slice of a ring (a glint or shade that follows a round band), as a polygon so it can be
// measured: radii r0 to r1 about (cx, cy), angles in degrees (0 east, 90 south), clockwise.
const slice = (cx: number, cy: number, r0: number, r1_: number, a0: number, a1: number): string => {
  const steps = Math.max(4, Math.round((a1 - a0) / 7));
  const at = (r: number, a: number) =>
    `${r1(cx + r * Math.cos((a * Math.PI) / 180))} ${r1(cy + r * Math.sin((a * Math.PI) / 180))}`;
  const out = Array.from({ length: steps + 1 }, (_, i) => at(r1_, a0 + ((a1 - a0) * i) / steps));
  const back = Array.from({ length: steps + 1 }, (_, i) => at(r0, a1 - ((a1 - a0) * i) / steps));
  return `M${[...out, ...back].join("L")}Z`;
};

type Opts = Partial<Omit<Layer, "d" | "look" | "token">>;
const body = (
  look: "metal" | "matte" | "pearl",
  d: string,
  token: keyof WorldTokens,
  o: Opts = {},
) => ({ d, look, token, ...o }) satisfies Layer;
const light = (look: "shine" | "shade", d: string, o: Opts = {}) =>
  ({ d, look, ...o }) satisfies Layer;
const ink = (d: string, w: number, o: Opts & { token?: keyof WorldTokens } = {}) =>
  ({ d, look: "ink", w, ...o }) satisfies Layer;

// the watch's twelve hour marks, the quarters longer
const TICKS = Array.from({ length: 12 }, (_, i) => {
  const a = (i * Math.PI) / 6;
  const [from, to] = i % 3 === 0 ? [6.6, 9.2] : [8, 9.2];
  const at = (r: number) => `${r1(32 + r * Math.sin(a))} ${r1(34 - r * Math.cos(a))}`;
  return `M${at(from)}L${at(to)}`;
}).join("");

// eight pearls on an arc, touching: centre (32, 22), radius 26, every 20 degrees
const BEAD_AT = [20, 40, 60, 80, 100, 120, 140, 160].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return [r1(32 + 26 * Math.cos(a)), r1(22 + 26 * Math.sin(a))] as const;
});

export const ITEM_LAYERS: Record<ItemId, ItemDef> = {
  // a round gold case on a bracelet, a crown at three o'clock, a cream dial under a crystal
  watch: {
    layers: [
      body("metal", "M24.8 22L27 5.5Q32 3.5 37 5.5L39.2 22Z", "brass", {
        edge: 1.6,
        axis: [24, 0, 40, 0],
        shadow: true,
      }),
      body("metal", "M24.8 46H39.2L37.4 61Q32 63.5 26.6 61Z", "brass", {
        edge: 1.6,
        axis: [24, 0, 40, 0],
        shadow: true,
      }),
      ink("M27.6 9.5H36.4M26.9 14H37.1M26.2 18.5H37.8M25.6 51H38.4M26.1 55.5H37.9M27 59.5H37", 1, {
        token: "brass",
        dark: 0.55,
        minPx: 24,
      }),
      body("metal", "M45 30.5H51Q52 30.5 52 31.5V36.5Q52 37.5 51 37.5H45Z", "brass", {
        edge: 1.2,
        axis: [0, 30, 0, 38],
        shadow: true,
      }),
      body("metal", circle(32, 34, 15), "brass", { edge: 2.2, shadow: true }),
      body("metal", circle(32, 34, 12.4), "brass", { edge: 0.9, axis: [48, 50, 16, 18] }),
      body("matte", circle(32, 34, 10.2), "card", { edge: 0.9 }),
      ink(TICKS, 0.9, { minPx: 40 }),
      body("metal", circle(32, 34, 1.5), "brass", { edge: 0.6, minPx: 24 }),
      ink("M32 34V27M32 34L37.4 36.6", 1.7, { minPx: 16 }),
      light("shine", "M24.6 30.6A8.8 8.8 0 0 1 32.8 25.2L31.4 28.6A5.4 5.4 0 0 0 27.6 31.6Z"),
      light("shine", "M19.4 29.6A13.8 13.8 0 0 1 28 20.6L29.2 23A11.2 11.2 0 0 0 22 30.6Z"),
      light("shine", "M28.3 8.2H30.5L29.1 20H26.9Z", { minPx: 24 }),
      light("shine", "M27.1 48.2H29.3L30 59.4H28.1Z", { minPx: 24 }),
    ],
  },
  // a leather book with a page block, spine bands, brass corners, a title plate and a ribbon
  ledger: {
    layers: [
      body("matte", "M18 10H50V58H18Z", "card", { edge: 1.4, axis: [18, 0, 50, 0], shadow: true }),
      ink("M20 57H49M49.2 13V57", 0.7, { minPx: 32 }),
      body("matte", "M32 55H39V63L35.5 60L32 63Z", "codeRed", { edge: 1.2, shadow: true }),
      body("matte", "M16 8H46Q48 8 48 10V54Q48 56 46 56H16Z", "crateBrace", {
        edge: 2,
        shadow: true,
      }),
      light("shade", "M16 8H21.5V56H16Z", { axis: [16, 0, 21.5, 0] }),
      body("metal", "M16 13H21.5V15.6H16ZM16 29.4H21.5V32H16ZM16 46.4H21.5V49H16Z", "brass", {
        edge: 0.8,
        axis: [0, 13, 0, 49],
      }),
      body("metal", "M38.5 8H46Q48 8 48 10V17.5Z", "brass", { edge: 0.9 }),
      body("metal", "M48 46.5V54Q48 56 46 56H38.5Z", "brass", { edge: 0.9 }),
      body("metal", "M26 19.5H43V32H26Z", "brass", { edge: 1.1, axis: [26, 19, 43, 32] }),
      ink("M29 23.6H40M29 27.6H37", 1.2, { minPx: 16 }),
      light("shine", "M24 10H28L26.6 54H24.4Z"),
    ],
  },
  // a gold band, a flared head and a ruby seal cut in facets
  ring: {
    layers: [
      body("metal", `${circle(32, 41, 17)}${circle(32, 41, 11, 0)}`, "brass", {
        edge: 2,
        axis: [15, 24, 49, 58],
        shadow: true,
      }),
      light("shade", slice(32, 41, 12.1, 13.9, 200, 233)),
      body(
        "metal",
        "M23.5 10H40.5Q43 10 43 12.5V25.5Q43 28 40.5 28H23.5Q21 28 21 25.5V12.5Q21 10 23.5 10Z",
        "brass",
        { edge: 1.8, axis: [21, 10, 43, 28], shadow: true },
      ),
      body(
        "metal",
        "M25 13.5H39Q40 13.5 40 14.5V23.5Q40 24.5 39 24.5H25Q24 24.5 24 23.5V14.5Q24 13.5 25 13.5Z",
        "codeRed",
        {
          edge: 1,
          axis: [24, 13, 40, 25],
        },
      ),
      body(
        "metal",
        "M28 16.6H36Q37 16.6 37 17.6V20.4Q37 21.4 36 21.4H28Q27 21.4 27 20.4V17.6Q27 16.6 28 16.6Z",
        "codeRed",
        {
          edge: 0.8,
          axis: [37, 22, 27, 16],
          minPx: 24,
        },
      ),
      light("shine", slice(32, 41, 12.7, 15.3, 188, 231)),
      light("shine", "M25.4 14.6H30L25.4 20.4Z", { minPx: 24 }),
    ],
  },
  // a flared silver bowl with wine in it, an engraved band, a knop, a stem and a domed foot
  goblet: {
    layers: [
      body(
        "metal",
        "M20 58Q20 53.5 28 52.5H36Q44 53.5 44 58Q44 59 43 59H21Q20 59 20 58Z",
        "steel",
        {
          edge: 1.5,
          axis: [20, 0, 44, 0],
          shadow: true,
        },
      ),
      body("metal", "M29.6 34H34.4L35.2 53H28.8Z", "steel", {
        edge: 1.3,
        axis: [28.8, 0, 35.2, 0],
        shadow: true,
      }),
      body("metal", ell(32, 44.5, 4.6, 3.1), "steel", {
        edge: 1.3,
        axis: [27, 0, 37, 0],
        shadow: true,
      }),
      body("metal", "M16 9H48C48 20 44 31 36 35.5Q32 37.5 28 35.5C20 31 16 20 16 9Z", "steel", {
        edge: 2,
        axis: [16, 9, 48, 33],
        shadow: true,
      }),
      body("metal", ell(32, 9, 16, 3.2), "steel", { edge: 1.3, axis: [16, 0, 48, 0] }),
      body("matte", ell(32, 9.2, 13.8, 2.2), "codeRed", { edge: 0.8 }),
      ink("M17.6 18Q32 22.4 46.4 18", 1, { minPx: 24 }),
      light("shine", "M20 13.5H24C24 21 26.6 27.6 30.4 31.4C23.2 28.4 20 22 20 13.5Z"),
      light("shine", "M23 55H31L30 56.6H23Z", { minPx: 24 }),
    ],
  },
  // a lacquer fountain pen: nib, grip, barrel, cap, clip and bands; drawn level, turned 45 degrees
  pen: {
    turn: -45,
    layers: [
      body("metal", "M2.5 32L13 28.4Q16 27.8 19.5 27.8V36.2Q16 36.2 13 35.6Z", "brass", {
        edge: 1.2,
        axis: [0, 27.8, 0, 36.2],
        shadow: true,
      }),
      ink("M3.4 32H13.4M13.4 32.5A1 1 0 1 0 15.4 32.5A1 1 0 1 0 13.4 32.5", 0.9, { minPx: 24 }),
      body("matte", "M19 28.2H28.5V35.8H19Z", "codeBlack", {
        edge: 1.2,
        axis: [0, 28, 0, 36],
        shadow: true,
      }),
      body("metal", "M27.6 27.4H47.8V36.6H27.6Z", "codeBlack", {
        edge: 1.4,
        axis: [0, 27, 0, 37],
        shadow: true,
      }),
      body("metal", "M47.2 26.2H59Q61.6 26.2 61.6 28.8V35.2Q61.6 37.8 59 37.8H47.2Z", "codeBlack", {
        edge: 1.4,
        axis: [0, 26, 0, 38],
        shadow: true,
      }),
      body("metal", "M46.6 25.6H50V38.4H46.6Z", "brass", { edge: 0.9, axis: [0, 25, 0, 39] }),
      body("metal", "M50.4 26V23.8Q50.4 22.6 51.6 22.6H60.2V24.4H52.2V26Z", "brass", {
        edge: 0.9,
        axis: [0, 22, 0, 26],
      }),
      body("metal", "M56.4 26.2H58.2V37.8H56.4Z", "brass", {
        edge: 0.6,
        minPx: 40,
        axis: [0, 26, 0, 38],
      }),
      light("shine", "M29.6 28.6H46.6V30.4H29.6Z"),
      light("shine", "M51.6 27.6H60V29.2H51.6Z"),
    ],
  },
  // eight pearls on a gold chain that meets at a clasp
  necklace: {
    layers: [
      ink("M55.2 29.6L36 10M8.8 29.6L28 10", 1.5, { token: "brass", dark: 0.15 }),
      {
        d: `${seg(36, 10, 55.2, 29.6, 1.8)}${seg(28, 10, 8.8, 29.6, 1.8)}`,
        look: "cast",
        shadow: true,
      },
      body(
        "metal",
        "M28.8 5H35.2Q37 5 37 6.8V12.2Q37 14 35.2 14H28.8Q27 14 27 12.2V6.8Q27 5 28.8 5Z",
        "brass",
        {
          edge: 1.3,
          axis: [27, 5, 37, 14],
          shadow: true,
        },
      ),
      ...BEAD_AT.map(([x, y]) =>
        body("pearl", circle(x, y, 4.7), "card", {
          edge: 1.6,
          radial: [r1(x - 1.6), r1(y - 1.8), 6.6],
          shadow: true,
        }),
      ),
      ...BEAD_AT.map(([x, y]) =>
        light("shine", circle(r1(x - 1.7), r1(y - 1.9), 1.25), { minPx: 20 }),
      ),
    ],
  },
};

// The item's whole drop shadow as one path (one fill, so overlaps do not darken), in the item's own
// grid: both renderers shift it by SHADOW and turn it like the item.
export const shadowPath = (item: ItemId): string =>
  ITEM_LAYERS[item].layers
    .filter((l) => l.shadow)
    .map((l) => l.d)
    .join("");

export const visibleLayers = (item: ItemId, size: number): Layer[] =>
  ITEM_LAYERS[item].layers.filter((l) => l.look !== "cast" && (!l.minPx || size >= l.minPx));

// `crateBrace` -> `--w-crate-brace`: the CSS variable for a world token
export const tokenVar = (token: keyof WorldTokens): string =>
  `var(--w-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)})`;

// A token as the HUD mixes it: `amt` toward white or black, scaled by --item-shade (1; 0 in high
// contrast, which leaves the plain token).
export const mixCss = (token: keyof WorldTokens, toward: 0 | 1, amt: number): string =>
  amt === 0
    ? tokenVar(token)
    : `color-mix(in srgb, ${tokenVar(token)}, ${toward ? "white" : "black"} calc(var(--item-shade) * ${r1(amt * 100)}%))`;
// A body's edge and a token ink's tone: the token toward black, or the line colour in high contrast.
const toLine = (tone: string): string =>
  `color-mix(in srgb, var(--w-line) calc((1 - var(--item-shade)) * 100%), ${tone})`;
export const edgeCss = (token: keyof WorldTokens): string =>
  toLine(`color-mix(in srgb, ${tokenVar(token)}, black ${EDGE_DARK * 100}%)`);
export const inkCss = (token: keyof WorldTokens | undefined, dark = 0): string =>
  token
    ? toLine(`color-mix(in srgb, ${tokenVar(token)}, black ${r1(dark * 100)}%)`)
    : "var(--w-line)";
