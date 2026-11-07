import { currentHue, duskSettled, isHighContrast, onWorldChange, worldStamp } from "../tokens.ts";
import { LIVE, TILT } from "./project.ts";

// The tile atlas (NFR-perf, plan diorama-look §4.4): a tile type's static layers are painted once to
// an offscreen canvas at the frame's device scale, and blitted after. Never a whole-room canvas. Used
// only on a settled projection with no dusk blend, so it never keeps a tile per animation frame.

export interface AtlasKey {
  scale: number; // CSS px per tile
  dpr: number; // device px per CSS px
  tokens: string; // changes whenever WORLD does
  theme: string;
}

const CAP = 64;
const tiles = new Map<string, HTMLCanvasElement>();

// The key for a frame at this scale: the device ratio, WORLD's stamp, the hue and the contrast mode.
// The last key made, reused while nothing it reads has changed (it is asked for once per tile).
let last: { ctx: CanvasRenderingContext2D; stamp: number; key: AtlasKey } | null = null;
export function atlasKey(ctx: CanvasRenderingContext2D, scale: number, theme = ""): AtlasKey {
  const stamp = worldStamp();
  if (
    last?.ctx === ctx &&
    last.stamp === stamp &&
    last.key.scale === scale &&
    last.key.theme === theme
  )
    return last.key;
  const dpr = ctx.getTransform?.()?.a || globalThis.devicePixelRatio || 1;
  const key = {
    scale,
    dpr,
    tokens: `${stamp}|${currentHue()}|${isHighContrast() ? "hc" : "n"}`,
    theme,
  };
  last = { ctx, stamp, key };
  return key;
}

// Draws a tile type's static layers once to an offscreen canvas and returns it. `paint` draws in CSS
// px, s being the tile's width; `box` is the canvas's size in CSS px (a tile square by default).
export function atlasTile(
  key: AtlasKey,
  tile: string,
  paint: (c: CanvasRenderingContext2D, s: number) => void,
  box: { w: number; h: number } = { w: key.scale, h: key.scale },
): CanvasImageSource {
  const id = `${key.scale * key.dpr}|${key.tokens}|${key.theme}|${tile}|${box.w}x${box.h}`;
  const known = tiles.get(id);
  if (known) {
    tiles.delete(id); // most recently used goes last
    tiles.set(id, known);
    return known;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(box.w * key.dpr));
  canvas.height = Math.max(1, Math.ceil(box.h * key.dpr));
  const c = canvas.getContext("2d");
  if (c) {
    c.scale(key.dpr, key.dpr);
    paint(c, key.scale);
  }
  tiles.set(id, canvas);
  while (tiles.size > CAP) {
    const oldest = tiles.keys().next().value;
    if (oldest === undefined) break;
    tiles.delete(oldest);
  }
  return canvas;
}

export function clearAtlas(): void {
  tiles.clear();
  last = null;
}
// setContrast, setHue and every dusk step repaint WORLD: the tiles painted before are dropped
onWorldChange(clearAtlas);

// Whether a frame may draw from the atlas: there is a document to paint on, the walls stand at full
// height, and the dusk palette is not blending.
export function atlasReady(): boolean {
  return typeof document !== "undefined" && LIVE.wall === TILT.wall && duskSettled();
}

// Draws one tile at (x, y), w × h CSS px: from the atlas when it is ready, else painted live with the
// same painter (so the two can never differ). `paint` draws at the origin it is given.
export function drawTile(
  ctx: CanvasRenderingContext2D,
  scale: number,
  tile: string,
  x: number,
  y: number,
  w: number,
  h: number,
  paint: (c: CanvasRenderingContext2D, ox: number, oy: number) => void,
): void {
  if (!atlasReady()) {
    paint(ctx, x, y);
    return;
  }
  const key = atlasKey(ctx, scale);
  const img = atlasTile(key, tile, (c) => paint(c, 0, 0), { w, h }) as HTMLCanvasElement;
  // a 1:1 copy onto whole device pixels: a blit that is scaled or lands between pixels is filtered,
  // which cost more than painting the tile live (the frame bench, Task 104)
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    img,
    Math.round(x * key.dpr) / key.dpr,
    Math.round(y * key.dpr) / key.dpr,
    img.width / key.dpr,
    img.height / key.dpr,
  );
  ctx.imageSmoothingEnabled = smooth;
}
