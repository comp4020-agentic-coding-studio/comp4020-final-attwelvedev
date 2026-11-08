import { mix, WORLD } from "../../tokens.ts";
import { BLACK, type Painter } from "./kit.ts";

// Rooms 01 (pavilion) and 02 (conservatory).

// The pavilion: ivy trails small lens-shaped leaves from the top edge (never a single large leaf);
// a planter is a box with a few small leaves over its rim.
const LEAF = () => mix(WORLD.wallFront, WORLD.codeGreen, 0.35);
function lens(c: CanvasRenderingContext2D, x: number, y: number, w: number, a: number) {
  c.beginPath();
  c.ellipse(x, y, w * 0.07, w * 0.03, a, 0, Math.PI * 2);
  c.fill();
}
export const ivy: Painter = (c, item, w, h) => {
  c.fillStyle = LEAF();
  const vines = 2 + (item.variant % 2);
  for (let v = 0; v < vines; v++) {
    const x = w * (0.2 + (0.6 * (v + 0.5)) / vines);
    const n = 3 + ((item.variant + v) % 3);
    c.fillRect(x - 0.5, 0, 1, h * 0.14 * (n + 1));
    for (let i = 0; i < n; i++)
      lens(c, x + (i % 2 ? w * 0.05 : -w * 0.05), h * 0.12 * (i + 1), w, i % 2 ? 0.5 : -0.5);
  }
};
export const planter: Painter = (c, item, w, h) => {
  c.fillStyle = mix(WORLD.wallFront, BLACK, 0.3); // the box
  c.fillRect(w * 0.18, h * 0.5, w * 0.64, h * 0.4);
  c.fillStyle = LEAF();
  const n = 4 + (item.variant % 3);
  for (let i = 0; i < n; i++)
    lens(c, w * (0.24 + (0.52 * i) / (n - 1)), h * 0.42, w, i % 2 ? 1 : -1);
};

// The conservatory: a diagonal lattice (never a grid of rails) and fern fronds on a top.
export const trellis: Painter = (c, item, w, h) => {
  c.strokeStyle = mix(WORLD.wallFront, BLACK, 0.3);
  c.lineWidth = 1;
  const gap = w * (0.25 + 0.05 * (item.variant % 2));
  c.beginPath();
  for (let x = -h; x < w + h; x += gap) {
    c.moveTo(x, 0);
    c.lineTo(x + h, h);
    c.moveTo(x + h, 0);
    c.lineTo(x, h);
  }
  c.stroke();
};
export const fern: Painter = (c, item, w, h) => {
  c.fillStyle = LEAF();
  const n = 5 + (item.variant % 3);
  for (let i = 0; i < n; i++)
    lens(c, w * (0.15 + (0.7 * i) / (n - 1)), h * (0.4 + 0.15 * (i % 2)), w, (i - n / 2) * 0.35);
};
