import type { Stamp } from "../../game/channels.ts";
import type { Role, Seat, Vec } from "../../game/types.ts";
import type { EntityView } from "../../net/protocol.ts";
import type { Fx } from "../fx.ts";
import { COLOR, MAP, ROLE_COLOR, setDusk, WORLD } from "../tokens.ts";
import { drawAlarm } from "./alarm.ts";
import { drawBackdrop } from "./backdrop.ts";
import { block, drawFlat, drawStanding, floorTop, glass, vent, wall } from "./blocks.ts";
import { drawKeepsake, drawMotifTile, drawSlide } from "./chamber.ts";
import { drawCloud } from "./dye.ts";
import { drawHidden, drawOwnBlind, drawPlayer } from "./figures.ts";
import { drawGear, drawGoggles, drawHold, drawUv, gearGlyph } from "./gear.ts";
import { drawHazard, drawHazardFloor, drawSight } from "./hazards.ts";
import { drawItem } from "./items.ts";
import { drawLabels } from "./labels.ts";
import { figureCover, wallAlpha } from "./occlusion.ts";
import { drawEdgePills, drawPops } from "./pops.ts";
import { type Camera, camera, LIVE, setRise, tileWindow, toScreen } from "./project.ts";
import { drawMist, inSight, lightPolygon, litEntities, nightTile, seenOf } from "./sight.ts";
import { drawBell, drawHatch, drawLampSwitch, drawLever } from "./signals.ts";
import {
  drawLink,
  drawOrder,
  drawPlaque,
  drawStationFloor,
  drawStationPlates,
  drawStationStanding,
  drawTargetCard,
  linkOf,
  linkRow,
  stationRows,
} from "./stations.ts";

export { type Camera, camera, easeCamera, fromScreen, LIVE, TILT, toScreen } from "./project.ts";

export interface Scene {
  w: number; // canvas size in CSS pixels
  h: number;
  role: Role;
  seat: Seat;
  roles: [Role, Role, Role]; // by seat, from the reveal
  tiles: string[] | null; // null for Can't see
  entities: EntityView[];
  self: Vec | null; // own position, null for Can't see
  // "fit" shows the whole room (the home feeds, the reveal); "follow" is the game camera.
  layout: "fit" | "follow";
  pops?: FacePop[]; // faces shown above their senders
  fx?: (Fx & { age: number })[]; // small effects, each with how far through its life it is (0 to 1)
  alarm?: boolean; // the alarm is on: a red border, a banner, and the dusk palette
  nowMs?: number; // the clock the alarm pulse, the water and the dusk blend follow
  reducedMotion?: boolean; // a static alarm, no pulse, no drift
  // A spectator sees the room even while following Can't see (spec §4.1: full
  // tiles and entities, no dark masking) — the one place `role === "blind"`
  // would otherwise black the screen out.
  spectator?: boolean;
  // A watcher of the whole room follows nobody, so no avatar is "you" and none is outlined as such.
  noSelf?: boolean;
  // Your own figure as the client knows it, which is ahead of the server: the way you last pushed,
  // and whether you are walking or pushing at something. Overrides what the view says about you;
  // for Can't see it is all there is to draw.
  own?: Motion;
  // How far the world has risen out of the flat reveal, 0 to 1 (FR25). Absent is fully risen. Scales
  // depth and every height, eases the follow camera in from the whole room, and fades Can't see's
  // figure in over the first 400 ms of 900.
  rise?: number;
  // The camera to draw with, when the caller eases one (the game does). Absent: the scene's own.
  cam?: Camera;
  // The view's `seen`: the tiles in your line of sight. Present for the sighted, who draw everything
  // else under mist; absent for watchers, who see the whole room.
  seen?: string[];
  bots?: [boolean, boolean, boolean]; // by seat: a bot's figure has an antenna
  labels?: { text: string; at: Vec }[]; // the first room's labels: one per kind in sight (FR15)
  // Filled by draw with the boxes it placed (canvas px), so a spec can measure that no chip sits on a
  // plaque: the picture alone cannot say. Absent, nothing is recorded.
  report?: { chips: Box[]; plaques: Box[] };
  floorEntities?: EntityView[]; // every entity sent, before what stands out of the light is dropped: the floor layer reads these (a hazard's cone outlives its body)
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Motion {
  facing: Vec;
  moving: boolean;
  blocked: boolean;
}

export interface FacePop {
  seat: Seat;
  img?: CanvasImageSource; // a face; absent for a mark
  fade: number; // 1 while fully shown, down to 0 as it goes
  // Where the sender stood (a face) or the mark was placed, and the sender's name: what an edge
  // pill needs when they are out of sight and so not among the entities.
  from?: Vec;
  name?: string;
  mark?: Stamp; // a mark's glyph, for its pill
  alone?: boolean; // past the face's 1.5 s: the pill stays on its own for a few seconds
}

const FAINT_MARK = 0.35; // a mark in a tile you cannot see
const isBlock = (ch: string | undefined) => ch === "#" || ch === "%" || ch === "=" || ch === "H";

// Entities drawn flat on the floor, under everything standing up in their row.
const FLAT: EntityView["kind"][] = ["plate", "exit", "hide", "sign", "door", "motiftile"];
// Things that stand up out of the floor, and the figures, in painter's order within a row.
const STANDING: EntityView["kind"][] = [
  "door",
  "crate",
  "checkpoint",
  "loot",
  "camera",
  "laser",
  "guard",
  "gear",
  "bell",
  "lamp",
  "lever",
  "keepsake",
  "card",
  "order",
  "player",
  "stamp",
];

// Draws one frame. Can't see gets a black field and a dim ring and nothing
// else; the renderer is told nothing more than that player was sent.
export function draw(ctx: CanvasRenderingContext2D, given: Scene): void {
  // what stands in a tile the light does not touch is not drawn; the rest is drawn whole and cut by the
  // clip to the light (see lightOf and clipToLight)
  const light = lightOf(given);
  const scene = light
    ? {
        ...given,
        entities: litEntities(given.entities, light, given.seat),
        floorEntities: given.entities,
      }
    : given;
  try {
    drawScene(ctx, scene);
  } finally {
    // the label code replaces `report` on the scene it draws: hand it back to the caller's scene
    if (scene !== given && scene.report) given.report = scene.report;
  }
}

// The exact region the sighted viewer can see, or null (Can't see, a watcher, no map yet). The mist is
// cut out of it, and what stands is drawn inside a clip to it, so the cone's edge cuts an object the
// way it would in a dark room.
function lightOf(scene: Scene): Vec[] | null {
  if (!scene.seen || !scene.self || !scene.tiles) return null;
  const closed = new Set<string>();
  for (const e of scene.entities)
    if (e.kind === "door" && e.state === "closed")
      closed.add(`${Math.floor(e.pos.x)},${Math.floor(e.pos.y)}`);
  return lightPolygon(scene.self, scene.tiles, (tx, ty) => closed.has(`${tx},${ty}`));
}

// Limits what is drawn next to the lit region (no light, no limit: a watcher sees the whole room). The
// light is the outline of lit floor, but what stands rises above its tile on screen (a figure's head, a
// crate, a wall-hung panel), so the region is that outline swept straight up by a wall's height. A shift
// straight up only grows the region where an edge faces up, so the sweep is the polygon plus one quad
// for each edge that faces up; every piece is wound the same way, so under the non-zero rule they add up
// to their union and none cancels another. (A quad for every edge made five times the canvas calls.)
// It is built once a frame and reused by every row and layer.
// How far up the clip reaches, in tiles: the tallest thing that stands (a camera on the wall is the
// tallest, 3.2 tiles above its foot; a bell 2.9; you with your arrow 1.5), with a margin. A test
// measures the real draw routines against it, so a taller thing added later cannot be silently cut.
export const SWEEP_TILES = 3.5;
function flatLight(cam: Camera, light: readonly Vec[]): { x: number; y: number }[] {
  return light.map((p) => toScreen(cam, p.x, p.y));
}
const swept = new WeakMap<readonly Vec[], Map<number, { x: number; y: number }[][]>>();
function sweptLight(cam: Camera, light: readonly Vec[]): { x: number; y: number }[][] {
  const key = cam.scale * 1e6 + cam.ox * 1e3 + cam.oy;
  const known = swept.get(light)?.get(key);
  if (known) return known;
  const at = (p: Vec, lift = 0) => toScreen(cam, p.x, p.y, lift);
  const area = (pts: { x: number; y: number }[]) =>
    pts.reduce((sum, a, i) => {
      const b = pts[(i + 1) % pts.length] as { x: number; y: number };
      return sum + (a.x * b.y - b.x * a.y);
    }, 0);
  const floor = light.map((p) => at(p));
  const sign = Math.sign(area(floor)) || 1;
  const wound = (pts: { x: number; y: number }[]) =>
    Math.sign(area(pts)) === sign ? pts : [...pts].reverse();
  const pieces = [wound(floor)];
  for (const [i, p] of light.entries()) {
    const n = light[(i + 1) % light.length] as Vec;
    const a = at(p);
    const b = at(n);
    // an edge faces up if the region lies below it on screen: skip edges that run level or face down
    if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5) continue;
    pieces.push(wound([a, b, at(n, SWEEP_TILES), at(p, SWEEP_TILES)]));
  }
  if (!swept.has(light)) swept.set(light, new Map());
  swept.get(light)?.set(key, pieces);
  return pieces;
}

// `reach` is how far up the region is swept (tiles): SWEEP_TILES for what stands, 0 for what lies flat,
// which is cut by the exact outline of the lit floor.
function clipToLight(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  light: readonly Vec[] | null,
  reach = SWEEP_TILES,
) {
  if (!light || light.length < 3) return;
  ctx.beginPath();
  for (const piece of reach > 0 ? sweptLight(cam, light) : [flatLight(cam, light)]) {
    for (const [i, q] of piece.entries()) {
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
  }
  ctx.clip("nonzero");
}

function drawScene(ctx: CanvasRenderingContext2D, scene: Scene): void {
  ctx.clearRect(0, 0, scene.w, scene.h);
  setRise(scene.rise ?? 1);
  if ((scene.role === "blind" && !scene.spectator) || !scene.tiles) {
    ctx.fillStyle = COLOR.ink;
    ctx.fillRect(0, 0, scene.w, scene.h);
    if (scene.own) {
      drawOwnBlind(ctx, scene, scene.own);
      return;
    }
    // no figure to show (a home feed): the dim ring
    ctx.save();
    ctx.globalAlpha = MAP.blindRingAlpha;
    ctx.lineWidth = MAP.ringWidthPx;
    ctx.strokeStyle = ROLE_COLOR.blind;
    ctx.beginPath();
    ctx.arc(scene.w / 2, scene.h / 2, MAP.blindRingTiles * MAP.phoneTilePx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  // the dusk palette follows the alarm; with no clock (a paused feed) it is simply on or off
  setDusk(!!scene.alarm, scene.nowMs ?? 0, scene.reducedMotion || scene.nowMs === undefined);
  const tiles = scene.tiles;
  const cam = scene.cam ?? camera(scene);
  drawBackdrop(ctx, scene, cam);
  // a station is drawn only where it stands in your light: a part behind a wall is cut away (a station
  // is sent whole when any one part is seen), and the rest of the frame reads the cut scene

  const win = tileWindow(cam, scene.w, scene.h, tiles[0]?.length ?? 0, tiles.length);
  // the exact light, once: what lies or stands is drawn inside a clip to it, and the mist is cut out of it
  const light = lightOf(scene);
  const byRow = new Map<number, EntityView[]>();
  for (const e of scene.entities) {
    const shown =
      e.kind === "player" && e.seat === scene.seat && scene.self ? { ...e, pos: scene.self } : e;
    const row = Math.floor(shown.pos.y);
    byRow.set(row, [...(byRow.get(row) ?? []), shown]);
  }
  // figures, where they are drawn (yours is the predicted position), to see which walls stand
  // between them and the viewer
  const figures = scene.entities
    .filter((e) => e.kind === "player" && e.state !== "dim")
    .map((e) => (e.seat === scene.seat && scene.self ? { ...e, pos: scene.self } : e));
  // a keepsake in a vault's bottom row stands behind the wall in front of it: it gets the same window
  const behindWalls = [
    ...figures.map((f) => f.pos),
    ...scene.entities.filter((e) => e.kind === "keepsake").map((e) => e.pos),
  ];

  // floor tops first, so no block front is painted over by the floor of the row behind it
  for (let y = win.y0; y <= win.y1; y++) {
    const row = tiles[y] ?? "";
    for (let x = win.x0; x <= win.x1; x++) {
      const ch = row[x];
      if (ch === " ") nightTile(ctx, cam, tiles, x, y);
      else if (!isBlock(ch)) floorTop(ctx, cam, x, y, WORLD.floor);
      else if (ch === "=" || ch === "H") floorTop(ctx, cam, x, y, WORLD.floor); // glass and hatches stand on the floor
    }
  }
  // what lies on the floor (plates, an open door's slot, the exit...) is cut by the light like what stands
  ctx.save();
  clipToLight(ctx, cam, light, 0);
  for (const e of scene.floorEntities ?? scene.entities) {
    if (e.kind === "camera" || e.kind === "laser" || e.kind === "guard")
      drawHazardFloor(ctx, e, cam, scene);
  }
  for (const e of scene.entities)
    if (FLAT.includes(e.kind) && !(e.kind === "door" && e.state !== "open"))
      e.kind === "motiftile" ? drawMotifTile(ctx, e, cam) : drawFlat(ctx, e, cam, scene);
  // a station's floor parts (pads, keys, sockets) are part of the station: a veiled one is invisible too
  for (const e of scene.entities) if (e.kind === "station") drawStationFloor(ctx, e, cam, scene);
  ctx.restore();
  for (const e of scene.entities) if (e.kind === "sight") drawSight(ctx, e, cam);
  // a station stands in each row it has a standing part in (the safe, the panel, the lamps...)
  const stationsByRow = new Map<number, EntityView[]>();
  for (const e of scene.entities)
    for (const r of stationRows(e)) stationsByRow.set(r, [...(stationsByRow.get(r) ?? []), e]);
  const hatches = new Set(
    scene.entities
      .filter((e) => e.kind === "hatch")
      .map((e) => `${Math.floor(e.pos.x)},${Math.floor(e.pos.y)}`),
  );

  // a station's wire, in the row of its southernmost point so the wall blocks it runs along are down
  const linksByRow = new Map<number, { e: EntityView; path: Vec[] }[]>();
  for (const e of scene.entities) {
    const path = e.kind === "station" && e.station ? linkOf(e.station, scene) : null;
    if (path)
      linksByRow.set(linkRow(path), [...(linksByRow.get(linkRow(path)) ?? []), { e, path }]);
  }

  const seenNow = scene.seen ? seenOf(scene.seen) : null;
  // north to south: blocks of the row, then what stands in it
  for (let y = win.y0; y <= win.y1; y++) {
    const row = tiles[y] ?? "";
    for (let x = win.x0; x <= win.x1; x++) {
      const ch = row[x];
      if (!isBlock(ch)) continue;
      // a wall in front of a figure is see-through by distance: a soft window that follows them
      ctx.save();
      ctx.globalAlpha = wallAlpha(cam, x, y, behindWalls);
      if (ch === "#") wall(ctx, cam, x, y, !isBlock((tiles[y + 1] ?? "")[x]));
      else if (ch === "H") drawHatch(ctx, x, y, cam);
      else if (ch === "%") vent(ctx, cam, x, y);
      else glass(ctx, cam, x, y);
      ctx.restore();
    }
    // a closed door is a block like a wall: drawn with them, under the veil, not cut away by the light
    // (a door outside the light was "just mist")
    for (const e of byRow.get(y) ?? [])
      if (e.kind === "door" && e.state === "closed") drawStanding(ctx, e, cam, scene);
    // what stands in this row is cut by the light's edge: drawn whole, in its one fixed place, inside a
    // clip to the lit region (a figure's outline behind a wall, a mark and the layout are drawn apart)
    // (a row with nothing in it makes no clip: most rows are empty, and a clip is the costly part)
    const hasStanding =
      (linksByRow.get(y)?.length ?? 0) > 0 ||
      (stationsByRow.get(y)?.length ?? 0) > 0 ||
      (byRow.get(y) ?? []).some((e) => STANDING.includes(e.kind) && e.kind !== "door");
    if (!hasStanding) continue;
    ctx.save();
    clipToLight(ctx, cam, light);
    for (const { e, path } of linksByRow.get(y) ?? [])
      if (e.station) drawLink(ctx, e.station, cam, scene, path);
    for (const e of stationsByRow.get(y) ?? []) {
      drawStationStanding(ctx, e, cam, scene, y);
    }
    for (const kind of STANDING) {
      for (const e of byRow.get(y) ?? []) {
        if (e.kind !== kind) continue;
        if (kind === "door") continue; // an open door is only its slot (the floor layer); a closed one is drawn above
        if (kind === "stamp" && !inSight(seenNow, e.pos)) continue; // drawn through the mist, below
        if (kind === "camera" || kind === "laser" || kind === "guard")
          drawHazard(ctx, e, cam, scene);
        else if (kind === "player") drawPlayer(ctx, e, cam, scene);
        else if (kind === "gear")
          drawGear(ctx, e, cam, hatches.has(`${Math.floor(e.pos.x)},${Math.floor(e.pos.y)}`));
        else if (kind === "bell") drawBell(ctx, e, cam, scene);
        else if (kind === "lamp") drawLampSwitch(ctx, e, cam);
        else if (kind === "lever") drawLever(ctx, e, cam);
        else if (kind === "keepsake") drawKeepsake(ctx, e, cam);
        else if (kind === "card") drawTargetCard(ctx, e, cam);
        else if (kind === "order") drawOrder(ctx, e, cam);
        else drawStanding(ctx, e, cam, scene);
      }
    }
    ctx.restore();
  }
  // the mist: everything outside your line of sight, the edge of it the true ray from where you stand.
  // Only the sighted have one: Can't see has no map, and a watcher (no `seen`) sees the whole room.
  const seen = scene.seen ? seenOf(scene.seen) : null;
  if (seen && light) drawMist(ctx, cam, tiles, light, win);
  // a mark in a place you can't see shows faintly through the haze: only a teammate's message,
  // never room state
  for (const e of scene.entities) {
    if (e.kind !== "stamp" || inSight(seen, e.pos)) continue;
    ctx.save();
    ctx.globalAlpha = FAINT_MARK;
    drawStanding(ctx, e, cam, scene);
    ctx.restore();
  }
  // each station's name plate, over everything standing so no figure or wall hides the name
  // a chip's text starts with the thing's name ("Safe: ..."), which is the plate under it
  const chipped = new Set((scene.labels ?? []).map((l) => l.text.split(":")[0] ?? ""));
  // (inside the light as well: a name behind a wall is not drawn, and one at the cone's edge is cut)
  ctx.save();
  clipToLight(ctx, cam, light);
  for (const e of scene.entities) if (e.kind === "station") drawStationPlates(ctx, e, cam, chipped);
  // a sign's own words (a plaque), over everything standing, like the names
  for (const e of scene.entities) if (e.kind === "sign" && e.text) drawPlaque(ctx, e, cam, scene);
  ctx.restore();
  // the UV pool and its ink: the one bold effect, over the mist (it is only sent where it is seen)
  drawUv(ctx, scene, cam);
  // the outline of a figure a wall hides: the figure itself, outline only, over the wall
  for (const f of figures) drawHidden(ctx, f, cam, scene, figureCover(cam, f.pos, tiles));
  // held hands: an arc from each towed figure to its leader
  for (const f of figures) {
    const leader = figures.find((g) => g.seat === f.heldBy);
    if (f.heldBy !== undefined && leader) drawHold(ctx, cam, f.pos, leader.pos, f.pulling === true);
  }
  void block;
  drawFx(ctx, scene, cam);
  drawLabels(ctx, scene, cam);
  drawPops(ctx, scene, cam);
  drawEdgePills(ctx, scene, cam);
  // your own goggles tint everything you see (the gear you carry is on your own figure)
  const mine = scene.entities.find((e) => e.kind === "player" && e.seat === scene.seat);
  if (!scene.spectator && !scene.noSelf && mine?.item === "goggles") drawGoggles(ctx, scene);
  if (scene.alarm) drawAlarm(ctx, scene);
}

// Read per frame, so it follows high contrast.
const fxColor = (tone: "goal" | "danger" | "ui" | "muted") =>
  ({ goal: COLOR.goal, danger: COLOR.danger, ui: COLOR.ui, muted: COLOR.uiMuted })[tone];

// Each effect is one shape that fades over its short life. It grows as it fades,
// unless the player asked for reduced motion, in which case it only fades. Rings lie on the
// floor, so the tilt squashes them.
function drawFx(ctx: CanvasRenderingContext2D, scene: Scene, cam: Camera) {
  // an effect at a place you cannot see is not drawn (a door sliding behind a wall would tell you where
  // it is): the sighted see only what is in their light; a watcher has no `seen` and sees them all
  const seen = scene.seen ? seenOf(scene.seen) : null;
  for (const f of scene.fx ?? []) {
    if (!inSight(seen, f.pos)) continue;
    const at = toScreen(cam, f.pos.x, f.pos.y);
    const { x, y } = at;
    const grow = scene.reducedMotion ? 1 : 0.3 + 0.7 * f.age;
    ctx.save();
    ctx.globalAlpha = 0.85 * (1 - f.age);
    ctx.strokeStyle = fxColor(f.tone);
    ctx.fillStyle = fxColor(f.tone);
    ctx.lineWidth = 3;
    if (f.kind === "slide") {
      ctx.restore(); // the slide draws the door itself, over the floor the wall left
      drawSlide(ctx, f.pos, cam, f.age, !!scene.reducedMotion);
      continue;
    }
    if (f.kind === "lift") {
      // the item rises off the plinth towards its owner and fades (reduced motion: it only fades)
      const rise = scene.reducedMotion ? 0 : f.age * cam.scale * 0.9;
      const c = toScreen(cam, f.pos.x, f.pos.y);
      ctx.globalAlpha = 1 - f.age;
      if (f.keep) drawItem(ctx, f.keep, c.x, c.y - cam.scale * 0.5 - rise, cam.scale * 0.7);
      ctx.restore();
      continue;
    }
    if (f.kind === "cloud") {
      ctx.restore(); // the cloud fades itself
      drawCloud(ctx, toScreen(cam, f.pos.x, f.pos.y, 0.5), cam.scale, f.age, !!scene.reducedMotion);
      continue;
    }
    if (f.kind === "arc" && f.to && f.item) {
      // the gear's glyph flies from the giver to the taker over its life (reduced motion: it is
      // simply there, so nothing is drawn in flight)
      if (!scene.reducedMotion) {
        const t = Math.min(1, f.age / 0.4); // 250 ms of the 600 ms life
        const a = toScreen(cam, f.pos.x, f.pos.y, 0.8);
        const b = toScreen(cam, f.to.x, f.to.y, 0.8);
        const lift = Math.sin(t * Math.PI) * cam.scale * 0.5;
        ctx.globalAlpha = t < 1 ? 1 : 0;
        gearGlyph(
          ctx,
          f.item,
          a.x + (b.x - a.x) * t,
          a.y + (b.y - a.y) * t - lift,
          cam.scale * 0.18,
        );
      }
      ctx.restore();
      continue;
    }
    if (f.kind === "swing") {
      // sound lines either side of the bell: the swing itself is the bell's own drawing
      const c = toScreen(cam, f.pos.x, f.pos.y, LIVE.wall);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(
          c.x,
          c.y,
          cam.scale * 0.45 * grow,
          side < 0 ? Math.PI * 0.8 : -Math.PI * 0.2,
          side < 0 ? Math.PI * 1.2 : Math.PI * 0.2,
        );
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }
    if (f.kind === "ring") {
      ctx.beginPath();
      const r = cam.scale * (f.big ? 1.6 : 0.9) * grow;
      ctx.ellipse(x, y, r, r * LIVE.depth, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (f.kind === "dust") {
      for (const [dx, dy] of [
        [-1, -0.6],
        [1, -0.6],
        [-0.7, 0.8],
        [0.7, 0.8],
      ] as const) {
        ctx.beginPath();
        ctx.arc(
          x + dx * cam.scale * 0.35 * grow,
          y + dy * cam.scale * 0.35 * grow,
          cam.scale * 0.07,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    } else {
      const c = toScreen(cam, f.pos.x, f.pos.y, 0.5);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.moveTo(
          c.x + Math.cos(a) * cam.scale * 0.25 * grow,
          c.y + Math.sin(a) * cam.scale * 0.25 * grow,
        );
        ctx.lineTo(
          c.x + Math.cos(a) * cam.scale * 0.5 * grow,
          c.y + Math.sin(a) * cam.scale * 0.5 * grow,
        );
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}
