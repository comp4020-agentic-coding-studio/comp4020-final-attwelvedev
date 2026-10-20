import { STAMP_FACE } from "../hud.ts";
import { COLOR, MAP, ROLE_COLOR, ROLE_SHAPE, WORLD } from "../tokens.ts";
import type { FacePop, Scene } from "./index.ts";
import { type Camera, TILT, toScreen } from "./project.ts";
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
  const head = toScreen(cam, at.x, at.y, TILT.block + MAP.avatarRadius);
  const x = head.x - size / 2;
  const y = head.y - size - cam.scale * 0.3;
  ctx.save();
  ctx.globalAlpha = pop.fade;
  ctx.fillStyle = COLOR.ui;
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - 3, y - 3, size + 6, size + 6, 8);
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
export function drawEdgePills(ctx: CanvasRenderingContext2D, scene: Scene, cam: Camera) {
  for (const pop of scene.pops ?? []) {
    if (!pop.from || !pop.name) continue;
    // a sender you can see already shows over their head, and a mark on screen is just a mark
    const sender = scene.entities.find((e) => e.kind === "player" && e.seat === pop.seat);
    const target = toScreen(cam, pop.from.x, pop.from.y);
    const onScreen = target.x >= 0 && target.x <= scene.w && target.y >= 0 && target.y <= scene.h;
    if (pop.mark ? onScreen : sender !== undefined) continue;
    drawPill(ctx, scene, pop, exitPoint(scene.w, scene.h, target, PILL_MARGIN + PILL_H / 2));
  }
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  pop: FacePop,
  at: { x: number; y: number },
) {
  const role = scene.roles[pop.seat] ?? "blind";
  ctx.save();
  ctx.globalAlpha = pop.fade;
  ctx.font = `700 ${NAME_PX}px "Archivo", system-ui, sans-serif`;
  const name = pop.name ?? "";
  const hasPicture = !!pop.img && !pop.alone;
  const glyph = pop.mark ? STAMP_FACE[pop.mark] : "";
  const w =
    12 +
    PILL_H * 0.6 +
    6 +
    ctx.measureText(name).width +
    8 +
    (glyph ? 22 : 0) +
    (hasPicture ? FACE_PX : 0);
  const x = Math.max(PILL_MARGIN, Math.min(scene.w - PILL_MARGIN - w, at.x - w / 2));
  const y = at.y - PILL_H / 2;
  ctx.fillStyle = "rgba(20, 30, 54, 0.88)"; // --glass: the canvas can't read an rgba token
  ctx.strokeStyle = ROLE_COLOR[role];
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, PILL_H, PILL_H / 2);
  ctx.fill();
  ctx.stroke();
  let cursor = x + 12;
  ctx.fillStyle = ROLE_COLOR[role];
  shapePath(ctx, ROLE_SHAPE[role], cursor + PILL_H * 0.15, y + PILL_H / 2, PILL_H * 0.2);
  ctx.fill();
  cursor += PILL_H * 0.6 + 6;
  ctx.fillStyle = COLOR.ui;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(name, cursor, y + PILL_H / 2 + 1);
  cursor += ctx.measureText(name).width + 8;
  if (glyph) {
    ctx.font = `700 ${NAME_PX + 2}px system-ui, sans-serif`;
    ctx.fillText(glyph, cursor, y + PILL_H / 2 + 1);
  }
  if (hasPicture && pop.img) {
    // the face hangs off the pill, on a white plate, so it is readable at a glance
    const fy = y - FACE_PX - 2;
    ctx.fillStyle = COLOR.ui;
    ctx.beginPath();
    ctx.roundRect(x + w - FACE_PX - 6, fy - 3, FACE_PX + 6, FACE_PX + 6, 8);
    ctx.fill();
    ctx.drawImage(pop.img, x + w - FACE_PX - 3, fy, FACE_PX, FACE_PX);
  }
  ctx.restore();
}
