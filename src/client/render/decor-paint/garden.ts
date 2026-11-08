import { mix, WORLD } from "../../tokens.ts";
import {
  blossom,
  bulb,
  darker,
  glow,
  iron,
  leaf,
  leafTone,
  lighter,
  litBox,
  type Painter,
  wood,
} from "./kit.ts";

// Rooms 01 (pavilion) and 02 (conservatory): things a garden pavilion's walls carry. Each has a job
// (DESIGN.md §4.9): a lattice holds the ivy, a lantern lights, a basket hangs, coping caps the wall.

const terracotta = () => mix(darker(WORLD.codeRed, 0.25), WORLD.brass, 0.45);
const flower = (v: number) =>
  [WORLD.codeWhite, WORLD.dyePink, mix(WORLD.codeYellow, WORLD.codeWhite, 0.4)][v % 3] as string;

// A thin bar from (x0, y0) to (x1, y1), w wide, in tone: a lattice lath, a chain, a stem.
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

// A diagonal wooden lattice over the part of the face from y0 down to y1, inset from the sides.
function lattice(c: CanvasRenderingContext2D, w: number, y0: number, y1: number, gap: number) {
  const x0 = w * 0.1;
  const x1 = w * 0.9;
  const t = Math.max(1, w * 0.025);
  c.save();
  c.beginPath();
  c.rect(x0, y0, x1 - x0, y1 - y0);
  c.clip();
  const span = y1 - y0;
  for (let x = x0 - span; x < x1 + span; x += gap) {
    bar(c, x + 1, y0 + 1, x + span + 1, y1 + 1, t, darker(wood(), 0.25)); // the shade under it
    bar(c, x, y0, x + span, y1, t, wood());
    bar(c, x + span, y0, x, y1, t, lighter(wood(), 0.1));
  }
  c.restore();
}

// The pavilion's ivy: climbing a lattice from the foot, stems with leaves in three sizes and a few
// small blossoms. Three looks.
export const ivy: Painter = (c, item, w, h) => {
  const look = item.variant % 3;
  lattice(c, w, h * 0.12, h * 0.9, w * 0.26);
  const stems = [
    [0.3, 0.92, 0.42, 0.2],
    [0.66, 0.92, 0.56, 0.32],
    [0.5, 0.92, 0.74, 0.14],
  ].slice(0, 2 + (look === 1 ? 1 : 0));
  for (const [sx, sy, ex, ey] of stems) {
    const x0 = w * (sx as number);
    const y0 = h * (sy as number);
    const x1 = w * (ex as number);
    const y1 = h * (ey as number);
    bar(c, x0, y0, x1, y1, Math.max(1, w * 0.02), darker(leafTone(), 0.3));
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const size = [0.16, 0.12, 0.09][(i + look) % 3] as number;
      const side = i % 2 ? 1 : -1;
      leaf(c, x + side * w * 0.06, y, w * size, side * 0.6, leafTone(((i + look) % 3) * 0.08));
    }
  }
  const blooms = look === 2 ? 3 : 2;
  for (let i = 0; i < blooms; i++)
    blossom(
      c,
      w * ((i * 0.12 + 0.38) % 0.7),
      h * (0.3 + ((i + look) % 3) * 0.13),
      w * 0.08,
      flower(i + look),
    );
};

// A hanging lantern: an iron bracket from the wall, and a lantern of four warm panes under a cap,
// lit, its glow clipped to the face.
export const hangingLantern: Painter = (c, _item, w, h) => {
  const cx = w * 0.56;
  const top = h * 0.32;
  const lw = w * 0.18;
  const lh = h * 0.24;
  glow(c, cx, top + lh * 0.55, w * 0.5);
  // the bracket: a plate on the wall, an arm out, a short drop
  litBox(c, w * 0.2, h * 0.1, w * 0.06, h * 0.16, iron());
  bar(c, w * 0.24, h * 0.14, cx, h * 0.14, Math.max(1, w * 0.025), iron());
  bar(c, w * 0.28, h * 0.24, w * 0.44, h * 0.15, Math.max(1, w * 0.018), iron()); // the brace
  bar(c, cx, h * 0.14, cx, top - h * 0.04, Math.max(1, w * 0.015), iron());
  // the cap and the base
  c.fillStyle = iron();
  c.beginPath();
  c.moveTo(cx - lw * 0.65, top + h * 0.02);
  c.lineTo(cx + lw * 0.65, top + h * 0.02);
  c.lineTo(cx, top - h * 0.05);
  c.closePath();
  c.fill();
  litBox(c, cx - lw * 0.6, top + lh, lw * 1.2, h * 0.04, iron());
  // the panes, lit from inside, with the frame's uprights
  c.fillStyle = mix(WORLD.sconce, WORLD.brass, 0.25);
  c.fillRect(cx - lw / 2, top + h * 0.02, lw, lh - h * 0.02);
  c.fillStyle = WORLD.sconce;
  c.fillRect(cx - lw * 0.25, top + h * 0.05, lw * 0.5, lh - h * 0.08);
  c.fillStyle = iron();
  for (const dx of [-0.5, 0, 0.5]) c.fillRect(cx + lw * dx - 0.5, top + h * 0.02, 1, lh);
  bulb(c, cx, top + lh * 0.55, w);
};

// A hanging basket on a hook: an iron hook, three chains to a woven bowl, trailing leaves.
export const hangingBasket: Painter = (c, item, w, h) => {
  const look = item.variant % 2;
  const cx = w * 0.5;
  const hook = h * 0.12;
  const bowlY = h * 0.5;
  const bw = w * 0.42;
  litBox(c, cx - w * 0.03, h * 0.04, w * 0.06, h * 0.06, iron());
  bar(c, cx, h * 0.08, cx, hook, Math.max(1, w * 0.02), iron());
  for (const dx of [-0.45, 0, 0.45]) bar(c, cx, hook, cx + bw * dx, bowlY, 1, darker(iron(), 0.1));
  // the foliage above the rim
  for (let i = 0; i < 7; i++)
    leaf(
      c,
      cx + bw * (-0.45 + (0.9 * i) / 6),
      bowlY - h * (0.03 + 0.04 * (i % 2)),
      w * 0.13,
      (i - 3) * 0.4,
      leafTone((i % 3) * 0.08),
    );
  // the bowl: a half ellipse of woven willow, lit on its upper left
  c.fillStyle = wood();
  c.beginPath();
  c.ellipse(cx, bowlY, bw / 2, h * 0.14, 0, 0, Math.PI);
  c.fill();
  c.fillStyle = lighter(wood(), 0.2);
  c.fillRect(cx - bw / 2, bowlY, bw, Math.max(1, h * 0.025));
  c.fillStyle = darker(wood(), 0.2);
  for (let i = 1; i < 4; i++) c.fillRect(cx - bw / 2 + (bw * i) / 4, bowlY + 1, 1, h * 0.09);
  // trailing strands over the side
  for (const [dx, len] of [
    [-0.42, 0.3],
    [0.4, 0.22 + 0.08 * look],
  ] as const) {
    const x = cx + bw * dx;
    bar(c, x, bowlY, x + w * 0.02, bowlY + h * len, 1, darker(leafTone(), 0.25));
    for (let k = 1; k <= 3; k++)
      leaf(c, x + (k % 2 ? 3 : -2), bowlY + (h * len * k) / 3, w * 0.1, 1.2, leafTone(0.05));
  }
  if (look === 1) blossom(c, cx + bw * 0.15, bowlY - h * 0.06, w * 0.08, flower(1));
};

// A wall's top: stone coping, flush, its joints and a lit north edge. Two looks (where the joints
// fall).
export const coping: Painter = (c, item, w, h) => {
  // the top's own fill and light show through: coping is only its joints, each a shaded line with a
  // lit one beside it
  const stone = WORLD.wallTop;
  const at = item.variant % 2 ? [0.5] : [0.3, 0.8];
  for (const x of at) {
    c.fillStyle = darker(stone, 0.14);
    c.fillRect(w * x, 0, 1, h);
    c.fillStyle = lighter(stone, 0.2);
    c.fillRect(w * x + 1, 0, 1, h);
  }
};

// Moss on a wall's top: low clumps of small tufts along the coping's joints and edges. Two looks.
export const moss: Painter = (c, item, w, h) => {
  coping(c, item, w, h);
  const clumps: [number, number, number][] =
    item.variant % 2
      ? [
          [0.06, 0.8, 5],
          [0.48, 0.25, 4],
          [0.82, 0.7, 6],
        ]
      : [
          [0.28, 0.75, 6],
          [0.62, 0.2, 4],
          [0.95, 0.55, 3],
        ];
  for (const [x, y, n] of clumps)
    for (let k = 0; k < n; k++) {
      // tufts spread along the clump, each a small dark blob with a lit top
      const tx = w * (x + (k - n / 2) * 0.035);
      const ty = h * (y + ((k * 37) % 5) * 0.03 - 0.06);
      const r = w * (0.022 + ((k * 13) % 3) * 0.008);
      c.fillStyle = darker(leafTone(), 0.15);
      c.beginPath();
      c.ellipse(tx, ty, r, r * 0.7, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = lighter(leafTone(), 0.1);
      c.beginPath();
      c.ellipse(tx - r * 0.25, ty - r * 0.25, r * 0.55, r * 0.35, 0, 0, Math.PI * 2);
      c.fill();
    }
};

// The conservatory's trellis: a wooden fan trellis, five laths spreading up from a foot, tied by two
// curved cross-laths, with a flowering vine climbing it. Two looks (where the flowers fall).
export const trellis: Painter = (c, item, w, h) => {
  const look = item.variant % 2;
  const fx = w * 0.5;
  const fy = h * 0.9;
  const t = Math.max(1, w * 0.028);
  const tips = [0.14, 0.31, 0.5, 0.69, 0.86];
  for (const x of tips) {
    bar(c, fx + 1, fy + 1, w * x + 1, h * 0.14 + 1, t, darker(wood(), 0.3)); // its shade
    bar(c, fx, fy, w * x, h * 0.14, t, wood());
  }
  for (const y of [0.3, 0.58]) {
    const k = (fy - h * y) / (fy - h * 0.14); // how far up the laths this cross-lath sits
    const x0 = fx + (w * 0.14 - fx) * k;
    const x1 = fx + (w * 0.86 - fx) * k;
    c.strokeStyle = lighter(wood(), 0.1);
    c.lineWidth = t;
    c.beginPath();
    c.moveTo(x0, h * y);
    c.quadraticCurveTo(fx, h * y - h * 0.05, x1, h * y);
    c.stroke();
  }
  // the vine: one stem winding up, leaves and flowers along it
  const pts: [number, number][] = [
    [0.46, 0.88],
    [0.4, 0.7],
    [0.3, 0.52],
    [0.42, 0.36],
    [0.62, 0.22],
  ];
  c.strokeStyle = darker(leafTone(), 0.3);
  c.lineWidth = Math.max(1, w * 0.02);
  c.beginPath();
  for (const [i, [x, y]] of pts.entries()) {
    if (i === 0) c.moveTo(w * x, h * y);
    else c.lineTo(w * x, h * y);
  }
  c.stroke();
  pts.forEach(([x, y], i) => {
    leaf(c, w * x - w * 0.06, h * y, w * 0.13, -0.6, leafTone((i % 3) * 0.08));
    leaf(c, w * x + w * 0.06, h * y + h * 0.03, w * 0.11, 0.6, leafTone(((i + 1) % 3) * 0.08));
    if ((i + look) % 2 === 0)
      blossom(c, w * x + w * 0.02, h * y - h * 0.05, w * 0.09, flower(i + look));
  });
};

// A plant shelf: a wooden board on two iron brackets, with three pots of small plants. Two looks.
export const plantShelf: Painter = (c, item, w, h) => {
  const look = item.variant % 2;
  const y = h * 0.5;
  for (const x of [0.22, 0.78]) {
    c.fillStyle = iron(); // a bracket: an upright and a diagonal brace
    c.fillRect(w * x - 1, y, 2, h * 0.16);
    c.beginPath();
    c.moveTo(w * x - 1, y + h * 0.15);
    c.lineTo(w * x + (x < 0.5 ? w * 0.1 : -w * 0.1), y);
    c.lineTo(w * x + (x < 0.5 ? w * 0.06 : -w * 0.06), y);
    c.lineTo(w * x - 1, y + h * 0.09);
    c.closePath();
    c.fill();
  }
  litBox(c, w * 0.1, y - h * 0.04, w * 0.8, h * 0.045, wood());
  [0.24, 0.5, 0.76].forEach((x, i) => {
    const pw = w * (i === 1 ? 0.17 : 0.14);
    const ph = h * (i === 1 ? 0.12 : 0.1);
    const px = w * x - pw / 2;
    const py = y - h * 0.04 - ph;
    // the plant over the rim
    const n = 3 + ((i + look) % 2);
    for (let k = 0; k < n; k++)
      leaf(
        c,
        px + (pw * (k + 0.5)) / n,
        py - h * 0.04 - (k % 2) * h * 0.03,
        w * 0.11,
        (k - n / 2) * 0.7,
        leafTone(((i + k) % 3) * 0.08),
      );
    if ((i + look) % 3 === 0) blossom(c, w * x, py - h * 0.08, w * 0.07, flower(i + look));
    // the pot: tapered, with its rim
    c.fillStyle = terracotta();
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(px + pw, py);
    c.lineTo(px + pw * 0.82, py + ph);
    c.lineTo(px + pw * 0.18, py + ph);
    c.closePath();
    c.fill();
    c.fillStyle = darker(terracotta(), 0.2);
    c.fillRect(px + pw * 0.6, py + ph * 0.25, pw * 0.25, ph * 0.7);
    litBox(c, px - 1, py - h * 0.02, pw + 2, h * 0.025, lighter(terracotta(), 0.1));
  });
};

// A hanging fern basket: a hook and chains to a wire basket, fronds arching out over it.
export const fernBasket: Painter = (c, _item, w, h) => {
  const cx = w * 0.5;
  const bowlY = h * 0.46;
  const bw = w * 0.36;
  litBox(c, cx - w * 0.03, h * 0.04, w * 0.06, h * 0.06, iron());
  for (const dx of [-0.45, 0.45]) bar(c, cx, h * 0.1, cx + bw * dx, bowlY, 1, darker(iron(), 0.1));
  // fronds: a stem arching out and down either side, leaflets along it shrinking to the tip
  for (const [dir, len, drop] of [
    [-1, 0.4, 0.16],
    [1, 0.38, 0.14],
    [-0.6, 0.3, 0.22],
    [0.6, 0.3, 0.24],
    [0.1, 0.16, -0.12],
  ] as const) {
    const at = (t: number) => ({
      x: cx + dir * w * len * t,
      y:
        bowlY - h * 0.03 - h * 0.12 * Math.sin(t * Math.PI) * (drop > 0 ? 1 : 0) + h * drop * t * t,
    });
    c.strokeStyle = darker(leafTone(), 0.2);
    c.lineWidth = 1;
    c.beginPath();
    for (let k = 0; k <= 8; k++) {
      const p = at(k / 8);
      if (k === 0) c.moveTo(p.x, p.y);
      else c.lineTo(p.x, p.y);
    }
    c.stroke();
    for (let k = 1; k <= 7; k++) {
      const p = at(k / 8);
      const l = w * (0.12 - 0.01 * k);
      leaf(c, p.x, p.y - l * 0.3, l, 1.2 + dir * 0.3, leafTone((k % 2) * 0.1));
      leaf(c, p.x, p.y + l * 0.3, l, -1.2 + dir * 0.3, leafTone(((k + 1) % 2) * 0.1));
    }
  }
  c.fillStyle = iron(); // the wire basket
  c.beginPath();
  c.ellipse(cx, bowlY, bw / 2, h * 0.12, 0, 0, Math.PI);
  c.fill();
  c.fillStyle = darker(leafTone(), 0.15); // moss lining showing through
  c.beginPath();
  c.ellipse(cx, bowlY + 1, bw / 2 - 2, h * 0.1, 0, 0, Math.PI);
  c.fill();
  c.fillStyle = iron();
  c.fillRect(cx - bw / 2, bowlY, bw, Math.max(1, h * 0.02));
};

// A gooseneck wall lamp: a wall plate, a curved iron arm, a small shade with its bulb, lit.
export const wallLamp: Painter = (c, _item, w, h) => {
  const sx = w * 0.62;
  const sy = h * 0.34;
  glow(c, sx, sy + h * 0.06, w * 0.5);
  litBox(c, w * 0.26, h * 0.42, w * 0.1, h * 0.14, iron());
  c.strokeStyle = iron();
  c.lineWidth = Math.max(1, w * 0.025);
  c.beginPath();
  c.moveTo(w * 0.31, h * 0.46);
  c.bezierCurveTo(w * 0.36, h * 0.18, sx, h * 0.12, sx, sy - h * 0.04);
  c.stroke();
  // the shade, open downward, lit on its left
  const tone = mix(WORLD.codeGreen, WORLD.steelFront, 0.55);
  c.fillStyle = tone;
  c.beginPath();
  c.moveTo(sx - w * 0.04, sy - h * 0.05);
  c.lineTo(sx + w * 0.04, sy - h * 0.05);
  c.lineTo(sx + w * 0.1, sy + h * 0.04);
  c.lineTo(sx - w * 0.1, sy + h * 0.04);
  c.closePath();
  c.fill();
  c.fillStyle = lighter(tone, 0.25);
  c.fillRect(sx - w * 0.07, sy, w * 0.04, h * 0.02);
  bulb(c, sx, sy + h * 0.05, w);
};
