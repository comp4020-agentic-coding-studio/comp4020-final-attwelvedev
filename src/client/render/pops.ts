import { COLOR, MAP, WORLD } from "../tokens.ts";
import type { FacePop, Scene } from "./index.ts";
import { type Camera, TILT, toScreen } from "./project.ts";

// A face pop is 1.4 tiles on a white plate, above its sender's head. Pops whose sender isn't
// among the entities are dropped here; Task 20 gives them an edge pill instead.
export function drawPops(ctx: CanvasRenderingContext2D, scene: Scene, cam: Camera) {
  for (const pop of scene.pops ?? []) drawPop(ctx, scene, cam, pop);
}

function drawPop(ctx: CanvasRenderingContext2D, scene: Scene, cam: Camera, pop: FacePop) {
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
