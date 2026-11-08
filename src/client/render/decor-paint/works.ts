import { mix, WORLD } from "../../tokens.ts";
import { bulb, darker, glow, iron, lighter, litBox, type Painter, wood } from "./kit.ts";

// Rooms 07 (service) and 09 (strongroom): a plant room's fittings and a vault's steel, each with a
// job (DESIGN.md §4.9).

const steel = () => mix(WORLD.steel, WORLD.wallFront, 0.3);
const grey = () => mix(WORLD.steelFront, WORLD.wallFront, 0.25);
const red = () => mix(darker(WORLD.codeRed, 0.2), WORLD.wallFront, 0.3);

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

// A small round bolt head at (x, y): lit on its upper left.
function bolt(c: CanvasRenderingContext2D, x: number, y: number, r: number, tone: string) {
  c.fillStyle = darker(tone, 0.25);
  c.beginPath();
  c.arc(x + r * 0.2, y + r * 0.2, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = lighter(tone, 0.2);
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

// A breaker cabinet: a grey steel box with a hinged lid (its two hinges on the left), a latch on the
// right, a plain label plate (no text), and a conduit running up out of its top.
export const breakerCabinet: Painter = (c, _item, w, h) => {
  const bx = w * 0.24;
  const by = h * 0.28;
  const bw = w * 0.52;
  const bh = h * 0.44;
  litBox(c, w * 0.47, 0, w * 0.06, by, grey()); // the conduit up the wall
  c.fillStyle = darker(grey(), 0.15);
  c.fillRect(w * 0.45, by * 0.4, w * 0.1, h * 0.025); // its clip
  litBox(c, bx, by, bw, bh, grey());
  c.fillStyle = darker(grey(), 0.18); // the lid's seam, inset
  c.fillRect(bx + bw * 0.06, by + bh * 0.06, bw * 0.88, 1);
  c.fillRect(bx + bw * 0.06, by + bh * 0.94, bw * 0.88, 1);
  c.fillRect(bx + bw * 0.06, by + bh * 0.06, 1, bh * 0.88);
  c.fillRect(bx + bw * 0.94, by + bh * 0.06, 1, bh * 0.88);
  for (const t of [0.2, 0.72]) litBox(c, bx - w * 0.015, by + bh * t, w * 0.035, bh * 0.1, iron()); // hinges
  litBox(c, bx + bw * 0.8, by + bh * 0.42, bw * 0.08, bh * 0.18, iron()); // the latch
  litBox(c, bx + bw * 0.25, by + bh * 0.18, bw * 0.4, bh * 0.14, mix(WORLD.codeWhite, grey(), 0.3)); // label
};

// A pipe with flanged joints: a thick painted pipe across the face, two bolted flanges, a bracket.
export const pipe: Painter = (c, item, w, h) => {
  const y = h * 0.4;
  const t = h * 0.12;
  const tone = item.variant % 2 ? red() : mix(darker(WORLD.codeGreen, 0.25), WORLD.wallFront, 0.35);
  c.fillStyle = tone;
  c.fillRect(0, y, w, t);
  c.fillStyle = lighter(tone, 0.25); // round: a lit band on top, a shade below
  c.fillRect(0, y + t * 0.15, w, t * 0.2);
  c.fillStyle = darker(tone, 0.25);
  c.fillRect(0, y + t * 0.75, w, t * 0.25);
  for (const x of [0.28, 0.76]) {
    litBox(c, w * x - w * 0.03, y - t * 0.3, w * 0.06, t * 1.6, darker(tone, 0.08));
    bolt(c, w * x, y - t * 0.12, w * 0.01, iron());
    bolt(c, w * x, y + t * 1.12, w * 0.01, iron());
  }
  litBox(c, w * 0.5 - w * 0.03, y + t, w * 0.06, h * 0.2, iron()); // the bracket to the wall
};

// A tool pegboard: a brown board of holes, a spanner and a hammer hung on it.
export const pegboard: Painter = (c, _item, w, h) => {
  const bx = w * 0.16;
  const by = h * 0.2;
  const bw = w * 0.68;
  const bh = h * 0.5;
  const board = mix(wood(), WORLD.wallFront, 0.25);
  litBox(c, bx, by, bw, bh, board);
  c.fillStyle = darker(board, 0.3);
  for (let i = 1; i < 6; i++)
    for (let j = 1; j < 5; j++) c.fillRect(bx + (bw * i) / 6, by + (bh * j) / 5, 1, 1);
  // a spanner: a long handle, an open jaw at the top, a ring at the bottom
  const sx = bx + bw * 0.3;
  const tool = lighter(WORLD.steel, 0.05);
  bar(c, sx, by + bh * 0.22, sx, by + bh * 0.82, Math.max(1.5, w * 0.035), tool);
  c.fillStyle = tool;
  c.beginPath();
  c.arc(sx, by + bh * 0.16, w * 0.045, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = board; // the open jaw
  c.fillRect(sx - w * 0.015, by + bh * 0.06, w * 0.03, bh * 0.1);
  // a hammer: a wooden handle and a steel head across its top
  const hx = bx + bw * 0.68;
  bar(c, hx, by + bh * 0.25, hx, by + bh * 0.86, Math.max(1.5, w * 0.035), wood());
  litBox(c, hx - w * 0.1, by + bh * 0.14, w * 0.2, bh * 0.12, darker(WORLD.steel, 0.25));
};

// A caged bulb on a short bracket, lit: an iron cage of three bars over the bulb, a wall plate.
export const cagedBulb: Painter = (c, _item, w, h) => {
  const x = w / 2;
  const y = h * 0.36;
  glow(c, x, y, w * 0.5);
  litBox(c, x - w * 0.06, y + h * 0.1, w * 0.12, h * 0.06, iron());
  c.fillStyle = mix(WORLD.sconce, WORLD.brass, 0.15);
  c.beginPath();
  c.ellipse(x, y, w * 0.045, h * 0.055, 0, 0, Math.PI * 2);
  c.fill();
  bulb(c, x, y, w);
  c.fillStyle = iron();
  for (const dx of [-0.06, 0, 0.06]) c.fillRect(x + w * dx - 0.5, y - h * 0.08, 1, h * 0.18);
  c.fillRect(x - w * 0.07, y - h * 0.085, w * 0.14, 1);
};

// The strongroom: riveted steel plates with a weld seam and bolt heads; hinge straps; a cable tray;
// an I-beam stub; a caged sconce (lit); and a row of rivets along a top.
export const rivets: Painter = (c, item, w, h) => {
  const y = item.face === "top" ? h / 2 : h * 0.1;
  const r = Math.min(w * 0.025, h * 0.08);
  for (let i = 0; i < 6; i++) bolt(c, w * (0.12 + (i * 0.76) / 5), y, r, steel());
};

export const cladding: Painter = (c, item, w, h) => {
  litBox(c, 0, h * 0.05, w * 0.5, h * 0.9, steel());
  litBox(c, w * 0.5, h * 0.05, w * 0.5, h * 0.9, darker(steel(), 0.04));
  c.fillStyle = darker(steel(), 0.3); // the weld seam: a bead of small darker beads
  for (let y = h * 0.08; y < h * 0.94; y += h * 0.04) c.fillRect(w * 0.5 - 1, y, 2, h * 0.025);
  const at = item.variant % 2 ? [0.12, 0.88] : [0.12, 0.5, 0.88];
  for (const y of at)
    for (const x of [0.08, 0.42, 0.58, 0.92])
      bolt(c, w * x, h * y, Math.min(w, h) * 0.022, steel());
};

export const hingeStrap: Painter = (c, _item, w, h) => {
  for (const y of [0.25, 0.65]) {
    litBox(c, w * 0.1, h * y, w * 0.62, h * 0.08, iron());
    c.fillStyle = iron(); // a pointed strap end
    c.beginPath();
    c.moveTo(w * 0.72, h * y);
    c.lineTo(w * 0.84, h * (y + 0.04));
    c.lineTo(w * 0.72, h * (y + 0.08));
    c.closePath();
    c.fill();
    for (const x of [0.22, 0.42, 0.62]) bolt(c, w * x, h * (y + 0.04), w * 0.014, steel());
    litBox(c, w * 0.04, h * (y - 0.02), w * 0.08, h * 0.12, darker(iron(), 0.1)); // the knuckle
  }
};

export const cableTray: Painter = (c, _item, w, h) => {
  const y = h * 0.24;
  litBox(c, 0, y + h * 0.1, w, h * 0.03, steel()); // the tray's lip and bottom
  c.fillStyle = darker(steel(), 0.15);
  c.fillRect(0, y + h * 0.13, w, h * 0.02);
  // the cables lie heaped in the tray and sag out of it between the brackets, each its own way, so
  // they read as loose cable, never as flat bands across the face (rule 3)
  const cables = [darker(WORLD.steelFront, 0.5), red(), darker(WORLD.steelFront, 0.35)];
  c.lineWidth = Math.max(1, h * 0.022);
  cables.forEach((tone, i) => {
    const top = y + h * (0.06 + i * 0.012);
    const sag = h * (0.06 + i * 0.05);
    c.strokeStyle = tone;
    c.beginPath();
    c.moveTo(0, top);
    c.quadraticCurveTo(w * (0.45 + i * 0.05), top + sag * 2, w, top + h * 0.01 * i);
    c.stroke();
  });
  for (const x of [0.25, 0.75])
    litBox(c, w * x - w * 0.02, y + h * 0.13, w * 0.04, h * 0.12, iron());
};

export const girder: Painter = (c, _item, w, h) => {
  const x = w * 0.36;
  const bw = w * 0.28;
  litBox(c, x, 0, bw, h * 0.08, steel()); // the top flange
  litBox(c, x + bw * 0.38, h * 0.08, bw * 0.24, h * 0.6, darker(steel(), 0.08)); // the web
  litBox(c, x, h * 0.68, bw, h * 0.08, steel()); // the bottom flange
  litBox(c, x - w * 0.04, h * 0.76, bw + w * 0.08, h * 0.05, iron()); // its base plate
  for (const dx of [0.08, 0.92]) bolt(c, x + bw * dx, h * 0.785, w * 0.012, steel());
};

export const cagedSconce: Painter = (c, _item, w, h) => {
  const x = w / 2;
  const y = h * 0.38;
  glow(c, x, y, w * 0.5);
  litBox(c, x - w * 0.07, y + h * 0.1, w * 0.14, h * 0.06, darker(steel(), 0.2));
  bulb(c, x, y, w);
  c.fillStyle = darker(steel(), 0.35);
  for (const dx of [-0.05, 0, 0.05]) c.fillRect(x + w * dx - 0.5, y - h * 0.08, 1, h * 0.18);
};
