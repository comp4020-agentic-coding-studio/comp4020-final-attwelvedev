import type { Role, Seat, Vec } from "../game/types.ts";
import type { EntityView } from "../net/protocol.ts";
import { COLOR, MAP, ROLE_COLOR, ROLE_SHAPE, type Shape } from "./tokens.ts";

export interface Scene {
  w: number; // canvas size in CSS pixels
  h: number;
  role: Role;
  seat: Seat;
  roles: [Role, Role, Role]; // by seat, from the reveal
  tiles: string[] | null; // null for Can't see
  entities: EntityView[];
  self: Vec | null; // own position, null for Can't see
  layout: "fit" | "follow"; // desktop fits the room, phone follows the team
}

export interface Camera {
  scale: number; // pixels per tile
  ox: number; // pixel position of tile (0, 0)
  oy: number;
}

// Where the window sits along one axis: centred on `want`, but never so far
// from `self` that it would leave them closer than `margin` to the edge, and
// never past the room's edges (a room smaller than the window is centred).
function windowStart(
  want: number,
  self: number,
  view: number,
  room: number,
  margin: number,
): number {
  if (room <= view) return (room - view) / 2;
  const reach = Math.max(0, view / 2 - margin);
  const centre = Math.max(self - reach, Math.min(self + reach, want));
  return Math.max(0, Math.min(room - view, centre - view / 2));
}

export function camera(scene: Scene): Camera {
  const roomW = scene.tiles?.[0]?.length ?? 1;
  const roomH = scene.tiles?.length ?? 1;
  const fit = Math.min(scene.w / roomW, scene.h / roomH);
  if (scene.layout === "fit" || roomW * MAP.phoneTilePx <= scene.w) {
    const scale = Math.max(fit, 1);
    return { scale, ox: (scene.w - roomW * scale) / 2, oy: (scene.h - roomH * scale) / 2 };
  }
  const scale = MAP.phoneTilePx;
  const players = scene.entities.filter((e) => e.kind === "player");
  const centroid =
    players.length === 0
      ? (scene.self ?? { x: roomW / 2, y: roomH / 2 })
      : {
          x: players.reduce((sum, p) => sum + p.pos.x, 0) / players.length,
          y: players.reduce((sum, p) => sum + p.pos.y, 0) / players.length,
        };
  const self = scene.self ?? centroid;
  const viewW = scene.w / scale;
  const viewH = scene.h / scale;
  const left = windowStart(centroid.x, self.x, viewW, roomW, MAP.edgeMarginTiles);
  const top = windowStart(centroid.y, self.y, viewH, roomH, MAP.edgeMarginTiles);
  return { scale, ox: -left * scale, oy: -top * scale };
}

function shapePath(ctx: CanvasRenderingContext2D, shape: Shape, cx: number, cy: number, r: number) {
  ctx.beginPath();
  if (shape === "circle") ctx.arc(cx, cy, r, 0, Math.PI * 2);
  else if (shape === "square") ctx.rect(cx - r, cy - r, r * 2, r * 2);
  else {
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy + r * 0.85);
    ctx.lineTo(cx - r, cy + r * 0.85);
    ctx.closePath();
  }
}

// Diagonal hatching inside a rectangle: a texture, so state never rests on colour alone.
function hatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let d = -h; d < w; d += MAP.hatchPx) {
    ctx.moveTo(x + d, y + h);
    ctx.lineTo(x + d + h, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawTiles(ctx: CanvasRenderingContext2D, tiles: string[], cam: Camera) {
  ctx.fillStyle = COLOR.solid;
  for (let y = 0; y < tiles.length; y++) {
    const row = tiles[y] ?? "";
    for (let x = 0; x < row.length; x++) {
      if (row[x] === "#")
        ctx.fillRect(
          cam.ox + x * cam.scale,
          cam.oy + y * cam.scale,
          cam.scale + 0.5,
          cam.scale + 0.5,
        );
    }
  }
}

function drawEntity(ctx: CanvasRenderingContext2D, e: EntityView, cam: Camera, scene: Scene) {
  const s = cam.scale;
  const px = cam.ox + e.pos.x * s;
  const py = cam.oy + e.pos.y * s;
  const left = px - s / 2;
  const top = py - s / 2;
  if (e.kind === "plate") {
    const inset = s * MAP.plateInset;
    ctx.lineWidth = 2;
    ctx.strokeStyle = e.state === "pressed" ? COLOR.goal : COLOR.ui;
    ctx.strokeRect(left + inset, top + inset, s - inset * 2, s - inset * 2);
    if (e.state === "pressed") {
      ctx.fillStyle = COLOR.goal;
      ctx.fillRect(left + inset * 2, top + inset * 2, s - inset * 4, s - inset * 4);
    }
  } else if (e.kind === "door") {
    if (e.state === "open") {
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLOR.uiMuted;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(left + 1, top + 1, s - 2, s - 2);
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = COLOR.panel;
      ctx.fillRect(left, top, s, s);
      hatch(ctx, left, top, s, s, COLOR.ui);
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLOR.ui;
      ctx.strokeRect(left + 1, top + 1, s - 2, s - 2);
    }
  } else if (e.kind === "crate") {
    const inset = s * 0.08;
    ctx.fillStyle = COLOR.crate;
    ctx.fillRect(left + inset, top + inset, s - inset * 2, s - inset * 2);
    ctx.strokeStyle = COLOR.bg;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left + inset, top + inset);
    ctx.lineTo(left + s - inset, top + s - inset);
    ctx.moveTo(left + s - inset, top + inset);
    ctx.lineTo(left + inset, top + s - inset);
    ctx.stroke();
  } else if (e.kind === "exit") {
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = COLOR.goal;
    ctx.fillRect(left, top, s, s);
    ctx.globalAlpha = 1;
    hatch(ctx, left, top, s, s, COLOR.goal);
  } else if (e.kind === "player" && e.seat !== undefined) {
    const role = scene.roles[e.seat] ?? "blind";
    const isSelf = e.seat === scene.seat;
    shapePath(ctx, ROLE_SHAPE[role], px, py, s * MAP.avatarRadius * 1.1);
    ctx.fillStyle = ROLE_COLOR[role];
    ctx.fill();
    ctx.lineWidth = isSelf ? 3 : 2;
    ctx.strokeStyle = isSelf ? COLOR.ui : COLOR.bg;
    ctx.stroke();
  }
}

// Draws one frame. Can't see gets a black field and a dim ring and nothing
// else; the renderer is told nothing more than that player was sent.
export function draw(ctx: CanvasRenderingContext2D, scene: Scene): void {
  ctx.clearRect(0, 0, scene.w, scene.h);
  if (scene.role === "blind" || !scene.tiles) {
    ctx.fillStyle = COLOR.ink;
    ctx.fillRect(0, 0, scene.w, scene.h);
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
  const cam = camera(scene);
  ctx.fillStyle = COLOR.floor;
  ctx.fillRect(0, 0, scene.w, scene.h);
  drawTiles(ctx, scene.tiles, cam);
  const order: EntityView["kind"][] = ["plate", "door", "crate", "exit", "player"];
  for (const kind of order) {
    for (const e of scene.entities) {
      if (e.kind !== kind) continue;
      // our own avatar is drawn where we predict it, not where the last view put it
      const shown =
        e.kind === "player" && e.seat === scene.seat && scene.self ? { ...e, pos: scene.self } : e;
      drawEntity(ctx, shown, cam, scene);
    }
  }
}
