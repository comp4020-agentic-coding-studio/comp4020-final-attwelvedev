import { COLOR, WORLD } from "../tokens.ts";
import type { Scene } from "./index.ts";
import { type Camera, TILT, toScreen } from "./project.ts";

const CLIFF_TILES = 2; // the island's slab runs this far down before it meets the water
const SLAB_TILES = 0.3; // of which the top part is the floor's own edge
const RIPPLES = 7;
const DRIFT_PX_PER_S = 6;

// Sky down to a horizon just above the north wall, water below it, then the island's slab and
// its cliff running into the water. Everything here is behind the room.
export function drawBackdrop(ctx: CanvasRenderingContext2D, scene: Scene, cam: Camera) {
  const { w, h } = scene;
  const rows = scene.tiles?.length ?? 1;
  const cols = scene.tiles?.[0]?.length ?? 1;
  const horizon = Math.max(0, Math.min(h, toScreen(cam, 0, 0, TILT.wall).y - cam.scale * 0.8));
  const sky = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizon));
  sky.addColorStop(0, WORLD.skyHi);
  sky.addColorStop(1, WORLD.skyLo);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const water = ctx.createLinearGradient(0, horizon, 0, h);
  water.addColorStop(0, WORLD.water);
  water.addColorStop(1, WORLD.waterDeep);
  ctx.fillStyle = water;
  ctx.fillRect(0, horizon, w, h - horizon);

  // a few ripples that drift sideways; still when the clock is absent or motion is reduced
  const drift =
    scene.reducedMotion || scene.nowMs === undefined ? 0 : (scene.nowMs / 1000) * DRIFT_PX_PER_S;
  ctx.fillStyle = WORLD.ripple;
  ctx.globalAlpha = 0.5;
  const span = w + 160;
  for (let i = 0; i < RIPPLES; i++) {
    const y = horizon + ((h - horizon) * (i + 0.5)) / RIPPLES;
    const x = ((i * 97 + drift * (1 + (i % 3) * 0.3)) % span) - 80;
    ctx.fillRect(x, y, 40 + (i % 3) * 20, 2);
  }
  ctx.globalAlpha = 1;

  // the slab: the floor's edge, then the cliff
  const left = toScreen(cam, 0, rows).x;
  const top = toScreen(cam, 0, rows).y;
  const width = cols * cam.scale + 0.5;
  ctx.fillStyle = WORLD.floorFront;
  ctx.fillRect(left, top, width, SLAB_TILES * cam.scale);
  const cliffTop = top + SLAB_TILES * cam.scale;
  const cliffH = (CLIFF_TILES - SLAB_TILES) * cam.scale;
  const cliff = ctx.createLinearGradient(0, cliffTop, 0, cliffTop + cliffH);
  cliff.addColorStop(0, WORLD.cliffHi);
  cliff.addColorStop(1, WORLD.cliffLo);
  ctx.fillStyle = cliff;
  ctx.fillRect(left, cliffTop, width, cliffH);
  // where it meets the water
  ctx.fillStyle = COLOR.ui;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(left, cliffTop + cliffH - 2, width, 2);
  ctx.globalAlpha = 1;
}
