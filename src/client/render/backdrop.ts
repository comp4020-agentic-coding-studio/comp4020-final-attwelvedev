import { COLOR, isHighContrast, mix, WORLD, worldStamp } from "../tokens.ts";
import type { Scene } from "./index.ts";
import { type Camera, LIVE, toScreen } from "./project.ts";

const CLIFF_TILES = 2; // the island's slab runs this far down before it meets the water
const SLAB_TILES = 0.3; // of which the top part is the floor's own edge
const RIPPLES = 7;
const DRIFT_PX_PER_S = 6;
const STRATA = 3; // bands of rock across the cliff
const REFLECTION_TILES = 0.6; // the slab's still reflection under the cliff
export const REFLECTION_ALPHA = 0.12;

// The sky down to the horizon, and the sun's glow in the top-left corner when `sun`.
function paintSky(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  horizon: number,
  sun: boolean,
) {
  const sky = c.createLinearGradient(0, 0, 0, Math.max(1, horizon));
  sky.addColorStop(0, WORLD.skyHi);
  sky.addColorStop(1, WORLD.skyLo);
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  if (!sun) return;
  const r = Math.max(w, h) * 0.6;
  const glow = c.createRadialGradient(0, 0, 0, 0, 0, r);
  const tone = mix(WORLD.skyHi, "#ffffff", 0.5);
  glow.addColorStop(0, `${tone}66`); // 40 %
  glow.addColorStop(1, `${tone}00`);
  c.fillStyle = glow;
  c.fillRect(0, 0, Math.min(w, r), Math.min(h, r));
}
let sky: { id: string; img: HTMLCanvasElement } | null = null;
let lastSky = ""; // the sky asked for by the previous frame
function skyImage(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  horizon: number,
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null; // the unit tests' recorder: drawn directly
  const dpr = ctx.getTransform?.()?.a || 1;
  const id = `${w}x${h}@${dpr}|${Math.round(horizon * dpr)}|${worldStamp()}`;
  if (sky?.id === id) return sky.img;
  // the horizon moved since the last frame (the camera is panning north or south): the plain sky, and
  // the glow is painted again once it holds still, so a pan never pays for a new image every frame
  if (lastSky !== id) {
    lastSky = id;
    return null;
  }
  const img = document.createElement("canvas");
  img.width = Math.max(1, Math.round(w * dpr));
  img.height = Math.max(1, Math.round(h * dpr));
  const c = img.getContext("2d");
  if (!c) return null;
  c.scale(dpr, dpr);
  // painted at the horizon its key names (whole device pixels), so one key always holds one picture,
  // however the eased camera came to rest
  paintSky(c, w, h, Math.round(horizon * dpr) / dpr, true);
  sky = { id, img };
  return img;
}

// Sky down to a horizon just above the north wall, water below it, then the island's slab and
// its cliff running into the water. Everything here is behind the room. Lit from the north-west: a sun
// glow in the top-left corner, strata across the cliff, a foam line where it meets the water and its
// still reflection below. High contrast draws only the flat fills (FR9).
export function drawBackdrop(ctx: CanvasRenderingContext2D, scene: Scene, cam: Camera) {
  const { w, h } = scene;
  const flat = isHighContrast();
  const rows = scene.tiles?.length ?? 1;
  const cols = scene.tiles?.[0]?.length ?? 1;
  const horizon = Math.max(0, Math.min(h, toScreen(cam, 0, 0, LIVE.wall).y - cam.scale * 0.8));
  // the sky, and (not in high contrast) the sun low in the north-west. A see-through glow over the
  // canvas cost a tenth of the frame on a phone (the frame bench), so in a browser the two are painted
  // together once per size, horizon and palette and copied opaque, which costs what the sky's fill did
  const img = flat ? null : skyImage(ctx, w, h, horizon);
  if (img) ctx.drawImage(img, 0, 0, w, h);
  // no image: high contrast (no sun), a pan in progress (no sun until it settles), or no document to
  // paint one on (drawn directly, sun and all)
  else paintSky(ctx, w, h, horizon, !flat && typeof document === "undefined");
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
  const cliffTop = top + SLAB_TILES * cam.scale;
  const cliffH = (CLIFF_TILES - SLAB_TILES) * cam.scale;
  const foot = cliffTop + cliffH;
  if (!flat) {
    // the slab's still reflection in the water, fading downward (the ripples cross it)
    const reflection = ctx.createLinearGradient(0, foot, 0, foot + REFLECTION_TILES * cam.scale);
    reflection.addColorStop(0, WORLD.cliffHi);
    reflection.addColorStop(1, `${WORLD.cliffHi}00`);
    ctx.save();
    ctx.globalAlpha = REFLECTION_ALPHA;
    ctx.fillStyle = reflection;
    ctx.fillRect(left, foot, width, REFLECTION_TILES * cam.scale);
    ctx.restore();
  }
  ctx.fillStyle = WORLD.floorFront;
  ctx.fillRect(left, top, width, SLAB_TILES * cam.scale);
  const cliff = ctx.createLinearGradient(0, cliffTop, 0, foot);
  cliff.addColorStop(0, WORLD.cliffHi);
  cliff.addColorStop(1, WORLD.cliffLo);
  ctx.fillStyle = cliff;
  ctx.fillRect(left, cliffTop, width, cliffH);
  if (flat) {
    // where it meets the water
    ctx.fillStyle = COLOR.ui;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(left, foot - 2, width, 2);
    ctx.globalAlpha = 1;
    return;
  }
  // strata: bands of rock, each a step darker, parted by a 1 px line
  const band = cliffH / STRATA;
  for (let i = 1; i < STRATA; i++) {
    const y = cliffTop + band * i;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = mix(WORLD.cliffHi, WORLD.cliffLo, i / STRATA);
    ctx.fillRect(left, y, width, band);
    ctx.restore();
    ctx.fillStyle = mix(WORLD.cliffLo, "#000000", 0.15);
    ctx.fillRect(left, y, width, 1);
  }
  // the foam where it meets the water, with a white crest
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = WORLD.ripple;
  ctx.fillRect(left, foot - 2, width, 2);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(left, foot - 2, width, 1);
  ctx.restore();
}
