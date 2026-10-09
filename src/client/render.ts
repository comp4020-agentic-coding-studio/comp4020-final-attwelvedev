import { STAMP_LIFE_MS, type Stamp } from "../game/channels.ts";
import { visiblePolygon } from "../game/cone.ts";
import type { Role, Seat, Vec } from "../game/types.ts";
import type { EntityView } from "../net/protocol.ts";
import type { Fx } from "./fx.ts";
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
  fx?: (Fx & { age: number })[]; // small effects, each with how far through its life it is (0 to 1)
  alarm?: boolean; // the alarm is on: a red border and banner
  nowMs?: number; // the clock the alarm pulse follows
  reducedMotion?: boolean; // a static alarm, no pulse
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
  // a space is a tile inside a dark zone: the server sends nothing about it
  for (const [ch, color] of [
    ["#", COLOR.solid],
    [" ", COLOR.ink],
  ] as const) {
    ctx.fillStyle = color;
    for (let y = 0; y < tiles.length; y++) {
      const row = tiles[y] ?? "";
      for (let x = 0; x < row.length; x++) {
        if (row[x] === ch)
          ctx.fillRect(
            cam.ox + x * cam.scale,
            cam.oy + y * cam.scale,
            cam.scale + 0.5,
            cam.scale + 0.5,
          );
      }
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

// What blocks sight, as the server counts it: walls, closed doors and hide spots
// (cover). Built once per frame and shared by every cone drawn in it.
const blockerCache = new WeakMap<Scene, (tx: number, ty: number) => boolean>();
function blockedFor(scene: Scene): (tx: number, ty: number) => boolean {
  const cached = blockerCache.get(scene);
  if (cached) return cached;
  const solid = new Set<string>();
  for (const e of scene.entities) {
    const closedDoor = e.kind === "door" && e.state === "closed";
    if (closedDoor || e.kind === "hide") solid.add(`${Math.floor(e.pos.x)},${Math.floor(e.pos.y)}`);
  }
  const fn = (tx: number, ty: number) =>
    scene.tiles?.[ty]?.[tx] === "#" || solid.has(`${tx},${ty}`);
  blockerCache.set(scene, fn);
  return fn;
}

// A hazard's sight (a guard's, a camera's): a fan of rays that stops at walls, closed
// doors and cover, so it leaves a shadow behind them, as the real rule does. Lit and
// hatched while it is looking; a camera that is looking away is only an outline,
// so it never rests on colour alone.
function drawCone(
  ctx: CanvasRenderingContext2D,
  e: EntityView,
  cam: Camera,
  scene: Scene,
  color: string,
  looking: boolean,
) {
  if (!e.cone) return;
  const poly = visiblePolygon(
    {
      origin: e.cone.from ?? e.pos,
      facing: e.facing ?? { x: 1, y: 0 },
      fovDeg: e.cone.fovDeg,
      range: e.cone.range,
    },
    blockedFor(scene),
  );
  const pts = poly.map((p) => ({ x: cam.ox + p.x * cam.scale, y: cam.oy + p.y * cam.scale }));
  // its own path object: the hatching below starts paths of its own
  const shape = new Path2D();
  pts.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x, p.y);
    else shape.lineTo(p.x, p.y);
  });
  shape.closePath();
  ctx.save();
  if (looking) {
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
    const [w, h] = [Math.max(...xs) - x0, Math.max(...ys) - y0];
    ctx.save();
    ctx.clip(shape);
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = color;
    ctx.fillRect(x0, y0, w, h);
    ctx.globalAlpha = 0.5;
    hatch(ctx, x0, y0, w, h, color);
    ctx.restore();
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke(shape);
  } else {
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOR.uiMuted;
    ctx.globalAlpha = 0.6;
    ctx.setLineDash([4, 4]);
    ctx.stroke(shape);
  }
  ctx.restore();
}

// A security camera turned the way it looks: a body with a lens. Watching, the
// lens is open and filled with rays coming out of it; idle, the eye is shut (a
// bar across an empty lens), so the state is in the shape and not only the colour.
function drawCamera(
  ctx: CanvasRenderingContext2D,
  e: EntityView,
  px: number,
  py: number,
  s: number,
) {
  const watching = e.state === "watching";
  const aim = Math.atan2(e.facing?.y ?? 1, e.facing?.x ?? 0); // the lens points where it looks
  const ink = watching ? COLOR.cameraLight : COLOR.uiMuted;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(aim);
  ctx.lineWidth = 2;
  ctx.strokeStyle = ink;
  ctx.fillStyle = COLOR.bg;
  ctx.beginPath(); // the body, with a mount stub behind it
  ctx.roundRect(-s * 0.45, -s * 0.24, s * 0.55, s * 0.48, 3);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-s * 0.45, 0);
  ctx.lineTo(-s * 0.58, 0);
  ctx.stroke();
  ctx.beginPath(); // the lens
  ctx.arc(s * 0.3, 0, s * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (watching) {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(s * 0.3, 0, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath(); // rays out of the lens
    for (const a of [-0.45, 0, 0.45]) {
      ctx.moveTo(s * 0.3 + Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3);
      ctx.lineTo(s * 0.3 + Math.cos(a) * s * 0.46, Math.sin(a) * s * 0.46);
    }
    ctx.stroke();
  } else {
    ctx.beginPath(); // the eye is shut
    ctx.moveTo(s * 0.3 - s * 0.2, 0);
    ctx.lineTo(s * 0.3 + s * 0.2, 0);
    ctx.stroke();
  }
  ctx.restore();
}

// The code on the floor: "7 > 1 > 4". Plates already pressed in order turn green,
// and a thin line under the sign drains over the 5 s you have to press the next
// one. Quiet on purpose: you only need it once you are partway through.
function drawSign(ctx: CanvasRenderingContext2D, e: EntityView, px: number, py: number, s: number) {
  const ids = (e.shows ?? []).map((id) => id.replace(/^p/, ""));
  const done = e.progress ?? 0;
  const sep = " > ";
  ctx.save();
  ctx.font = `700 ${Math.round(s * 0.4)}px system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const widths = ids.map((id) => ctx.measureText(id).width);
  const sepW = ctx.measureText(sep).width;
  const textW = widths.reduce((sum, w) => sum + w, 0) + sepW * Math.max(0, ids.length - 1);
  const w = Math.max(s, textW + s * 0.4);
  const top = py - s * 0.35;
  ctx.fillStyle = COLOR.panel;
  ctx.strokeStyle =
    e.flash === "wrong"
      ? COLOR.danger
      : e.flash === "ok" || done >= ids.length
        ? COLOR.goal
        : COLOR.ui;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(px - w / 2, top, w, s * 0.7, 3);
  ctx.fill();
  ctx.stroke();
  let x = px - textW / 2;
  ids.forEach((id, i) => {
    ctx.fillStyle = i < done ? COLOR.goal : COLOR.ui;
    ctx.fillText(id, x, py + 1);
    x += widths[i] ?? 0;
    if (i < ids.length - 1) {
      ctx.fillStyle = COLOR.uiMuted;
      ctx.fillText(sep, x, py + 1);
      x += sepW;
    }
  });
  if (e.window !== undefined) {
    ctx.fillStyle = e.window < 0.3 ? COLOR.danger : COLOR.uiMuted;
    ctx.fillRect(px - w / 2, top + s * 0.7 + 3, w * e.window, 3);
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
    // the plate's number, so a sign that says "7 1 4" can be matched to the floor
    ctx.fillStyle = e.state === "pressed" ? COLOR.bg : COLOR.ui;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(s * 0.5)}px system-ui, sans-serif`;
    ctx.fillText(e.id.replace(/^p/, ""), px, py + 1);
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
    ctx.globalAlpha = e.state === "occupied" ? 0.6 : 0.3; // someone is standing on it
    ctx.fillStyle = COLOR.goal;
    ctx.fillRect(left, top, s, s);
    ctx.globalAlpha = 1;
    hatch(ctx, left, top, s, s, COLOR.goal);
  } else if (e.kind === "camera") {
    drawCone(ctx, e, cam, scene, COLOR.cameraLight, e.state === "watching");
    drawCamera(ctx, e, px, py, s * 1.25);
  } else if (e.kind === "laser") {
    drawBeam(ctx, e, px, py, cam);
    ctx.fillStyle = COLOR.bg;
    ctx.strokeStyle = COLOR.danger;
    ctx.lineWidth = 2;
    ctx.fillRect(left + s * 0.25, top + s * 0.25, s * 0.5, s * 0.5);
    ctx.strokeRect(left + s * 0.25, top + s * 0.25, s * 0.5, s * 0.5);
  } else if (e.kind === "sight") {
    // What a hazard in the dark can see, in the light: drawn as any cone is, and nothing of
    // the hazard itself or where it stands.
    const color = e.state === "watching" ? COLOR.cameraLight : COLOR.danger;
    for (const poly of e.polys ?? []) {
      const pts = poly.map((p) => ({ x: cam.ox + p.x * s, y: cam.oy + p.y * s }));
      const trace = () => {
        ctx.beginPath();
        pts.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
      };
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
      const [w, h] = [Math.max(...xs) - x0, Math.max(...ys) - y0];
      ctx.save();
      trace();
      ctx.clip();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = color;
      ctx.fillRect(x0, y0, w, h);
      ctx.globalAlpha = 0.5;
      hatch(ctx, x0, y0, w, h, color);
      ctx.restore();
      ctx.save();
      trace();
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.restore();
    }
  } else if (e.kind === "guard") {
    drawCone(ctx, e, cam, scene, COLOR.danger, true);
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
    if (e.state !== "reached") {
      // three pips: one filled for each player at the flag; all three sets it
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(left + s * (0.3 + i * 0.2), top + s * 0.94, s * 0.06, 0, Math.PI * 2);
        if (i < (e.present ?? 0)) {
          ctx.fillStyle = COLOR.ui;
          ctx.fill();
        } else {
          ctx.lineWidth = 1;
          ctx.strokeStyle = COLOR.uiMuted;
          ctx.stroke();
        }
      }
    }
  } else if (e.kind === "loot") {
    diamond(ctx, px, py, s * 0.3);
    ctx.fillStyle = COLOR.goal;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOR.bg;
    ctx.stroke();
  } else if (e.kind === "sign") {
    drawSign(ctx, e, px, py, s);
  } else if (e.kind === "stamp" && e.state) {
    drawStamp(ctx, e.state as Stamp, px, py, s, e.age ?? 0);
  } else if (e.kind === "player" && e.seat !== undefined) {
    const role = scene.roles[e.seat] ?? "blind";
    const isSelf = e.seat === scene.seat;
    shapePath(ctx, ROLE_SHAPE[role], px, py, s * MAP.avatarRadius * 1.1);
    if (e.state === "hidden") {
      // on a hide spot: faint, with a dashed outline, so you can see you are hidden
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = ROLE_COLOR[role];
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = isSelf ? COLOR.ui : COLOR.uiMuted;
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    if (e.state === "dim") {
      // in the dark you are only a ring
      ctx.globalAlpha = MAP.blindRingAlpha;
      ctx.lineWidth = MAP.ringWidthPx;
      ctx.strokeStyle = ROLE_COLOR[role];
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
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
    "sight",
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
  drawFx(ctx, scene, cam);
  drawPops(ctx, scene, cam);
  if (scene.alarm) drawAlarm(ctx, scene);
}

const FX_COLOR = { goal: COLOR.goal, danger: COLOR.danger, ui: COLOR.ui, muted: COLOR.uiMuted };

// Each effect is one shape that fades over its short life. It grows as it fades,
// unless the player asked for reduced motion, in which case it only fades.
function drawFx(ctx: CanvasRenderingContext2D, scene: Scene, cam: Camera) {
  for (const f of scene.fx ?? []) {
    const x = cam.ox + f.pos.x * cam.scale;
    const y = cam.oy + f.pos.y * cam.scale;
    const grow = scene.reducedMotion ? 1 : 0.3 + 0.7 * f.age;
    ctx.save();
    ctx.globalAlpha = 0.85 * (1 - f.age);
    ctx.strokeStyle = FX_COLOR[f.tone];
    ctx.fillStyle = FX_COLOR[f.tone];
    ctx.lineWidth = 3;
    if (f.kind === "ring") {
      ctx.beginPath();
      ctx.arc(x, y, cam.scale * (f.big ? 1.6 : 0.9) * grow, 0, Math.PI * 2);
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
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.moveTo(
          x + Math.cos(a) * cam.scale * 0.25 * grow,
          y + Math.sin(a) * cam.scale * 0.25 * grow,
        );
        ctx.lineTo(
          x + Math.cos(a) * cam.scale * 0.5 * grow,
          y + Math.sin(a) * cam.scale * 0.5 * grow,
        );
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

// A steady red border and a banner. The banner's intensity follows a 1 Hz sine
// (one pulse a second, far under the flashing limit); with reduced motion it
// does not move at all. The word is there so it never rests on colour alone.
function drawAlarm(ctx: CanvasRenderingContext2D, scene: Scene) {
  const pulse = scene.reducedMotion
    ? 1
    : 0.7 + 0.3 * Math.sin(((scene.nowMs ?? 0) / 1000) * 2 * Math.PI);
  ctx.save();
  ctx.lineWidth = 6;
  ctx.strokeStyle = COLOR.danger;
  ctx.strokeRect(3, 3, scene.w - 6, scene.h - 6);
  ctx.globalAlpha = pulse;
  const w = Math.min(scene.w - 24, 220);
  ctx.fillStyle = COLOR.danger;
  ctx.fillRect((scene.w - w) / 2, 12, w, 30);
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLOR.bg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 16px system-ui, sans-serif";
  ctx.fillText("ALARM", scene.w / 2, 28);
  ctx.restore();
}
