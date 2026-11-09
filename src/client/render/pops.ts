import { STAMP_FACE } from "../hud.ts";
import { COLOR, MAP, ROLE_COLOR, ROLE_SHAPE, SHELL, WORLD } from "../tokens.ts";
import type { FacePop, Scene } from "./index.ts";
import { type Camera, LIVE, toScreen } from "./project.ts";
import { shapePath } from "./shared.ts";

// A face pop is 1.4 tiles on a white plate, above its sender's head. A sender who is out of sight
// is not among the entities, so they get an edge pill instead (below).
export function drawPops(ctx: CanvasRenderingContext2D, scene: Scene, cam: Camera) {
  for (const pop of scene.pops ?? []) if (pop.img && !pop.alone) drawPop(ctx, scene, cam, pop);
}

function drawPop(ctx: CanvasRenderingContext2D, scene: Scene, cam: Camera, pop: FacePop) {
  if (!pop.img) return;
  const who = scene.entities.find((e) => e.kind === "player" && e.seat === pop.seat);
  if (!who) return;
  const at = pop.seat === scene.seat && scene.self ? scene.self : who.pos; // own avatar is drawn predicted
  const size = Math.max(28, cam.scale * 1.4);
  const head = toScreen(cam, at.x, at.y, LIVE.block + MAP.avatarRadius);
  const x = head.x - size / 2;
  const y = head.y - size - cam.scale * 0.3;
  ctx.save();
  ctx.globalAlpha = pop.fade;
  ctx.fillStyle = COLOR.ui;
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - 3, y - 3, size + 6, size + 6, SHELL.r);
  ctx.fill();
  ctx.stroke();
  ctx.drawImage(pop.img, x, y, size, size);
  ctx.restore();
}

const PILL_H = 30;
const PILL_MARGIN = 10;
const FACE_PX = 40;
const NAME_PX = 14;

// Where the ray from the middle of the screen to `target` leaves a rectangle inset by `margin`.
function exitPoint(w: number, h: number, target: { x: number; y: number }, margin: number) {
  const cx = w / 2;
  const cy = h / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  const rx = cx - margin;
  const ry = cy - margin;
  const k = Math.max(Math.abs(dx) / rx, Math.abs(dy) / ry, 1e-9);
  return { x: cx + dx / k, y: cy + dy / k };
}

// A face or a mark from someone you can't see: a glass pill at the screen edge on their side,
// with their shape, their name (in the HUD's font on --glass) and the face or the mark's glyph.
// The face is there for its 1.5 s, then the pill stays alone a few seconds more.
// Two pills toward nearby places (a door and a mark beside it) would land on one spot: each later one
// steps along its edge until it is clear of those already placed (PILL_GAP between their boxes).
export function drawEdgePills(ctx: CanvasRenderingContext2D, scene: Scene, cam: Camera) {
  const placed: Box[] = [];
  for (const pop of scene.pops ?? []) {
    if (!pop.from || !pop.name) continue;
    // a sender you can see already shows over their head, and a mark on screen is just a mark
    const sender =
      pop.seat === null
        ? undefined
        : scene.entities.find((e) => e.kind === "player" && e.seat === pop.seat);
    const target = toScreen(cam, pop.from.x, pop.from.y);
    const onScreen = target.x >= 0 && target.x <= scene.w && target.y >= 0 && target.y <= scene.h;
    if (pop.mark ? onScreen : sender !== undefined) continue; // (a door has no seat: a mark)
    const at = exitPoint(scene.w, scene.h, target, PILL_MARGIN + PILL_H / 2);
    const w = pillWidth(ctx, scene, pop);
    const box = clearOf(placed, scene, at, w);
    placed.push(box);
    drawPill(ctx, scene, pop, box);
  }
}

interface Box {
  x: number;
  y: number;
  w: number;
}
const PILL_GAP = 18; // between two pills' boxes: their centres are at least PILL_H + 18 = 48 px apart

// Where a pill of width `w` centred on `at` goes: there, or the nearest step along its edge (down or up
// a side edge, along a top or bottom one) that touches none of `placed`, kept inside the screen.
function clearOf(placed: Box[], scene: Scene, at: { x: number; y: number }, w: number): Box {
  const boxAt = (cx: number, cy: number): Box => ({
    x: Math.max(PILL_MARGIN, Math.min(scene.w - PILL_MARGIN - w, cx - w / 2)),
    y: Math.max(PILL_MARGIN, Math.min(scene.h - PILL_MARGIN - PILL_H, cy - PILL_H / 2)),
    w,
  });
  const touches = (a: Box, b: Box) =>
    a.x < b.x + b.w + PILL_GAP &&
    b.x < a.x + a.w + PILL_GAP &&
    a.y < b.y + PILL_H + PILL_GAP &&
    b.y < a.y + PILL_H + PILL_GAP;
  const side = at.x <= PILL_MARGIN + PILL_H || at.x >= scene.w - PILL_MARGIN - PILL_H;
  const step = side ? PILL_H + PILL_GAP : w + PILL_GAP;
  const first = boxAt(at.x, at.y);
  for (let i = 0; i <= 2 * placed.length; i++) {
    const k = i % 2 === 0 ? i / 2 : -(i + 1) / 2; // 0, -1, +1, -2, +2 ...
    const box = side ? boxAt(at.x, at.y + k * step) : boxAt(at.x + k * step, at.y);
    if (!placed.some((b) => touches(box, b))) return box;
  }
  return first;
}

// A door's pill is "Door" alone; the others are shape, name, the glyph and the face.
function pillWidth(ctx: CanvasRenderingContext2D, scene: Scene, pop: FacePop): number {
  const role = pop.seat === null ? null : (scene.roles[pop.seat] ?? "blind");
  const glyph = pop.mark ? STAMP_FACE[pop.mark] : "";
  ctx.save();
  ctx.font =
    role === null
      ? `700 ${NAME_PX + 2}px system-ui, sans-serif`
      : `700 ${NAME_PX}px "Archivo", system-ui, sans-serif`;
  const w =
    role === null
      ? 24 + ctx.measureText(glyph).width
      : 12 +
        PILL_H * 0.6 +
        6 +
        ctx.measureText(pop.name ?? "").width +
        8 +
        (glyph ? 22 : 0) +
        (pop.img && !pop.alone ? FACE_PX : 0);
  ctx.restore();
  return w;
}

function drawPill(ctx: CanvasRenderingContext2D, scene: Scene, pop: FacePop, box: Box) {
  // a door's pill has no seat: the door's colour, no role shape, just "Door"
  const role = pop.seat === null ? null : (scene.roles[pop.seat] ?? "blind");
  const colour = role === null ? WORLD.door : ROLE_COLOR[role];
  ctx.save();
  ctx.globalAlpha = pop.fade;
  ctx.font = `700 ${NAME_PX}px "Archivo", system-ui, sans-serif`;
  const name = role === null ? "" : (pop.name ?? "");
  const hasPicture = !!pop.img && !pop.alone;
  const glyph = pop.mark ? STAMP_FACE[pop.mark] : "";
  const { x, y, w } = box;
  ctx.fillStyle = SHELL.glass; // --glass
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, PILL_H, PILL_H / 2);
  ctx.fill();
  ctx.stroke();
  let cursor = x + 12;
  ctx.fillStyle = colour;
  if (role !== null) {
    shapePath(ctx, ROLE_SHAPE[role], cursor + PILL_H * 0.15, y + PILL_H / 2, PILL_H * 0.2);
    ctx.fill();
    cursor += PILL_H * 0.6 + 6;
  }
  ctx.fillStyle = COLOR.ui;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  if (role !== null) {
    ctx.fillText(name, cursor, y + PILL_H / 2 + 1);
    cursor += ctx.measureText(name).width + 8;
  }
  if (glyph) {
    ctx.font = `700 ${NAME_PX + 2}px system-ui, sans-serif`;
    ctx.fillText(glyph, cursor, y + PILL_H / 2 + 1);
  }
  if (hasPicture && pop.img) {
    // the face hangs off the pill, on a white plate, so it is readable at a glance
    const fy = y - FACE_PX - 2;
    ctx.fillStyle = COLOR.ui;
    ctx.beginPath();
    ctx.roundRect(x + w - FACE_PX - 6, fy - 3, FACE_PX + 6, FACE_PX + 6, SHELL.r);
    ctx.fill();
    ctx.drawImage(pop.img, x + w - FACE_PX - 3, fy, FACE_PX, FACE_PX);
  }
  ctx.restore();
}
