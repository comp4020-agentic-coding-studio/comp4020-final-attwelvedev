import type { Stamp } from "../../game/channels.ts";
import type { Role, Seat, Vec } from "../../game/types.ts";
import type { EntityView } from "../../net/protocol.ts";
import type { Fx } from "../fx.ts";
import { COLOR, MAP, ROLE_COLOR, setDusk, WORLD } from "../tokens.ts";
import { drawAlarm } from "./alarm.ts";
import { drawBackdrop } from "./backdrop.ts";
import { block, drawFlat, drawStanding, floorTop, glass, vent, wall } from "./blocks.ts";
import { drawOwnBlind, drawPlayer } from "./figures.ts";
import { drawHazard, drawSight } from "./hazards.ts";
import { drawEdgePills, drawPops } from "./pops.ts";
import { type Camera, camera, TILT, tileWindow, toScreen } from "./project.ts";
import { inSight, nightTile, seenOf, veilTile } from "./sight.ts";

export { type Camera, camera, fromScreen, TILT, toScreen } from "./project.ts";

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
  // The view's `seen`: the tiles in your line of sight. Present for the sighted, who draw everything
  // else under mist; absent for watchers, who see the whole room.
  seen?: string[];
  bots?: [boolean, boolean, boolean]; // by seat: a bot's figure has an antenna
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

const FADED_WALL = 0.35; // a wall in front of a figure
const FAINT_MARK = 0.35; // a mark in a tile you cannot see
const isBlock = (ch: string | undefined) => ch === "#" || ch === "%" || ch === "=";

// Entities drawn flat on the floor, under everything standing up in their row.
const FLAT: EntityView["kind"][] = ["plate", "exit", "hide", "sign", "door"];
// Things that stand up out of the floor, and the figures, in painter's order within a row.
const STANDING: EntityView["kind"][] = [
  "door",
  "crate",
  "checkpoint",
  "loot",
  "camera",
  "laser",
  "guard",
  "player",
  "stamp",
];

// Draws one frame. Can't see gets a black field and a dim ring and nothing
// else; the renderer is told nothing more than that player was sent.
export function draw(ctx: CanvasRenderingContext2D, scene: Scene): void {
  ctx.clearRect(0, 0, scene.w, scene.h);
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
  const cam = camera(scene);
  drawBackdrop(ctx, scene, cam);

  const win = tileWindow(cam, scene.w, scene.h, tiles[0]?.length ?? 0, tiles.length);
  const byRow = new Map<number, EntityView[]>();
  for (const e of scene.entities) {
    const shown =
      e.kind === "player" && e.seat === scene.seat && scene.self ? { ...e, pos: scene.self } : e;
    const row = Math.floor(shown.pos.y);
    byRow.set(row, [...(byRow.get(row) ?? []), shown]);
  }
  // figures, to see which walls stand between them and the viewer
  const figures = scene.entities.filter((e) => e.kind === "player" && e.state !== "dim");

  // floor tops first, so no block front is painted over by the floor of the row behind it
  for (let y = win.y0; y <= win.y1; y++) {
    const row = tiles[y] ?? "";
    for (let x = win.x0; x <= win.x1; x++) {
      const ch = row[x];
      if (ch === " ") nightTile(ctx, cam, tiles, x, y);
      else if (!isBlock(ch)) floorTop(ctx, cam, x, y, WORLD.floor);
      else if (ch === "=") floorTop(ctx, cam, x, y, WORLD.floor); // glass stands on the floor
    }
  }
  for (const e of scene.entities)
    if (FLAT.includes(e.kind) && !(e.kind === "door" && e.state !== "open"))
      drawFlat(ctx, e, cam, scene);
  for (const e of scene.entities) if (e.kind === "sight") drawSight(ctx, e, cam);

  const seenNow = scene.seen ? seenOf(scene.seen) : null;
  // north to south: blocks of the row, then what stands in it
  for (let y = win.y0; y <= win.y1; y++) {
    const row = tiles[y] ?? "";
    for (let x = win.x0; x <= win.x1; x++) {
      const ch = row[x];
      if (!isBlock(ch)) continue;
      // a wall whose front covers a figure standing north of it
      const hides = figures.some((f) => {
        const fx = Math.floor(f.pos.x);
        return fx === x && f.pos.y < y && f.pos.y > y - TILT.wall / TILT.depth;
      });
      ctx.save();
      if (hides) ctx.globalAlpha = FADED_WALL;
      if (ch === "#") wall(ctx, cam, x, y, !isBlock((tiles[y + 1] ?? "")[x]));
      else if (ch === "%") vent(ctx, cam, x, y);
      else glass(ctx, cam, x, y);
      ctx.restore();
    }
    for (const kind of STANDING) {
      for (const e of byRow.get(y) ?? []) {
        if (e.kind !== kind) continue;
        if (kind === "door" && e.state === "open") continue;
        if (kind === "stamp" && !inSight(seenNow, e.pos)) continue; // drawn through the mist, below
        if (kind === "camera" || kind === "laser" || kind === "guard")
          drawHazard(ctx, e, cam, scene);
        else if (kind === "player") drawPlayer(ctx, e, cam, scene);
        else drawStanding(ctx, e, cam, scene);
      }
    }
  }
  // the mist: every tile outside your line of sight, over its floor, its block and what stands on it
  const seen = scene.seen ? seenOf(scene.seen) : null;
  if (seen) {
    for (let y = win.y0; y <= win.y1; y++) {
      const row = tiles[y] ?? "";
      for (let x = win.x0; x <= win.x1; x++) {
        if (seen.has(x, y) || row[x] === " ") continue;
        veilTile(ctx, cam, x, y, isBlock(row[x]) ? TILT.wall : 0);
      }
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
  // the dashed silhouette of a figure behind a faded wall
  for (const f of figures) {
    const fx = Math.floor(f.pos.x);
    const fy = Math.floor(f.pos.y);
    const behind = [fy + 1, fy + 2].some(
      (ry) => isBlock((tiles[ry] ?? "")[fx]) && f.pos.y > ry - TILT.wall / TILT.depth,
    );
    if (!behind) continue;
    const foot = toScreen(cam, f.pos.x, f.pos.y);
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = WORLD.line;
    ctx.beginPath();
    ctx.roundRect(
      foot.x - cam.scale * 0.31,
      foot.y - cam.scale * 0.95,
      cam.scale * 0.62,
      cam.scale * 0.95,
      cam.scale * 0.31,
    );
    ctx.stroke();
    ctx.restore();
  }
  void block;
  drawFx(ctx, scene, cam);
  drawPops(ctx, scene, cam);
  drawEdgePills(ctx, scene, cam);
  if (scene.alarm) drawAlarm(ctx, scene);
}

// Read per frame, so it follows high contrast.
const fxColor = (tone: "goal" | "danger" | "ui" | "muted") =>
  ({ goal: COLOR.goal, danger: COLOR.danger, ui: COLOR.ui, muted: COLOR.uiMuted })[tone];

// Each effect is one shape that fades over its short life. It grows as it fades,
// unless the player asked for reduced motion, in which case it only fades. Rings lie on the
// floor, so the tilt squashes them.
function drawFx(ctx: CanvasRenderingContext2D, scene: Scene, cam: Camera) {
  for (const f of scene.fx ?? []) {
    const at = toScreen(cam, f.pos.x, f.pos.y);
    const { x, y } = at;
    const grow = scene.reducedMotion ? 1 : 0.3 + 0.7 * f.age;
    ctx.save();
    ctx.globalAlpha = 0.85 * (1 - f.age);
    ctx.strokeStyle = fxColor(f.tone);
    ctx.fillStyle = fxColor(f.tone);
    ctx.lineWidth = 3;
    if (f.kind === "ring") {
      ctx.beginPath();
      const r = cam.scale * (f.big ? 1.6 : 0.9) * grow;
      ctx.ellipse(x, y, r, r * TILT.depth, 0, 0, Math.PI * 2);
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
