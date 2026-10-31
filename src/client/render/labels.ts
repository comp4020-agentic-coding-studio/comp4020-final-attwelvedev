import { COLOR, WORLD } from "../tokens.ts";
import type { Scene } from "./index.ts";
import { type Camera, LIVE, toScreen } from "./project.ts";
import { plaqueBox } from "./stations.ts";

const FONT_PX = 13;
const LINE_PX = 17;
const PAD = 8;
const LIFT_PX = 46; // how far above the object the chip first floats
const GAP_PX = 6; // between two chips
const MARGIN = 8;
const MAX_W = 230;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w + GAP_PX &&
  b.x < a.x + a.w + GAP_PX &&
  a.y < b.y + b.h + GAP_PX &&
  b.y < a.y + a.h + GAP_PX;

// Breaks `text` into lines no wider than `maxW`, on word boundaries.
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxW) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// The labels (FR15): a glass chip with a leader line down to the thing it names. A chip that would
// sit on another moves to the nearest free place, so each stays readable; none is drawn over another.
export function drawLabels(ctx: CanvasRenderingContext2D, scene: Scene, cam: Camera) {
  // a plaque's plate is already on the wall: no chip sits on its words, so it starts as taken
  const placed: Rect[] = [];
  if (scene.report) scene.report = { chips: [], plaques: [] };
  for (const e of scene.entities) {
    let b: Rect | null = e.kind === "sign" ? plaqueBox(ctx, e, cam) : null;
    if (e.kind === "ink" && e.text) {
      // UV ink in a torch's light (gear.ts: drawUv): its words centred on its tile
      const c = toScreen(cam, e.pos.x, e.pos.y);
      const px = Math.round(cam.scale * 0.42);
      ctx.save();
      ctx.font = `700 ${px}px Archivo, system-ui, sans-serif`;
      const w = ctx.measureText(e.text).width;
      ctx.restore();
      b = { x: c.x - w / 2, y: c.y - px / 2, w, h: px };
    }
    if (!b) continue;
    placed.push({ x: b.x, y: b.y, w: b.w, h: b.h });
    scene.report?.plaques.push({ x: b.x, y: b.y, w: b.w, h: b.h });
  }
  for (const label of scene.labels ?? []) {
    const target = toScreen(cam, label.at.x, label.at.y, LIVE.block * 0.5);
    ctx.save();
    ctx.font = `600 ${FONT_PX}px "Archivo", system-ui, sans-serif`;
    const lines = wrap(ctx, label.text, Math.min(MAX_W, scene.w - 2 * (MARGIN + PAD)));
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + PAD * 2;
    const h = lines.length * LINE_PX + PAD;
    const x = Math.max(MARGIN, Math.min(scene.w - MARGIN - w, target.x - w / 2));
    // the first free place: from just above the thing, up a chip at a time, then down; a chip with
    // no free place in the frame is not drawn (the nearest ones come first, so they keep theirs)
    const want = Math.max(MARGIN, target.y - LIFT_PX - h);
    const free = (top: number) => !placed.some((o) => overlaps({ x, y: top, w, h }, o));
    const step = h + GAP_PX;
    const tries = [want];
    for (let k = 1; k * step < scene.h; k++) tries.push(want - k * step, want + k * step);
    const y = tries.find((t) => t >= MARGIN && t + h <= scene.h - MARGIN && free(t));
    if (y === undefined) {
      ctx.restore();
      continue;
    }
    placed.push({ x, y, w, h });
    scene.report?.chips.push({ x, y, w, h });
    const lineX = Math.max(x + 10, Math.min(x + w - 10, target.x));
    ctx.strokeStyle = WORLD.line;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(lineX, y + h);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(target.x, target.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = COLOR.ui;
    ctx.fill();
    ctx.fillStyle = "rgba(20, 30, 54, 0.88)"; // --glass: the canvas can't read an rgba token
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLOR.ui;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    lines.forEach((l, i) => {
      ctx.fillText(l, x + PAD, y + PAD / 2 + LINE_PX * (i + 0.5) + 1);
    });
    ctx.restore();
  }
}
