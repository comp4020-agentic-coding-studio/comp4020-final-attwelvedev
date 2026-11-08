import { mix, WORLD } from "../../tokens.ts";
import { BLACK, bulb, glow, type Painter } from "./kit.ts";

// Rooms 07 (service) and 09 (strongroom).

// Service: a steel kick panel with vertical seams, and a caged bulb that glows.
export const kickPanel: Painter = (c, item, w, h) => {
  c.fillStyle = mix(WORLD.steel, WORLD.wallFront, 0.45);
  c.fillRect(0, h * 0.5, w, h * 0.5);
  c.fillStyle = mix(WORLD.steelFront, WORLD.wallFront, 0.3);
  const seams = 2 + (item.variant % 2);
  for (let i = 1; i <= seams; i++) c.fillRect((w * i) / (seams + 1) - 0.5, h * 0.5, 1, h * 0.5);
};
export const cagedBulb: Painter = (c, _item, w, h) => {
  glow(c, w / 2, h * 0.36, w * 0.5);
  bulb(c, w / 2, h * 0.36, w);
  c.fillStyle = mix(WORLD.steelFront, BLACK, 0.3);
  for (const dx of [-0.06, 0.06]) c.fillRect(w / 2 + w * dx - 0.5, h * 0.26, 1, h * 0.2);
};

// The strongroom: a row of six rivet heads along the top; steel cladding with vertical seams; a caged
// sconce with its glow.
export const rivets: Painter = (c, item, w, h) => {
  c.fillStyle = mix(WORLD.steelFront, WORLD.wallFront, 0.3);
  const y = item.face === "top" ? h / 2 : h * 0.1;
  const r = Math.min(w * 0.025, h * 0.08);
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.arc(w * (0.12 + (i * 0.76) / 5), y, r, 0, Math.PI * 2);
    c.fill();
  }
};
export const cladding: Painter = (c, item, w, h) => {
  c.fillStyle = mix(WORLD.steel, WORLD.wallFront, 0.45);
  c.fillRect(0, h * 0.05, w, h * 0.9);
  c.fillStyle = mix(WORLD.steelFront, WORLD.wallFront, 0.3);
  const seams = 2 + (item.variant % 2);
  for (let i = 1; i <= seams; i++) c.fillRect((w * i) / (seams + 1) - 0.5, h * 0.05, 1, h * 0.9);
};
export const cagedSconce: Painter = (c, _item, w, h) => {
  const x = w / 2;
  const y = h * 0.38;
  glow(c, x, y, w * 0.5);
  c.fillStyle = mix(WORLD.steelFront, BLACK, 0.2); // the wall plate
  c.fillRect(x - w * 0.06, y + h * 0.1, w * 0.12, h * 0.05);
  bulb(c, x, y, w);
  c.fillStyle = mix(WORLD.steelFront, BLACK, 0.3); // the cage: three upright bars
  for (const dx of [-0.05, 0, 0.05]) c.fillRect(x + w * dx - 0.5, y - h * 0.08, 1, h * 0.18);
};
