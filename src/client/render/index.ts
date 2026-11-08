import type { Stamp } from "../../game/channels.ts";
import type { Role, Seat, Vec } from "../../game/types.ts";
import type { EntityView } from "../../net/protocol.ts";
import { DURATION, type Fx, motionT } from "../fx.ts";
import { COLOR, MAP, ROLE_COLOR, setDusk, setDuskAmount, WORLD } from "../tokens.ts";
import { drawAlarm } from "./alarm.ts";
import { drawBackdrop } from "./backdrop.ts";
import {
  block,
  drawDoorOpening,
  drawFlat,
  drawStanding,
  type FloorAt,
  floorTop,
  glass,
  vent,
  wall,
} from "./blocks.ts";
import { drawKeepsake, drawMotifTile, drawSlide } from "./chamber.ts";
import { drawCut, groundSlice, HEIGHT, type Part, rememberOrigin, tileFoot } from "./column.ts";
import { type DecorItem, decorAt } from "./decor.ts";
import { drawCloud } from "./dye.ts";
import { drawHidden, drawOwnBlind, drawPlayer } from "./figures.ts";
import { drawGear, drawGoggles, drawHold, drawLetGo, drawUv, gearGlyph } from "./gear.ts";
import { drawHazard, drawHazardFloor, drawSight } from "./hazards.ts";
import { drawItem } from "./items.ts";
import { drawLabels } from "./labels.ts";
import { floorOf } from "./materials.ts";
import { arc, type PuffShape, puff } from "./motion.ts";
import { figureCover, wallAlpha } from "./occlusion.ts";
import { drawEdgePills, drawPops } from "./pops.ts";
import { type Camera, camera, LIVE, setRise, tileWindow, toScreen } from "./project.ts";
import { diamond } from "./shared.ts";
import { drawMist, inSight, lightPolygon, litEntities, nightTile, seenOf } from "./sight.ts";
import { drawBell, drawHatch, drawLampSwitch, drawLever } from "./signals.ts";
import {
  drawBraillePlate,
  drawLink,
  drawOrder,
  drawPlaque,
  drawStationFloor,
  drawStationStanding,
  drawTargetCard,
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
  dusk?: boolean; // the dusk palette with no alarm: the reveal's backdrop (drawn at once, no blend)
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
  // The room is cleared: nobody walks on, so no figure hops or kicks up dust, whatever stale motion
  // the last view or the client's own input left behind (FR2).
  cleared?: boolean;
  // The start of a room (FR14), each 0 to 1 and absent when over. `rise`: how far the board has
  // tipped out of the flat plan (depth and every height; walls grow north to south). `swoop`: how
  // far the follow camera has flown from the whole room to you. `landing`: your own figure's hop,
  // and Can't see's figure fading in.
  rise?: number;
  swoop?: number;
  landing?: number;
  // The sunrise, 0 to 1: the world's colours go from the reveal's dusk (0) to the room's own (1) as
  // the board tilts and the camera flies in. Absent: no sunrise (over, reduced motion, high contrast).
  sunrise?: number;
  // Where the reveal's backdrop drew the whole room (canvas px; it may reach past the canvas): the
  // swoop flies from the room fitted there, so the first intro frame is the backdrop's picture.
  // Absent: the room fitted to the canvas.
  introFit?: Box;
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
  // Boxes the page has put over the canvas (canvas px), such as the riddle chip: no label chip sits on
  // one, as it would be half hidden. Measured from the DOM by the game, so the chip may grow or wrap.
  avoid?: Box[];
  // The room's id ("04-the-safe"), for its floor's material. Absent: stone.
  roomId?: string;
  // The room's decor (render/decor.ts), worked out once per room by the page from its first full view.
  decor?: DecorItem[];
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
  seat: Seat | null; // null: a door that opened off screen, whose pill belongs to no one
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
const FLAT: EntityView["kind"][] = [
  "plate",
  "exit",
  "hide",
  "sign",
  "door",
  "motiftile",
  "braille",
];
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
  const made = lightPolygon(scene.self, scene.tiles, (tx, ty) => closed.has(`${tx},${ty}`));
  rememberOrigin(made, scene.self);
  return made;
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
const FIGURE_FOOT = 0.36; // tiles each way: the radius of a figure's shadow (figures.ts draws it at 0.36)
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

let lastDusk = false; // whether the previous scene drawn asked for the dusk palette

function drawScene(ctx: CanvasRenderingContext2D, scene: Scene): void {
  ctx.clearRect(0, 0, scene.w, scene.h);
  setRise(scene.rise ?? 1, scene.tiles?.length);
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
  // a dusk scene (the reveal's backdrop) is drawn at once. The game rising under the fading reveal
  // brings the room's colours up like a sunrise, from the intro's own timeline (`sunrise`), so it
  // lands on them as you land; with no sunrise (reduced motion) the first frame after a dusk scene
  // is drawn in the room's colours at once, never easing back from dusk
  const dusk = !!scene.dusk;
  if (!dusk && !scene.alarm && scene.sunrise !== undefined)
    setDuskAmount(1 - scene.sunrise, scene.nowMs ?? 0);
  else
    setDusk(
      dusk || !!scene.alarm,
      scene.nowMs ?? 0,
      dusk || dusk !== lastDusk || scene.reducedMotion || scene.nowMs === undefined,
    );
  lastDusk = dusk;
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
  const kind = floorOf(scene.roomId);
  const floorAt = (x: number, y: number): FloorAt => ({
    kind,
    north: (tiles[y - 1] ?? "")[x] === "#",
    west: (tiles[y] ?? "")[x - 1] === "#",
  });
  for (let y = win.y0; y <= win.y1; y++) {
    const row = tiles[y] ?? "";
    for (let x = win.x0; x <= win.x1; x++) {
      const ch = row[x];
      if (ch === " ") nightTile(ctx, cam, tiles, x, y);
      else if (!isBlock(ch)) floorTop(ctx, cam, x, y, WORLD.floor, floorAt(x, y));
      else if (ch === "=" || ch === "H") floorTop(ctx, cam, x, y, WORLD.floor, floorAt(x, y)); // glass and hatches stand on the floor
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
      e.kind === "motiftile"
        ? drawMotifTile(ctx, e, cam)
        : e.kind === "braille"
          ? drawBraillePlate(ctx, e, cam, scene)
          : drawFlat(ctx, e, cam, scene);
  // a station's floor parts (pads, keys, sockets) are part of the station: a veiled one is invisible too
  for (const e of scene.entities) if (e.kind === "station") drawStationFloor(ctx, e, cam, scene);
  ctx.restore();
  for (const e of scene.entities) if (e.kind === "sight") drawSight(ctx, e, cam);
  // the floor is veiled now, before any wall or anything that stands: what stands is drawn over it, so a
  // lit thing is never veiled and needs no hole cut for it. Only the sighted have a mist: Can't see has no
  // map, and a watcher (no `seen`) sees the whole room.
  const seen = scene.seen ? seenOf(scene.seen) : null;
  const veiled = !!(seen && light);
  if (veiled) drawMist(ctx, cam, tiles, light, win, "floor");
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
    const path = e.kind === "wire" && e.route ? e.route.map((p) => ({ ...p })) : null;
    if (path)
      linksByRow.set(linkRow(path), [...(linksByRow.get(linkRow(path)) ?? []), { e, path }]);
  }

  // each effect is drawn in the row of the place it happened (FR15), an ordinary door's opening too
  const fxByRow = new Map<number, NonNullable<Scene["fx"]>>();
  // An effect at a place you cannot see is not drawn at all (a secret door sliding behind a wall
  // would tell you where it is); a watcher has no `seen` and sees them all. An ordinary door's
  // opening is drawn wherever the door is (ADR 0025 FR5).
  const fxSeen = scene.seen ? seenOf(scene.seen) : null;
  for (const f of scene.fx ?? []) {
    if (!f.door && !inSight(fxSeen, f.pos)) continue;
    const r = Math.min(win.y1, Math.max(win.y0, Math.floor(f.pos.y)));
    fxByRow.set(r, [...(fxByRow.get(r) ?? []), f]);
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
      if (ch === "#") wall(ctx, cam, x, y, !isBlock((tiles[y + 1] ?? "")[x]), decorOf(scene, x, y));
      else if (ch === "H") drawHatch(ctx, x, y, cam);
      else if (ch === "%") vent(ctx, cam, x, y);
      else glass(ctx, cam, x, y);
      ctx.restore();
    }
    // the walls of this row the light never reaches are veiled now, before what stands in the row
    if (veiled) drawMist(ctx, cam, tiles, light, win, y);
    // a closed door is a block like a wall: drawn with them, under the veil, not cut away by the light
    // (a door outside the light was "just mist")
    for (const e of byRow.get(y) ?? [])
      if (e.kind === "door" && e.state === "closed") drawStanding(ctx, e, cam, scene);
    // what stands in this row is cut by the exact light, straight up: each thing is drawn whole inside a
    // clip to the lit part of its own footprint, swept up by its own height (a figure's outline behind a
    // wall, a mark and the layout are drawn apart). A row with nothing in it makes no clip.
    const hasStanding =
      (fxByRow.get(y)?.length ?? 0) > 0 ||
      (linksByRow.get(y)?.length ?? 0) > 0 ||
      (stationsByRow.get(y)?.length ?? 0) > 0 ||
      (byRow.get(y) ?? []).some((e) => STANDING.includes(e.kind) && e.kind !== "door");
    if (!hasStanding) continue;
    const cut = (parts: Part[], height: number, draw: (c: CanvasRenderingContext2D) => void) => {
      if (!light) return draw(ctx);
      drawCut(ctx, cam, light, parts, height, draw);
    };
    // a wire is a faint guide from the dial to its remote part, never cut by the light (the user, screenshot 95:
    // "always shown"), and sent from anywhere (screenshots 105 to 107)
    for (const { path } of linksByRow.get(y) ?? []) drawLink(ctx, cam, scene, path);
    for (const e of stationsByRow.get(y) ?? []) {
      const st = e.station;
      // every piece of a station stands on its own tile's ground (the safe's body on its anchor tile). A station is cut
      // straight across by the cone's diagonal, whatever its geometry (the user, screenshots 101 and 102)
      const parts: Part[] = (st?.parts ?? []).flatMap((q) =>
        q.at.map(
          (t): Part => ({
            foot: groundSlice(tiles, t.x + 0.5, t.y + 0.5, 0.5),
            wallBehind: isBlock(tiles[t.y - 1]?.[t.x]),
          }),
        ),
      );
      const height = (st?.type && HEIGHT[st.type]) || (HEIGHT.station as number);
      cut(parts, height, (c) => drawStationStanding(c, e, cam, scene, y));
    }
    for (const kind of STANDING) {
      for (const e of byRow.get(y) ?? []) {
        if (e.kind !== kind) continue;
        if (kind === "door") continue; // an open door is only its slot (the floor layer); a closed one is drawn above
        if (kind === "stamp" && !inSight(seenNow, e.pos)) continue; // drawn through the mist, below
        const box = kind === "crate" || kind === "checkpoint";
        // a camera is bolted to the wall behind its tile: cut as that wall's column is, by a vertical line from where the
        // light meets the wall's foot (the wall's south line, one row up), with no top (the user, screenshot 96)
        const bolted = kind === "camera";
        // a figure with a wall behind it is cut over that wall's front by the wall's vertical line, as a station is
        // (the user, screenshots 110 and 111): its foot starts at the tile's north edge, the wall's own foot line
        const wallBehind =
          kind === "player" && isBlock(tiles[Math.floor(e.pos.y) - 1]?.[Math.floor(e.pos.x)]);
        // a figure is a flat sprite at one depth, as wide as its shadow: lit where its feet are, whole at every height,
        // and cut by a vertical line where a shadow edge crosses its depth (the user, screenshots 117 and 118)
        const ground = groundSlice(tiles, e.pos.x, e.pos.y, 0.5);
        const figureFoot = groundSlice(tiles, e.pos.x, e.pos.y, FIGURE_FOOT);
        const foot = box
          ? tileFoot(Math.floor(e.pos.x), Math.floor(e.pos.y))
          : bolted
            ? groundSlice(tiles, e.pos.x, Math.floor(e.pos.y) - 0.5, 0.5)
            : wallBehind
              ? { ...ground, y0: Math.max(ground.y0, Math.floor(e.pos.y)) }
              : kind === "player"
                ? figureFoot
                : ground;
        const figure = kind === "player" && !wallBehind;
        cut(
          [{ foot, planar: bolted, faceOnly: bolted, wallBehind, figure }],
          HEIGHT[kind] ?? 1.5,
          (c) => {
            if (kind === "camera" || kind === "laser" || kind === "guard")
              drawHazard(c, e, cam, scene);
            else if (kind === "player") drawPlayer(c, e, cam, scene);
            else if (kind === "gear")
              drawGear(
                c,
                e,
                cam,
                hatches.has(`${Math.floor(e.pos.x)},${Math.floor(e.pos.y)}`),
                scene,
              );
            else if (kind === "bell") drawBell(c, e, cam, scene);
            else if (kind === "lamp") drawLampSwitch(c, e, cam);
            else if (kind === "lever") drawLever(c, e, cam, scene);
            else if (kind === "keepsake") drawKeepsake(c, e, cam);
            else if (kind === "card") drawTargetCard(c, e, cam);
            else if (kind === "order") drawOrder(c, e, cam);
            else drawStanding(c, e, cam, scene);
          },
        );
      }
    }
    // the row's effects, last in it and cut by the light like what stands in it: a wall in front of
    // one, in a row further south, covers it as it would its object (FR15). An ordinary door's
    // opening is not cut: it is drawn out of the light too (ADR 0025 FR5), still in its row's order.
    const rowFx = fxByRow.get(y) ?? [];
    const doorFx = rowFx.filter((f) => f.door);
    const litFx = rowFx.filter((f) => !f.door);
    if (doorFx.length) drawFx(ctx, scene, cam, doorFx);
    if (litFx.length) {
      ctx.save();
      clipToLight(ctx, cam, light);
      drawFx(ctx, scene, cam, litFx);
      ctx.restore();
    }
  }
  // a mark in a place you can't see shows faintly through the haze: only a teammate's message,
  // never room state
  for (const e of scene.entities) {
    if (e.kind !== "stamp" || inSight(seen, e.pos)) continue;
    ctx.save();
    ctx.globalAlpha = FAINT_MARK;
    drawStanding(ctx, e, cam, scene);
    ctx.restore();
  }
  // a sign's own words (a plaque), over everything standing, like the names. Never cut by the light:
  // the plate floats over its tile and a cone edge across it would drop words. The server only sends a
  // sign whose tile was seen, and the words are the ones it sent, so a whole plate shows nothing new.
  for (const e of scene.entities) if (e.kind === "sign" && e.text) drawPlaque(ctx, e, cam, scene);
  // the UV pool and its ink: the one bold effect, over the mist (it is only sent where it is seen)
  drawUv(ctx, scene, cam);
  // the outline of a figure a wall hides: the figure itself, outline only, over the wall
  for (const f of figures) drawHidden(ctx, f, cam, scene, figureCover(cam, f.pos, tiles));
  // held hands: an arc from each towed figure to its leader
  for (const f of figures) {
    const leader = figures.find((g) => g.seat === f.heldBy);
    if (f.heldBy === undefined || !leader) continue;
    const join = motionT(scene, f.id, "join");
    const nowMs = scene.reducedMotion ? undefined : scene.nowMs;
    drawHold(ctx, cam, f.pos, leader.pos, f.pulling === true, {
      ...(join !== undefined ? { join } : {}),
      ...(nowMs !== undefined ? { nowMs } : {}),
    });
  }
  void block;
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

// Dust puffs (motion.ts `puff`) around a floor point, in the effect's tone.
function drawPuff(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  at: Vec,
  t: number,
  shape: PuffShape,
  tone: Fx["tone"],
) {
  const c = toScreen(cam, at.x, at.y);
  ctx.save();
  ctx.fillStyle = fxColor(tone);
  for (const p of puff(t, shape)) {
    ctx.globalAlpha = p.a;
    ctx.beginPath();
    ctx.arc(
      c.x + p.dx * cam.scale,
      c.y + p.dy * cam.scale * LIVE.depth,
      p.r * cam.scale,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

// What an effect draws apart from its object: the ring (a station solved, your landing), dust and
// puffs, the spark, gear or loot in flight, the dye cloud, the keepsake's lift and a secret door's
// slide. Each object's own motion (a plate sinking, a bell swinging) is its drawer's, read through
// `activeFx`. Drawn in the effect's own row, inside the row's clip to the light (FR15). With reduced
// motion nothing grows or flies: what is drawn only fades, or is not drawn at all.
// The decor on the wall tile under (x, y), if the scene has any.
const decorOf = (scene: Scene, x: number, y: number) =>
  scene.decor ? decorAt(scene.decor, Math.floor(x), Math.floor(y)) : {};

function drawFx(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  cam: Camera,
  list: NonNullable<Scene["fx"]>,
) {
  const still = !!scene.reducedMotion;
  for (const f of list) {
    const { x, y } = toScreen(cam, f.pos.x, f.pos.y);
    const grow = still ? 1 : 0.3 + 0.7 * f.age;
    ctx.save();
    ctx.globalAlpha = 0.85 * (1 - f.age);
    ctx.strokeStyle = fxColor(f.tone);
    ctx.fillStyle = fxColor(f.tone);
    ctx.lineWidth = 3;
    if (f.kind === "ring") {
      ctx.beginPath();
      const r = cam.scale * (f.big ? 1.6 : 0.9) * grow;
      ctx.ellipse(x, y, r, r * LIVE.depth, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (f.kind === "slide") {
      ctx.restore(); // the slide draws the door itself, over the floor the wall left
      drawSlide(ctx, f.pos, cam, f.age, still, decorOf(scene, f.pos.x, f.pos.y));
      continue;
    } else if (f.kind === "lift") {
      // the item rises off the plinth and fades (reduced motion: it only fades, in place)
      const rise = still ? 0 : f.age * cam.scale * 0.9;
      ctx.globalAlpha = 1 - f.age;
      if (f.keep) drawItem(ctx, f.keep, x, y - cam.scale * 0.5 - rise, cam.scale * 0.7);
    } else if (f.kind === "cloud") {
      ctx.restore(); // the cloud fades itself
      drawCloud(ctx, toScreen(cam, f.pos.x, f.pos.y, 0.5), cam.scale, f.age, still);
      continue;
    } else if (f.kind === "arc" && f.to && f.item) {
      // the gear's glyph flies from the giver to the taker in its first 250 ms (reduced motion: it is
      // simply there, so nothing is drawn in flight)
      const t = f.age / 0.4;
      if (!still && t < 1) {
        ctx.globalAlpha = 1;
        const p = arc(t, f.pos, f.to, 0.5);
        const c = toScreen(cam, p.x, p.y, 0.8);
        gearGlyph(ctx, f.item, c.x, c.y, cam.scale * 0.18);
      }
    } else if (f.kind === "loot") {
      // the loot hops and arcs to the nearest figure, then sparks there (reduced motion: it fades in
      // place over 150 ms)
      if (still) {
        ctx.globalAlpha = Math.max(0, 1 - (f.age * DURATION.loot) / 150);
        diamond(ctx, x, y - cam.scale * 0.5, cam.scale * 0.3);
        ctx.fill();
      } else if (f.age < 0.7) {
        const t = f.age / 0.7;
        const p = arc(t, f.pos, f.to ?? f.pos, 0.8);
        const c = toScreen(cam, p.x, p.y, 0.5);
        ctx.globalAlpha = 1;
        diamond(ctx, c.x, c.y, cam.scale * 0.3 * (1 - 0.5 * t));
        ctx.fill();
      } else {
        const to = f.to ?? f.pos;
        drawSpark(ctx, cam, to, (f.age - 0.7) / 0.3, 1);
      }
    } else if (f.kind === "spark") {
      // a flash of rays: none under reduced motion, where the thing it marks shows its end state
      if (!still) drawSpark(ctx, cam, f.pos, f.age, grow);
    } else if (f.kind === "crate") {
      ctx.restore();
      if (!still) drawPuff(ctx, cam, f.pos, f.age, "trail", f.tone);
      continue;
    } else if (f.kind === "curtain" || f.kind === "dust") {
      ctx.restore();
      if (!still) drawPuff(ctx, cam, f.pos, f.age, f.kind === "dust" ? "side" : "curtain", f.tone);
      continue;
    } else if (f.kind === "door") {
      ctx.restore(); // the door's own leaves part and sink (blocks.ts)
      if (!still) drawDoorOpening(ctx, cam, f.pos, f.age);
      continue;
    } else if (f.kind === "caught") {
      // a burst where the figure was, in its first 200 ms; it pops up at the flag (figures.ts)
      ctx.restore();
      const t = (f.age * DURATION.caught) / 200;
      if (!still && t < 1) drawPuff(ctx, cam, f.pos, t, "burst", f.tone);
      continue;
    } else if (f.kind === "unjoin" && f.to) {
      // hands let go: the two beads draw back to their own figures (the join is drawHold's)
      ctx.restore();
      if (!still) drawLetGo(ctx, cam, f.pos, f.to, f.age);
      continue;
    }
    ctx.restore();
  }
}

// A spark: eight short rays out of a point, `t` 0 to 1 through its life.
function drawSpark(ctx: CanvasRenderingContext2D, cam: Camera, at: Vec, t: number, grow: number) {
  const c = toScreen(cam, at.x, at.y, 0.5);
  ctx.globalAlpha = 0.85 * (1 - t);
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
