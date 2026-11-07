import { isHighContrast, mix, WORLD } from "../tokens.ts";

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
