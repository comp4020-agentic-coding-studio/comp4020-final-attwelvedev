import type { EntityView } from "../../net/protocol.ts";
import { WORLD } from "../tokens.ts";
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
