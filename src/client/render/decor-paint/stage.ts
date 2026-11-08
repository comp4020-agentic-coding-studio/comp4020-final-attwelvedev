import { dark, type Painter } from "./kit.ts";

// Rooms 06 (backstage) and 08 (salon). Backstage's unlit sconce is the watch house's (civic.ts).

// The salon: instruments as flat silhouettes in a darker wall tone, hung on the face.
export const violin: Painter = (c, _item, w, h) => {
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
export const lute: Painter = (c, _item, w, h) => {
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
export const staff: Painter = (c, item, w, h) => {
  c.fillStyle = dark(0.3);
  const gap = h * 0.07;
  const top = h * (0.3 + 0.03 * (item.variant % 2));
  for (let i = 0; i < 5; i++) c.fillRect(w * 0.12, top + i * gap, w * 0.76, 1);
};
// A curtain swag across the top: a drape that dips in the middle, in a darker wall tone.
export const swag: Painter = (c, _item, w, h) => {
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
