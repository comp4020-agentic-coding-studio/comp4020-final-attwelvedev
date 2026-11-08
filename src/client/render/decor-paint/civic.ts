import { mix, WORLD } from "../../tokens.ts";
import { BLACK, bulb, glow, type Painter } from "./kit.ts";

// Rooms 03 (watch house), 04 (bank) and 05 (gallery).

// The watch house: a swallowtail banner in wall tones, and an unlit sconce (no glow).
export const banner: Painter = (c, _item, w, h) => {
  c.fillStyle = mix(WORLD.wallFront, BLACK, 0.25);
  c.beginPath();
  c.moveTo(w * 0.3, h * 0.08);
  c.lineTo(w * 0.7, h * 0.08);
  c.lineTo(w * 0.7, h * 0.82);
  c.lineTo(w * 0.5, h * 0.66);
  c.lineTo(w * 0.3, h * 0.82);
  c.closePath();
  c.fill();
};
function sconceBody(c: CanvasRenderingContext2D, w: number, h: number) {
  c.fillStyle = mix(WORLD.wallFront, BLACK, 0.35); // plate and cup
  c.fillRect(w / 2 - w * 0.06, h * 0.5, w * 0.12, h * 0.05);
  c.fillRect(w / 2 - w * 0.04, h * 0.34, w * 0.08, h * 0.16);
}
export const sconceDim: Painter = (c, _item, w, h) => {
  sconceBody(c, w, h);
  c.fillStyle = mix(WORLD.sconce, WORLD.wallFront, 0.8); // a cold bulb
  c.beginPath();
  c.arc(w / 2, h * 0.31, w * 0.04, 0, Math.PI * 2);
  c.fill();
};

// The bank: a lower panel with one rail, a framed card, a lit sconce.
export const wainscot: Painter = (c, _item, w, h) => {
  c.fillStyle = mix(WORLD.wallFront, BLACK, 0.18);
  c.fillRect(0, h * 0.58, w, h * 0.42);
  c.fillStyle = mix(WORLD.brass, WORLD.wallFront, 0.3); // the one rail
  c.fillRect(0, h * 0.58, w, 1.5);
};
export const certificate: Painter = (c, _item, w, h) => {
  c.fillStyle = mix(WORLD.brass, WORLD.wallFront, 0.25);
  c.fillRect(w * 0.26, h * 0.22, w * 0.48, h * 0.5);
  c.fillStyle = mix(WORLD.wallTop, WORLD.wallFront, 0.4); // the card
  c.fillRect(w * 0.3, h * 0.27, w * 0.4, h * 0.4);
};
export const sconce: Painter = (c, _item, w, h) => {
  glow(c, w / 2, h * 0.31, w * 0.5);
  sconceBody(c, w, h);
  bulb(c, w / 2, h * 0.31, w);
};

// The gallery: a gilt frame round an abstract field in two code colours mixed most of the way to the
// wall, with a picture light above it throwing a glow down the face.
const CODES = ["codeRed", "codeBlue", "codeYellow", "codeGreen"] as const;
export const painting: Painter = (c, item, w, h) => {
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
