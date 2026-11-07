import type { EntityView } from "../../net/protocol.ts";
import { motionT } from "../fx.ts";
import { COLOR, WORLD } from "../tokens.ts";
import { block } from "./blocks.ts";
import type { Scene } from "./index.ts";
import { ease, swing } from "./motion.ts";
import { type Camera, LIVE, toScreen, wallAt } from "./project.ts";

// The bell rope, the lamp switch and the hatch (spec §4.1). The bell swings ±15° three times in
// 1.2 s when rung, once (FR17): then it hangs still while it stays on (a static tilt under reduced
// motion); the lamp's light is in the HUD, not here.

const SWING_DEG = 15;

// A hatch: a wall tile with a waist-high sill and a lintel, open between. Sight passes the gap;
// bodies and sound do not (the server's rules, ADR 0012).
export function drawHatch(ctx: CanvasRenderingContext2D, x: number, y: number, cam: Camera) {
  const s = cam.scale;
  const tall = wallAt(y); // the hatch grows with its row's walls as the board tips
  const sill = tall * 0.4;
  block(ctx, cam, { x, y, w: 1, d: 1, h: sill }, WORLD.wallTop, WORLD.wallFront);
  // the lintel: a beam across the top, standing on two posts
  const top = toScreen(cam, x, y, tall);
  const post = Math.max(3, s * 0.1);
  const lintel = toScreen(cam, x, y + 1, tall);
  ctx.fillStyle = WORLD.wallFront;
  ctx.fillRect(lintel.x, lintel.y, post, (tall - sill) * s);
  ctx.fillRect(lintel.x + s - post, lintel.y, post, (tall - sill) * s);
  ctx.fillStyle = WORLD.wallTop;
  ctx.fillRect(top.x, top.y, s + 0.5, s * LIVE.depth * 0.35);
  ctx.fillStyle = WORLD.wallFront;
  ctx.fillRect(lintel.x, lintel.y, s + 0.5, s * 0.16);
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = 2;
  const sillFront = toScreen(cam, x, y + 1, sill);
  ctx.beginPath();
  ctx.moveTo(sillFront.x, sillFront.y);
  ctx.lineTo(sillFront.x + s, sillFront.y);
  ctx.stroke();
}

// The bell: a brass bell on a bracket with its rope, swinging while it rings.
export function drawBell(ctx: CanvasRenderingContext2D, e: EntityView, cam: Camera, scene: Scene) {
  const s = cam.scale;
  const hang = toScreen(cam, e.pos.x, e.pos.y, LIVE.wall * 0.95);
  const rung = e.state === "on";
  const t = motionT(scene, e.id, "bell");
  // rung: three swings within its fx's 1.2 s, then still; reduced motion: a static tilt while on
  const deg = !rung
    ? 0
    : scene.reducedMotion
      ? SWING_DEG
      : t === undefined
        ? 0
        : swing(t, SWING_DEG, 3);
  // the bracket
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hang.x - s * 0.25, hang.y);
  ctx.lineTo(hang.x + s * 0.05, hang.y);
  ctx.stroke();
  ctx.save();
  ctx.translate(hang.x, hang.y);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.fillStyle = WORLD.brass;
  ctx.beginPath();
  ctx.moveTo(-s * 0.18, s * 0.34);
  ctx.quadraticCurveTo(-s * 0.16, s * 0.02, 0, s * 0.02);
  ctx.quadraticCurveTo(s * 0.16, s * 0.02, s * 0.18, s * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // the rope, down to hand height
  ctx.beginPath();
  ctx.moveTo(0, s * 0.34);
  ctx.lineTo(0, s * (LIVE.wall * 0.95 - 0.35));
  ctx.stroke();
  ctx.restore();
  // the pull: a knot you stand on, on the floor
  const f = toScreen(cam, e.pos.x, e.pos.y, 0.35);
  ctx.fillStyle = WORLD.brass;
  ctx.beginPath();
  ctx.arc(f.x, f.y, s * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// The lamp switch: a small steel post with a lever; its light shows in every sighted HUD.
export function drawLampSwitch(ctx: CanvasRenderingContext2D, e: EntityView, cam: Camera) {
  const s = cam.scale;
  block(
    ctx,
    cam,
    { x: e.pos.x - 0.15, y: e.pos.y - 0.15, w: 0.3, d: 0.3, h: LIVE.block * 0.8 },
    WORLD.steel,
    WORLD.steelFront,
  );
  const top = toScreen(cam, e.pos.x, e.pos.y - 0.15, LIVE.block * 0.8);
  const on = e.state === "on";
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = Math.max(2, s * 0.05);
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(top.x + (on ? s * 0.14 : -s * 0.14), top.y - s * 0.22);
  ctx.stroke();
  // a little bulb on the post: lit (with rays) while the lamp flashes, hollow otherwise
  ctx.fillStyle = on ? WORLD.lamp : COLOR.ui;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(top.x, top.y - s * 0.32, s * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// The practice lever (Task 38): a wide steel plate on the floor with a long handle thrown to the
// left (off) or the right (on) and left there, so it never reads as the lamp switch's short post.
// Its word sits on the plate, so the state is never told by the handle's side alone.
// Thrown (280 ms): the handle sweeps across from the other side, and the plate thuds 1 px as it lands.
export function drawLever(
  ctx: CanvasRenderingContext2D,
  e: EntityView,
  cam: Camera,
  scene?: Scene,
) {
  const s = cam.scale;
  const on = e.state === "on";
  const t = scene ? motionT(scene, e.id, "lever") : undefined;
  const throwT = t === undefined ? 1 : ease.outBack(Math.min(1, t / 0.8));
  const reach = (on ? 1 : -1) * (2 * throwT - 1) * s * 0.32; // from the other side across to its own
  const thud = t !== undefined && t > 0.8 ? 1 : 0;
  block(
    ctx,
    cam,
    { x: e.pos.x - 0.4, y: e.pos.y - 0.2, w: 0.8, d: 0.4, h: LIVE.block * 0.25 },
    WORLD.steel,
    WORLD.steelFront,
  );
  const hinge = toScreen(cam, e.pos.x, e.pos.y, LIVE.block * 0.25);
  const pivot = { x: hinge.x, y: hinge.y + thud };
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = Math.max(3, s * 0.08);
  ctx.beginPath();
  ctx.moveTo(pivot.x, pivot.y);
  ctx.lineTo(pivot.x + reach, pivot.y - s * 0.3);
  ctx.stroke();
  ctx.fillStyle = on ? WORLD.lamp : COLOR.ui;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pivot.x + reach, pivot.y - s * 0.3, s * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = WORLD.line;
  ctx.font = `700 ${Math.max(11, Math.round(s * 0.2))}px Archivo, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(on ? "Practice" : "Real", pivot.x, pivot.y + s * 0.1);
}
