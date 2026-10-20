import type { Vec } from "../../game/types.ts";
import { MIST, WORLD } from "../tokens.ts";
import { type Camera, LIVE, toScreen } from "./project.ts";

// The tiles in your line of sight, from the view's `seen` ("y:x0-x1,x2-x3", inclusive runs). The
// client may not import src/game/sim/, so this repeats decodeSeen there; render.test.ts holds it
// to the same format.
export interface Seen {
  has(x: number, y: number): boolean;
}

export function decodeSeen(rows: readonly string[]): Seen {
  const tiles = new Set<number>();
  const key = (x: number, y: number) => y * 4096 + x;
  for (const row of rows) {
    const [y, runs = ""] = row.split(":");
    for (const run of runs.split(",")) {
      const [x0, x1] = run.split("-").map(Number) as [number, number];
      for (let x = x0; x <= x1; x++) tiles.add(key(x, Number(y)));
    }
  }
  return { has: (x, y) => tiles.has(key(x, y)) };
}

const decoded = new WeakMap<readonly string[], Seen>();
export function seenOf(rows: readonly string[]): Seen {
  const known = decoded.get(rows);
  if (known) return known;
  const seen = decodeSeen(rows);
  decoded.set(rows, seen);
  return seen;
}

// Whether a point (in tiles) is in a tile you can see.
export const inSight = (seen: Seen | null, at: Vec): boolean =>
  seen === null || seen.has(Math.floor(at.x), Math.floor(at.y));

const STIPPLE_PX = 4;

// The veil over a tile you can't see: its floor, and for a block its whole height. Drawn after
// the tile and what stands on it, so the layout stays readable through it but nothing about the
// room's state does (the server never sent that).
export function veilTile(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x: number,
  y: number,
  height: number,
) {
  const s = cam.scale;
  const top = toScreen(cam, x, y, height);
  const h = s * LIVE.depth + height * s;
  ctx.save();
  ctx.globalAlpha = MIST.alpha;
  ctx.fillStyle = WORLD.mist;
  ctx.fillRect(top.x, top.y, s + 0.5, h + 0.5);
  // a static stipple, so the haze is texture and not only a tint
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#ffffff";
  for (let dy = 0; dy < h; dy += STIPPLE_PX * 2)
    for (let dx = ((dy / STIPPLE_PX) % 2) * STIPPLE_PX; dx < s; dx += STIPPLE_PX * 2)
      ctx.fillRect(top.x + dx, top.y + dy, 1.5, 1.5);
  ctx.restore();
}

// A dark zone: night, with a rim along any edge that borders the light.
export function nightTile(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  tiles: string[],
  x: number,
  y: number,
) {
  const p = toScreen(cam, x, y);
  const s = cam.scale;
  const d = s * LIVE.depth;
  ctx.fillStyle = WORLD.night;
  ctx.fillRect(p.x, p.y, s + 0.5, d + 0.5);
  ctx.fillStyle = WORLD.nightRim;
  const lit = (tx: number, ty: number) => {
    const ch = tiles[ty]?.[tx];
    return ch !== undefined && ch !== " ";
  };
  if (lit(x, y - 1)) ctx.fillRect(p.x, p.y, s + 0.5, 2);
  if (lit(x, y + 1)) ctx.fillRect(p.x, p.y + d - 2, s + 0.5, 2);
  if (lit(x - 1, y)) ctx.fillRect(p.x, p.y, 2, d + 0.5);
  if (lit(x + 1, y)) ctx.fillRect(p.x + s - 2, p.y, 2, d + 0.5);
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

// How a tile stands to the light: wholly in it, wholly out of it, or crossed by its edge.
// Sampled on a small grid inside the tile, which is as fine as the picture can show.
const SAMPLES = 4;
type Lit = "lit" | "dark" | "edge";

function inPolygon(poly: readonly Vec[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Vec;
    const b = poly[j] as Vec;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function litState(poly: readonly Vec[], tx: number, ty: number): Lit {
  let lit = 0;
  for (let j = 0; j < SAMPLES; j++)
    for (let i = 0; i < SAMPLES; i++)
      if (inPolygon(poly, tx + (i + 0.5) / SAMPLES, ty + (j + 0.5) / SAMPLES)) lit++;
  return lit === 0 ? "dark" : lit === SAMPLES * SAMPLES ? "lit" : "edge";
}

// The wall tiles the light touches. A wall is seen where a ray ends on its face, so it is lit when
// the polygon has a vertex on its boundary: area would say a wall is dark, since the light stops at
// its face and never fills it. A vertex on a corner touches up to four tiles.
const TOUCH = 1e-3;
function touchedTiles(light: readonly Vec[]): Set<number> {
  const out = new Set<number>();
  for (const p of light) {
    for (let ty = Math.floor(p.y - TOUCH); ty <= Math.floor(p.y + TOUCH); ty++)
      for (let tx = Math.floor(p.x - TOUCH); tx <= Math.floor(p.x + TOUCH); tx++)
        out.add(ty * 4096 + tx);
  }
  return out;
}

// The mist, cut exactly to your line of sight. Tiles the server did not send are under mist as a
// whole, whatever the ray says: the picture never shows more than it was sent. Tiles it did send
// are clear where the light reaches and veiled where it does not, and the tiles the edge of the
// light crosses are veiled with the lit part of them punched out (an even-odd clip), so the edge
// runs through the tile along the ray and not along its sides.
export function drawMist(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  tiles: readonly string[],
  seen: Seen,
  light: readonly Vec[] | null,
  win: { x0: number; x1: number; y0: number; y1: number },
) {
  const touched = light ? touchedTiles(light) : null;
  for (let y = win.y0; y <= win.y1; y++) {
    const row = tiles[y] ?? "";
    for (let x = win.x0; x <= win.x1; x++) {
      if (row[x] === " ") continue; // a dark zone is night, not mist
      const height = row[x] === "#" || row[x] === "%" || row[x] === "=" ? LIVE.wall : 0;
      if (!seen.has(x, y)) {
        veilTile(ctx, cam, x, y, height);
        continue;
      }
      if (!light) continue;
      if (height > 0) {
        // a wall, a vent or glass: seen where the light meets its face, and veiled whole otherwise
        if (!touched?.has(y * 4096 + x)) veilTile(ctx, cam, x, y, height);
        continue;
      }
      const state = litState(light, x, y);
      if (state === "lit") continue;
      if (state === "dark") {
        veilTile(ctx, cam, x, y, height);
        continue;
      }
      ctx.save();
      const top = toScreen(cam, x, y, height);
      const w = cam.scale + 0.5;
      const h = cam.scale * LIVE.depth + height * cam.scale + 0.5;
      // the tile's rectangle, then the lit polygon, filled even-odd: what is left is the veil
      ctx.beginPath();
      ctx.rect(top.x, top.y, w, h);
      for (const [i, p] of light.entries()) {
        const at = toScreen(cam, p.x, p.y);
        if (i === 0) ctx.moveTo(at.x, at.y);
        else ctx.lineTo(at.x, at.y);
      }
      ctx.closePath();
      ctx.clip("evenodd");
      veilTile(ctx, cam, x, y, height);
      ctx.restore();
    }
  }
}
