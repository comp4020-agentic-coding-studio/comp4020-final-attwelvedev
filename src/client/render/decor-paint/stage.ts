import { mix, WORLD } from "../../tokens.ts";
import { bulb, darker, glow, iron, lighter, litBox, muted, type Painter, wood } from "./kit.ts";

// Rooms 06 (backstage) and 08 (salon): a theatre's wings and a music room, each thing with a job
// (DESIGN.md §4.9).

const velvet = () => muted(darker(WORLD.codeRed, 0.45));
const paper = () => mix(WORLD.codeWhite, WORLD.brass, 0.18);

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

// A stage curtain: velvet hung in folds from a brass rod, drawn back to one side by a tieback with a
// tassel, so the wall shows on the other side.
export const curtain: Painter = (c, item, w, h) => {
  const left = item.variant % 2 === 0;
  const top = h * 0.06;
  const foot = h * 0.96;
  // the drape: full width at the rod, pinched at the tieback, flaring a little to the foot
  const edge = left ? w * 0.02 : w * 0.98; // the side it is drawn to
  const at = (f: number) => (left ? w * f : w * (1 - f)); // a distance from that side
  c.fillStyle = velvet();
  c.beginPath();
  c.moveTo(edge, top);
  c.lineTo(at(0.62), top);
  c.quadraticCurveTo(at(0.5), h * 0.35, at(0.3), h * 0.55);
  c.quadraticCurveTo(at(0.36), h * 0.75, at(0.4), foot);
  c.lineTo(edge, foot);
  c.closePath();
  c.fill();
  // folds: shaded and lit strips running down from the rod toward the tieback
  for (const [f, lit] of [
    [0.1, false],
    [0.2, true],
    [0.32, false],
    [0.44, true],
  ] as const) {
    c.strokeStyle = lit ? lighter(velvet(), 0.12) : darker(velvet(), 0.25);
    c.lineWidth = Math.max(1, w * 0.035);
    c.beginPath();
    c.moveTo(at(f), top);
    c.quadraticCurveTo(at(f * 0.75), h * 0.4, at(f * 0.5 + 0.03), h * 0.55);
    c.lineTo(at(f * 0.6 + 0.04), foot);
    c.stroke();
  }
  // the tieback: a brass cord round the pinch, and its tassel
  c.fillStyle = WORLD.brass;
  c.fillRect(Math.min(edge, at(0.32)), h * 0.53, Math.abs(at(0.32) - edge), h * 0.03);
  const tx = at(0.33);
  c.fillStyle = darker(WORLD.brass, 0.1);
  c.beginPath();
  c.moveTo(tx - w * 0.03, h * 0.66);
  c.lineTo(tx + w * 0.03, h * 0.66);
  c.lineTo(tx, h * 0.56);
  c.closePath();
  c.fill();
  litBox(c, 0, top - h * 0.03, w, h * 0.03, WORLD.brass); // the rod
};

// A dressing mirror: a wooden frame round a dull silvered glass (opaque, no sheen), with a row of
// round bulbs along its top, unlit.
export const dressingMirror: Painter = (c, _item, w, h) => {
  const fx = w * 0.2;
  const fy = h * 0.2;
  const fw = w * 0.6;
  const fh = h * 0.46;
  litBox(c, fx, fy, fw, fh, darker(wood(), 0.05));
  c.fillStyle = mix(WORLD.steel, WORLD.wallFront, 0.45); // the silvering, flat and dull
  c.fillRect(fx + fw * 0.1, fy + fh * 0.16, fw * 0.8, fh * 0.74);
  for (let i = 0; i < 5; i++) {
    const x = fx + fw * (0.1 + 0.2 * i);
    c.fillStyle = mix(WORLD.sconce, WORLD.wallFront, 0.6); // a cold bulb
    c.beginPath();
    c.arc(x, fy + fh * 0.08, w * 0.03, 0, Math.PI * 2);
    c.fill();
  }
  litBox(c, fx + fw * 0.05, fy + fh, fw * 0.9, h * 0.04, wood()); // the shelf under it
};

// A rope and a sandbag on a cleat: the rope from the top of the face down to an iron cleat, its
// tail hanging, and a canvas sandbag tied to it.
export const sandbag: Painter = (c, _item, w, h) => {
  const rope = mix(WORLD.brass, WORLD.wallFront, 0.35);
  const x = w * 0.42;
  bar(c, x, 0, x, h * 0.48, Math.max(1.5, w * 0.03), rope);
  litBox(c, x - w * 0.1, h * 0.46, w * 0.2, h * 0.04, iron()); // the cleat
  bar(c, x + w * 0.02, h * 0.5, x + w * 0.1, h * 0.62, Math.max(1.5, w * 0.03), rope);
  const bag = mix(WORLD.brass, WORLD.codeWhite, 0.4);
  c.fillStyle = darker(bag, 0.15);
  c.beginPath();
  c.moveTo(x + w * 0.04, h * 0.62);
  c.lineTo(x + w * 0.18, h * 0.62);
  c.lineTo(x + w * 0.24, h * 0.86);
  c.lineTo(x - w * 0.02, h * 0.86);
  c.closePath();
  c.fill();
  c.fillStyle = lighter(bag, 0.05);
  c.fillRect(x + w * 0.03, h * 0.66, w * 0.07, h * 0.18);
  c.fillStyle = darker(rope, 0.2); // the tie at its neck
  c.fillRect(x + w * 0.05, h * 0.61, w * 0.12, h * 0.025);
};

// An unlit wall sconce: a brass plate, a short arm and a candle cup with a white candle, unlit.
export const sconceDim: Painter = (c, _item, w, h) => {
  const cx = w * 0.5;
  litBox(c, cx - w * 0.05, h * 0.42, w * 0.1, h * 0.16, mix(WORLD.brass, WORLD.wallFront, 0.3));
  bar(c, cx, h * 0.5, cx, h * 0.4, Math.max(1, w * 0.025), mix(WORLD.brass, WORLD.wallFront, 0.3));
  litBox(c, cx - w * 0.07, h * 0.37, w * 0.14, h * 0.03, mix(WORLD.brass, WORLD.wallFront, 0.3));
  litBox(
    c,
    cx - w * 0.025,
    h * 0.24,
    w * 0.05,
    h * 0.13,
    paper(), // wax, not code white
  );
};

// A candle sconce, lit: as the unlit one, with a small flame and its glow.
export const candleSconce: Painter = (c, item, w, h) => {
  const cx = w * 0.5;
  glow(c, cx, h * 0.22, w * 0.45);
  sconceDim(c, item, w, h);
  c.fillStyle = WORLD.sconce; // the flame: a small teardrop
  c.beginPath();
  c.moveTo(cx, h * 0.15);
  c.quadraticCurveTo(cx + w * 0.03, h * 0.21, cx, h * 0.235);
  c.quadraticCurveTo(cx - w * 0.03, h * 0.21, cx, h * 0.15);
  c.fill();
  bulb(c, cx, h * 0.215, w);
};

// A stringed instrument hung by its scroll from a peg: the body in two lobes, shaded wood, a dark
// fingerboard, strings, and the tailpiece. `lute` turns it into a pear-shaped bowl with a bent head.
function instrument(c: CanvasRenderingContext2D, w: number, h: number, lute: boolean) {
  const cx = w * 0.5;
  const body = mix(darker(WORLD.brass, 0.25), WORLD.codeRed, 0.18);
  // the peg it hangs from: over the scroll, or over the lute's bent pegbox
  const peg = lute ? cx - w * 0.14 : cx;
  litBox(c, peg - w * 0.025, lute ? h * 0.08 : h * 0.06, w * 0.05, h * 0.04, iron());
  c.fillStyle = body;
  if (lute) {
    c.beginPath();
    c.ellipse(cx, h * 0.66, w * 0.17, h * 0.2, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(cx - w * 0.13, h * 0.56);
    c.lineTo(cx, h * 0.4);
    c.lineTo(cx + w * 0.13, h * 0.56);
    c.closePath();
    c.fill();
  } else {
    c.beginPath();
    c.ellipse(cx, h * 0.72, w * 0.15, h * 0.13, 0, 0, Math.PI * 2);
    c.ellipse(cx, h * 0.5, w * 0.12, h * 0.1, 0, 0, Math.PI * 2);
    c.fill();
    c.fillRect(cx - w * 0.09, h * 0.52, w * 0.18, h * 0.16); // the waist
    c.fillStyle = darker(body, 0.25); // the C-bouts
    c.fillRect(cx - w * 0.11, h * 0.58, w * 0.03, h * 0.05);
    c.fillRect(cx + w * 0.08, h * 0.58, w * 0.03, h * 0.05);
  }
  // the lit edge of the body, upper left
  c.fillStyle = lighter(body, 0.25);
  c.beginPath();
  c.ellipse(cx - w * 0.06, lute ? h * 0.6 : h * 0.47, w * 0.04, h * 0.05, -0.5, 0, Math.PI * 2);
  c.fill();
  // the neck and fingerboard, up to the scroll at the peg
  const board = darker(wood(), 0.4);
  c.fillStyle = board;
  if (lute) {
    c.save();
    c.translate(cx, h * 0.42);
    c.rotate(-0.25);
    c.fillRect(-w * 0.025, -h * 0.28, w * 0.05, h * 0.3);
    c.translate(0, -h * 0.28); // to the neck's end
    c.rotate(-0.6); // the pegbox, bent back from it
    c.fillRect(-w * 0.025, -h * 0.09, w * 0.05, h * 0.1);
    c.restore();
  } else {
    c.fillRect(cx - w * 0.02, h * 0.12, w * 0.04, h * 0.5);
    c.fillStyle = body; // the scroll
    c.fillRect(cx - w * 0.035, h * 0.09, w * 0.07, h * 0.06);
  }
  // the strings over the body to the tailpiece
  c.fillStyle = lighter(WORLD.steel, 0.2);
  const s0 = lute ? h * 0.42 : h * 0.14;
  for (const dx of [-0.012, 0.012]) c.fillRect(cx + w * dx - 0.25, s0, 0.5, h * 0.78 - s0);
  c.fillStyle = board;
  c.fillRect(cx - w * 0.03, h * 0.76, w * 0.06, h * 0.06); // the tailpiece or bridge
}
export const violin: Painter = (c, _item, w, h) => instrument(c, w, h, false);
export const lute: Painter = (c, _item, w, h) => instrument(c, w, h, true);

// A framed manuscript: a page of five-line staves with bar lines and a clef at each stave's start,
// in a thin dark frame. Never a note head: a note would read as a tune to play.
export const manuscript: Painter = (c, item, w, h) => {
  const fx = w * 0.2;
  const fy = h * 0.16;
  const fw = w * 0.6;
  const fh = h * 0.5;
  litBox(c, fx, fy, fw, fh, darker(wood(), 0.2));
  c.fillStyle = paper();
  c.fillRect(fx + fw * 0.07, fy + fh * 0.06, fw * 0.86, fh * 0.88);
  const ink = mix(darker(WORLD.brass, 0.6), paper(), 0.25);
  const px = fx + fw * 0.14;
  const pw = fw * 0.72;
  const staves = 2 + (item.variant % 2);
  for (let s = 0; s < staves; s++) {
    const top = fy + fh * (0.16 + (0.7 * s) / staves);
    const gap = fh * 0.035;
    c.fillStyle = ink;
    for (let i = 0; i < 5; i++) c.fillRect(px, top + i * gap, pw, 0.6);
    // bar lines across the stave
    for (const t of [0, 0.35, 0.68, 1]) c.fillRect(px + pw * t - 0.3, top, 0.6, gap * 4);
    // a clef: a curl drawn as a stroke, never filled
    c.strokeStyle = ink;
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(px + pw * 0.08, top + gap * 4.6);
    c.lineTo(px + pw * 0.08, top - gap * 0.6);
    c.quadraticCurveTo(px + pw * 0.15, top + gap, px + pw * 0.05, top + gap * 2.6);
    c.quadraticCurveTo(px + pw * 0.12, top + gap * 3.6, px + pw * 0.14, top + gap * 2.4);
    c.stroke();
  }
};
