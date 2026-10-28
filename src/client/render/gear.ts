import type { GearItem } from "../../game/sim/world.ts";
import type { Vec } from "../../game/types.ts";
import type { EntityView } from "../../net/protocol.ts";
import { COLOR, OVERLAY, WORLD } from "../tokens.ts";
import type { Scene } from "./index.ts";
import { type Camera, LIVE, toScreen } from "./project.ts";

// Gear (spec §4.1): on the floor a small mat with a contact shadow and no bob, so it never reads as
// loot; carried, on the figure. The UV pool is the room's one bold effect, and goggles tint the
// wearer's whole view.

const POOL_ALPHA = 0.3;
const GRAIN = 0.08; // goggles grain: 8 %
const GRAIN_FPS = 12;

// One gear item's glyph, drawn at (cx, cy) about `r` across: goggles two linked rings, a
// stethoscope a looped tube and bell, an earpiece a curl, a torch a barrel with its lens.
export function gearGlyph(
  ctx: CanvasRenderingContext2D,
  item: GearItem,
  cx: number,
  cy: number,
  r: number,
) {
  ctx.save();
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.lineCap = "round";
  if (item === "goggles") {
    ctx.fillStyle = WORLD.nv;
    for (const dx of [-0.5, 0.5]) {
      ctx.beginPath();
      ctx.arc(cx + dx * r, cy, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.08, cy);
    ctx.lineTo(cx + r * 0.08, cy);
    ctx.stroke();
  } else if (item === "stethoscope") {
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.1, r * 0.55, Math.PI * 0.1, Math.PI * 0.9, true);
    ctx.moveTo(cx, cy + r * 0.45);
    ctx.lineTo(cx, cy + r * 0.1);
    ctx.stroke();
    ctx.fillStyle = WORLD.brass;
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.6, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (item === "earpiece") {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, Math.PI * 0.8, Math.PI * 2.3);
    ctx.arc(cx + r * 0.1, cy + r * 0.1, r * 0.22, 0, Math.PI * 1.5);
    ctx.stroke();
  } else {
    ctx.fillStyle = WORLD.steel;
    ctx.beginPath();
    ctx.rect(cx - r * 0.6, cy - r * 0.2, r * 0.9, r * 0.4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = WORLD.uv;
    ctx.beginPath();
    ctx.arc(cx + r * 0.45, cy, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// Gear lying on the floor or on a hatch sill: a card mat with a contact shadow, the glyph on it.
export function drawGear(
  ctx: CanvasRenderingContext2D,
  e: EntityView,
  cam: Camera,
  onSill: boolean,
) {
  if (!e.item) return;
  const s = cam.scale;
  const z = onSill ? LIVE.wall * 0.45 : 0;
  const c = toScreen(cam, e.pos.x, e.pos.y, z);
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = WORLD.line;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + 2, s * 0.32, s * 0.32 * LIVE.depth, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = WORLD.card;
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(c.x - s * 0.3, c.y - s * 0.2, s * 0.6, s * 0.36, s * 0.06);
  ctx.fill();
  ctx.stroke();
  gearGlyph(ctx, e.item, c.x, c.y - s * 0.02, s * 0.22);
}

// What a figure carries, on the figure: goggles over the eyes, the stethoscope round the neck, an
// earpiece curl at the side, the torch at the hip. On a phone's small tiles, a shoulder badge too.
export function drawCarried(
  ctx: CanvasRenderingContext2D,
  item: GearItem,
  foot: Vec,
  s: number,
  faceY: number,
  phone: boolean,
) {
  if (item === "goggles") gearGlyph(ctx, "goggles", foot.x, faceY, s * 0.2);
  else if (item === "stethoscope")
    gearGlyph(ctx, "stethoscope", foot.x, faceY + s * 0.24, s * 0.16);
  else if (item === "earpiece") gearGlyph(ctx, "earpiece", foot.x + s * 0.2, faceY, s * 0.12);
  else gearGlyph(ctx, "uv", foot.x + s * 0.32, foot.y - s * 0.3, s * 0.16);
  if (phone) {
    // the badge: a card disc on the shoulder with the glyph, readable at 7 tiles across
    const bx = foot.x - s * 0.34;
    const by = foot.y - s * 0.62;
    ctx.fillStyle = WORLD.card;
    ctx.strokeStyle = WORLD.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx, by, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    gearGlyph(ctx, item, bx, by, s * 0.1);
  }
}

// Holding hands: a 2 px arc between the two hands with a bead at each end and an arrowhead
// toward the leader.
export function drawHold(ctx: CanvasRenderingContext2D, cam: Camera, towed: Vec, leader: Vec) {
  const s = cam.scale;
  const a = toScreen(cam, towed.x, towed.y, 0.45);
  const b = toScreen(cam, leader.x, leader.y, 0.45);
  const mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - s * 0.25 };
  ctx.save();
  ctx.strokeStyle = COLOR.ui;
  ctx.fillStyle = COLOR.ui;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(mid.x, mid.y, b.x, b.y);
  ctx.stroke();
  for (const p of [a, b]) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
  // the arrowhead at the curve's midpoint, pointing on toward the leader
  const t = { x: (b.x - a.x) * 0.5, y: b.y - a.y };
  const at = { x: 0.25 * a.x + 0.5 * mid.x + 0.25 * b.x, y: 0.25 * a.y + 0.5 * mid.y + 0.25 * b.y };
  const ang = Math.atan2(t.y, t.x);
  ctx.beginPath();
  ctx.moveTo(at.x + Math.cos(ang) * s * 0.1, at.y + Math.sin(ang) * s * 0.1);
  ctx.lineTo(at.x + Math.cos(ang + 2.5) * s * 0.1, at.y + Math.sin(ang + 2.5) * s * 0.1);
  ctx.lineTo(at.x + Math.cos(ang - 2.5) * s * 0.1, at.y + Math.sin(ang - 2.5) * s * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

const tracePoly = (ctx: CanvasRenderingContext2D, cam: Camera, poly: Vec[]) => {
  poly.forEach((p, i) => {
    const q = toScreen(cam, p.x, p.y);
    if (i === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  });
  ctx.closePath();
};

// The UV pool: a blue-violet wash at 30 % with a dashed rim, clipped by walls (the polygon is the
// server's, cast with the walls), and the ink in it, clipped to the pool so letters cut at the rim.
// High contrast: no wash, a 3 px dashed white rim, yellow ink outlined black.
export function drawUv(ctx: CanvasRenderingContext2D, scene: Scene, cam: Camera) {
  const high = !OVERLAY.wash;
  const pools = scene.entities.filter((e) => e.kind === "uv" && e.polys);
  if (pools.length === 0) return;
  const inks = scene.entities.filter((e) => e.kind === "ink" && e.text);
  const s = cam.scale;
  for (const pool of pools) {
    ctx.save();
    ctx.beginPath();
    for (const poly of pool.polys ?? []) tracePoly(ctx, cam, poly);
    if (!high) {
      ctx.globalAlpha = POOL_ALPHA;
      ctx.fillStyle = WORLD.uv;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = high ? 3 : 2;
    ctx.strokeStyle = high ? COLOR.ui : WORLD.uv;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.clip();
    for (const ink of inks) {
      const c = toScreen(cam, ink.pos.x, ink.pos.y);
      ctx.font = `700 ${Math.round(s * 0.42)}px Archivo, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = high ? COLOR.ink : COLOR.ui;
      ctx.strokeText(ink.text as string, c.x, c.y);
      ctx.fillStyle = WORLD.uvInk;
      ctx.fillText(ink.text as string, c.x, c.y);
    }
    ctx.restore();
  }
}

// Goggles: a green-grey tint over the wearer's view with 8 % grain at 12 fps (a static stipple
// under reduced motion or with no clock). High contrast: no tint, a 2 px green inner frame.
export function drawGoggles(ctx: CanvasRenderingContext2D, scene: Scene) {
  const high = !OVERLAY.wash;
  ctx.save();
  if (high) {
    ctx.strokeStyle = COLOR.goal;
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, scene.w - 12, scene.h - 12);
    ctx.restore();
    return;
  }
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = WORLD.nv;
  ctx.fillRect(0, 0, scene.w, scene.h);
  const still = scene.reducedMotion || scene.nowMs === undefined;
  const frame = still ? 0 : Math.floor(((scene.nowMs ?? 0) / 1000) * GRAIN_FPS);
  ctx.globalAlpha = GRAIN;
  ctx.fillStyle = WORLD.line;
  // a cheap deterministic grain: a hashed grid of specks, reseeded each frame
  const step = 9;
  for (let y = 0; y < scene.h; y += step) {
    for (let x = ((y / step) % 2) * 4; x < scene.w; x += step) {
      const h = Math.sin(x * 12.9898 + y * 78.233 + frame * 37.719) * 43758.5453;
      if (h - Math.floor(h) < 0.35) ctx.fillRect(x, y, 2, 2);
    }
  }
  ctx.restore();
}
