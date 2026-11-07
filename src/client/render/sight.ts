import { footHalf, footLit, inLight, lightPolygon, tileTouched } from "../../game/light.ts";
import type { Vec } from "../../game/types.ts";
import type { EntityView } from "../../net/protocol.ts";
import { MIST, WORLD } from "../tokens.ts";
import { darkOfGlass, darkOfWall, touchedOf } from "./column.ts";
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

// What stands is drawn only where the light touches its footprint: the ground its drawing stands on (a
// figure's shadow disc, here its square; anything else its tile's half each way). The server sends a thing
// when the light touches its tile, and the swept clip that keeps a figure's head and a crate's top from
// being cut also reaches up over the unlit tile behind a wall, which is how a camera on veiled floor was
// drawn at full strength. A thing whose footprint the light misses entirely is dropped; one whose
// footprint it touches anywhere is kept, drawn whole, and the clip then cuts it at the cone's edge (the
// user, playtest L1, L3, L5: a figure at a corner, the flag and the goggles vanished while part of each
// was in the light). Never dropped: your own figure, a mark (a teammate's message, shown faintly through
// the haze by design), a cone of sight, and the floor's own layout (plates, doors, exits...), which the
// veil is meant to leave readable. A watcher has no light and keeps everything.
export function litEntities(
  entities: EntityView[],
  light: readonly Vec[] | null,
  mySeat: number,
): EntityView[] {
  if (light === null) return entities;
  const touched = (e: EntityView) => footLit(light, e.pos, footHalf(e.kind));
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

// The mist is painted in pieces, in the order what stands is drawn, so nothing lit is ever veiled and no
// hole has to be cut for it (a hole was a rectangle wider than the thing it was cut for): the floor
// first, once, before any wall or anything standing; then each row's walls the light never reaches,
// right after that row's blocks are drawn and before what stands in it. What stands in a row is drawn
// over the veil of the walls behind it, and under the walls in front of it, as in the world.
//   part "floor": the open floor, with the light punched out of it (one path, even-odd, one fill).
//   part n (a row): the walls of that row, and its closed doors, that the light does not touch.
export function drawMist(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  tiles: readonly string[],
  light: readonly Vec[] | null,
  win: { x0: number; x1: number; y0: number; y1: number },
  part: "floor" | number,
) {
  if (!light) return;
  const s = cam.scale;
  const depth = s * LIVE.depth;
  if (part === "floor") {
    const open: Box[] = []; // floor: the light is cut out of it
    for (let y = win.y0; y <= win.y1; y++) {
      const row = tiles[y] ?? "";
      for (let x = win.x0; x <= win.x1; x++) {
        const ch = row[x];
        if (ch === " " || ch === "#" || ch === "%" || ch === "=" || ch === "H") continue; // night, or a block
        const top = toScreen(cam, x, y);
        open.push({ x: top.x, y: top.y, w: s, h: depth });
      }
    }
    if (open.length === 0) return;
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
    return;
  }
  const walls: Box[] = []; // walls the light never reaches: veiled whole
  const touched = touchedOf(light);
  const cut: { x: number; y: number }[][] = []; // the dark side of the cone's edge on a wall it reaches
  const row = tiles[part] ?? "";
  for (let x = win.x0; x <= win.x1; x++) {
    const ch = row[x];
    if (ch !== "#" && ch !== "%" && ch !== "=" && ch !== "H") continue;
    const top = toScreen(cam, x, part, LIVE.wall);
    const box = { x: top.x, y: top.y, w: s, h: depth + LIVE.wall * s };
    if (ch === "=") {
      const rect = [
        { x: box.x, y: box.y },
        { x: box.x + box.w, y: box.y },
        { x: box.x + box.w, y: box.y + box.h },
        { x: box.x, y: box.y + box.h },
      ];
      const pane = darkOfGlass(cam, light, x, part, rect);
      if (pane === "dark") walls.push(box);
      else if (pane !== "lit") cut.push(...pane);
      continue;
    }
    const dark = darkOfWall(
      cam,
      light,
      tiles,
      x,
      part,
      [
        { x: box.x, y: box.y },
        { x: box.x + box.w, y: box.y },
        { x: box.x + box.w, y: box.y + box.h },
        { x: box.x, y: box.y + box.h },
      ],
      touched.has(part * 4096 + x),
    );
    if (dark === "dark") walls.push(box);
    else if (dark !== "lit") cut.push(...dark);
  }
  if (walls.length === 0 && cut.length === 0) return;
  ctx.save();
  ctx.beginPath();
  for (const b of walls) ctx.rect(b.x, b.y, b.w, b.h);
  for (const shape of cut) {
    for (const [i, q] of shape.entries()) {
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
  }
  paintVeil(ctx, "nonzero");
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
