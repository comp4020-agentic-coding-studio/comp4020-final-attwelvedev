import { COLOR } from "../tokens.ts";
import type { Scene } from "./index.ts";

// A steady red border and a banner. The banner's intensity follows a 1 Hz sine
// (one pulse a second, far under the flashing limit); with reduced motion it
// does not move at all. The word is there so it never rests on colour alone.
export function drawAlarm(ctx: CanvasRenderingContext2D, scene: Scene) {
  const pulse = scene.reducedMotion
    ? 1
    : 0.7 + 0.3 * Math.sin(((scene.nowMs ?? 0) / 1000) * 2 * Math.PI);
  ctx.save();
  ctx.lineWidth = 6;
  ctx.strokeStyle = COLOR.danger;
  ctx.strokeRect(3, 3, scene.w - 6, scene.h - 6);
  ctx.globalAlpha = pulse;
  const w = Math.min(scene.w - 24, 220);
  ctx.fillStyle = COLOR.danger;
  ctx.fillRect((scene.w - w) / 2, 12, w, 30);
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLOR.bg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 16px system-ui, sans-serif";
  ctx.fillText("Alarm", scene.w / 2, 28);
  ctx.restore();
}
