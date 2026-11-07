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

// A closed union: each theme's kinds. Phase 8 adds the other six themes' kinds.
export type DecorKind =
  | "painting" // gallery: a gilt frame round an abstract field, with a picture light
  | "violin" // salon: silhouettes in a darker wall tone
  | "lute"
  | "staff" // salon: five lines, never a note
  | "swag" // salon: a curtain swag across the top of a front
  | "rivets" // strongroom: a row of six dots along the top of a front, or along a wall top
  | "cladding" // strongroom: a steel panel with vertical seams
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
  pavilion: [],
  conservatory: [],
  watch: [],
  bank: [],
  gallery: ["painting"],
  backstage: [],
  service: [],
  salon: ["violin", "lute", "staff", "swag"],
  strongroom: ["rivets", "cladding", "cagedSconce"],
};

// Which faces a kind can go on. Only a row of rivets also reads on a wall's top.
export const KIND_FACES: Record<DecorKind, readonly ("front" | "top")[]> = {
  painting: ["front"],
  violin: ["front"],
  lute: ["front"],
  staff: ["front"],
  swag: ["front"],
  rivets: ["front", "top"],
  cladding: ["front"],
  cagedSconce: ["front"],
};

// Kinds that carry a --w-sconce glow, clipped to their own face.
const LIT: ReadonlySet<DecorKind> = new Set(["painting", "cagedSconce"]);

export interface DecorItem {
  x: number; // the wall tile
  y: number;
  face: "front" | "top";
  kind: DecorKind;
  lit?: true;
  variant: number; // 0..3, seeded
}

// A room's nudge to its seed (R2): raised when the anchor test finds an item beside a station part.
// 05 and 09 are nudged so that no item stands beside a station part or plaque (decor.test.ts, R2).
export const SALT: Record<string, number> = { "05-the-gallery": 36, "09-the-vault": 2995 };

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

// The room's decor: fronts then tops, each walked in reading order with its own density, at least
// APART tiles from the last item on that kind of face. Room 01 is at half density.
export function decorFor(
  roomId: string,
  tiles: readonly string[],
  wires: readonly Vec[][] = [],
): DecorItem[] {
  const theme = THEME_OF[roomId];
  const kinds = theme ? THEME_KINDS[theme] : [];
  if (kinds.length === 0) return [];
  const rng = mulberry32(fnv1a(`${roomId}:${SALT[roomId] ?? 0}`));
  const half = roomId.startsWith("01-") ? 0.5 : 1;
  const near = excluded(tiles, wires);
  const fronts: Vec[] = [];
  const tops: Vec[] = [];
  tiles.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== "#" || near.has(`${x},${y}`)) continue;
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
    const cap = Math.floor(cells.length * p); // at most 1 per 1/p eligible, whatever the dice say
    let last: Vec | null = null;
    let placed = 0;
    for (const at of cells) {
      const roll = rng();
      if (placed >= cap || roll >= p || (last && cheb(last, at) < APART)) continue;
      const kind = choices[Math.floor(rng() * choices.length)] as DecorKind;
      const variant = Math.floor(rng() * 4);
      out.push({ x: at.x, y: at.y, face, kind, variant, ...(LIT.has(kind) ? { lit: true } : {}) });
      last = at;
      placed++;
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
