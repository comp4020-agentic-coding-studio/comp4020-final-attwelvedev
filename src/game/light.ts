import type { Vec } from "./types.ts";

// The exact light a sighted viewer stands in, shared by the server (which stations to send) and the
// client (what to draw), so the two cannot disagree and nothing pops as you move a hair.

// Whether a point (in tiles) is inside the light polygon (even-odd): the exact region you can see,
// whose edge is the true ray past a wall's corner, not a tile's edge.
export function inLight(light: readonly Vec[], at: Vec): boolean {
  let inside = false;
  for (let i = 0, j = light.length - 1; i < light.length; j = i++) {
    const a = light[i] as Vec;
    const b = light[j] as Vec;
    if (a.y > at.y !== b.y > at.y && at.x < ((b.x - a.x) * (at.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

// Whether any part of a tile is in the light: a corner or the centre inside the polygon, or a vertex of
// the polygon inside the tile (a thin wedge can cross a tile and touch neither a corner nor the centre).
export function tileTouched(light: readonly Vec[], tx: number, ty: number): boolean {
  const pts = [
    { x: tx + 0.5, y: ty + 0.5 },
    { x: tx + 0.05, y: ty + 0.05 },
    { x: tx + 0.95, y: ty + 0.05 },
    { x: tx + 0.05, y: ty + 0.95 },
    { x: tx + 0.95, y: ty + 0.95 },
  ];
  if (pts.some((p) => inLight(light, p))) return true;
  return light.some((v) => v.x >= tx && v.x <= tx + 1 && v.y >= ty && v.y <= ty + 1);
}

// What stops your sight, as the server counts it (src/game/sim/sight.ts): walls, vents and closed
// doors. Glass passes sight. The tile you stand on never blocks you, even in a doorway.
function stopsSight(
  tiles: readonly string[],
  closed: (tx: number, ty: number) => boolean,
  home: Vec,
  tx: number,
  ty: number,
): boolean {
  if (tx === home.x && ty === home.y) return false;
  const ch = tiles[ty]?.[tx];
  if (ch === undefined || ch === "#" || ch === "%") return true; // off the map is a wall
  return ch === "D" && closed(tx, ty);
}

// Where a ray from (ox, oy) along the unit vector (dx, dy) meets the face of the first tile that
// stops it: a grid walk, tile to tile, so the answer is the face itself and not a step short.
function rayLength(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  hit: (tx: number, ty: number) => boolean,
  home: Vec,
): number {
  let x = home.x;
  let y = home.y;
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const deltaX = dx === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dx);
  const deltaY = dy === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dy);
  let nextX = dx === 0 ? Number.POSITIVE_INFINITY : ((dx > 0 ? x + 1 : x) - ox) / dx;
  let nextY = dy === 0 ? Number.POSITIVE_INFINITY : ((dy > 0 ? y + 1 : y) - oy) / dy;
  for (;;) {
    let t: number;
    if (nextX < nextY) {
      t = nextX;
      x += stepX;
      nextX += deltaX;
    } else {
      t = nextY;
      y += stepY;
      nextY += deltaY;
    }
    if (hit(x, y)) return t;
  }
}

const PEEK = 1e-4; // radians: a ray this far to either side of a corner sees what lies past it

// Whether the exact light from `origin` touches any part of tile (tx, ty), decided without building the
// polygon (which costs ~0.3 ms, and a view asks about a few tiles). A grid of sample points across the
// tile, each reached by one ray stopped by what stops sight: a point is lit when the ray gets to it, or,
// for a wall tile, when the ray ends on that tile's own face. The points include the tile's corners and
// a hair inside its edges, because the light's edge runs through wall corners. spec/light-sweep.test.ts
// holds this to `lightPolygon` over every real room, so a gap in the sampling shows up there.
const SAMPLES = [0, 0.02, 0.05, 0.2, 0.4, 0.5, 0.6, 0.8, 0.95, 0.98, 1];
export function lightTouches(
  origin: Vec,
  tiles: readonly string[],
  closedDoor: (tx: number, ty: number) => boolean,
  tx: number,
  ty: number,
): boolean {
  const home = { x: Math.floor(origin.x), y: Math.floor(origin.y) };
  if (home.x === tx && home.y === ty) return true;
  const stops = (x: number, y: number) => stopsSight(tiles, closedDoor, home, x, y);
  for (const fx of SAMPLES) {
    for (const fy of SAMPLES) {
      const px = tx + fx - origin.x;
      const py = ty + fy - origin.y;
      const dist = Math.hypot(px, py);
      const dx = px / dist;
      const dy = py / dist;
      const t = rayLength(origin.x, origin.y, dx, dy, stops, home);
      if (t >= dist - 1e-9) return true;
      if (
        Math.floor(origin.x + dx * (t + 1e-6)) === tx &&
        Math.floor(origin.y + dy * (t + 1e-6)) === ty
      )
        return true;
    }
  }
  return false;
}

// Everything you can see from `origin`, as one polygon: the edge of the light runs exactly through
// the corners of walls, as a camera's cone does, not along tile edges. A ray goes to every corner
// of every wall that borders open ground, plus one a hair either side of it (that pair is what
// puts the edge of a shadow on the corner), and the polygon joins where they land, in order.
// Built in tiles; the caller projects it. Drawn, it is the lit part of the floor: the server's own
// tile set (view.seen) still decides what you are told, and the picture is cut to it.
export function lightPolygon(
  origin: Vec,
  tiles: readonly string[],
  closedDoor: (tx: number, ty: number) => boolean = () => false,
): Vec[] {
  const home = { x: Math.floor(origin.x), y: Math.floor(origin.y) };
  const rows = tiles.length;
  const cols = tiles[0]?.length ?? 0;
  const stops = (tx: number, ty: number) => stopsSight(tiles, closedDoor, home, tx, ty);
  const corners = new Set<number>();
  const stride = cols + 1;
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      if (!stops(tx, ty)) continue;
      let border = false;
      for (let dy = -1; dy <= 1 && !border; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = tx + dx;
          const ny = ty + dy;
          if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !stops(nx, ny)) {
            border = true;
            break;
          }
        }
      if (!border) continue;
      for (const [cx, cy] of [
        [tx, ty],
        [tx + 1, ty],
        [tx, ty + 1],
        [tx + 1, ty + 1],
      ] as const)
        corners.add(cy * stride + cx);
    }
  }
  // the map's own corners always bound the light, so a room with no wall in it is lit whole
  for (const [cx, cy] of [
    [0, 0],
    [cols, 0],
    [0, rows],
    [cols, rows],
  ] as const)
    corners.add(cy * stride + cx);
  const rays: { angle: number; x: number; y: number }[] = [];
  for (const key of corners) {
    const cx = key % stride;
    const cy = Math.floor(key / stride);
    const aim = Math.atan2(cy - origin.y, cx - origin.x);
    for (const off of [-PEEK, 0, PEEK]) {
      let angle = aim + off;
      if (angle > Math.PI) angle -= 2 * Math.PI;
      if (angle <= -Math.PI) angle += 2 * Math.PI;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const t = rayLength(origin.x, origin.y, dx, dy, stops, home);
      rays.push({ angle, x: origin.x + dx * t, y: origin.y + dy * t });
    }
  }
  rays.sort((a, b) => a.angle - b.angle);
  return rays.map((r) => ({ x: r.x, y: r.y }));
}

// The light polygon cut to a box (Sutherland-Hodgman against each side).
export function cutToBox(
  light: readonly Vec[],
  b: { x0: number; x1: number; y0: number; y1: number },
): Vec[] {
  let poly = [...light];
  const sides: ((p: Vec) => number)[] = [
    (p) => p.x - b.x0,
    (p) => b.x1 - p.x,
    (p) => p.y - b.y0,
    (p) => b.y1 - p.y,
  ];
  for (const inside of sides) {
    const next: Vec[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i] as Vec;
      const c = poly[(i + 1) % poly.length] as Vec;
      const da = inside(a);
      const dc = inside(c);
      if (da >= 0) next.push(a);
      if (da >= 0 !== dc >= 0) {
        const t = da / (da - dc);
        next.push({ x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t });
      }
    }
    poly = next;
    if (poly.length === 0) break;
  }
  return poly;
}

// Whether the light covers some of a thing's footprint: the square `half` each way round `at` (a figure's
// shadow disc, a box's tile). A corner the edge only grazes (less than TOUCH_AREA of it lit) does not count.
// The server sends a standing thing by this rule and the client draws it by the same one, so the two agree
// (the user, playtest L1, L3, L5: a figure, the flag and the goggles vanished while part of each was lit).
const TOUCH_AREA = 1e-4; // square tiles
export function footLit(light: readonly Vec[], at: Vec, half: number): boolean {
  const lit = cutToBox(light, {
    x0: at.x - half,
    x1: at.x + half,
    y0: at.y - half,
    y1: at.y + half,
  });
  let area = 0;
  for (let i = 0; i < lit.length; i++) {
    const a = lit[i] as Vec;
    const b = lit[(i + 1) % lit.length] as Vec;
    area += (a.x * b.y - b.x * a.y) / 2;
  }
  return Math.abs(area) > TOUCH_AREA;
}

// The ground a standing thing covers, tiles each way from its centre: a figure's shadow disc (figures.ts draws
// it at 0.36), anything else half its tile.
export const footHalf = (kind: string): number => (kind === "player" ? 0.36 : 0.5);
