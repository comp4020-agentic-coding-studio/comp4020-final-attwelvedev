import { mix, WORLD } from "../../tokens.ts";
import {
  bulb,
  darker,
  glow,
  iron,
  lighter,
  litBox,
  MUTE,
  muted,
  type Painter,
  wood,
} from "./kit.ts";

// Rooms 03 (watch house), 04 (bank) and 05 (gallery): things a watch house, a bank hall and a gallery
// hang on their walls, each with a job (DESIGN.md §4.9).

const brassFrame = () => mix(WORLD.brass, WORLD.wallFront, 0.15);
const cloth = () => muted(darker(WORLD.codeRed, 0.35));
const paper = () => mix(WORLD.codeWhite, WORLD.brass, 0.15);

function bar(
  c: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  tone: string,
) {
  c.strokeStyle = tone;
  c.lineWidth = w;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}

// The watch house's banner: cloth hung from a wooden rod on two cords, a swallowtail foot, a darker
// border and two tassels at the rod's ends. It hangs flat on the wall, from a rod (never a flag on a
// pole, which is the exit's look).
export const banner: Painter = (c, item, w, h) => {
  const x0 = w * 0.3;
  const x1 = w * 0.7;
  const top = h * 0.16;
  const foot = h * 0.8;
  bar(c, w * 0.5, h * 0.05, x0, top, 1, darker(wood(), 0.2)); // the cords to a peg
  bar(c, w * 0.5, h * 0.05, x1, top, 1, darker(wood(), 0.2));
  litBox(c, w * 0.485, h * 0.035, w * 0.03, w * 0.03, iron());
  const tone = item.variant % 2 ? muted(darker(WORLD.codeBlue, 0.4)) : cloth();
  c.fillStyle = tone;
  c.beginPath();
  c.moveTo(x0, top);
  c.lineTo(x1, top);
  c.lineTo(x1, foot);
  c.lineTo(w * 0.5, foot - h * 0.12);
  c.lineTo(x0, foot);
  c.closePath();
  c.fill();
  // folds: a lit stripe and a shaded one down the cloth
  c.fillStyle = lighter(tone, 0.12);
  c.fillRect(x0 + (x1 - x0) * 0.18, top, (x1 - x0) * 0.12, foot - top - h * 0.08);
  c.fillStyle = darker(tone, 0.18);
  c.fillRect(x0 + (x1 - x0) * 0.66, top, (x1 - x0) * 0.14, foot - top - h * 0.1);
  // a border band in brass a little below the rod
  c.fillStyle = darker(WORLD.brass, 0.15); // plain brass: tinted by the cloth it read as a code yellow
  c.fillRect(x0, top + h * 0.06, x1 - x0, Math.max(1, h * 0.025));
  litBox(c, x0 - w * 0.06, top - h * 0.02, x1 - x0 + w * 0.12, h * 0.03, wood()); // the rod
  for (const x of [x0 - w * 0.05, x1 + w * 0.05]) {
    bar(c, x, top, x, top + h * 0.1, 1, WORLD.brass); // a tassel's cord and its tuft
    c.fillStyle = darker(WORLD.brass, 0.1);
    c.beginPath();
    c.moveTo(x - w * 0.025, top + h * 0.16);
    c.lineTo(x + w * 0.025, top + h * 0.16);
    c.lineTo(x, top + h * 0.09);
    c.closePath();
    c.fill();
  }
};

// A hooded lantern: an iron hood and a box of warm panes on a short wall arm, lit.
export const hoodedLantern: Painter = (c, _item, w, h) => {
  const cx = w * 0.5;
  const top = h * 0.3;
  const lw = w * 0.16;
  const lh = h * 0.2;
  glow(c, cx, top + lh * 0.5, w * 0.48);
  litBox(c, cx - w * 0.05, top + lh + h * 0.02, w * 0.1, h * 0.12, iron()); // the wall bracket
  c.fillStyle = mix(WORLD.sconce, WORLD.brass, 0.3);
  c.fillRect(cx - lw / 2, top, lw, lh);
  c.fillStyle = WORLD.sconce;
  c.fillRect(cx - lw * 0.22, top + lh * 0.12, lw * 0.44, lh * 0.76);
  c.fillStyle = iron();
  for (const dx of [-0.5, 0.5]) c.fillRect(cx + lw * dx - 0.75, top, 1.5, lh);
  litBox(c, cx - lw * 0.6, top + lh, lw * 1.2, h * 0.025, iron());
  c.fillStyle = iron(); // the hood: a flared cap with a ring on top
  c.beginPath();
  c.moveTo(cx - lw * 0.8, top + h * 0.01);
  c.lineTo(cx + lw * 0.8, top + h * 0.01);
  c.lineTo(cx + lw * 0.3, top - h * 0.06);
  c.lineTo(cx - lw * 0.3, top - h * 0.06);
  c.closePath();
  c.fill();
  c.fillStyle = lighter(iron(), 0.25);
  c.fillRect(cx - lw * 0.6, top - h * 0.01, lw * 0.5, 1);
  bulb(c, cx, top + lh * 0.5, w);
};

// Crossed staves on two pegs: two wooden quarterstaffs leaning across each other, iron-shod ends.
export const staves: Painter = (c, _item, w, h) => {
  const t = Math.max(1.5, w * 0.04);
  for (const [x0, x1] of [
    [0.22, 0.78],
    [0.78, 0.22],
  ] as const) {
    bar(c, w * x0 + 1, h * 0.12 + 1, w * x1 + 1, h * 0.9 + 1, t, darker(wood(), 0.35)); // shade
    bar(c, w * x0, h * 0.12, w * x1, h * 0.9, t, wood());
    bar(c, w * x0, h * 0.12, w * x0 + (x1 - x0) * w * 0.08, h * 0.18, t, iron());
  }
  for (const x of [0.36, 0.64]) litBox(c, w * x - w * 0.03, h * 0.36, w * 0.06, h * 0.05, iron());
};

// A coil of rope hung on an iron hook: rings of rope, each lit on its top, hanging long and flattened
// under its own weight, so never a round face (rule 3).
export const ropeCoil: Painter = (c, _item, w, h) => {
  const cx = w * 0.5;
  const cy = h * 0.52;
  const rope = mix(WORLD.brass, WORLD.wallFront, 0.35);
  litBox(c, cx - w * 0.03, h * 0.18, w * 0.06, h * 0.06, iron());
  bar(c, cx, h * 0.22, cx, h * 0.3, Math.max(1, w * 0.025), iron());
  c.lineWidth = Math.max(1.5, w * 0.035);
  for (let i = 0; i < 4; i++) {
    const rx = w * (0.13 - i * 0.008);
    const ry = h * (0.22 - i * 0.008);
    c.strokeStyle = darker(rope, 0.15 + 0.05 * (i % 2));
    c.beginPath();
    c.ellipse(cx + i * 0.6, cy + i * 0.8, rx, ry, 0.15, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = lighter(rope, 0.15);
    c.beginPath();
    c.ellipse(cx + i * 0.6, cy + i * 0.8, rx, ry, 0.15, Math.PI * 1.1, Math.PI * 1.7);
    c.stroke();
  }
  bar(
    c,
    cx + w * 0.12,
    cy + h * 0.18,
    cx + w * 0.16,
    cy + h * 0.36,
    Math.max(1.5, w * 0.035),
    rope,
  ); // the end
};

// The bank: a raised-panel wainscot under one dado rail, a framed engraving, a banker's lamp, a strip
// of brass coat hooks.
export const wainscot: Painter = (c, item, w, h) => {
  const panel = mix(wood(), WORLD.wallFront, 0.35);
  const top = h * 0.5;
  c.fillStyle = panel;
  c.fillRect(0, top, w, h - top);
  // one raised panel per tile (two on the second look), each lit on its top-left
  const n = 1 + (item.variant % 2);
  for (let i = 0; i < n; i++) {
    const px = w * 0.1 + (i * w * 0.8) / n;
    const pw = (w * 0.8) / n - w * 0.06;
    litBox(c, px, top + h * 0.1, pw, h * 0.28, lighter(panel, 0.06));
    c.fillStyle = panel;
    c.fillRect(px + pw * 0.15, top + h * 0.15, pw * 0.7, h * 0.18);
  }
  litBox(c, 0, top - h * 0.03, w, h * 0.04, mix(wood(), WORLD.brass, 0.2)); // the dado rail
};

// A framed engraving: a dark wooden frame, a cream mount, and a landscape in brown line (fields
// and a far hill): no text, no figure.
export const engraving: Painter = (c, item, w, h) => {
  const fx = w * 0.24;
  const fy = h * 0.18;
  const fw = w * 0.52;
  const fh = h * 0.4;
  bar(c, w * 0.5, h * 0.06, fx + fw * 0.2, fy, 1, darker(WORLD.brass, 0.3)); // the hanging wire
  bar(c, w * 0.5, h * 0.06, fx + fw * 0.8, fy, 1, darker(WORLD.brass, 0.3));
  litBox(c, fx, fy, fw, fh, darker(wood(), 0.1));
  c.fillStyle = paper();
  c.fillRect(fx + fw * 0.1, fy + fh * 0.1, fw * 0.8, fh * 0.8);
  const ink = mix(darker(WORLD.brass, 0.5), paper(), 0.3);
  const ix = fx + fw * 0.2;
  const iw = fw * 0.6;
  const iy = fy + fh * 0.22;
  const ih = fh * 0.56;
  c.strokeStyle = ink;
  c.lineWidth = 1;
  c.beginPath(); // a hill line, and a field line under it
  c.moveTo(ix, iy + ih * 0.55);
  c.quadraticCurveTo(
    ix + iw * (item.variant % 2 ? 0.3 : 0.6),
    iy + ih * 0.1,
    ix + iw,
    iy + ih * 0.5,
  );
  c.moveTo(ix, iy + ih * 0.8);
  c.lineTo(ix + iw, iy + ih * 0.72);
  c.stroke();
  c.fillStyle = ink; // a tree: a trunk and a canopy
  const tx = ix + iw * (item.variant % 2 ? 0.75 : 0.25);
  c.fillRect(tx - 0.5, iy + ih * 0.5, 1, ih * 0.28);
  c.beginPath();
  c.ellipse(tx, iy + ih * 0.42, iw * 0.09, ih * 0.14, 0, 0, Math.PI * 2);
  c.fill();
};

// A banker's lamp on the wall: a brass arm and a long green shade, lit beneath.
export const bankerLamp: Painter = (c, _item, w, h) => {
  const cx = w * 0.5;
  const sy = h * 0.3;
  glow(c, cx, sy + h * 0.06, w * 0.5);
  litBox(c, cx - w * 0.04, h * 0.42, w * 0.08, h * 0.12, WORLD.brass); // the wall plate
  bar(c, cx, h * 0.44, cx, sy, Math.max(1, w * 0.025), WORLD.brass);
  const shade = muted(darker(WORLD.codeGreen, 0.3));
  c.fillStyle = shade;
  c.beginPath();
  c.moveTo(cx - w * 0.18, sy + h * 0.04);
  c.lineTo(cx + w * 0.18, sy + h * 0.04);
  c.lineTo(cx + w * 0.13, sy - h * 0.03);
  c.lineTo(cx - w * 0.13, sy - h * 0.03);
  c.closePath();
  c.fill();
  c.fillStyle = lighter(shade, 0.3);
  c.fillRect(cx - w * 0.12, sy - h * 0.02, w * 0.12, 1);
  c.fillStyle = WORLD.sconce; // the light under the shade
  c.fillRect(cx - w * 0.14, sy + h * 0.04, w * 0.28, Math.max(1, h * 0.015));
};

// A brass coat-hook strip: a wooden board with four brass hooks.
export const coatHooks: Painter = (c, _item, w, h) => {
  const y = h * 0.3;
  litBox(c, w * 0.1, y, w * 0.8, h * 0.07, wood());
  for (let i = 0; i < 4; i++) {
    const x = w * (0.2 + i * 0.2);
    c.fillStyle = WORLD.brass;
    c.fillRect(x - 1, y + h * 0.02, 2, h * 0.1);
    c.beginPath();
    c.ellipse(x + w * 0.02, y + h * 0.12, w * 0.025, h * 0.012, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = lighter(WORLD.brass, 0.3);
    c.fillRect(x - 1, y + h * 0.02, 1, h * 0.06);
  }
};

// The gallery: a gilt moulded frame, in one of two sizes, round a landscape or a still life in code
// colours mixed most of the way to the wall (MUTE), so no code survives in it; a plain label card
// under it, and a picture light above (lit). No portraits: a figure would read as a role's shape.
export { MUTE };

// The picture inside a painting's moulding: a landscape (looks 0 and 1) or a still life (2 and 3).
function paintingPicture(
  c: CanvasRenderingContext2D,
  variant: number,
  ix: number,
  iy: number,
  iw: number,
  ih: number,
): void {
  if (variant < 2) {
    // a landscape: sky, a far hill, a near field, a tree
    c.fillStyle = muted(WORLD.codeBlue);
    c.fillRect(ix, iy, iw, ih);
    c.fillStyle = muted(mix(WORLD.codeGreen, WORLD.codeBlue, 0.4));
    c.beginPath();
    c.moveTo(ix, iy + ih * 0.6);
    c.quadraticCurveTo(ix + iw * 0.4, iy + ih * 0.25, ix + iw, iy + ih * 0.55);
    c.lineTo(ix + iw, iy + ih);
    c.lineTo(ix, iy + ih);
    c.closePath();
    c.fill();
    c.fillStyle = muted(WORLD.codeGreen);
    c.fillRect(ix, iy + ih * 0.72, iw, ih * 0.28);
    c.fillStyle = muted(darker(WORLD.codeGreen, 0.3));
    c.beginPath();
    c.ellipse(ix + iw * 0.72, iy + ih * 0.5, iw * 0.1, ih * 0.18, 0, 0, Math.PI * 2);
    c.fill();
  } else {
    // a still life: a dark ground, a table edge, a jug and two pieces of fruit
    c.fillStyle = muted(darker(WORLD.codeBlue, 0.5));
    c.fillRect(ix, iy, iw, ih);
    c.fillStyle = muted(WORLD.codeYellow);
    c.fillRect(ix, iy + ih * 0.7, iw, ih * 0.3);
    c.fillStyle = muted(WORLD.codeWhite);
    c.fillRect(ix + iw * 0.22, iy + ih * 0.3, iw * 0.2, ih * 0.42);
    c.fillStyle = muted(WORLD.codeRed);
    c.beginPath();
    c.ellipse(ix + iw * 0.6, iy + ih * 0.64, iw * 0.08, ih * 0.1, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = muted(mix(WORLD.codeYellow, WORLD.codeRed, 0.4));
    c.beginPath();
    c.ellipse(ix + iw * 0.76, iy + ih * 0.66, iw * 0.07, ih * 0.09, 0, 0, Math.PI * 2);
    c.fill();
  }
}

export const painting: Painter = (c, item, w, h) => {
  const big = item.variant % 2 === 0;
  const fw = w * (big ? 0.66 : 0.5);
  const fh = h * (big ? 0.42 : 0.34);
  const fx = (w - fw) / 2;
  const fy = h * 0.2;
  glow(c, w / 2, fy + fh * 0.3, w * 0.55);
  const gilt = brassFrame();
  litBox(c, fx, fy, fw, fh, gilt);
  c.fillStyle = darker(gilt, 0.2); // the moulding's inner step
  const m = Math.max(2, fw * 0.08);
  c.fillRect(fx + m * 0.6, fy + m * 0.6, fw - m * 1.2, fh - m * 1.2);
  const ix = fx + m;
  const iy = fy + m;
  const iw = fw - 2 * m;
  const ih = fh - 2 * m;
  // a face only a few px tall (the board early in its tilt) has no room inside the moulding: the
  // frame alone, never a picture of negative size (which makes ellipse throw mid-frame)
  if (iw > 0 && ih > 0) paintingPicture(c, item.variant, ix, iy, iw, ih);
  // a plain label card under the frame (no text)
  litBox(c, w / 2 - w * 0.07, fy + fh + h * 0.05, w * 0.14, h * 0.05, paper());
  // the picture light: a brass arm and a short hood above the frame
  c.fillStyle = WORLD.brass;
  c.fillRect(w / 2 - 0.75, fy - h * 0.08, 1.5, h * 0.08);
  litBox(c, w / 2 - w * 0.12, fy - h * 0.09, w * 0.24, h * 0.03, WORLD.brass);
  c.fillStyle = WORLD.sconce;
  c.fillRect(w / 2 - w * 0.1, fy - h * 0.06, w * 0.2, 1);
};
