import type { Vec } from "../../game/types.ts";

// Decor (plan diorama-look §4.3, FR10 to FR12): themed things on wall faces and tops, placed by a
// seeded walk over the layout every sighted client already has (R2). Pure: no DOM, and it reads
// nothing but its arguments, so a cache's state can never move or reveal it.

export type Theme =
  | "pavilion"
  | "conservatory"
  | "watch"
  | "bank"
  | "gallery"
  | "backstage"
  | "service"
  | "salon"
  | "strongroom";

// A closed union: each theme's kinds.
export type DecorKind =
  | "ivy" // pavilion: ivy climbing a wooden lattice, leaves in three sizes, a few blossoms
  | "hangingLantern" // pavilion: a lantern on an iron bracket, lit
  | "hangingBasket" // pavilion: a willow basket of trailing plants on a hook
  | "coping" // every top: flush stone coping with its joints
  | "moss" // pavilion top: moss cushions on the coping
  | "trellis" // conservatory: an arched iron trellis with a flowering vine
  | "plantShelf" // conservatory: a board on two brackets with three pots
  | "fernBasket" // conservatory: a fern in a wire basket on chains
  | "wallLamp" // conservatory: a gooseneck lamp, lit
  | "banner" // watch: a cloth banner hung from a rod, with tassels
  | "hoodedLantern" // watch: a lantern under an iron hood, lit
  | "staves" // watch: two quarterstaffs crossed on pegs
  | "ropeCoil" // watch: a coil of rope on a hook
  | "wainscot" // bank: raised panels under one dado rail
  | "engraving" // bank: a framed landscape engraving, no text
  | "bankerLamp" // bank: a green-shaded lamp on a brass arm, lit
  | "coatHooks" // bank: a board of brass coat hooks
  | "curtain" // backstage: velvet on a rod, gathered by a tieback with a tassel
  | "dressingMirror" // backstage: a dull mirror under a row of unlit bulbs
  | "sandbag" // backstage: a fly rope on a cleat with its sandbag
  | "sconceDim" // backstage: an unlit candle sconce, no glow
  | "breakerCabinet" // service: a steel box, hinged lid, latch, a blank label plate
  | "pipe" // service: a painted pipe with bolted flanges
  | "pegboard" // service: a spanner and a hammer on a board
  | "cagedBulb" // service: a lit bulb in a cage
  | "painting" // gallery: a gilt frame round a landscape or a still life, a label card, a picture light
  | "violin" // salon: hung by its scroll, shaded wood, strings
  | "lute" // salon: a pear-shaped bowl, a bent pegbox
  | "manuscript" // salon: framed staves with bar lines and a clef, never a note head
  | "candleSconce" // salon: a candle sconce, lit
  | "rivets" // strongroom: a row of six rivet heads, on a front or along a top
  | "cladding" // strongroom: riveted steel plates with a weld seam
  | "hingeStrap" // strongroom: two iron hinge straps, bolted
  | "cableTray" // strongroom: a tray of cables on brackets
  | "girder" // strongroom: the end of a steel girder (an I-section) on its base plate
  | "cagedSconce"; // strongroom: a lit bulb in a cage

export const THEME_OF: Record<string, Theme> = {
  "01-first-steps": "pavilion",
  "02-three-hands": "conservatory",
  "03-watchers": "watch",
  "04-the-safe": "bank",
  "05-the-gallery": "gallery",
  "06-lights-out": "backstage",
  "07-night-shift": "service",
  "08-music-room": "salon",
  "09-the-vault": "strongroom",
};

export const THEME_KINDS: Record<Theme, readonly DecorKind[]> = {
  pavilion: ["ivy", "hangingLantern", "hangingBasket", "coping", "moss"],
  conservatory: ["trellis", "plantShelf", "fernBasket", "wallLamp", "coping"],
  watch: ["banner", "hoodedLantern", "staves", "ropeCoil", "coping"],
  bank: ["wainscot", "engraving", "bankerLamp", "coatHooks", "coping"],
  gallery: ["painting", "coping"],
  backstage: ["curtain", "dressingMirror", "sandbag", "sconceDim", "coping"],
  service: ["breakerCabinet", "pipe", "pegboard", "cagedBulb", "coping"],
  salon: ["violin", "lute", "manuscript", "candleSconce", "coping"],
  strongroom: ["cladding", "hingeStrap", "cableTray", "girder", "cagedSconce", "rivets"],
};

// Which faces a kind can go on. A wall's top carries only flush things (DESIGN.md §4.9 rule 7).
export const KIND_FACES: Record<DecorKind, readonly ("front" | "top")[]> = {
  ivy: ["front"],
  hangingLantern: ["front"],
  hangingBasket: ["front"],
  coping: ["top"],
  moss: ["top"],
  trellis: ["front"],
  plantShelf: ["front"],
  fernBasket: ["front"],
  wallLamp: ["front"],
  banner: ["front"],
  hoodedLantern: ["front"],
  staves: ["front"],
  ropeCoil: ["front"],
  wainscot: ["front"],
  engraving: ["front"],
  bankerLamp: ["front"],
  coatHooks: ["front"],
  curtain: ["front"],
  dressingMirror: ["front"],
  sandbag: ["front"],
  sconceDim: ["front"],
  breakerCabinet: ["front"],
  pipe: ["front"],
  pegboard: ["front"],
  cagedBulb: ["front"],
  painting: ["front"],
  violin: ["front"],
  lute: ["front"],
  manuscript: ["front"],
  candleSconce: ["front"],
  rivets: ["top"],
  cladding: ["front"],
  hingeStrap: ["front"],
  cableTray: ["front"],
  girder: ["front"],
  cagedSconce: ["front"],
};

// Kinds that carry a --w-sconce glow, clipped to their own face.
export const LIT: ReadonlySet<DecorKind> = new Set([
  "hangingLantern",
  "wallLamp",
  "painting",
  "cagedSconce",
  "hoodedLantern",
  "bankerLamp",
  "cagedBulb",
  "candleSconce",
]);

export interface DecorItem {
  x: number; // the wall tile
  y: number;
  face: "front" | "top";
  kind: DecorKind;
  lit?: true;
  variant: number; // 0..3, seeded
}

// A room's nudge to its seed (R2): raised when the anchor test finds an item beside a station part.
// Re-picked for the per-cell rolls (auto fixes 2), and again for the decor redesign: the first salt
// with no item beside a station part, plaque or ink, at least two fronts, and no lit item within a
// tile of a dark zone (07, 08); 08's also shows its violin and manuscript, the named complaint.
export const SALT: Record<string, number> = {
  "03-watchers": 1,
  "04-the-safe": 2,
  "05-the-gallery": 242,
  "06-lights-out": 67,
  "07-night-shift": 21095,
  "08-music-room": 4,
  "09-the-vault": 33205,
};

// 32-bit FNV-1a, then mulberry32
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BLOCKS = "#=%H";
const NEAR = "DH=% "; // nothing within 1 tile of a door, hatch, glass, vent or night
const FRONT_P = 1 / 6;
const TOP_P = 1 / 8;
const APART = 3; // tiles (Chebyshev) between one item and the next on the same kind of face

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// Every tile within 1 of something decor stays clear of: the NEAR letters and each wire's route.
function excluded(tiles: readonly string[], wires: readonly Vec[][]): Set<string> {
  const out = new Set<string>();
  const mark = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) out.add(`${x + dx},${y + dy}`);
  };
  tiles.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (NEAR.includes(row[x] as string)) mark(x, y);
  });
  for (const route of wires)
    for (let i = 0; i < route.length; i++) {
      const a = route[i] as Vec;
      const b = route[i + 1] ?? a;
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4));
      for (let k = 0; k <= steps; k++)
        mark(
          Math.floor(a.x + ((b.x - a.x) * k) / steps),
          Math.floor(a.y + ((b.y - a.y) * k) / steps),
        );
    }
  return out;
}

// The room's decor: fronts then tops, each with its own density. Every wall cell rolls its own dice
// for each face, seeded by the room and the cell alone, so a view that differs somewhere (the night
// masked, a cache's chamber opened) moves no item more than APART - 1 tiles from the change (FR3,
// auto fixes 2). A cell gets an item when its roll is under p, it is clear of NEAR and wires, and no
// cell of that face earlier in reading order within APART rolled under p (eligible or not), so items
// stay APART. Room 01 is at half density.
export function decorFor(
  roomId: string,
  tiles: readonly string[],
  wires: readonly Vec[][] = [],
): DecorItem[] {
  const theme = THEME_OF[roomId];
  const kinds = theme ? THEME_KINDS[theme] : [];
  if (kinds.length === 0) return [];
  const salt = SALT[roomId] ?? 0;
  const half = roomId.startsWith("01-") ? 0.5 : 1;
  const near = excluded(tiles, wires);
  // every cell that has the face, in reading order: a front needs open floor (not a door) south of it
  const fronts: Vec[] = [];
  const tops: Vec[] = [];
  tiles.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== "#") continue;
      tops.push({ x, y });
      const south = tiles[y + 1]?.[x];
      if (y < tiles.length - 1 && south !== undefined && !BLOCKS.includes(south) && south !== "D")
        fronts.push({ x, y });
    }
  });
  const out: DecorItem[] = [];
  const place = (cells: Vec[], face: "front" | "top", p: number) => {
    const choices = kinds.filter((k) => KIND_FACES[k].includes(face));
    if (choices.length === 0) return;
    const hits: Vec[] = []; // the cells so far that rolled under p
    for (const at of cells) {
      const rng = mulberry32(fnv1a(`${roomId}:${salt}:${at.x},${at.y}:${face}`));
      if (rng() >= p) continue;
      const crowded = hits.some((h) => cheb(h, at) < APART);
      hits.push(at);
      if (crowded || near.has(`${at.x},${at.y}`)) continue;
      const kind = choices[Math.floor(rng() * choices.length)] as DecorKind;
      const variant = Math.floor(rng() * 4);
      out.push({ x: at.x, y: at.y, face, kind, variant, ...(LIT.has(kind) ? { lit: true } : {}) });
    }
  };
  place(fronts, "front", FRONT_P * half);
  place(tops, "top", TOP_P * half);
  return out;
}

// A page's decor for the room it is in: worked out from the room's first view with tiles (its layout
// and its wires), then kept for as long as the room id stays the same, so a cache opening (which
// changes the tiles) never moves it.
export interface RoomDecor {
  room: string;
  items: DecorItem[];
}
export function roomDecor(
  kept: RoomDecor | null,
  view: {
    room: string;
    tiles?: readonly string[] | null;
    entities: readonly { kind: string; route?: Vec[] }[];
  },
): RoomDecor | null {
  if (kept?.room === view.room) return kept;
  if (!view.tiles) return null; // a new room, its layout not yet come
  const wires = view.entities.flatMap((e) => (e.kind === "wire" && e.route ? [e.route] : []));
  return { room: view.room, items: decorFor(view.room, view.tiles, wires) };
}

// The items on one wall tile's faces: a lookup built once per decorFor result.
const index = new WeakMap<
  readonly DecorItem[],
  Map<string, { front?: DecorItem; top?: DecorItem }>
>();
export function decorAt(
  items: readonly DecorItem[],
  x: number,
  y: number,
): { front?: DecorItem; top?: DecorItem } {
  let map = index.get(items);
  if (!map) {
    map = new Map();
    for (const it of items) {
      const key = `${it.x},${it.y}`;
      map.set(key, { ...map.get(key), [it.face]: it });
    }
    index.set(items, map);
  }
  return map.get(`${x},${y}`) ?? {};
}
