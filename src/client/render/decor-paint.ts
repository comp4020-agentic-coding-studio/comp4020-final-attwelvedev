import { isHighContrast, mix, WORLD } from "../tokens.ts";
import type { DecorItem, DecorKind } from "./decor.ts";

// Decor painters (plan diorama-look §4.3, FR11, FR12): each draws one item in face-local px, (0, 0)
// the face's top-left and w × h its size. paintDecor clips to that rect first, so nothing (a glow
// included) leaves the face. No outline (WORLD.line is never used), no animation, and nothing in high
// contrast: decor is mood, never information.
//
// The banned list holds for every painter (decor-paint.test.ts): no circle big enough to read as a
// dial or a bell, no more than two horizontal lines across the face (no slats or rails; the staff's
// five carry no notes), and no motif or role shape.

type Painter = (c: CanvasRenderingContext2D, item: DecorItem, w: number, h: number) => void;

const BLACK = "#000000";
const GLOW = 0.3; // a lit item's glow at its centre, under FR11's 35 %

// A soft --w-sconce pool centred on (x, y), r across, fading to nothing. Clipped by paintDecor.
function glow(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
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
function bulb(c: CanvasRenderingContext2D, x: number, y: number, w: number) {
  c.fillStyle = WORLD.sconce;
  c.beginPath();
  c.arc(x, y, w * 0.05, 0, Math.PI * 2);
  c.fill();
}

const dark = (t: number) => mix(WORLD.wallFront, BLACK, t);

// The gallery: a gilt frame round an abstract field in two code colours mixed most of the way to the
// wall, with a picture light above it throwing a glow down the face.
const CODES = ["codeRed", "codeBlue", "codeYellow", "codeGreen"] as const;
const painting: Painter = (c, item, w, h) => {
  const fw = w * 0.56;
  const fh = h * 0.42;
  const fx = (w - fw) / 2;
  const fy = h * 0.26;
  glow(c, w / 2, fy, w * 0.55);
  c.fillStyle = mix(WORLD.brass, WORLD.wallFront, 0.2); // the frame
  c.fillRect(fx, fy, fw, fh);
  const a = WORLD[CODES[item.variant % 4] as (typeof CODES)[number]];
  const b = WORLD[CODES[(item.variant + 2) % 4] as (typeof CODES)[number]];
  const ix = fx + fw * 0.12;
  const iy = fy + fh * 0.14;
  const iw = fw * 0.76;
  const ih = fh * 0.72;
  c.fillStyle = mix(a, WORLD.wallFront, 0.7);
  c.fillRect(ix, iy, iw, ih);
  // the second colour as an off-centre block: a field, never a shape
  const split = [0.38, 0.55, 0.62, 0.45][item.variant % 4] as number;
  c.fillStyle = mix(b, WORLD.wallFront, 0.7);
  if (item.variant % 2 === 0) c.fillRect(ix + iw * split, iy, iw * (1 - split), ih);
  else c.fillRect(ix, iy + ih * split, iw, ih * (1 - split));
  // the picture light: a short brass arm and its bulb above the frame
  c.fillStyle = WORLD.brass;
  c.fillRect(w / 2 - w * 0.14, fy - h * 0.06, w * 0.28, h * 0.03);
  bulb(c, w / 2, fy - h * 0.045, w);
};

// The salon: instruments as flat silhouettes in a darker wall tone, hung on the face.
const violin: Painter = (c, _item, w, h) => {
  c.fillStyle = dark(0.35);
  const cx = w / 2;
  // the body: two lobes and a waist, as ellipses taller than wide (never a circle)
  c.beginPath();
  c.ellipse(cx, h * 0.58, w * 0.1, h * 0.1, 0, 0, Math.PI * 2);
  c.ellipse(cx, h * 0.4, w * 0.08, h * 0.08, 0, 0, Math.PI * 2);
  c.fill();
  c.fillRect(cx - w * 0.07, h * 0.4, w * 0.14, h * 0.18);
  c.fillRect(cx - w * 0.015, h * 0.14, w * 0.03, h * 0.28); // the neck
  c.fillRect(cx - w * 0.03, h * 0.1, w * 0.06, h * 0.06); // the scroll
};
const lute: Painter = (c, _item, w, h) => {
  c.fillStyle = dark(0.35);
  const cx = w / 2;
  c.beginPath();
  c.ellipse(cx, h * 0.6, w * 0.12, h * 0.15, 0, 0, Math.PI * 2); // a pear-shaped bowl
  c.fill();
  c.beginPath();
  c.moveTo(cx - w * 0.1, h * 0.52);
  c.lineTo(cx, h * 0.34);
  c.lineTo(cx + w * 0.1, h * 0.52);
  c.closePath();
  c.fill();
  c.save();
  c.translate(cx, h * 0.34);
  c.rotate(-0.35); // the neck, bent back
  c.fillRect(-w * 0.015, -h * 0.22, w * 0.03, h * 0.24);
  c.restore();
};
// Five thin lines across the middle of the face: a staff, which carries no notes.
const staff: Painter = (c, item, w, h) => {
  c.fillStyle = dark(0.3);
  const gap = h * 0.07;
  const top = h * (0.3 + 0.03 * (item.variant % 2));
  for (let i = 0; i < 5; i++) c.fillRect(w * 0.12, top + i * gap, w * 0.76, 1);
};
// A curtain swag across the top: a drape that dips in the middle, in a darker wall tone.
const swag: Painter = (c, _item, w, h) => {
  c.fillStyle = dark(0.25);
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(w, 0);
  c.lineTo(w, h * 0.3);
  c.quadraticCurveTo(w / 2, h * 0.12, 0, h * 0.3);
  c.closePath();
  c.fill();
  c.fillStyle = dark(0.4); // the tails down each side
  c.fillRect(0, 0, w * 0.06, h * 0.42);
  c.fillRect(w * 0.94, 0, w * 0.06, h * 0.42);
};

// The strongroom: a row of six rivet heads along the top; steel cladding with vertical seams; a caged
// sconce with its glow.
const rivets: Painter = (c, item, w, h) => {
  c.fillStyle = mix(WORLD.steelFront, WORLD.wallFront, 0.3);
  const y = item.face === "top" ? h / 2 : h * 0.1;
  const r = Math.min(w * 0.025, h * 0.08);
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.arc(w * (0.12 + (i * 0.76) / 5), y, r, 0, Math.PI * 2);
    c.fill();
  }
};
const cladding: Painter = (c, item, w, h) => {
  c.fillStyle = mix(WORLD.steel, WORLD.wallFront, 0.45);
  c.fillRect(0, h * 0.05, w, h * 0.9);
  c.fillStyle = mix(WORLD.steelFront, WORLD.wallFront, 0.3);
  const seams = 2 + (item.variant % 2);
  for (let i = 1; i <= seams; i++) c.fillRect((w * i) / (seams + 1) - 0.5, h * 0.05, 1, h * 0.9);
};
const cagedSconce: Painter = (c, _item, w, h) => {
  const x = w / 2;
  const y = h * 0.38;
  glow(c, x, y, w * 0.5);
  c.fillStyle = mix(WORLD.steelFront, BLACK, 0.2); // the wall plate
  c.fillRect(x - w * 0.06, y + h * 0.1, w * 0.12, h * 0.05);
  bulb(c, x, y, w);
  c.fillStyle = mix(WORLD.steelFront, BLACK, 0.3); // the cage: three upright bars
  for (const dx of [-0.05, 0, 0.05]) c.fillRect(x + w * dx - 0.5, y - h * 0.08, 1, h * 0.18);
};

// How many looks each kind has: the rest of an item's variant is ignored, so the atlas keeps one tile
// per look, not per variant.
export const LOOKS: Record<DecorKind, number> = {
  painting: 4,
  violin: 1,
  lute: 1,
  staff: 2,
  swag: 1,
  rivets: 1,
  cladding: 2,
  cagedSconce: 1,
};
// The atlas's name for an item's look on its face.
export const decorTile = (item: DecorItem): string =>
  `${item.face}:${item.kind}:${item.variant % LOOKS[item.kind]}`;

export const PAINTERS: Record<DecorKind, Painter> = {
  painting,
  violin,
  lute,
  staff,
  swag,
  rivets,
  cladding,
  cagedSconce,
};

// Paints one item on its face, clipped to it. A no-op in high contrast (FR9).
export function paintDecor(c: CanvasRenderingContext2D, item: DecorItem, w: number, h: number) {
  if (isHighContrast() || w <= 0 || h <= 0) return;
  c.save();
  c.beginPath();
  c.rect(0, 0, w, h);
  c.clip();
  PAINTERS[item.kind](c, item, w, h);
  c.restore();
}
