import { isHighContrast } from "../tokens.ts";
import type { DecorItem, DecorKind } from "./decor.ts";
import {
  bankerLamp,
  banner,
  coatHooks,
  engraving,
  hoodedLantern,
  painting,
  ropeCoil,
  sconceDim,
  staves,
  wainscot,
} from "./decor-paint/civic.ts";
import {
  coping,
  fernBasket,
  hangingBasket,
  hangingLantern,
  ivy,
  moss,
  plantShelf,
  trellis,
  wallLamp,
} from "./decor-paint/garden.ts";
import type { Painter } from "./decor-paint/kit.ts";
import { lute, staff, swag, violin } from "./decor-paint/stage.ts";
import { cagedBulb, cagedSconce, cladding, kickPanel, rivets } from "./decor-paint/works.ts";

export { BLACK, bulb, dark, glow, type Painter } from "./decor-paint/kit.ts";

// Decor painters (plan diorama-look §4.3, FR11, FR12): one file per theme group in decor-paint/, the
// shared helpers in decor-paint/kit.ts. Each draws one item in face-local px, (0, 0) the face's
// top-left and w × h its size. paintDecor clips to that rect first, so nothing (a glow
// included) leaves the face. No outline (WORLD.line is never used), no animation, and nothing in high
// contrast: decor is mood, never information.
//
// The rules hold for every painter (DESIGN.md §4.9, ADR 0029; decor-paint.test.ts): a real thing with
// a job, never a clue or a game object, no text, nothing in WORLD.line or glass's colours, nothing
// translucent but a glow clipped to its face.

// How many looks each kind has: the rest of an item's variant is ignored, so the atlas keeps one tile
// per look, not per variant.
export const LOOKS: Record<DecorKind, number> = {
  ivy: 3,
  hangingLantern: 1,
  hangingBasket: 2,
  coping: 2,
  moss: 2,
  trellis: 2,
  plantShelf: 2,
  fernBasket: 1,
  wallLamp: 1,
  banner: 2,
  hoodedLantern: 1,
  staves: 1,
  ropeCoil: 1,
  sconceDim: 1,
  wainscot: 2,
  engraving: 2,
  bankerLamp: 1,
  coatHooks: 1,
  kickPanel: 2,
  cagedBulb: 1,
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
  ivy,
  hangingLantern,
  hangingBasket,
  coping,
  moss,
  trellis,
  plantShelf,
  fernBasket,
  wallLamp,
  banner,
  hoodedLantern,
  staves,
  ropeCoil,
  sconceDim,
  wainscot,
  engraving,
  bankerLamp,
  coatHooks,
  kickPanel,
  cagedBulb,
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
