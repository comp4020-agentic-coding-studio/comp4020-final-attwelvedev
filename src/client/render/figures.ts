import type { EntityView } from "../../net/protocol.ts";
import { COLOR, MAP, ROLE_COLOR, ROLE_SHAPE, WORLD } from "../tokens.ts";
import type { Scene } from "./index.ts";
import { type Camera, TILT, toScreen } from "./project.ts";
import { floorRing, shapePath } from "./shared.ts";

const BODY_H = 0.95; // tiles, foot to crown of the pill
const BODY_W = 0.62;

// The pill body, as a path at `foot` (the figure's floor point on screen).
function pill(ctx: CanvasRenderingContext2D, foot: { x: number; y: number }, s: number) {
  const w = s * BODY_W;
  ctx.beginPath();
  ctx.roundRect(foot.x - w / 2, foot.y - s * BODY_H, w, s * BODY_H, w / 2);
}

// A role's hat is its shape, sitting on the crown: dome, box or cone.
function hat(
  ctx: CanvasRenderingContext2D,
  foot: { x: number; y: number },
  s: number,
  shape: "circle" | "square" | "triangle",
) {
  const crown = foot.y - s * BODY_H;
  const r = s * 0.2;
  shapePath(ctx, shape, foot.x, crown - r * 0.6, r);
}

// A player: shadow on the floor, a pill in the role colour with a 2 px outline, a face disc, and
// the role's shape as a hat. Your own figure also gets a ring on the floor and a chevron.
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  e: EntityView,
  cam: Camera,
  scene: Scene,
) {
  if (e.seat === undefined) return;
  const s = cam.scale;
  const role = scene.roles[e.seat] ?? "blind";
  const isSelf = !scene.noSelf && e.seat === scene.seat;
  const foot = toScreen(cam, e.pos.x, e.pos.y);
  const color = ROLE_COLOR[role];

  // the shadow, and for you the ring
  ctx.save();
  ctx.fillStyle = WORLD.line;
  ctx.globalAlpha = 0.25;
  floorRing(ctx, foot.x, foot.y, s * 0.36, TILT.depth);
  ctx.fill();
  ctx.restore();
  if (isSelf && e.state !== "hidden" && e.state !== "dim") {
    ctx.save();
    ctx.lineWidth = MAP.selfRingPx;
    ctx.strokeStyle = COLOR.ui;
    floorRing(ctx, foot.x, foot.y, s * 0.5, TILT.depth);
    ctx.stroke();
    ctx.restore();
  }

  if (e.state === "hidden") {
    // on a hide spot: faint, with a dashed outline, so you can see you are hidden
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = color;
    pill(ctx, foot, s);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = isSelf ? COLOR.ui : WORLD.line;
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (e.state === "dim") {
    // in a dark zone you are only a ring: the floor, drawn in your colour
    ctx.save();
    ctx.globalAlpha = MAP.blindRingAlpha + 0.2;
    ctx.lineWidth = MAP.ringWidthPx;
    ctx.strokeStyle = color;
    floorRing(ctx, foot.x, foot.y, s * 0.45, TILT.depth);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = 2;
  pill(ctx, foot, s);
  ctx.fill();
  ctx.stroke();
  // the face: a pale disc with two eyes
  const faceY = foot.y - s * BODY_H * 0.62;
  ctx.fillStyle = COLOR.ui;
  ctx.beginPath();
  ctx.arc(foot.x, faceY, s * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = WORLD.line;
  for (const dx of [-0.06, 0.06]) {
    ctx.beginPath();
    ctx.arc(foot.x + s * dx, faceY, s * 0.026, 0, Math.PI * 2);
    ctx.fill();
  }
  // the hat
  ctx.fillStyle = color;
  hat(ctx, foot, s, ROLE_SHAPE[role]);
  ctx.fill();
  ctx.stroke();
  if (isSelf) {
    // the "You" chevron above the hat
    const top = foot.y - s * (BODY_H + 0.55);
    ctx.fillStyle = COLOR.ui;
    ctx.beginPath();
    ctx.moveTo(foot.x - s * 0.14, top);
    ctx.lineTo(foot.x + s * 0.14, top);
    ctx.lineTo(foot.x, top + s * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
