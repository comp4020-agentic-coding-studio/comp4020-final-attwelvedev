import { COLOR, isHighContrast, mix, WORLD } from "../tokens.ts";
import { floorRing } from "./shared.ts";

// The world's materials (FR8): every tone is a world token mixed toward white or black, lit from the
// north-west. Each painter draws one tile's face at (ox, oy) in CSS px, the same whether it paints into
// the atlas (origin 0, 0) or straight onto the frame. Each first lays today's flat fill, which is all
// high contrast draws (FR9); the material goes over it.

const WHITE = "#ffffff";
const BLACK = "#000000";

// Rooms whose floor is wood; every other room is stone.
export const FLOOR_OF: Record<string, "stone" | "wood"> = {
  "04-the-safe": "wood",
  "08-music-room": "wood",
};
export type FloorKind = "stone" | "wood";
export const floorOf = (roomId: string | undefined): FloorKind =>
  (roomId && FLOOR_OF[roomId]) || "stone";

// A tile's flag or board set, 0 to 3, from its position: the same tile is always the same variant.
export function floorVariant(x: number, y: number): number {
  let h = (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return h % 4;
}

// A small seeded sequence, for where the speckle and the grain fall on a variant.
function seq(seed: number): () => number {
  let a = (seed + 1) * 2654435761;
  return () => {
    a = (Math.imul(a ^ (a >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    return a / 4294967296;
  };
}

// The floor's top face, s wide and d deep: stone flags with a groove and speckle, or three boards.
export function paintFloor(
  c: CanvasRenderingContext2D,
  s: number,
  d: number,
  variant: number,
  kind: FloorKind,
  ox = 0,
  oy = 0,
): void {
  if (isHighContrast()) {
    c.fillStyle = WORLD.floor;
    c.fillRect(ox, oy, s + 0.5, d + 0.5);
    c.fillStyle = WORLD.seam;
    c.fillRect(ox, oy, s + 0.5, 1);
    c.fillRect(ox, oy, 1, d + 0.5);
    return;
  }
  const rand = seq(variant);
  if (kind === "wood") {
    const board = d / 3;
    for (let i = 0; i < 3; i++) {
      const y = oy + i * board;
      c.fillStyle = mix(WORLD.floor, BLACK, 0.025 * ((variant + i) % 4));
      c.fillRect(ox, y, s + 0.5, board + 0.5);
      // the grain: two thin lines along the board
      c.fillStyle = mix(WORLD.floor, WORLD.seam, 0.7);
      for (let g = 0; g < 2; g++)
        c.fillRect(ox + s * (0.1 + rand() * 0.3), y + board * (0.3 + g * 0.35), s * 0.45, 0.75);
      // the gap between boards, and the butt joint where the board ends
      c.fillStyle = WORLD.seam;
      c.fillRect(ox, y, s + 0.5, 1);
      c.fillRect(ox + s * (((variant + i * 2) % 4) / 4 + 0.1), y, 1, board);
    }
    return;
  }
  // the flag, its tone set by its variant (one fill: variant 0 is the floor token itself)
  c.fillStyle = variant ? mix(WORLD.floor, BLACK, 0.02 * variant) : WORLD.floor;
  c.fillRect(ox, oy, s + 0.5, d + 0.5);
  // the groove along the north and west edges, with its lit lip just south-east of it
  c.fillStyle = WORLD.seam;
  c.fillRect(ox, oy, s + 0.5, 1.5);
  c.fillRect(ox, oy, 1.5, d + 0.5);
  c.fillStyle = mix(WORLD.floor, WHITE, 0.35);
  c.fillRect(ox + 1.5, oy + 1.5, s - 1, 1);
  c.fillRect(ox + 1.5, oy + 1.5, 1, d - 1);
  // the speckle
  c.save();
  c.globalAlpha *= 0.08;
  c.fillStyle = WORLD.seam;
  for (let i = 0; i < 6; i++)
    c.fillRect(ox + 3 + rand() * (s - 6), oy + 3 + rand() * (d - 6), 1.5, 1.5);
  c.restore();
}

// Ambient occlusion on a floor tile at the foot of a wall: a soft shade falling away from the wall to
// the north (over a quarter tile) and the west (over 0.15 tile). Part of the floor tile, so the floor's
// mist cuts it like the floor. None in high contrast.
export function paintAo(
  c: CanvasRenderingContext2D,
  s: number,
  d: number,
  north: boolean,
  west: boolean,
  ox = 0,
  oy = 0,
): void {
  if (isHighContrast() || (!north && !west)) return;
  const clear = `${WORLD.wallShade}00`;
  c.save();
  c.globalAlpha *= 0.16;
  if (north) {
    const g = c.createLinearGradient(0, oy, 0, oy + d * 0.25);
    g.addColorStop(0, WORLD.wallShade);
    g.addColorStop(1, clear);
    c.fillStyle = g;
    c.fillRect(ox, oy, s + 0.5, d * 0.25);
  }
  if (west) {
    const g = c.createLinearGradient(ox, 0, ox + s * 0.15, 0);
    g.addColorStop(0, WORLD.wallShade);
    g.addColorStop(1, clear);
    c.fillStyle = g;
    c.fillRect(ox, oy, s * 0.15, d + 0.5);
  }
  c.restore();
}

// A wall's top face: lit from the north-west, with a bright lip along the south edge.
export function paintWallTop(
  c: CanvasRenderingContext2D,
  s: number,
  d: number,
  ox = 0,
  oy = 0,
): void {
  c.fillStyle = WORLD.wallTop;
  c.fillRect(ox, oy, s + 0.5, d + 0.5);
  if (isHighContrast()) return;
  const g = c.createLinearGradient(ox, oy, ox + s, oy + d); // 135°: top-left to bottom-right
  g.addColorStop(0, mix(WORLD.wallTop, WHITE, 0.12));
  g.addColorStop(1, WORLD.wallTop);
  c.fillStyle = g;
  c.fillRect(ox, oy, s + 0.5, d + 0.5);
  c.fillStyle = mix(WORLD.wallTop, WHITE, 0.3);
  c.fillRect(ox, oy + d - 1.5, s + 0.5, 1.5);
}

// A wall's south face, h tall: darker toward the foot, a bevel along its top edge, and the contact
// shade along the foot when the floor in front of it is open.
export function paintWallFront(
  c: CanvasRenderingContext2D,
  s: number,
  h: number,
  southOpen: boolean,
  ox = 0,
  oy = 0,
): void {
  c.fillStyle = WORLD.wallFront;
  c.fillRect(ox, oy, s + 0.5, h + 0.5);
  if (!isHighContrast()) {
    const g = c.createLinearGradient(0, oy, 0, oy + h);
    g.addColorStop(0, WORLD.wallFront);
    g.addColorStop(1, mix(WORLD.wallFront, WORLD.wallShade, 0.5));
    c.fillStyle = g;
    c.fillRect(ox, oy, s + 0.5, h + 0.5);
    c.fillStyle = mix(WORLD.wallFront, WHITE, 0.25);
    c.fillRect(ox, oy, s + 0.5, 1);
  }
  if (southOpen) {
    c.fillStyle = WORLD.wallShade;
    c.fillRect(ox, oy + h - 3, s + 0.5, 3);
  }
}

// ---- Objects (phase 4) -------------------------------------------------------------------------
// Each painter draws one object at its top face's corner (ox, oy), w wide, d deep on the floor's plane
// and h tall on its front, all in CSS px. Each lays today's flat fills first; in high contrast that is
// all there is (FR9). Information (an outline, the seam, the slat count, a brace) is kept as it was.

// A door: two inset panels on each leaf, a sheen on its top and the seam down the middle.
export function paintDoor(
  c: CanvasRenderingContext2D,
  w: number,
  d: number,
  h: number,
  ox = 0,
  oy = 0,
): void {
  c.fillStyle = WORLD.door;
  c.fillRect(ox, oy, w + 0.5, d + 0.5);
  c.fillStyle = WORLD.doorFront;
  c.fillRect(ox, oy + d, w + 0.5, h + 0.5);
  if (!isHighContrast()) {
    const g = c.createLinearGradient(ox, oy, ox + w, oy + d); // 135°
    g.addColorStop(0, mix(WORLD.door, WHITE, 0.25));
    g.addColorStop(1, WORLD.door);
    c.fillStyle = g;
    c.fillRect(ox, oy, w + 0.5, d + 0.5);
    const leaf = w / 2;
    const pw = leaf - 6;
    const ph = (h - 8) / 2;
    for (let side = 0; side < 2; side++) {
      for (let row = 0; row < 2; row++) {
        const px = ox + side * leaf + 3;
        const py = oy + d + 3 + row * (ph + 2);
        c.fillStyle = mix(WORLD.doorFront, BLACK, 0.12);
        c.fillRect(px, py, pw, ph);
        c.fillStyle = mix(WORLD.door, WHITE, 0.3); // the bevel: a lit lip on the north-west
        c.fillRect(px, py, pw, 1);
        c.fillRect(px, py, 1, ph);
      }
    }
  }
  c.fillStyle = WORLD.doorSeam;
  c.fillRect(ox + w / 2 - 1, oy + d, 2, h);
}

// A crate's drop shadow on the floor under it: an ellipse of the outline colour at 18 %, 0.08 tile
// south-east. None in high contrast.
export function paintCrateShadow(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  tile: number,
): void {
  if (isHighContrast()) return;
  c.save();
  c.globalAlpha *= 0.18;
  c.fillStyle = WORLD.line;
  c.beginPath();
  c.ellipse(cx + tile * 0.08, cy + tile * 0.08, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

// A crate: a top lit from the north-west, a front with three grain lines and its X brace.
export function paintCrate(
  c: CanvasRenderingContext2D,
  w: number,
  d: number,
  h: number,
  ox = 0,
  oy = 0,
): void {
  c.fillStyle = WORLD.crate;
  c.fillRect(ox, oy, w + 0.5, d + 0.5);
  c.fillStyle = WORLD.crateFront;
  c.fillRect(ox, oy + d, w + 0.5, h + 0.5);
  if (!isHighContrast()) {
    const g = c.createLinearGradient(ox, oy, ox + w, oy + d);
    g.addColorStop(0, mix(WORLD.crate, WHITE, 0.3));
    g.addColorStop(1, WORLD.crate);
    c.fillStyle = g;
    c.fillRect(ox, oy, w + 0.5, d + 0.5);
    c.fillStyle = mix(WORLD.crateFront, WORLD.crateBrace, 0.4);
    for (let i = 1; i <= 3; i++) c.fillRect(ox + 2, oy + d + (h * i) / 4 - 0.5, w - 4, 1);
  }
  c.strokeStyle = WORLD.crateBrace;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(ox, oy + d);
  c.lineTo(ox + w, oy + d + h);
  c.moveTo(ox + w, oy + d);
  c.lineTo(ox, oy + d + h);
  c.stroke();
}

// Glass: a translucent top and a front graded from 0.55 to 0.8 alpha downwards, a sheen band at 20°,
// a bright top edge, two glints, and the outline that marks it solid.
export function paintGlass(
  c: CanvasRenderingContext2D,
  s: number,
  d: number,
  h: number,
  ox = 0,
  oy = 0,
): void {
  const hc = isHighContrast();
  c.save();
  c.globalAlpha = 0.55;
  c.fillStyle = WORLD.glass;
  c.fillRect(ox, oy, s + 0.5, d + 0.5);
  const fy = oy + d;
  c.globalAlpha = hc ? 0.7 : 0.55;
  c.fillStyle = WORLD.glassFront;
  c.fillRect(ox, fy, s + 0.5, h + 0.5);
  if (!hc) {
    // the grade: the same colour again, thicker towards the foot (0.55 → about 0.8)
    const g = c.createLinearGradient(0, fy, 0, fy + h);
    g.addColorStop(0, `${WORLD.glassFront}00`);
    g.addColorStop(1, WORLD.glassFront);
    c.globalAlpha = 0.45;
    c.fillStyle = g;
    c.fillRect(ox, fy, s + 0.5, h + 0.5);
    // the sheen band: 0.12 tile wide, leaning 20° from the vertical
    const lean = Math.tan((20 * Math.PI) / 180) * h;
    const bx = ox + s * 0.62;
    c.globalAlpha = 0.18;
    c.fillStyle = WHITE;
    c.beginPath();
    c.moveTo(bx + lean, fy);
    c.lineTo(bx + lean + s * 0.12, fy);
    c.lineTo(bx + s * 0.12, fy + h);
    c.lineTo(bx, fy + h);
    c.closePath();
    c.fill();
    c.globalAlpha = 1;
    c.fillStyle = mix(WORLD.glass, WHITE, 0.6);
    c.fillRect(ox, fy, s + 0.5, 1);
  }
  c.globalAlpha = 0.85;
  c.strokeStyle = COLOR.ui;
  c.lineWidth = 2;
  c.beginPath();
  for (const [dx, len] of [
    [0.28, 0.5],
    [0.5, 0.25],
  ] as const) {
    c.moveTo(ox + s * dx + s * 0.18, fy + s * 0.15);
    c.lineTo(ox + s * dx, fy + s * 0.15 + s * len);
  }
  c.stroke();
  // the outline marks it interactive-looking-but-solid: you cannot walk through
  c.globalAlpha = 1;
  c.strokeStyle = WORLD.line;
  c.strokeRect(ox + 1, fy, s - 2, h);
  c.restore();
}

// A vent: brushed steel with fine horizontal lines, and exactly four slats, each with a lit lip above.
export function paintVent(
  c: CanvasRenderingContext2D,
  s: number,
  d: number,
  h: number,
  ox = 0,
  oy = 0,
): void {
  c.fillStyle = WORLD.vent;
  c.fillRect(ox, oy, s + 0.5, d + 0.5);
  const fy = oy + d;
  c.fillStyle = WORLD.ventFront;
  c.fillRect(ox, fy, s + 0.5, h + 0.5);
  const hc = isHighContrast();
  if (!hc) {
    c.save();
    c.globalAlpha = 0.04;
    for (let y = 0, i = 0; y < h; y += 2, i++) {
      c.fillStyle = i % 2 ? BLACK : WHITE;
      c.fillRect(ox, fy + y, s + 0.5, 1);
    }
    c.restore();
  }
  for (let i = 1; i <= 4; i++) {
    const y = fy + (h * i) / 5 - 1;
    c.fillStyle = WORLD.ventSlat;
    c.fillRect(ox + s * 0.15, y, s * 0.7, 2);
    if (!hc) {
      c.fillStyle = mix(WORLD.ventFront, WHITE, 0.4);
      c.fillRect(ox + s * 0.15, y - 1, s * 0.7, 1);
    }
  }
}

// ---- Station bodies ---------------------------------------------------------------------------
// Brushed steel (and brass) like the keepsakes: a lit edge, a dark band, a second light. `vertical` runs
// the bands across the rect's width, else down its height. A flat fill in high contrast (FR9). Only
// bodies and rails use it: a swatch, lamp, key, number or outline is never drawn with it.
export function paintSteel(
  c: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  banded: boolean,
  base: string = WORLD.steel,
  vertical = false,
): void {
  c.fillStyle = base;
  c.fillRect(rect.x, rect.y, rect.w, rect.h);
  if (!banded || isHighContrast()) return;
  const g = vertical
    ? c.createLinearGradient(rect.x, 0, rect.x + rect.w, 0)
    : c.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  g.addColorStop(0, mix(base, WHITE, 0.28));
  g.addColorStop(0.35, base);
  g.addColorStop(0.6, mix(base, BLACK, 0.16));
  g.addColorStop(0.85, mix(base, WHITE, 0.12));
  g.addColorStop(1, mix(base, BLACK, 0.1));
  c.fillStyle = g;
  c.fillRect(rect.x, rect.y, rect.w, rect.h);
}

// A fill for a path (a disc): the same bands, or the flat colour in high contrast.
export function steelStyle(
  c: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  base: string = WORLD.steel,
): string | CanvasGradient {
  if (isHighContrast()) return base;
  const g = c.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  g.addColorStop(0, mix(base, WHITE, 0.28));
  g.addColorStop(0.45, base);
  g.addColorStop(0.7, mix(base, BLACK, 0.16));
  g.addColorStop(1, mix(base, WHITE, 0.1));
  return g;
}

// ---- Figures ----------------------------------------------------------------------------------
// A figure's body: a soft vertical gradient over the flat role colour already filled into the current
// path (a lighter crown, the role colour, a darker foot). Nothing in high contrast, where the flat
// colour is all there is.
export function paintFigureBody(
  c: CanvasRenderingContext2D,
  top: number,
  h: number,
  color: string,
): void {
  if (isHighContrast()) return;
  const g = c.createLinearGradient(0, top, 0, top + h);
  g.addColorStop(0, mix(color, WHITE, 0.18));
  g.addColorStop(0.5, color);
  g.addColorStop(1, mix(color, BLACK, 0.12));
  c.fillStyle = g;
  c.fill();
}

// A sheen arc on the hat's upper-left, drawn after the hat's own outline. None in high contrast.
export function paintHatSheen(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
): void {
  if (isHighContrast()) return;
  c.save();
  c.globalAlpha *= 0.4;
  c.strokeStyle = WHITE;
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(cx, cy, r * 0.55, Math.PI * 1.05, Math.PI * 1.55);
  c.stroke();
  c.restore();
}

// The figure's floor shadow: radial, the outline colour at 22 % fading to nothing (a flat 25 % ellipse
// in high contrast, as before).
export function paintFigureShadow(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  depth: number,
): void {
  c.save();
  if (isHighContrast()) {
    c.globalAlpha = 0.25;
    c.fillStyle = WORLD.line;
  } else {
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, WORLD.line);
    g.addColorStop(1, `${WORLD.line}00`);
    c.globalAlpha = 0.22;
    c.fillStyle = g;
  }
  floorRing(c, cx, cy, r, depth); // the ellipse the ground shadow always was
  c.fill();
  c.restore();
}
