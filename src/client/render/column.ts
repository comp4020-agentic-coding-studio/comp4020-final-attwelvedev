import { inLight } from "../../game/light.ts";
import type { Vec } from "../../game/types.ts";
import { type Camera, LIVE, toScreen } from "./project.ts";

// What stands, and the walls, are cut by the cone's own edges, carried straight on up the screen.
//
// A shadow edge of the light is a ray from the viewer past a corner, so on the floor it is a straight
// line, and on screen too (the projection is affine). The cut continues that line: a thing or a wall
// that the edge crosses is drawn on the lit side of the same line, so the cut lines up with the floor
// beside it. A thing the light fully covers is drawn whole, with no clip at all; a thing whose ground
// the light does not touch is not drawn.

export interface Foot {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type S = { x: number; y: number };

// The light polygon cut to a box (Sutherland-Hodgman against each side).
export function cutToBox(light: readonly Vec[], b: Foot): Vec[] {
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

// Where the light was cast from, so an edge's near end (the wall corner the shadow starts at) and its far end
// (where it lands) can be told apart. Set by whoever builds the polygon.
const origins = new WeakMap<readonly Vec[], Vec>();
export function rememberOrigin(light: readonly Vec[], origin: Vec): void {
  origins.set(light, origin);
}

// One shadow edge of the light, as it is on screen: a RAY from the wall corner the shadow starts at, away from
// the viewer, through where it lands and on past it. The cut does not stop at the wall it lands on: it goes
// on up the wall and over whatever stands in front of it, so the line stays a straight diagonal. A point of
// the screen is on the lit side when nx * x + ny * y >= c.
export interface ConeEdge {
  nx: number;
  ny: number;
  c: number;
  sx: number; // the ray's start on screen (the near end)
  sy: number;
  ux: number; // and its direction, a unit vector, away from the viewer
  uy: number;
  len: number; // the drawn segment's length; a ray with no known origin stops there
  ray: boolean;
  land: Vec; // where it lands on the floor (the far end)
  from: Vec; // and the wall corner it starts at (the near end)
}

const GRID = 1e-6;
const MIN_EDGE = 0.02; // tiles: the two rays either side of a concave corner leave a speck of an edge
const onGrid = (a: Vec, b: Vec) =>
  (Math.abs(a.x - b.x) < GRID && Math.abs(a.x - Math.round(a.x)) < GRID) ||
  (Math.abs(a.y - b.y) < GRID && Math.abs(a.y - Math.round(a.y)) < GRID);

type Seen = { scale: number; ox: number; oy: number; edges: ConeEdge[] };
const edgeCache = new WeakMap<readonly Vec[], Seen[]>();

// The light polygon is made of rays, so each of its edges either runs along a wall face (a tile line)
// or is the edge of a shadow, along a ray from the viewer. The shadow edges are the ones that cut. The
// lit side is the polygon's inside, found from its winding, so no probing is needed.
export function coneEdges(cam: Camera, light: readonly Vec[]): ConeEdge[] {
  const known = edgeCache
    .get(light)
    ?.find((k) => k.scale === cam.scale && k.ox === cam.ox && k.oy === cam.oy);
  if (known) return known.edges;
  const origin = origins.get(light);
  let twice = 0;
  for (const [i, p] of light.entries()) {
    const q = light[(i + 1) % light.length] as Vec;
    twice += p.x * q.y - q.x * p.y;
  }
  const inward = twice >= 0 ? 1 : -1; // inside is to the left of the edge when the polygon winds one way
  const out: ConeEdge[] = [];
  for (const [i, p0] of light.entries()) {
    const q0 = light[(i + 1) % light.length] as Vec;
    const len = Math.hypot(q0.x - p0.x, q0.y - p0.y);
    if (len < MIN_EDGE || onGrid(p0, q0)) continue;
    const mid = { x: (p0.x + q0.x) / 2, y: (p0.y + q0.y) / 2 };
    const lit = {
      x: mid.x - ((q0.y - p0.y) / len) * inward * 0.01,
      y: mid.y + ((q0.x - p0.x) / len) * inward * 0.01,
    };
    const near =
      origin &&
      Math.hypot(p0.x - origin.x, p0.y - origin.y) > Math.hypot(q0.x - origin.x, q0.y - origin.y)
        ? q0
        : p0;
    const far = near === p0 ? q0 : p0;
    const sn = toScreen(cam, near.x, near.y);
    const sf = toScreen(cam, far.x, far.y);
    const sl = toScreen(cam, lit.x, lit.y);
    const slen = Math.hypot(sf.x - sn.x, sf.y - sn.y) || 1;
    let nx = -(sf.y - sn.y);
    let ny = sf.x - sn.x;
    if (nx * (sl.x - sn.x) + ny * (sl.y - sn.y) < 0) {
      nx = -nx;
      ny = -ny;
    }
    out.push({
      nx,
      ny,
      c: nx * sn.x + ny * sn.y,
      sx: sn.x,
      sy: sn.y,
      ux: (sf.x - sn.x) / slen,
      uy: (sf.y - sn.y) / slen,
      len: slen,
      ray: origin !== undefined,
      land: far,
      from: near,
    });
  }
  const list = edgeCache.get(light) ?? [];
  list.push({ scale: cam.scale, ox: cam.ox, oy: cam.oy, edges: out });
  edgeCache.set(light, list.slice(-4));
  return out;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const boxOf = (pts: readonly S[]): Box => ({
  x0: Math.min(...pts.map((p) => p.x)),
  y0: Math.min(...pts.map((p) => p.y)),
  x1: Math.max(...pts.map((p) => p.x)),
  y1: Math.max(...pts.map((p) => p.y)),
});

// Whether an edge's ray passes through a box on screen (Liang-Barsky).
function hits(e: ConeEdge, b: Box): boolean {
  let t0 = 0;
  let t1 = e.ray ? Number.POSITIVE_INFINITY : e.len;
  const bounds: [number, number][] = [
    [-e.ux, e.sx - b.x0],
    [e.ux, b.x1 - e.sx],
    [-e.uy, e.sy - b.y0],
    [e.uy, b.y1 - e.sy],
  ];
  for (const [p, q] of bounds) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
  }
  return true;
}

// The edges whose ray passes through a box on screen, the few nearest its middle.
const MOST_EDGES = 3;
export function edgesNear(edges: readonly ConeEdge[], b: Box): ConeEdge[] {
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const off = (e: ConeEdge) =>
    Math.abs(e.nx * cx + e.ny * cy - e.c) / (Math.hypot(e.nx, e.ny) || 1);
  return edges
    .filter((e) => hits(e, b))
    .sort((p, q) => off(p) - off(q))
    .slice(0, MOST_EDGES);
}

// Whether an edge's segment on the floor passes through a box (Liang-Barsky), grown by `grow` tiles.
function crossesFloor(e: ConeEdge, f: Foot, grow = 0): boolean {
  const dx = e.land.x - e.from.x;
  const dy = e.land.y - e.from.y;
  let t0 = 0;
  let t1 = 1;
  const bounds: [number, number][] = [
    [-dx, e.from.x - (f.x0 - grow)],
    [dx, f.x1 + grow - e.from.x],
    [-dy, e.from.y - (f.y0 - grow)],
    [dy, f.y1 + grow - e.from.y],
  ];
  for (const [p, q] of bounds) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
  }
  return true;
}

// A polygon cut to one side of an edge's line (Sutherland-Hodgman). The pieces of one rectangle keep its
// winding, so under the non-zero rule they add up to their union.
function clipSide(poly: S[], e: ConeEdge, lit: boolean): S[] {
  const side = (p: S) => (lit ? 1 : -1) * (e.nx * p.x + e.ny * p.y - e.c);
  const out: S[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as S;
    const b = poly[(i + 1) % poly.length] as S;
    const da = side(a);
    const db = side(b);
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

const areaOf = (pts: readonly S[]) =>
  Math.abs(
    pts.reduce((sum, a, i) => {
      const b = pts[(i + 1) % pts.length] as S;
      return sum + (a.x * b.y - b.x * a.y);
    }, 0),
  ) / 2;

// The rectangle cut into the cells the edges' lines make of it, each cell sorted lit or dark. A cell is
// lit when any sample point on the floor that falls in it is in the light (the samples stand for the
// ground the rectangle's pixels belong to); a cell with no sample is lit when it is on the lit side of
// every edge, which is the wedge between them.
export function cells(
  cam: Camera,
  rect: S[],
  edges: readonly ConeEdge[],
  samples: readonly Vec[],
  light: readonly Vec[],
): { lit: S[][]; dark: S[][] } {
  const seen = new Map<number, boolean>();
  for (const p of samples) {
    const s = toScreen(cam, p.x, p.y);
    let bits = 0;
    for (const [i, e] of edges.entries()) if (e.nx * s.x + e.ny * s.y >= e.c) bits |= 1 << i;
    seen.set(bits, (seen.get(bits) ?? false) || inLight(light, p));
  }
  const all = (1 << edges.length) - 1;
  const lit: S[][] = [];
  const dark: S[][] = [];
  for (let bits = 0; bits <= all; bits++) {
    let cell = rect;
    for (const [i, e] of edges.entries()) {
      cell = clipSide(cell, e, (bits & (1 << i)) !== 0);
      if (cell.length < 3) break;
    }
    if (cell.length < 3 || areaOf(cell) < 0.25) continue;
    (bits === all || seen.get(bits) ? lit : dark).push(cell);
  }
  return { lit, dark };
}

// A box's points at a grid, for sorting the cells of a thing's footprint.
const GRID_N = 5;
export function pointsIn(f: Foot): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < GRID_N; i++)
    for (let j = 0; j < GRID_N; j++)
      out.push({
        x: f.x0 + ((f.x1 - f.x0) * (i + 0.5)) / GRID_N,
        y: f.y0 + ((f.y1 - f.y0) * (j + 0.5)) / GRID_N,
      });
  return out;
}

export const screenRect = (cam: Camera, f: Foot, up: number, grow: number): S[] => {
  const tl = toScreen(cam, f.x0 - grow, f.y0 - grow, up);
  const br = toScreen(cam, f.x1 + grow, f.y1 + grow, 0);
  return [tl, { x: br.x, y: tl.y }, br, { x: tl.x, y: br.y }];
};

// A thing stands on one or more pieces of ground. Whatever it draws lies inside the rectangle that
// reaches from each piece's front up by `height` and a little to each side.
export interface Part {
  foot: Foot;
  // Cut by the shadow plane (faces vertical, top on the floor's line) instead of by the cone's edges carried up the
  // screen. Only a camera bolted to a wall opts in; everything else, stations included, is cut by the diagonal.
  planar?: boolean;
  // A flat face with no top (a camera bolted to a wall): cut by the vertical line only.
  faceOnly?: boolean;
  // A wall stands directly behind (north of) this piece: the part of the thing that lies over that wall's front is cut by
  // the wall's own vertical line, and only the part below the wall's foot by the diagonal (the user, screenshots 103
  // and 104).
  wallBehind?: boolean;
}
const SIDE = 0.3; // tiles each side of a piece that its drawing may reach (a figure's shoulders, a plate's overhang)

// What may be drawn of a thing: all of it (no clip), none, or the lit parts of each piece it stands on. A shadow edge is
// a vertical plane (the user, screenshots 94 and 95), so a thing is cut as the wall behind it is: its front face, which
// stands on the foot's south edge, is cut by a vertical line from where the light meets that edge; its top, which lies
// over the foot at the thing's height, is the lit part of the foot lifted straight up, so the floor's own line crosses it.
export function regionOf(
  cam: Camera,
  light: readonly Vec[],
  parts: readonly Part[],
  height: number,
): "whole" | "none" | S[][] {
  const pieces: S[][] = [];
  let whole = true;
  let edges: ConeEdge[] | null = null;
  for (const { foot, planar, wallBehind } of parts) {
    if (wallBehind && !planar) {
      whole = false;
      pieces.push(...behindWall(cam, light, foot, height));
      continue;
    }
    const lit = cutToBox(light, foot);
    if (lit.length < 3) {
      whole = false;
      continue;
    }
    if (!planar) {
      edges ??= coneEdges(cam, light);
      const rect = screenRect(cam, foot, height, SIDE);
      const through = edgesNear(edges, boxOf(rect));
      if (through.length === 0) {
        pieces.push(rect);
        continue;
      }
      whole = false;
      pieces.push(...cells(cam, rect, through, pointsIn(foot), light).lit);
      continue;
    }
    const wide = { ...foot, x0: foot.x0 - SIDE, x1: foot.x1 + SIDE };
    const spans = litSpans(light, foot.y1 - OUT, foot.x0, foot.x1);
    const first = spans[0];
    const last = spans[spans.length - 1];
    if (first && first[0] <= foot.x0 + 1e-6) first[0] = wide.x0;
    if (last && last[1] >= foot.x1 - 1e-6) last[1] = wide.x1;
    const fullFront =
      spans.length === 1 &&
      (spans[0] as [number, number])[0] <= wide.x0 + 1e-6 &&
      (spans[0] as [number, number])[1] >= wide.x1 - 1e-6;
    if (fullFront) {
      pieces.push(screenRect(cam, foot, height, SIDE));
      continue;
    }
    whole = false;
    // the front: from the foot's south edge up to the thing's height, and down a margin in front of it
    const frontTop = toScreen(cam, 0, foot.y1, height).y;
    const frontBottom = toScreen(cam, 0, foot.y1 + SIDE, 0).y;
    for (const [x0, x1] of spans)
      pieces.push([
        { x: toScreen(cam, x0, 0).x, y: frontTop },
        { x: toScreen(cam, x1, 0).x, y: frontTop },
        { x: toScreen(cam, x1, 0).x, y: frontBottom },
        { x: toScreen(cam, x0, 0).x, y: frontBottom },
      ]);
  }
  if (whole) return "whole";
  if (pieces.length === 0) return "none";
  // one winding for every piece, so overlapping pieces add up under the non-zero rule and none cancels another
  return pieces.map((poly) => (areaOfPlan(poly) < 0 ? [...poly].reverse() : poly));
}

// Keep the part of a polygon at or below a horizontal screen line (larger y), or at or above it.
function clipAtLine(poly: readonly S[], line: number, below: boolean): S[] {
  const keep = (p: S) => (below ? p.y >= line : p.y <= line);
  const out: S[] = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length] as S;
    if (keep(a)) out.push(a);
    if (keep(a) !== keep(b)) {
      const t = (line - a.y) / (b.y - a.y);
      out.push({ x: a.x + (b.x - a.x) * t, y: line });
    }
  });
  return out;
}

// A piece with a wall behind it: below the wall's foot line the diagonal cut as for any piece, above it (what lies over
// the wall's front) the wall's vertical cut: columns lit where the ground at the wall's foot, at the same x, is lit.
function behindWall(cam: Camera, light: readonly Vec[], foot: Foot, height: number): S[][] {
  const line = toScreen(cam, 0, foot.y0, 0).y;
  const rect = screenRect(cam, foot, height, SIDE);
  const out: S[][] = [];
  const lit = cutToBox(light, foot);
  if (lit.length >= 3) {
    const edges = coneEdges(cam, light);
    const through = edgesNear(edges, boxOf(rect));
    const below =
      through.length === 0 ? [rect] : cells(cam, rect, through, pointsIn(foot), light).lit;
    for (const q of below) {
      const c = clipAtLine(q, line, true);
      if (c.length >= 3) out.push(c);
    }
  }
  const wide = { x0: foot.x0 - SIDE, x1: foot.x1 + SIDE };
  const spans = litSpans(light, foot.y0 + OUT, wide.x0, wide.x1);
  const top = toScreen(cam, 0, foot.y0, height).y - 1;
  for (const [x0, x1] of spans)
    out.push([
      { x: toScreen(cam, x0, 0).x, y: top },
      { x: toScreen(cam, x1, 0).x, y: top },
      { x: toScreen(cam, x1, 0).x, y: line },
      { x: toScreen(cam, x0, 0).x, y: line },
    ]);
  return out;
}

const areaOfPlan = (poly: readonly S[]): number =>
  poly.reduce((sum, a, i) => {
    const b = poly[(i + 1) % poly.length] as S;
    return sum + (a.x * b.y - b.x * a.y) / 2;
  }, 0);

// What the light leaves dark of a wall tile. A wall is lit where a ray lands on a face of it, which is where
// the ground just outside the tile is lit, so the ground along the tile's perimeter stands for its faces.
// A cone edge that lands on a wall's south face is carried up that wall, and on along the run of wall it
// belongs to (the line does not stop at the tile it lands on, or the cut would jump when the edge's end
// crossed from one tile to the next): it splits the drawing of every tile in the run (`rect`, from its top
// down to the floor), a cell is lit when a perimeter point that falls in it is in the light, and the veil
// moves with the viewer a hair at a time. With no edge to cut it a wall is lit or dark whole.
const FACE_SAMPLES = 9;
const OUT = 0.01; // tiles outside the tile that stand for its faces
const BLOCKS = "#%=H";

// Whether the light polygon has a vertex on or next to the tile: cheap, and true for every wall some light
// lands on, with no sampling (the sampled test cost 10 ms a frame).
function lightBorders(light: readonly Vec[], tx: number, ty: number): boolean {
  // the tile itself, or the tile either side of it in its row: a stripe of light that lands on a wall carries on
  // across the seam into the wall next to it (the user, screenshot 67: the triangle's vertical edge is that seam)
  for (const p of light)
    if (p.x >= tx - 1 - 1e-3 && p.x <= tx + 2 + 1e-3 && p.y >= ty - 1e-3 && p.y <= ty + 1 + 1e-3)
      return true;
  return false;
}

// Points just outside a wall tile's four faces, which stand for the ground its faces are lit from.
function faceSamples(tx: number, ty: number): Vec[] {
  const samples: Vec[] = [];
  for (let i = 0; i < FACE_SAMPLES; i++) {
    const f = (i + 0.5) / FACE_SAMPLES;
    samples.push(
      { x: tx + f, y: ty - OUT },
      { x: tx + f, y: ty + 1 + OUT },
      { x: tx - OUT, y: ty + f },
      { x: tx + 1 + OUT, y: ty + f },
    );
  }
  return samples;
}

// The edges that land on the south face of the run of wall tiles holding (tx, ty), or pass through (tx, ty).
function edgesOfWall(
  cam: Camera,
  light: readonly Vec[],
  tiles: readonly string[],
  tx: number,
  ty: number,
  reached: boolean,
): ConeEdge[] {
  const row = tiles[ty] ?? "";
  let x0 = tx;
  while (x0 > 0 && BLOCKS.includes(row[x0 - 1] ?? " ")) x0--;
  let x1 = tx + 1;
  while (x1 < row.length && BLOCKS.includes(row[x1] ?? " ")) x1++;
  const base = ty + 1;
  // and the vertical run through the tile: an edge that lands on the east or west face of a column of wall is
  // carried down the whole column, the same way (the user, screenshot 59: every vent the line crosses is cut)
  let y0 = ty;
  while (y0 > 0 && BLOCKS.includes(tiles[y0 - 1]?.[tx] ?? " ")) y0--;
  let y1 = ty + 1;
  while (y1 < tiles.length && BLOCKS.includes(tiles[y1]?.[tx] ?? " ")) y1++;
  // an edge lands on the run's south face, or has just slid off it onto the face of a wall that meets the run
  // at either end (a hair of walking moves a landing from one to the other; the cut must not flip when it does)
  const lands = (p: Vec) =>
    Math.abs(p.y - base) < 1e-6 ? p.x >= x0 - 1e-6 && p.x <= x1 + 1e-6 : joinsRun(p);
  // a landing just under the run, on the side face of a column of wall whose top tile is directly under the
  // run: the vent column meeting the room's top wall, which an edge slides onto as the viewer moves
  const joinsRun = (p: Vec) => {
    if (p.y <= base || p.y > base + 1 + 1e-6) return false;
    for (const fx of [0, 1]) {
      const face = Math.round(p.x) + fx - 1;
      if (Math.abs(p.x - Math.round(p.x)) > 1e-6) return false;
      if (
        face >= x0 &&
        face < x1 &&
        BLOCKS.includes(tiles[base]?.[face] ?? " ") &&
        BLOCKS.includes(tiles[Math.floor(p.y - 1e-6)]?.[face] ?? " ")
      )
        return true;
    }
    return false;
  };
  const landsOnColumn = (p: Vec) =>
    (Math.abs(p.x - tx) < 1e-6 || Math.abs(p.x - (tx + 1)) < 1e-6) &&
    p.y >= y0 - 1e-6 &&
    p.y <= y1 + 1e-6;
  const all = coneEdges(cam, light);
  const out = all.filter((e) => lands(e.land) || landsOnColumn(e.land));
  for (const e of all)
    if (!out.includes(e) && crossesFloor(e, { x0: tx, x1: tx + 1, y0: ty, y1: ty + 1 }, OUT * 2))
      out.push(e);
  // an edge whose line, carried up the screen, crosses this wall's drawing cuts it too (the edge may land
  // beside the run, on another wall: the cut is the line, not where the ray ends)
  // (only for a wall some light reaches: one the light never reaches is veiled whole)
  if (reached) {
    const drawn = boxOf(screenRect(cam, { x0: tx, x1: tx + 1, y0: ty, y1: ty + 1 }, LIVE.wall, 0));
    // a wall whose middle lies beyond where the edge lands is behind the landing: the light does not reach through
    // the face to it, so the line does not cut it (the user, screenshot 82: a lit polygon "through the wall")
    const mid = { x: tx + 0.5, y: ty + 0.5 };
    // (more than a tile past the face it lands on: the tile it lands on is still cut)
    const onGrid = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;
    const behind = (e: ConeEdge) =>
      (onGrid(e.land.x) && (mid.x - e.land.x) * Math.sign(e.land.x - e.from.x) > 1) ||
      (onGrid(e.land.y) && (mid.y - e.land.y) * Math.sign(e.land.y - e.from.y) > 1);
    for (const e of edgesNear(all, drawn)) if (!out.includes(e) && !behind(e)) out.push(e);
  }
  return out.slice(0, MOST_EDGES);
}

// Whether one face of the wall tile looks onto open ground (not a wall) and the ground just in front of it is lit along
// its whole width, with a hair to spare so a light edge that runs along the face itself does not count.
const FACE_STEPS = 24;
function faceLitEndToEnd(
  light: readonly Vec[],
  tiles: readonly string[],
  tx: number,
  ty: number,
  southOnly = false,
): boolean {
  const open = (x: number, y: number) => !BLOCKS.includes(tiles[y]?.[x] ?? "#");
  const faces: [boolean, (f: number) => Vec][] = [
    [!southOnly && open(tx, ty - 1), (f) => ({ x: tx + f, y: ty - OUT })],
    [open(tx, ty + 1), (f) => ({ x: tx + f, y: ty + 1 + OUT })],
    [!southOnly && open(tx - 1, ty), (f) => ({ x: tx - OUT, y: ty + f })],
    [!southOnly && open(tx + 1, ty), (f) => ({ x: tx + 1 + OUT, y: ty + f })],
  ];
  for (const [isOpen, at] of faces) {
    if (!isOpen) continue;
    // the two ends first: a face lit end to end is lit at both, and most faces fail at one of them
    if (!inLight(light, at(0.5 / FACE_STEPS)) || !inLight(light, at(1 - 0.5 / FACE_STEPS)))
      continue;
    let all = true;
    for (let i = 1; i < FACE_STEPS - 1 && all; i++)
      if (!inLight(light, at((i + 0.5) / FACE_STEPS))) all = false;
    if (all) return true;
  }
  return false;
}

// The tiles a vertex of the light lies on, kept per light: a ray lands on each of them. The wall veil and the wire
// both ask it, so a wall the light lands on reads as lit to both.
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
const touchedCache = new WeakMap<readonly Vec[], Set<number>>();
export const touchedOf = (light: readonly Vec[]): Set<number> => {
  const known = touchedCache.get(light);
  if (known) return known;
  const made = touchedTiles(light);
  touchedCache.set(light, made);
  return made;
};

// Both halves of a wall tile's drawing: "lit" or "dark" whole, or the cells the cone's edges cut it into.
function splitOfBody(
  cam: Camera,
  light: readonly Vec[],
  tiles: readonly string[],
  tx: number,
  ty: number,
  rect: S[],
  touched: boolean, // some vertex of the light lies on this tile: a ray lands on it
  south = false, // judge only the south face (what the front of the wall shows)
): "lit" | "dark" | { lit: S[][]; dark: S[][] } {
  // a tile with a wall on all four sides is behind the wall in front of it: no light can land on a face of it, and it
  // is veiled whole, whatever edge passes through its box (the user, screenshot 70: the layer behind the corridor's
  // south wall showed a small lit cut; up against the wall it is wholly veiled, as it should be)
  const above = BLOCKS.includes(tiles[ty - 1]?.[tx] ?? " ");
  const below = BLOCKS.includes(tiles[ty + 1]?.[tx] ?? " ");
  const west = BLOCKS.includes(tiles[ty]?.[tx - 1] ?? " ");
  const east = BLOCKS.includes(tiles[ty]?.[tx + 1] ?? " ");
  if (above && below && west && east) return "dark";
  // reached by its own light, or by the stripe that cuts the wall tile directly above or below it in a column of
  // wall: the cut line runs on down the column (the user, screenshot 62: it clips the middle vent's corner)
  const reached =
    touched ||
    lightBorders(light, tx, ty) ||
    (above && lightBorders(light, tx, ty - 1)) ||
    (below && lightBorders(light, tx, ty + 1));
  const through = edgesOfWall(cam, light, tiles, tx, ty, reached);
  if (through.length === 0) return touched ? "lit" : "dark";
  // a face that looks onto open ground and is lit end to end is seen along its whole length: the wall is clear
  // whole, whatever edge's screen ray crosses its box (the user, screenshot 64: walking a corridor, none of its walls
  // should be veiled, and a cut across the top of the wall beside you "doesn't make sense"). Asked only of a tile
  // an edge would cut: a tile no edge reaches is already lit or dark whole, and the sampling is the dear part.
  if (faceLitEndToEnd(light, tiles, tx, ty, south)) return "lit";
  const samples = faceSamples(tx, ty);
  return cells(cam, rect, through, south ? samples.filter((p) => p.y > ty + 1) : samples, light);
}

// Where the light polygon crosses a horizontal line, as the stretches of x it covers inside [x0, x1].
function litSpans(light: readonly Vec[], y: number, x0: number, x1: number): [number, number][] {
  const xs: number[] = [];
  for (let i = 0; i < light.length; i++) {
    const p = light[i] as Vec;
    const q = light[(i + 1) % light.length] as Vec;
    if (p.y <= y !== q.y <= y) xs.push(p.x + ((q.x - p.x) * (y - p.y)) / (q.y - p.y));
  }
  xs.sort((a, b) => a - b);
  const spans: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const a = Math.max(xs[i] as number, x0);
    const b = Math.min(xs[i + 1] as number, x1);
    if (b - a > 1e-6) spans.push([a, b]);
  }
  return spans;
}

// A wall's front, cut as a shadow edge really falls on it: the edge is a vertical plane, so on the front it is a
// vertical line, from the point where the light meets the wall's foot (the user, screenshots 89 to 92). A column of the
// front is lit where the ground at its foot, at the same x, is lit; the rest is veiled. Nothing is carried across to
// a wall the light does not meet.
function frontByFoot(
  light: readonly Vec[],
  tx: number,
  ty: number,
  front: S[],
): "lit" | "dark" | { lit: S[][]; dark: S[][] } {
  const spans = litSpans(light, ty + 1 + OUT, tx, tx + 1);
  if (spans.length === 0) return "dark";
  const [a, b, , d] = front as [S, S, S, S];
  const at = (x: number) => a.x + (b.x - a.x) * (x - tx);
  const strip = (x0: number, x1: number): S[] => [
    { x: at(x0), y: a.y },
    { x: at(x1), y: a.y },
    { x: at(x1), y: d.y },
    { x: at(x0), y: d.y },
  ];
  if (
    spans.length === 1 &&
    (spans[0] as [number, number])[0] <= tx + 1e-6 &&
    (spans[0] as [number, number])[1] >= tx + 1 - 1e-6
  )
    return "lit";
  const lit: S[][] = [];
  const dark: S[][] = [];
  let from = tx;
  for (const [x0, x1] of spans) {
    if (x0 - from > 1e-6) dark.push(strip(from, x0));
    lit.push(strip(x0, x1));
    from = x1;
  }
  if (tx + 1 - from > 1e-6) dark.push(strip(from, tx + 1));
  return { lit, dark };
}

// A wall is drawn as a top (seen from the north) and a front, its south face (seen from the south). With open ground
// behind it, the front is judged by that ground alone: light that only touches the tile's north edge or its top does
// not light it (the user, screenshots 71 to 73: standing in the stub of a room, the fronts of the walls either side
// were lit, "the player is literally on the opposite side of the wall"). The two halves are cut by the same edges, so
// they meet at the seam, and each is continuous in the viewer's step.
function splitOfWall(
  cam: Camera,
  light: readonly Vec[],
  tiles: readonly string[],
  tx: number,
  ty: number,
  rect: S[],
  touched: boolean,
): "lit" | "dark" | { lit: S[][]; dark: S[][] } {
  const [a, b, c, d] = rect as [S, S, S, S];
  const k = LIVE.depth / (LIVE.depth + LIVE.wall); // the top face is this much of the box, from the top down
  const at = (p: S, q: S): S => ({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k });
  const seamA = at(a, d);
  const seamB = at(b, c);
  const topRect = [a, b, seamB, seamA];
  const frontRect = [seamA, seamB, c, d];
  // a top is seen by nobody on the floor: the light never veils it (the user, after screenshots 82 to 85: "wall tops
  // just don't get veiled at all"; clear for walled-in tiles and vents too); only the front, the face a ray lands on,
  // is cut
  const top = "lit";
  // a wall with wall south of it has its front behind that wall: judged as before, by the edges that reach it
  if (BLOCKS.includes(tiles[ty + 1]?.[tx] ?? " ")) {
    const behind = splitOfBody(cam, light, tiles, tx, ty, frontRect, touched);
    if (behind === "lit") return "lit";
    const f = behind === "dark" ? { lit: [], dark: [frontRect] } : behind;
    return { lit: [topRect, ...f.lit], dark: f.dark };
  }
  // a front is seen only from south of its foot line: from level with it or north of it, it is veiled whole (the user,
  // screenshots 74 and 75); from south of it, the edges cut it
  const viewer = origins.get(light);
  const front =
    viewer !== undefined && viewer.y <= ty + 1 ? "dark" : frontByFoot(light, tx, ty, frontRect);
  if (top === front) return top;
  const half = (r: ReturnType<typeof splitOfBody>, rc: S[]) =>
    r === "lit" ? { lit: [rc], dark: [] } : r === "dark" ? { lit: [], dark: [rc] } : r;
  const t = half(top, topRect);
  const f = half(front, frontRect);
  return { lit: [...t.lit, ...f.lit], dark: [...t.dark, ...f.dark] };
}

export function darkOfWall(
  cam: Camera,
  light: readonly Vec[],
  tiles: readonly string[],
  tx: number,
  ty: number,
  rect: S[],
  touched: boolean,
): "lit" | "dark" | S[][] {
  const split = splitOfWall(cam, light, tiles, tx, ty, rect, touched);
  return typeof split === "string" ? split : split.dark;
}

// Glass passes sight, so no ray lands on a pane: it is lit where the light covers the ground its pixels belong
// to, not where a vertex touches it. The edges that cross the pane's drawing cut it, the way they cut a wall,
// and each cell is lit when a point of the pane's footprint that falls in it is in the light.
const GLASS_GRID = [0.1, 0.5, 0.9];
export function darkOfGlass(
  cam: Camera,
  light: readonly Vec[],
  tx: number,
  ty: number,
  rect: S[],
): "lit" | "dark" | S[][] {
  const edges = edgesNear(
    coneEdges(cam, light),
    boxOf(screenRect(cam, { x0: tx, x1: tx + 1, y0: ty, y1: ty + 1 }, LIVE.wall, 0)),
  );
  const samples: Vec[] = [];
  for (const fx of GLASS_GRID)
    for (const fy of GLASS_GRID) samples.push({ x: tx + fx, y: ty + fy });
  if (edges.length === 0) return samples.some((p) => inLight(light, p)) ? "lit" : "dark";
  const split = cells(cam, rect, edges, samples, light);
  if (split.lit.length === 0) return "dark";
  if (split.dark.length === 0) return "lit";
  return split.dark;
}

function tracePieces(ctx: CanvasRenderingContext2D, shapes: readonly S[][]) {
  for (const shape of shapes) {
    for (const [i, q] of shape.entries()) {
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
  }
}

// Draws a thing cut by the cone's edge: whole when its ground is fully lit, not at all when no ground of
// it is lit, and otherwise on the lit side of the edge's line.
export function drawCut(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  light: readonly Vec[],
  parts: readonly Part[],
  height: number,
  draw: (c: CanvasRenderingContext2D) => void,
): void {
  drawRegion(ctx, regionOf(cam, light, parts, height), draw);
}

export function drawRegion(
  ctx: CanvasRenderingContext2D,
  region: "whole" | "none" | S[][],
  draw: (c: CanvasRenderingContext2D) => void,
): void {
  if (region === "none") return;
  if (region === "whole") {
    draw(ctx);
    return;
  }
  ctx.save();
  ctx.beginPath();
  tracePieces(ctx, region);
  ctx.clip();
  draw(ctx);
  ctx.restore();
}

// The ground a thing stands on, around (x, y): a box `half` each way. For a wall tile (a wire, a vault
// socket, a panel on the wall) it is a thin slice along the wall's south face, which is where the ground
// under what hangs on that face is (the light ends on the face, and never fills the wall tile itself).
const EDGE = 0.03;
export function groundSlice(tiles: readonly string[], x: number, y: number, half = 0.5): Foot {
  const ch = tiles[Math.floor(y)]?.[Math.floor(x)];
  const wall = ch === "#" || ch === "%";
  if (!wall) return { x0: x - half, x1: x + half, y0: y - half, y1: y + half };
  const cy = Math.floor(y) + 1.02;
  return { x0: x - half, x1: x + half, y0: cy - EDGE, y1: cy + EDGE };
}

// The full footprint of a tile, for a box that fills it.
export function tileFoot(tx: number, ty: number): Foot {
  return { x0: tx, y0: ty, x1: tx + 1, y1: ty + 1 };
}

// How tall each kind of standing thing is, in tiles above its foot, with a margin: what a thing draws
// lies inside the rectangle this reaches. A test measures the real draw routines against this table.
export const HEIGHT: Record<string, number> = {
  player: 1.56,
  crate: 1.1,
  checkpoint: 1.2,
  loot: 0.7,
  camera: 3.22,
  laser: 1.3,
  guard: 1.9,
  gear: 0.34,
  bell: 2.9,
  lamp: 1.14,
  lever: 0.6,
  keepsake: 0.9,
  card: 1.3,
  order: 1.3,
  stamp: 1.6,
  link: 1.3, // a wire along a wall's top and down to its ends
  station: 1.7,
  dial: 1.15,
  bells: 3.0,
};
