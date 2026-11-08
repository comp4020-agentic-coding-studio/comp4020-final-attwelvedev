import { mix, WORLD } from "../../tokens.ts";
import type { DecorItem } from "../decor.ts";

// What every decor painter shares (decor-paint.ts re-exports it): its signature, the glow, a bulb and
// the wall's own tone darkened. A painter draws one item in face-local px, (0, 0) the face's top-left
// and w × h its size; paintDecor has already clipped to that rect.

export type Painter = (c: CanvasRenderingContext2D, item: DecorItem, w: number, h: number) => void;

export const BLACK = "#000000";
const GLOW = 0.3; // a lit item's glow at its centre, under FR11's 35 %

// A soft --w-sconce pool centred on (x, y), r across, fading to nothing. Clipped by paintDecor.
export function glow(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, WORLD.sconce);
  g.addColorStop(1, `${WORLD.sconce}00`); // the same light, gone
  c.save();
  c.globalAlpha = GLOW;
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
  c.restore();
}

// A small bulb (a picture light's, a sconce's): 0.1 of the face across.
export function bulb(c: CanvasRenderingContext2D, x: number, y: number, w: number) {
  c.fillStyle = WORLD.sconce;
  c.beginPath();
  c.arc(x, y, w * 0.05, 0, Math.PI * 2);
  c.fill();
}

export const dark = (t: number) => mix(WORLD.wallFront, BLACK, t);
