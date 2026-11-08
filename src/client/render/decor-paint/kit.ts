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

// Lit from the north-west: a tone a little lighter, or a little darker, than the one given.
const WHITE = "#ffffff";
export const lighter = (tone: string, t = 0.25) => mix(tone, WHITE, t);
export const darker = (tone: string, t = 0.25) => mix(tone, BLACK, t);

// A solid box lit as the world is: its fill, a highlight along its top and left edges and a shade
// along its bottom and right (rule 6: no outline). Edges are 1 px, or less on a small box.
export function litBox(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  tone: string,
) {
  const e = Math.max(0.5, Math.min(1, w / 6, h / 6));
  c.fillStyle = tone;
  c.fillRect(x, y, w, h);
  c.fillStyle = lighter(tone);
  c.fillRect(x, y, w, e);
  c.fillRect(x, y, e, h);
  c.fillStyle = darker(tone);
  c.fillRect(x, y + h - e, w, e);
  c.fillRect(x + w - e, y, e, h);
}

// Wood and iron as the decor uses them: a warm brown from brass, and a dark iron from steel, both
// mixed a little toward the wall so they sit in the room's light.
export const wood = () => mix(darker(WORLD.brass, 0.45), WORLD.wallFront, 0.15);
export const iron = () => mix(darker(WORLD.steelFront, 0.55), WORLD.wallFront, 0.1);
// Rule 2 (DESIGN.md §4.9): a code colour in decor is mixed at least this far toward the wall, so no
// code can be read off it (decor-paint.test.ts measures every painter against 70 %).
export const MUTE = 0.72;
export const muted = (tone: string) => mix(tone, WORLD.wallFront, MUTE);
export const leafTone = (t = 0) => mix(darker(WORLD.codeGreen, 0.2 + t), WORLD.wallFront, 0.3);

// A small leaf: a lens at (x, y), l long, turned by a, with its lit half a shade lighter.
export function leaf(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  l: number,
  a: number,
  tone: string,
) {
  c.fillStyle = tone;
  c.beginPath();
  c.ellipse(x, y, l / 2, l / 4.5, a, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = lighter(tone, 0.2);
  c.beginPath();
  c.ellipse(x - l * 0.06, y - l * 0.06, l / 3.5, l / 9, a, 0, Math.PI * 2);
  c.fill();
}

// A small blossom: five dots round a brass centre, d across.
export function blossom(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  d: number,
  tone: string,
) {
  c.fillStyle = tone;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    c.beginPath();
    c.arc(x + Math.cos(a) * d * 0.28, y + Math.sin(a) * d * 0.28, d * 0.24, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = WORLD.brass;
  c.beginPath();
  c.arc(x, y, d * 0.14, 0, Math.PI * 2);
  c.fill();
}
