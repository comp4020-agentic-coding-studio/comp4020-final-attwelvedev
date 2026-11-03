import { inLight, lightPolygon, tileTouched } from "../../game/light.ts";
import type { Vec } from "../../game/types.ts";
import type { EntityView } from "../../net/protocol.ts";
import { MIST, WORLD } from "../tokens.ts";
import { type Camera, LIVE, toScreen } from "./project.ts";

export { inLight, lightPolygon, tileTouched };

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

// A station is sent whole when any one of its parts is in your light (so its furniture can be drawn
// from where you can see it), but a part behind a wall is not in your light: it is cut here, so wires,
// a music box or a back box that stand in the dark are not drawn at all, and a station none of whose
// parts you can see is dropped. A watcher has no `seen`, and every part stays.
export function cutToSight(entities: EntityView[], seen: Seen | null): EntityView[] {
  if (seen === null) return entities;
  const out: EntityView[] = [];
  for (const e of entities) {
    const st = e.station;
    if (e.kind !== "station" || !st) {
      out.push(e);
      continue;
    }
    const parts = st.parts
      .map((p) => ({ ...p, at: p.at.filter((t) => seen.has(t.x, t.y)) }))
      .filter((p) => p.at.length > 0);
    if (parts.length > 0) out.push({ ...e, station: { ...st, parts } });
  }
  return out;
}

// What stands is drawn only where the light touches its footprint (its own tile). The server sends a
// thing when its tile is touched by a ray, but a tile the cone grazes at a corner is sent too, and the
// swept clip that keeps a figure's head and a crate's top from being cut also reaches up over the unlit
// tile behind a wall, which is how a camera on veiled floor was drawn at full strength. A thing in a
// tile the light does not touch is dropped; one in a touched tile is drawn whole, and the clip then cuts
// it at the cone's edge. Never dropped: your own figure, a mark (a teammate's message, shown faintly
// through the haze by design), a cone of sight, and the floor's own layout (plates, doors, exits...),
// which the veil is meant to leave readable. A watcher has no light and keeps everything.
export function litEntities(
  entities: EntityView[],
  light: readonly Vec[] | null,
  mySeat: number,
): EntityView[] {
  if (light === null) return entities;
  const touched = (e: EntityView) => tileTouched(light, Math.floor(e.pos.x), Math.floor(e.pos.y));
  return entities.filter((e) => {
    if (e.kind === "player") return e.seat === mySeat || touched(e);
    return !STANDS.has(e.kind) || touched(e);
  });
}

// The things that stand on the floor and read as "something is there": gone when out of the light.
const STANDS = new Set<EntityView["kind"]>([
  "crate",
  "loot",
  "gear",
  "bell",
  "lamp",
  "lever",
  "keepsake",
  "card",
  "guard",
  "camera",
]);

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

// The wall tiles the light touches. A wall is seen where a ray ends on its face, so it is lit when
// the polygon has a vertex on its boundary: area would say a wall is dark, since the light stops at
// its face and never fills it. A vertex on a corner touches up to four tiles.
// Whether a point is inside the light polygon (even-odd ray crossing).
function insideLight(light: readonly Vec[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = light.length - 1; i < light.length; j = i++) {
    const a = light[i] as Vec;
    const b = light[j] as Vec;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// Glass passes sight, so the light runs through a pane and no ray stops on its face: a pane is lit
// when the light covers it, not when a vertex happens to land on it (those come and go from one
// step to the next at a shallow angle, and the pane flickered). It is lit when any of a grid of
// points across its footprint is inside the polygon.
const GLASS_SAMPLES = [0.1, 0.5, 0.9];
function glassLit(light: readonly Vec[], tx: number, ty: number): boolean {
  for (const fx of GLASS_SAMPLES)
    for (const fy of GLASS_SAMPLES) if (insideLight(light, tx + fx, ty + fy)) return true;
  return false;
}

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

// The mist, cut exactly to your line of sight, drawn as ONE region filled ONCE. Per-tile rectangles
// stepped along the edge of the light and doubled the veil's alpha where two overlapped by the half
// pixel kept to hide seams, which at night showed as a pale outline round a tile.
//
// The light is the ray, cast from where you stand over the room's layout. The layout is sent whole to
// every sighted client, so drawing floor and walls from the ray reveals nothing: it is not the server's
// `seen` set, which is symmetric shadowcasting and leaves out whole tiles the exact ray lights (it is
// what decides which ENTITIES you are told of, and the server filters those before they are sent). With
// no position to cast from, nothing is veiled (a watcher sees the whole room clear).
//
// Two passes, each one path filled once, so no point is painted twice:
//   1. the open floor, with the light punched out of it: the floor tiles are the clip, and the veil is
//      drawn over everything in it except the light polygon (even-odd). Cutting the light out by
//      clipping means it cannot veil a point no floor tile covers.
//   2. the walls the light never reaches, each a box, whole. A wall is seen where a ray lands on its
//      face, so a wall is lit when the polygon has a vertex on its edge (area would call it dark).
// A dark zone is night and is left alone. Paths are traced on the context itself (no Path2D): the
// unit tests record calls on a plain-Node context that has none.
type Box = { x: number; y: number; w: number; h: number };

export function drawMist(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  tiles: readonly string[],
  light: readonly Vec[] | null,
  win: { x0: number; x1: number; y0: number; y1: number },
) {
  if (!light) return;
  const touched = touchedTiles(light);
  const s = cam.scale;
  const depth = s * LIVE.depth;
  const open: Box[] = []; // floor: the light is cut out of it
  const walls: Box[] = []; // walls the light never reaches: veiled whole
  for (let y = win.y0; y <= win.y1; y++) {
    const row = tiles[y] ?? "";
    for (let x = win.x0; x <= win.x1; x++) {
      if (row[x] === " ") continue; // a dark zone is night, not mist
      const block = row[x] === "#" || row[x] === "%" || row[x] === "=" || row[x] === "H";
      const lift = block ? LIVE.wall : 0;
      const top = toScreen(cam, x, y, lift);
      const box = { x: top.x, y: top.y, w: s, h: depth + lift * s };
      if (!block) open.push(box);
      else if (row[x] === "=" ? !glassLit(light, x, y) : !touched.has(y * 4096 + x))
        walls.push(box);
    }
  }
  ctx.save();
  if (open.length > 0) {
    ctx.save();
    ctx.beginPath();
    for (const b of open) ctx.rect(b.x, b.y, b.w, b.h);
    ctx.clip();
    // everything in the clip, except the light (even-odd): one region, one fill
    ctx.beginPath();
    ctx.rect(0, 0, ctx.canvas?.width ?? 8192, ctx.canvas?.height ?? 8192);
    for (const [i, p] of light.entries()) {
      const at = toScreen(cam, p.x, p.y);
      if (i === 0) ctx.moveTo(at.x, at.y);
      else ctx.lineTo(at.x, at.y);
    }
    ctx.closePath();
    paintVeil(ctx, "evenodd");
    ctx.restore();
  }
  if (walls.length > 0) {
    ctx.beginPath();
    for (const b of walls) ctx.rect(b.x, b.y, b.w, b.h);
    paintVeil(ctx, "nonzero");
  }
  ctx.restore();
}

// The stipple's tile: dots 1.5 px across on a checkerboard, 8 px across and 16 down (two rows of
// dots, the second shifted half a step). Built once per device pixel ratio and tiled as a pattern,
// so the GPU (or the software rasteriser, on a machine without one) fills a region in one call
// instead of running a fillRect per dot over the whole canvas every frame. Null where there is
// no DOM to draw the tile on (the unit tests' recording context).
let stipple: { dpr: number; pattern: CanvasPattern } | null = null;
function stipplePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (typeof document === "undefined" || typeof ctx.createPattern !== "function") return null;
  const dpr = window.devicePixelRatio || 1;
  if (stipple?.dpr === dpr) return stipple.pattern;
  const tile = document.createElement("canvas");
  tile.width = Math.round(STIPPLE_PX * 2 * dpr);
  tile.height = Math.round(STIPPLE_PX * 4 * dpr);
  const t = tile.getContext("2d");
  if (!t) return null;
  t.scale(dpr, dpr);
  t.fillStyle = "#ffffff";
  t.fillRect(0, 0, 1.5, 1.5);
  t.fillRect(STIPPLE_PX, STIPPLE_PX * 2, 1.5, 1.5);
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return null;
  pattern.setTransform(new DOMMatrix().scale(1 / dpr, 1 / dpr)); // the tile is in device pixels
  stipple = { dpr, pattern };
  return pattern;
}

// Fills the current path once, then a static stipple through the same region, so the haze is
// texture and not only a tint. Called once per region, so no point is painted twice.
function paintVeil(ctx: CanvasRenderingContext2D, rule: CanvasFillRule) {
  ctx.save();
  ctx.globalAlpha = MIST.alpha;
  ctx.fillStyle = WORLD.mist;
  ctx.fill(rule);
  const dots = stipplePattern(ctx);
  if (dots) {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = dots;
    ctx.fill(rule); // the same path: only the region is stippled, no clip needed
  }
  ctx.restore();
}
