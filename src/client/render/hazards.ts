import { visiblePolygon } from "../../game/cone.ts";
import type { EntityView } from "../../net/protocol.ts";
import { COLOR, WORLD } from "../tokens.ts";
import type { Scene } from "./index.ts";
import { type Camera, LIVE, toScreen } from "./project.ts";
import { diamond, floorRing, hatch } from "./shared.ts";

// What blocks sight, as the server counts it: walls, vents, closed doors and hide spots
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
  // glass lets a hazard's sight through, so only walls and vents cut its cone
  const fn = (tx: number, ty: number) => {
    const ch = scene.tiles?.[ty]?.[tx];
    return ch === "#" || ch === "%" || solid.has(`${tx},${ty}`);
  };
  blockerCache.set(scene, fn);
  return fn;
}

// A cone is on the floor: its corners are floor points, so the tilt squashes it with the room.
// The path is traced afresh each time it is needed, since the hatching starts paths of its own.
function coneShape(points: { x: number; y: number }[], cam: Camera) {
  const pts = points.map((p) => toScreen(cam, p.x, p.y));
  const trace = (ctx: CanvasRenderingContext2D) => {
    ctx.beginPath();
    pts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
  };
  return { pts, trace };
}

type Cone = ReturnType<typeof coneShape>;

// Lit and hatched while it is looking; a camera that is looking away is only an outline,
// so it never rests on colour alone.
function paintCone(ctx: CanvasRenderingContext2D, cone: Cone, color: string, looking: boolean) {
  const { pts, trace } = cone;
  ctx.save();
  if (looking) {
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
    const [w, h] = [Math.max(...xs) - x0, Math.max(...ys) - y0];
    ctx.save();
    trace(ctx);
    ctx.clip();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = color;
    ctx.fillRect(x0, y0, w, h);
    ctx.globalAlpha = 0.55;
    hatch(ctx, x0, y0, w, h, color);
    ctx.restore();
    trace(ctx);
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
  } else {
    trace(ctx);
    ctx.lineWidth = 2;
    ctx.strokeStyle = WORLD.line;
    ctx.globalAlpha = 0.6;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
  }
  ctx.restore();
}

// A hazard's sight (a guard's, a camera's): a fan of rays that stops at walls, closed
// doors and cover, so it leaves a shadow behind them, as the real rule does.
export function drawCone(
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
  paintCone(ctx, coneShape(poly, cam), color, looking);
}

// What a hazard in the dark can see, in the light: drawn as any cone is, and nothing of the
// hazard itself or where it stands.
export function drawSight(ctx: CanvasRenderingContext2D, e: EntityView, cam: Camera) {
  const color = e.state === "watching" ? WORLD.watch : WORLD.laser;
  for (const poly of e.polys ?? []) {
    paintCone(ctx, coneShape(poly, cam), color, true);
  }
}

// A security camera on its wall bracket, turned the way it looks. Watching, the lens is open
// and filled with rays; idle, the eye is shut (a bar across an empty lens), so the state is in
// the shape and not only the colour.
function drawCamera(
  ctx: CanvasRenderingContext2D,
  e: EntityView,
  at: { x: number; y: number },
  s: number,
) {
  const watching = e.state === "watching";
  const aim = Math.atan2((e.facing?.y ?? 1) * LIVE.depth, e.facing?.x ?? 0); // the lens points where it looks
  const ink = watching ? WORLD.watch : WORLD.line;
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(aim);
  ctx.lineWidth = 2;
  ctx.strokeStyle = WORLD.line;
  ctx.fillStyle = COLOR.ui;
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
  ctx.fillStyle = COLOR.bg;
  ctx.fill();
  ctx.stroke();
  if (watching) {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(s * 0.3, 0, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ink;
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

// A beam is a steady line at 0.6 of a tile up while on (with a shadow on the floor) and a faint
// dotted one while off: it never flickers, so nothing here can flash.
function drawBeam(ctx: CanvasRenderingContext2D, e: EntityView, cam: Camera) {
  const beam = e.beam ?? [];
  const last = beam[beam.length - 1];
  if (!last) return;
  const lift = 0.6;
  const from = toScreen(cam, e.pos.x, e.pos.y, lift);
  const to = toScreen(cam, last.x, last.y, lift);
  ctx.save();
  if (e.state === "on") {
    ctx.beginPath(); // the floor shadow
    ctx.moveTo(from.x, toScreen(cam, e.pos.x, e.pos.y).y);
    ctx.lineTo(to.x, toScreen(cam, last.x, last.y).y);
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = WORLD.line;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.lineWidth = 3;
    ctx.strokeStyle = WORLD.laser;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = WORLD.line;
    ctx.setLineDash([2, 6]);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawHazard(
  ctx: CanvasRenderingContext2D,
  e: EntityView,
  cam: Camera,
  scene: Scene,
) {
  const s = cam.scale;
  if (e.kind === "camera") {
    drawCone(ctx, e, cam, scene, WORLD.watch, e.state === "watching");
    drawCamera(ctx, e, toScreen(cam, e.pos.x, e.pos.y, 0.7), s * 1.25);
  } else if (e.kind === "laser") {
    drawBeam(ctx, e, cam);
    // the emitter: a small post with a lit lens
    const foot = toScreen(cam, e.pos.x, e.pos.y);
    const top = toScreen(cam, e.pos.x, e.pos.y, 0.8);
    ctx.fillStyle = COLOR.ui;
    ctx.strokeStyle = WORLD.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(foot.x - s * 0.18, top.y, s * 0.36, foot.y - top.y, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = WORLD.laser;
    ctx.beginPath();
    ctx.arc(foot.x, toScreen(cam, e.pos.x, e.pos.y, 0.6).y, s * 0.07, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.kind === "guard") {
    drawCone(ctx, e, cam, scene, WORLD.laser, true);
    // a larger slate figure: a shadow, a body, and a diamond cap
    const foot = toScreen(cam, e.pos.x, e.pos.y);
    ctx.fillStyle = WORLD.line;
    ctx.globalAlpha = 0.25;
    floorRing(ctx, foot.x, foot.y, s * 0.5, LIVE.depth);
    ctx.fill();
    ctx.globalAlpha = 1;
    const body = toScreen(cam, e.pos.x, e.pos.y, 0.5);
    ctx.fillStyle = WORLD.nightRim;
    ctx.strokeStyle = WORLD.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(foot.x - s * 0.42, foot.y - s * 1.05, s * 0.84, s * 1.0, s * 0.3);
    ctx.fill();
    ctx.stroke();
    const cap = toScreen(cam, e.pos.x, e.pos.y, 1.05);
    diamond(ctx, cap.x, cap.y, s * 0.28);
    ctx.fillStyle = WORLD.laser;
    ctx.fill();
    ctx.stroke();
    void body;
  }
}
