import { STAMP_LIFE_MS, type Stamp } from "../game/channels.ts";
import type { Role, Seat, Vec } from "../game/types.ts";
import type { EntityView } from "../net/protocol.ts";
import { STAMP_FACE } from "./hud.ts";
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
  pops?: FacePop[]; // faces shown above their senders
}

export interface FacePop {
  seat: Seat;
  img: CanvasImageSource;
  fade: number; // 1 while fully shown, down to 0 as it goes
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

// A stamp is a small plate with its mark, fading over its life but never
// quite gone until the server drops it.
function drawStamp(
  ctx: CanvasRenderingContext2D,
  id: Stamp,
  x: number,
  y: number,
  s: number,
  ageMs: number,
) {
  const word = id === "door" || id === "key";
  ctx.save();
  ctx.globalAlpha = Math.max(0.25, 1 - ageMs / STAMP_LIFE_MS);
  // at the sender's feet: below their avatar, which is drawn first and would hide it
  y += s * 0.65;
  const w = s * (word ? 1.3 : 0.8);
  const h = s * 0.7;
  ctx.fillStyle = COLOR.bg;
  ctx.strokeStyle = COLOR.ui;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLOR.ui;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(s * (word ? 0.4 : 0.65))}px system-ui, sans-serif`;
  ctx.fillText(STAMP_FACE[id], x, y + 1);
  ctx.restore();
}

function drawPops(ctx: CanvasRenderingContext2D, scene: Scene, cam: Camera) {
  for (const pop of scene.pops ?? []) {
    const who = scene.entities.find((e) => e.kind === "player" && e.seat === pop.seat);
    if (!who) continue;
    const at = pop.seat === scene.seat && scene.self ? scene.self : who.pos; // own avatar is drawn predicted
    const size = Math.max(28, cam.scale * 1.5);
    const x = cam.ox + at.x * cam.scale;
    const y = cam.oy + at.y * cam.scale - cam.scale * MAP.avatarRadius * 1.1 - size;
    ctx.save();
    ctx.globalAlpha = pop.fade;
    ctx.drawImage(pop.img, x - size / 2, y, size, size);
    ctx.restore();
  }
}

function diamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
}

// A guard's sight: a wedge of `range` tiles either side of where it faces,
// hatched so it never rests on colour alone.
function drawCone(ctx: CanvasRenderingContext2D, e: EntityView, px: number, py: number, s: number) {
  if (!e.cone) return;
  const facing = Math.atan2(e.facing?.y ?? 0, e.facing?.x ?? 1);
  const half = (e.cone.fovDeg / 2) * (Math.PI / 180);
  const r = e.cone.range * s;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.arc(px, py, r, facing - half, facing + half);
  ctx.closePath();
  ctx.clip();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = COLOR.danger;
  ctx.fillRect(px - r, py - r, r * 2, r * 2);
  ctx.globalAlpha = 0.5;
  hatch(ctx, px - r, py - r, r * 2, r * 2, COLOR.danger);
  ctx.restore();
}

// A camera's zone is hatched while it is watching and only outlined when idle.
function drawZone(ctx: CanvasRenderingContext2D, e: EntityView, cam: Camera) {
  if (!e.zone) return;
  const [x0, y0, x1, y1] = e.zone;
  const x = cam.ox + x0 * cam.scale;
  const y = cam.oy + y0 * cam.scale;
  const w = (x1 - x0 + 1) * cam.scale;
  const h = (y1 - y0 + 1) * cam.scale;
  ctx.save();
  if (e.state === "watching") {
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = COLOR.cameraLight;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 0.55;
    hatch(ctx, x, y, w, h, COLOR.cameraLight);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOR.cameraLight;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  } else {
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOR.uiMuted;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }
  ctx.restore();
}

// A beam is a steady line while on and a faint dotted one while off: it never
// flickers, so nothing here can flash.
function drawBeam(
  ctx: CanvasRenderingContext2D,
  e: EntityView,
  px: number,
  py: number,
  cam: Camera,
) {
  const beam = e.beam ?? [];
  const last = beam[beam.length - 1];
  if (!last) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(cam.ox + last.x * cam.scale, cam.oy + last.y * cam.scale);
  if (e.state === "on") {
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLOR.danger;
  } else {
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = COLOR.uiMuted;
    ctx.setLineDash([2, 6]);
  }
  ctx.stroke();
  ctx.restore();
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
  } else if (e.kind === "camera") {
    drawZone(ctx, e, cam);
    const watching = e.state === "watching";
    ctx.fillStyle = COLOR.bg;
    ctx.strokeStyle = watching ? COLOR.cameraLight : COLOR.uiMuted;
    ctx.lineWidth = 2;
    ctx.fillRect(left + s * 0.2, top + s * 0.3, s * 0.6, s * 0.4);
    ctx.strokeRect(left + s * 0.2, top + s * 0.3, s * 0.6, s * 0.4);
    ctx.beginPath();
    ctx.arc(px, py, s * 0.11, 0, Math.PI * 2);
    ctx.fillStyle = watching ? COLOR.cameraLight : COLOR.uiMuted;
    ctx.fill();
  } else if (e.kind === "laser") {
    drawBeam(ctx, e, px, py, cam);
    ctx.fillStyle = COLOR.bg;
    ctx.strokeStyle = COLOR.danger;
    ctx.lineWidth = 2;
    ctx.fillRect(left + s * 0.25, top + s * 0.25, s * 0.5, s * 0.5);
    ctx.strokeRect(left + s * 0.25, top + s * 0.25, s * 0.5, s * 0.5);
  } else if (e.kind === "guard") {
    drawCone(ctx, e, px, py, s);
    diamond(ctx, px, py, s * 0.45);
    ctx.fillStyle = COLOR.danger;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOR.bg;
    ctx.stroke();
  } else if (e.kind === "hide") {
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOR.uiMuted;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(left + s * 0.1, top + s * 0.1, s * 0.8, s * 0.8);
    ctx.setLineDash([]);
  } else if (e.kind === "checkpoint") {
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOR.ui;
    ctx.beginPath();
    ctx.moveTo(left + s * 0.3, top + s * 0.85);
    ctx.lineTo(left + s * 0.3, top + s * 0.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(left + s * 0.3, top + s * 0.15);
    ctx.lineTo(left + s * 0.8, top + s * 0.32);
    ctx.lineTo(left + s * 0.3, top + s * 0.5);
    ctx.closePath();
    ctx.fillStyle = e.state === "reached" ? COLOR.goal : COLOR.ui;
    ctx.fill();
  } else if (e.kind === "loot") {
    diamond(ctx, px, py, s * 0.3);
    ctx.fillStyle = COLOR.goal;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOR.bg;
    ctx.stroke();
  } else if (e.kind === "sign") {
    const glyphs = (e.shows ?? []).map((id) => id.replace(/^p/, "")).join(" ");
    const w = Math.max(s, s * 0.34 * glyphs.length + s * 0.3);
    ctx.fillStyle = COLOR.panel;
    ctx.strokeStyle = COLOR.ui;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(px - w / 2, py - s * 0.35, w, s * 0.7, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLOR.ui;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(s * 0.4)}px system-ui, sans-serif`;
    ctx.fillText(glyphs, px, py + 1);
  } else if (e.kind === "stamp" && e.state) {
    drawStamp(ctx, e.state as Stamp, px, py, s, e.age ?? 0);
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
  const order: EntityView["kind"][] = [
    "plate",
    "door",
    "crate",
    "exit",
    "hide",
    "checkpoint",
    "loot",
    "sign",
    "camera",
    "laser",
    "guard",
    "player",
    "stamp",
  ];
  for (const kind of order) {
    for (const e of scene.entities) {
      if (e.kind !== kind) continue;
      // our own avatar is drawn where we predict it, not where the last view put it
      const shown =
        e.kind === "player" && e.seat === scene.seat && scene.self ? { ...e, pos: scene.self } : e;
      drawEntity(ctx, shown, cam, scene);
    }
  }
  drawPops(ctx, scene, cam);
}
