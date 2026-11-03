import type { Vec } from "../../game/types.ts";
import type { EntityView } from "../../net/protocol.ts";
import { WORLD } from "../tokens.ts";
import { drawItem } from "./items.ts";
import { type Camera, LIVE, toScreen } from "./project.ts";
import { motifGlyph } from "./stations.ts";

// A cache's motif tile: a card-coloured square flush with the floor, outlined, its symbol in the
// line colour. Drawn the same whether or not the cache is open, so only the riddle tells the right
// one from a decoy. The symbol is the whole message: no colour carries it.
export function drawMotifTile(ctx: CanvasRenderingContext2D, e: EntityView, cam: Camera) {
  if (!e.motif) return;
  const s = cam.scale;
  const c = toScreen(cam, e.pos.x, e.pos.y);
  const w = s * 0.82;
  const h = s * LIVE.depth * 0.82;
  ctx.fillStyle = WORLD.card;
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(c.x - w / 2, c.y - h / 2, w, h, 6);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(1, LIVE.depth);
  ctx.fillStyle = WORLD.line;
  motifGlyph(ctx, e.motif, 0, 0, s * 0.26);
  ctx.fill("evenodd");
  ctx.restore();
}

// A solved cache's keepsake standing in its open vault: the real object, on a low stone plinth with
// its own soft contact shadow. It does not bob (the loot diamond does), so the two never read alike.
// Gone the tick its owner takes it.
export function drawKeepsake(ctx: CanvasRenderingContext2D, e: EntityView, cam: Camera) {
  if (!e.keep) return;
  const s = cam.scale;
  const base = toScreen(cam, e.pos.x, e.pos.y);
  const w = s * 0.62;
  const d = s * LIVE.depth * 0.5;
  const rise = s * 0.16 * (LIVE.block / 0.7); // the plinth's height; flat before the world has risen
  ctx.save();
  ctx.globalAlpha = 0.28; // contact shadow
  ctx.fillStyle = WORLD.line;
  ctx.beginPath();
  ctx.ellipse(base.x, base.y + d * 0.2, w * 0.62, d * 0.46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = WORLD.card;
  ctx.fillRect(base.x - w / 2, base.y - rise - d / 2, w, d);
  ctx.fillStyle = WORLD.steelFront;
  ctx.fillRect(base.x - w / 2, base.y - rise + d / 2, w, rise);
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(base.x - w / 2, base.y - rise - d / 2, w, d + rise);
  drawItem(ctx, e.keep, base.x, base.y - rise - s * 0.34, s * 0.7);
}

// A secret door sinking into the floor, `age` 0 to 1 over the slide's 600 ms: the door's own face
// (DESIGN 4.8) shrinking to nothing, as an ordinary door does. Reduced motion has no slide: the
// full wall cross-fades out over the same time instead.
export function drawSlide(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  cam: Camera,
  age: number,
  reduced: boolean,
) {
  const s = cam.scale;
  const t = toScreen(cam, pos.x - 0.5, pos.y - 0.5, LIVE.block);
  const f = toScreen(cam, pos.x - 0.5, pos.y + 0.5, LIVE.block);
  const full = LIVE.block * s;
  const rest = reduced ? 1 : 1 - Math.min(1, Math.max(0, age));
  const h = full * rest;
  ctx.save();
  if (reduced) ctx.globalAlpha = 1 - Math.min(1, Math.max(0, age * 2)); // gone by 300 ms of the 600
  // the top sinks with the face: it is the face's top edge, lowered by what has gone
  const drop = full - h;
  ctx.fillStyle = WORLD.door;
  ctx.fillRect(t.x, t.y + drop, s + 0.5, s * LIVE.depth + 0.5);
  ctx.fillStyle = WORLD.doorFront;
  ctx.fillRect(t.x, f.y + drop, s + 0.5, h);
  ctx.fillStyle = WORLD.doorSeam;
  ctx.fillRect(t.x + s / 2 - 1, f.y + drop, 2, h);
  ctx.restore();
}

// A cache dial's inspection plate: the whole floor tile is a steel plate set flush in the floor,
// washed so faintly that the floor still shows through (still grey, close to the floor's own tone),
// with a thin outline for high contrast and a rivet at each end. Flat, unlabelled and with no wire to
// it: it reads as a different slab of floor, not a box or a button. Drawn at the dial's `back` tile
// when the station is a cache's.
const PLATE_WASH = 0.4;
export function drawInspectionPlate(ctx: CanvasRenderingContext2D, t: Vec, cam: Camera) {
  const s = cam.scale;
  const top = toScreen(cam, t.x, t.y);
  const w = s;
  const h = s * LIVE.depth;
  ctx.save();
  ctx.globalAlpha = PLATE_WASH;
  ctx.fillStyle = WORLD.steel;
  ctx.fillRect(top.x, top.y, w, h);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = WORLD.line;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(top.x + 1, top.y + 1, w - 2, h - 2);
  ctx.restore();
  // two rivets: a plate, not a button
  ctx.fillStyle = WORLD.line;
  for (const dx of [0.22, 0.78]) {
    ctx.beginPath();
    ctx.ellipse(top.x + w * dx, top.y + h / 2, s * 0.03, s * LIVE.depth * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
