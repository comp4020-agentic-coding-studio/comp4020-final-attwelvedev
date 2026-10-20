import { STAMP_LIFE_MS, type Stamp } from "../../game/channels.ts";
import type { EntityView } from "../../net/protocol.ts";
import { STAMP_FACE } from "../hud.ts";
import { COLOR, MAP, WORLD } from "../tokens.ts";
import type { Scene } from "./index.ts";
import { type Camera, TILT, toScreen } from "./project.ts";
import { diamond, hatch } from "./shared.ts";

// An extruded box: a top face and a south-facing front, light from the north-west. x, y, w, d
// are in tiles on the floor, h is its height in tiles.
export function block(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  box: { x: number; y: number; w: number; d: number; h: number },
  top: string,
  front: string,
) {
  const s = cam.scale;
  const t = toScreen(cam, box.x, box.y, box.h);
  const f = toScreen(cam, box.x, box.y + box.d, box.h);
  ctx.fillStyle = top;
  ctx.fillRect(t.x, t.y, box.w * s + 0.5, box.d * s * TILT.depth + 0.5);
  ctx.fillStyle = front;
  ctx.fillRect(f.x, f.y, box.w * s + 0.5, box.h * s + 0.5);
}

// A floor tile's top face, with the seams along its north and west edges.
export function floorTop(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x: number,
  y: number,
  fill: string,
) {
  const p = toScreen(cam, x, y);
  const d = cam.scale * TILT.depth;
  ctx.fillStyle = fill;
  ctx.fillRect(p.x, p.y, cam.scale + 0.5, d + 0.5);
  if (fill === WORLD.floor) {
    ctx.fillStyle = WORLD.seam;
    ctx.fillRect(p.x, p.y, cam.scale + 0.5, 1);
    ctx.fillRect(p.x, p.y, 1, d + 0.5);
  }
}

// A wall front, with its contact shade along the foot.
export function wall(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x: number,
  y: number,
  southOpen: boolean,
) {
  block(ctx, cam, { x, y, w: 1, d: 1, h: TILT.wall }, WORLD.wallTop, WORLD.wallFront);
  if (southOpen) {
    const foot = toScreen(cam, x, y + 1);
    ctx.fillStyle = WORLD.wallShade;
    ctx.fillRect(foot.x, foot.y - 3, cam.scale + 0.5, 3);
  }
}

// Glass: a wall you can see through. Translucent top and front with two glints.
export function glass(ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number) {
  const s = cam.scale;
  const top = toScreen(cam, x, y, TILT.wall);
  const frontY = toScreen(cam, x, y + 1, TILT.wall).y;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = WORLD.glass;
  ctx.fillRect(top.x, top.y, s + 0.5, s * TILT.depth + 0.5);
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = WORLD.glassFront;
  ctx.fillRect(top.x, frontY, s + 0.5, TILT.wall * s + 0.5);
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = COLOR.ui;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [dx, len] of [
    [0.28, 0.5],
    [0.5, 0.25],
  ] as const) {
    ctx.moveTo(top.x + s * dx + s * 0.18, frontY + s * 0.15);
    ctx.lineTo(top.x + s * dx, frontY + s * 0.15 + s * len);
  }
  ctx.stroke();
  // the outline marks it interactive-looking-but-solid: you cannot walk through
  ctx.globalAlpha = 1;
  ctx.strokeStyle = WORLD.line;
  ctx.strokeRect(top.x + 1, frontY, s - 2, TILT.wall * s);
  ctx.restore();
}

// A vent: an opaque slatted wall. Sight stops at it, sound goes through.
export function vent(ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number) {
  const s = cam.scale;
  block(ctx, cam, { x, y, w: 1, d: 1, h: TILT.wall }, WORLD.vent, WORLD.ventFront);
  const f = toScreen(cam, x, y + 1, TILT.wall);
  ctx.fillStyle = WORLD.ventSlat;
  for (let i = 1; i <= 4; i++)
    ctx.fillRect(f.x + s * 0.15, f.y + (TILT.wall * s * i) / 5 - 1, s * 0.7, 2);
}

// Flat things lying on the floor: plates, the exit, hide spots, an open door's slot, the sign.
export function drawFlat(ctx: CanvasRenderingContext2D, e: EntityView, cam: Camera, scene: Scene) {
  const s = cam.scale;
  const p = toScreen(cam, e.pos.x - 0.5, e.pos.y - 0.5);
  const d = s * TILT.depth;
  if (e.kind === "plate") {
    const inset = MAP.plateInset;
    const sunk = e.state === "pressed" ? 3 : 0;
    ctx.fillStyle = e.state === "pressed" ? WORLD.platePressed : WORLD.plate;
    ctx.fillRect(
      p.x + s * inset,
      p.y + d * inset + sunk,
      s * (1 - inset * 2),
      d * (1 - inset * 2) - sunk * 0.5,
    );
    ctx.strokeStyle = WORLD.line;
    ctx.lineWidth = 2;
    ctx.strokeRect(
      p.x + s * inset,
      p.y + d * inset + sunk,
      s * (1 - inset * 2),
      d * (1 - inset * 2) - sunk * 0.5,
    );
    // the plate's number, so a sign that says "7 1 4" can be matched to the floor
    ctx.fillStyle = WORLD.line;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(s * 0.42)}px system-ui, sans-serif`;
    ctx.fillText(e.id.replace(/^p/, ""), p.x + s / 2, p.y + d / 2 + sunk * 0.5 + 1);
  } else if (e.kind === "door" && e.state === "open") {
    // the door has slid into the floor: only its slot is left
    ctx.lineWidth = 2;
    ctx.strokeStyle = WORLD.doorSeam;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(p.x + 1, p.y + 1, s - 2, d - 2);
    ctx.setLineDash([]);
  } else if (e.kind === "exit") {
    ctx.globalAlpha = e.state === "occupied" ? 0.9 : 0.7; // someone is standing on it
    ctx.fillStyle = WORLD.exit;
    ctx.fillRect(p.x, p.y, s + 0.5, d + 0.5);
    ctx.globalAlpha = 1;
    hatch(ctx, p.x, p.y, s, d, WORLD.exitFlag);
  } else if (e.kind === "hide") {
    ctx.lineWidth = 2;
    ctx.strokeStyle = WORLD.line;
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(p.x + s * 0.1, p.y + d * 0.1, s * 0.8, d * 0.8);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  } else if (e.kind === "sign") {
    drawSign(ctx, e, toScreen(cam, e.pos.x, e.pos.y), s);
  }
  void scene;
}

// The code on the floor: "7 > 1 > 4". Plates already pressed in order turn green,
// and a thin line under the sign drains over the 5 s you have to press the next
// one. Quiet on purpose: you only need it once you are partway through.
function drawSign(
  ctx: CanvasRenderingContext2D,
  e: EntityView,
  at: { x: number; y: number },
  s: number,
) {
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
  const top = at.y - s * 0.35;
  ctx.fillStyle = COLOR.panel;
  ctx.strokeStyle =
    e.flash === "wrong"
      ? COLOR.danger
      : e.flash === "ok" || done >= ids.length
        ? COLOR.goal
        : COLOR.ui;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(at.x - w / 2, top, w, s * 0.7, 3);
  ctx.fill();
  ctx.stroke();
  let x = at.x - textW / 2;
  ids.forEach((id, i) => {
    ctx.fillStyle = i < done ? COLOR.goal : COLOR.ui;
    ctx.fillText(id, x, at.y + 1);
    x += widths[i] ?? 0;
    if (i < ids.length - 1) {
      ctx.fillStyle = COLOR.uiMuted;
      ctx.fillText(sep, x, at.y + 1);
      x += sepW;
    }
  });
  if (e.window !== undefined) {
    ctx.fillStyle = e.window < 0.3 ? COLOR.danger : COLOR.uiMuted;
    ctx.fillRect(at.x - w / 2, top + s * 0.7 + 3, w * e.window, 3);
  }
  ctx.restore();
}

// Things that stand up out of the floor, drawn in painter's order with the figures.
export function drawStanding(
  ctx: CanvasRenderingContext2D,
  e: EntityView,
  cam: Camera,
  scene: Scene,
) {
  const s = cam.scale;
  if (e.kind === "door") {
    const box = { x: e.pos.x - 0.5, y: e.pos.y - 0.5, w: 1, d: 1, h: TILT.block };
    block(ctx, cam, box, WORLD.door, WORLD.doorFront);
    const f = toScreen(cam, box.x, box.y + 1, TILT.block);
    ctx.fillStyle = WORLD.doorSeam;
    ctx.fillRect(f.x + s / 2 - 1, f.y, 2, TILT.block * s);
  } else if (e.kind === "crate") {
    const inset = 0.08;
    const box = {
      x: e.pos.x - 0.5 + inset,
      y: e.pos.y - 0.5 + inset,
      w: 1 - inset * 2,
      d: 1 - inset * 2,
      h: TILT.block,
    };
    block(ctx, cam, box, WORLD.crate, WORLD.crateFront);
    const f = toScreen(cam, box.x, box.y + box.d, TILT.block);
    ctx.strokeStyle = WORLD.crateBrace;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(f.x + box.w * s, f.y + TILT.block * s);
    ctx.moveTo(f.x + box.w * s, f.y);
    ctx.lineTo(f.x, f.y + TILT.block * s);
    ctx.stroke();
  } else if (e.kind === "loot") {
    const bob =
      scene.reducedMotion || scene.nowMs === undefined ? 0 : Math.sin(scene.nowMs / 300) * 0.06;
    const at = toScreen(cam, e.pos.x, e.pos.y, 0.5 + bob);
    diamond(ctx, at.x, at.y, s * 0.3);
    ctx.fillStyle = COLOR.goal;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = WORLD.line;
    ctx.stroke();
  } else if (e.kind === "checkpoint") {
    const foot = toScreen(cam, e.pos.x - 0.2, e.pos.y);
    const topY = foot.y - s * 0.9;
    ctx.lineWidth = 2;
    ctx.strokeStyle = WORLD.line;
    ctx.beginPath();
    ctx.moveTo(foot.x, foot.y);
    ctx.lineTo(foot.x, topY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(foot.x, topY);
    ctx.lineTo(foot.x + s * 0.5, topY + s * 0.17);
    ctx.lineTo(foot.x, topY + s * 0.35);
    ctx.closePath();
    ctx.fillStyle = e.state === "reached" ? COLOR.goal : COLOR.ui;
    ctx.fill();
    ctx.stroke();
    if (e.state !== "reached") {
      // three pips: one filled for each player at the flag; all three sets it
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(foot.x + s * (i * 0.2 - 0.1), foot.y + s * 0.14, s * 0.06, 0, Math.PI * 2);
        if (i < (e.present ?? 0)) {
          ctx.fillStyle = WORLD.line;
          ctx.fill();
        } else {
          ctx.lineWidth = 1;
          ctx.strokeStyle = WORLD.line;
          ctx.stroke();
        }
      }
    }
  } else if (e.kind === "stamp" && e.state) {
    drawStamp(ctx, e.state as Stamp, toScreen(cam, e.pos.x, e.pos.y), s, e.age ?? 0, scene);
  }
}

// A mark is an upright signpost on its tile, fading over its life but never quite gone until
// the server drops it. `faint` marks (in tiles you can't see) are drawn by sight.ts's caller.
function drawStamp(
  ctx: CanvasRenderingContext2D,
  id: Stamp,
  foot: { x: number; y: number },
  s: number,
  ageMs: number,
  scene: Scene,
) {
  void scene;
  const word = id === "door" || id === "key";
  ctx.save();
  ctx.globalAlpha = Math.max(0.25, 1 - ageMs / STAMP_LIFE_MS);
  const w = s * (word ? 1.3 : 0.8);
  const h = s * 0.7;
  const top = foot.y - s * 0.55 - h;
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = 3;
  ctx.beginPath(); // the post
  ctx.moveTo(foot.x, foot.y);
  ctx.lineTo(foot.x, top + h);
  ctx.stroke();
  ctx.fillStyle = COLOR.ui;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(foot.x - w / 2, top, w, h, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = WORLD.line;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(s * (word ? 0.4 : 0.65))}px system-ui, sans-serif`;
  ctx.fillText(STAMP_FACE[id], foot.x, top + h / 2 + 1);
  ctx.restore();
}
