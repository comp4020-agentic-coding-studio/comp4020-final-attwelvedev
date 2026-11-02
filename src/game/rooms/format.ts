import type { Role, Vec } from "../types.ts";

export type Tile =
  | "."
  | "#"
  | "1"
  | "2"
  | "3"
  | "B"
  | "p"
  | "D"
  | "E"
  | "G"
  | "C"
  | "L"
  | "h"
  | "K"
  | "$"
  | "S"
  | "Q"
  | "g"
  | "H"
  | "b"
  | "l"
  | "u"
  | "t"
  | "v"
  | "Y";

export interface RoomObject {
  id: string; // "p1", "D1", "B2", "E1"
  kind:
    | "plate"
    | "door"
    | "crate"
    | "exit"
    | "spawn"
    | "guard"
    | "camera"
    | "laser"
    | "hide"
    | "checkpoint"
    | "loot"
    | "sign"
    | "clue" // a chime with no picture (A2): `n` of 1 to 3 every `everyS` seconds
    | "station" // a puzzle's anchor: `params.type` and the tiles of its parts (src/game/sim/stations.ts)
    | "gear" // something one person can carry: `params.item` (src/game/sim/gear.ts)
    | "hatch" // a wall with a sill: gear goes through, people and sound do not, sight does
    | "bell" // a rope: Act rings a bell the whole room hears
    | "lamp" // a switch: Act flashes a lamp in every sighted player's HUD
    | "card" // a switches station's target card: `params.of` names the station
    | "lever" // a practice lever: Act flips it; a station that names it (`practice`) only plays
    | "order" // a vault's order clue: the wings' motifs in socket order
    | "ink"; // hidden text (`params.text`) that shows only in a UV torch's light
  tiles: Vec[]; // integer tile coordinates
  visibleTo: Role[];
  audibleTo: Role[];
  opensWhen?: string[]; // doors only
  mode?: "all" | "sequence"; // doors only: all plates held, or pressed in opensWhen order
  params?: Record<string, unknown>; // hazards, loot and signs: the room file's metadata for this id
}

export interface Beat {
  name: string;
  x: [number, number];
  intent: Record<Role, string>;
}

export interface Room {
  id: string;
  name: string;
  version: number;
  width: number;
  height: number;
  grid: string[]; // rows; object letters replaced by "." except "#", "D", "=", "%" and "H"
  objects: RoomObject[];
  beats: Beat[];
  meta: Record<string, unknown>; // the raw JSON, for later phases' keys
}

// An environment flip a room can carry in its metadata (spec §4.1 of the phase 05 plan):
// a dark zone, or an alarm set off by a plate or by being caught.
export type Flip =
  | { kind: "dark"; zone: [number, number, number, number] }
  | { kind: "alarm"; trigger: string; durationS: number };

export function flipsOf(room: Room): Flip[] {
  const raw = room.meta.flips;
  if (!Array.isArray(raw)) return [];
  const out: Flip[] = [];
  for (const f of raw) {
    if (!isRecord(f)) continue;
    const zone = f.zone;
    if (
      f.kind === "dark" &&
      Array.isArray(zone) &&
      zone.length === 4 &&
      zone.every((n) => typeof n === "number")
    ) {
      out.push({ kind: "dark", zone: zone as [number, number, number, number] });
    } else if (f.kind === "alarm" && typeof f.trigger === "string") {
      out.push({
        kind: "alarm",
        trigger: f.trigger,
        durationS: typeof f.durationS === "number" ? f.durationS : 8,
      });
    }
  }
  return out;
}

export class RoomFormatError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(message);
    this.name = "RoomFormatError";
    this.line = line;
  }
}

const TILES = new Set([
  "#",
  ".",
  "1",
  "2",
  "3",
  "B",
  "p",
  "D",
  "E",
  "G",
  "C",
  "L",
  "h",
  "K",
  "$",
  "S",
  "=", // glass: sight passes, sound and bodies don't
  "%", // vent: sound passes, sight and bodies don't
  "c", // a clue: a chime nobody can see
  "Q", // a station's anchor
  "g", // gear
  "H", // a hatch: kept in the grid, like glass
  "b", // a bell rope
  "l", // a lamp switch
  "u", // UV ink
  "t", // a target card
  "v", // a practice lever
  "Y", // a vault's order clue
]);

// Single-tile objects numbered in reading order: letter -> [kind, id prefix].
const NUMBERED: Record<string, [RoomObject["kind"], string]> = {
  G: ["guard", "G"],
  C: ["camera", "C"],
  L: ["laser", "L"],
  h: ["hide", "h"],
  K: ["checkpoint", "K"],
  $: ["loot", "$"],
  S: ["sign", "S"],
  c: ["clue", "c"],
  Q: ["station", "Q"],
  g: ["gear", "g"],
  H: ["hatch", "H"],
  b: ["bell", "b"],
  l: ["lamp", "l"],
  u: ["ink", "u"],
  t: ["card", "T"],
  v: ["lever", "v"],
  Y: ["order", "Y"],
};
// Kinds whose metadata is kept whole as `params`.
const PARAMS: Record<string, true> = {
  guard: true,
  camera: true,
  laser: true,
  hide: true,
  checkpoint: true,
  loot: true,
  sign: true,
  clue: true,
  plate: true, // `crateOnly`: only a crate's weight holds it
  station: true,
  gear: true,
  ink: true,
  card: true,
  order: true,
  lever: true,
};
export const STATION_TYPES = [
  "dial",
  "wires",
  "keypad",
  "radio",
  "switches",
  "bells",
  "vault",
  "sync",
] as const;
export const GEAR_ITEMS = ["earpiece", "goggles", "stethoscope", "uv"] as const;
// A drawn symbol at both ends of a link (clues FR3): a station that yields and the one it feeds.
export const MOTIFS = ["moon", "star", "wave", "key", "eye", "leaf"] as const;
export type Motif = (typeof MOTIFS)[number];
export const isMotif = (v: unknown): v is Motif => (MOTIFS as readonly unknown[]).includes(v);
// Things a cache's stash can hold (caches FR7): one drawn item, worth 1 loot.
export const ITEMS = ["watch", "ledger", "ring", "goblet", "pen", "necklace"] as const;
export type ItemId = (typeof ITEMS)[number];
export const MAX_CACHE_TILES = 6;

// A hidden optional station (`params.cache`): `owner` is the seat (1 to 3) whose screen shows the
// riddle; the tile whose motif matches `motif` uncovers the station, the others are decoys.
export interface CacheSpec {
  owner: 1 | 2 | 3;
  motif: Motif;
  riddle: string;
  item: ItemId;
  tiles: { at: Vec; motif: Motif }[];
  chamber: ChamberSpec;
}

// Inclusive tile rectangle: [x0, y0, x1, y1].
export type Rect = [x0: number, y0: number, x1: number, y1: number];
// The side room a cache hides: floor in the room's own grid, entered by a secret `D` tile (`door`);
// `vault` is an alcove inside it behind a second `D` tile, and `item` is where the keepsake stands.
export interface ChamberSpec {
  rect: Rect;
  door: Vec;
  vault: { rect: Rect; door: Vec; item: Vec };
}

export function inRect(r: Rect, t: Vec): boolean {
  return t.x >= r[0] && t.x <= r[2] && t.y >= r[1] && t.y <= r[3];
}

const isRect = (v: unknown): v is Rect =>
  Array.isArray(v) && v.length === 4 && v.every((n) => Number.isInteger(n));
const isPoint = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n));
const toVec = (p: [number, number]): Vec => ({ x: p[0], y: p[1] });

function checkCache(id: string, raw: unknown): void {
  const fail = (why: string): never => {
    throw new RoomFormatError(`cache ${id} ${why}`, 1);
  };
  if (!isRecord(raw)) {
    fail("must be an object");
    return;
  }
  if (![1, 2, 3].includes(raw.owner as number)) {
    fail(`needs an owner of 1, 2 or 3 (got ${JSON.stringify(raw.owner)})`);
  }
  if (!isMotif(raw.motif))
    fail(`has motif ${JSON.stringify(raw.motif)}, not one of ${MOTIFS.join(", ")}`);
  if (typeof raw.riddle !== "string" || raw.riddle === "") fail("needs a riddle");
  if (!(ITEMS as readonly unknown[]).includes(raw.item)) {
    fail(`needs an item, one of ${ITEMS.join(", ")} (got ${JSON.stringify(raw.item)})`);
  }
  const tiles = raw.tiles;
  if (!Array.isArray(tiles)) {
    fail("needs tiles");
    return;
  }
  if (tiles.length > MAX_CACHE_TILES) fail(`has ${tiles.length} tiles, at most ${MAX_CACHE_TILES}`);
  for (const t of tiles) {
    const at = isRecord(t) ? t.at : undefined;
    if (
      !isRecord(t) ||
      !Array.isArray(at) ||
      at.length !== 2 ||
      at.some((n) => !Number.isInteger(n)) ||
      !isMotif(t.motif)
    ) {
      fail('tiles are { "at": [x, y], "motif": a motif }');
    }
  }
  const matching = tiles.filter((t) => isRecord(t) && t.motif === raw.motif).length;
  if (matching !== 1) fail(`needs exactly one tile that matches its motif (has ${matching})`);
  if (raw.chamber === undefined) fail("needs a chamber");
}

// Checks a cache's chamber against the grid and the door objects (`parseRoom` calls it once both
// exist). Every message names the cache and the field.
function checkChamber(
  id: string,
  raw: Record<string, unknown>,
  grid: string[],
  doors: RoomObject[],
) {
  const fail = (why: string): never => {
    throw new RoomFormatError(`cache ${id} chamber ${why}`, 1);
  };
  const ch = raw.chamber;
  if (!isRecord(ch)) return fail("must be an object");
  const vault = ch.vault;
  if (!isRecord(vault)) return fail("needs a vault");
  const inGrid = (t: Vec) => grid[t.y] !== undefined && t.x >= 0 && t.x < (grid[t.y]?.length ?? 0);
  const rect = (name: string, r: unknown, ok: (t: Vec, c: string) => boolean): Rect => {
    if (!isRect(r)) return fail(`${name} must be [x0, y0, x1, y1]`);
    if (r[0] > r[2] || r[1] > r[3]) fail(`${name} has x0 > x1 or y0 > y1`);
    for (let y = r[1]; y <= r[3]; y++) {
      for (let x = r[0]; x <= r[2]; x++) {
        if (!inGrid({ x, y })) fail(`${name} is not inside the grid`);
        if (!ok({ x, y }, grid[y]?.[x] ?? ""))
          fail(`${name} has a tile at ${x},${y} that is not allowed`);
      }
    }
    return r;
  };
  const door = (name: string, d: unknown): Vec => {
    if (!isPoint(d)) return fail(`${name} must be [x, y]`);
    const t = toVec(d);
    if (!inGrid(t) || grid[t.y]?.[t.x] !== "D") fail(`${name} is not a D tile`);
    return t;
  };
  const chamberDoor = door("door", ch.door);
  const vaultDoor = door("vault.door", vault.door);
  // `rect` is a bounding box: floor, interior walls and the vault's own door; `vault.rect` is floor
  const outer = rect(
    "rect",
    ch.rect,
    (t, c) => c === "." || c === "#" || (t.x === vaultDoor.x && t.y === vaultDoor.y),
  );
  const inner = rect("vault.rect", vault.rect, (_t, c) => c === ".");
  if (
    !inRect(outer, { x: inner[0], y: inner[1] }) ||
    !inRect(outer, { x: inner[2], y: inner[3] })
  ) {
    fail("vault.rect is not inside rect");
  }
  if (!isPoint(vault.item) || !inRect(inner, toVec(vault.item))) {
    fail("vault.item is not in vault.rect");
  }
  const idAt = (t: Vec) => doors.find((d) => d.tiles.some((q) => q.x === t.x && q.y === t.y))?.id;
  if (idAt(chamberDoor) === idAt(vaultDoor))
    fail("door and vault.door touch (they would be one door)");
}

// The cache a station carries, or null for an ordinary station. `parseRoom` has already checked it.
export function cacheOf(o: RoomObject): CacheSpec | null {
  const raw = o.kind === "station" ? o.params?.cache : undefined;
  if (!isRecord(raw)) return null;
  return {
    owner: raw.owner as 1 | 2 | 3,
    motif: raw.motif as Motif,
    riddle: raw.riddle as string,
    item: raw.item as ItemId,
    tiles: (raw.tiles as { at: [number, number]; motif: Motif }[]).map((t) => ({
      at: { x: t.at[0], y: t.at[1] },
      motif: t.motif,
    })),
    chamber: chamberOf(raw.chamber as Record<string, unknown>),
  };
}

function chamberOf(c: Record<string, unknown>): ChamberSpec {
  const v = c.vault as Record<string, unknown>;
  return {
    rect: c.rect as Rect,
    door: toVec(c.door as [number, number]),
    vault: {
      rect: v.rect as Rect,
      door: toVec(v.door as [number, number]),
      item: toVec(v.item as [number, number]),
    },
  };
}

// Per cache, the two secret doors: the chamber's and the vault's, as door objects with their tiles.
export function secretDoors(room: Room): { id: string; chamber: RoomObject; vault: RoomObject }[] {
  const out: { id: string; chamber: RoomObject; vault: RoomObject }[] = [];
  for (const o of room.objects) {
    const c = cacheOf(o);
    if (!c) continue;
    const at = (t: Vec) =>
      room.objects.find(
        (d) => d.kind === "door" && d.tiles.some((q) => q.x === t.x && q.y === t.y),
      ) as RoomObject;
    out.push({ id: o.id, chamber: at(c.chamber.door), vault: at(c.chamber.vault.door) });
  }
  return out;
}

const DEFAULT_VISIBLE_TO: Role[] = ["deaf", "mute"];
const ROLE_SET = new Set<string>(["blind", "deaf", "mute"]);

function isRoleList(v: unknown): v is Role[] {
  return Array.isArray(v) && v.every((r) => typeof r === "string" && ROLE_SET.has(r));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseBeats(raw: unknown): Beat[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new RoomFormatError('"beats" must be an array', 1);
  return raw.map((b, i) => {
    const beat = isRecord(b) ? b : {};
    const x = beat.x;
    const intent = isRecord(beat.intent) ? beat.intent : {};
    if (typeof beat.name !== "string") throw new RoomFormatError(`beat ${i + 1} needs a name`, 1);
    if (!Array.isArray(x) || x.length !== 2 || x.some((n) => typeof n !== "number")) {
      throw new RoomFormatError(`beat "${beat.name}" needs x: [from, to]`, 1);
    }
    for (const role of ROLE_SET) {
      if (typeof intent[role] !== "string") {
        throw new RoomFormatError(`beat "${beat.name}" needs an intent for ${role}`, 1);
      }
    }
    // the presence linter (lint.ts: lintPresence) carries "every role is needed" now (spec FR4)
    if (beat.lead !== undefined || beat.cue !== undefined) {
      throw new RoomFormatError(
        `beat "${beat.name}" names a ${beat.lead !== undefined ? "lead" : "cue"}: lead beats were removed`,
        1,
      );
    }
    return {
      name: beat.name,
      x: [x[0] as number, x[1] as number],
      intent: intent as Record<Role, string>,
    };
  });
}

// Groups the tiles of one letter into 4-connected components, in reading order
// of each component's first tile, so adjacent D (or E) tiles become one object.
function components(grid: string[], letter: string): Vec[][] {
  const seen = new Set<string>();
  const out: Vec[][] = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < (grid[y]?.length ?? 0); x++) {
      if (grid[y]?.[x] !== letter || seen.has(`${x},${y}`)) continue;
      const tiles: Vec[] = [];
      const queue: Vec[] = [{ x, y }];
      seen.add(`${x},${y}`);
      while (queue.length > 0) {
        const t = queue.shift() as Vec;
        tiles.push(t);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const n = { x: t.x + dx, y: t.y + dy };
          if (grid[n.y]?.[n.x] === letter && !seen.has(`${n.x},${n.y}`)) {
            seen.add(`${n.x},${n.y}`);
            queue.push(n);
          }
        }
      }
      tiles.sort((a, b) => a.y - b.y || a.x - b.x);
      out.push(tiles);
    }
  }
  return out;
}

export function parseRoom(text: string): Room {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sep = lines.findIndex((l) => l.trim() === "---");
  if (sep < 0) throw new RoomFormatError('missing "---" line between metadata and grid', 1);

  let meta: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(lines.slice(0, sep).join("\n"));
    if (!isRecord(parsed)) throw new Error("not an object");
    meta = parsed;
  } catch (e) {
    throw new RoomFormatError(`metadata is not a JSON object: ${(e as Error).message}`, 1);
  }
  if (typeof meta.id !== "string" || typeof meta.name !== "string") {
    throw new RoomFormatError('metadata needs a string "id" and "name"', 1);
  }
  const version = typeof meta.version === "number" ? meta.version : 1;
  const overrides = isRecord(meta.objects) ? meta.objects : {};

  const rows = lines.slice(sep + 1);
  while (rows.length > 0 && rows[rows.length - 1]?.trim() === "") rows.pop();

  const raw = rows.map((r) => r.trimEnd());
  raw.forEach((row, r) => {
    for (const ch of row) {
      if (!TILES.has(ch)) {
        throw new RoomFormatError(`unknown tile ${JSON.stringify(ch)}`, sep + 2 + r);
      }
    }
  });

  const objects: RoomObject[] = [];
  const add = (id: string, kind: RoomObject["kind"], tiles: Vec[]) => {
    const o = overrides[id];
    const ov = isRecord(o) ? o : {};
    const object: RoomObject = {
      id,
      kind,
      tiles,
      // a clue has no picture, so nobody sees it unless the room file says so
      visibleTo: isRoleList(ov.visible_to)
        ? ov.visible_to
        : kind === "clue"
          ? []
          : [...DEFAULT_VISIBLE_TO],
      audibleTo: isRoleList(ov.audible_to) ? ov.audible_to : [],
    };
    if (kind === "door") {
      if (Array.isArray(ov.opensWhen)) {
        object.opensWhen = ov.opensWhen.filter((v): v is string => typeof v === "string");
      }
      object.mode = ov.mode === "sequence" ? "sequence" : "all";
    }
    if (kind in PARAMS) object.params = { ...ov };
    if (kind === "station" && !(STATION_TYPES as readonly unknown[]).includes(ov.type)) {
      throw new RoomFormatError(
        `station ${id} needs a type, one of ${STATION_TYPES.join(", ")} (got ${JSON.stringify(ov.type)})`,
        1,
      );
    }
    if (ov.motif !== undefined && !isMotif(ov.motif)) {
      throw new RoomFormatError(
        `${id} has motif ${JSON.stringify(ov.motif)}, not one of ${MOTIFS.join(", ")}`,
        1,
      );
    }
    if (kind === "station" && ov.cache !== undefined) checkCache(id, ov.cache);
    if (kind === "gear" && !(GEAR_ITEMS as readonly unknown[]).includes(ov.item)) {
      throw new RoomFormatError(
        `gear ${id} needs an item, one of ${GEAR_ITEMS.join(", ")} (got ${JSON.stringify(ov.item)})`,
        1,
      );
    }
    objects.push(object);
  };

  const counters: Record<string, number> = {};
  for (let y = 0; y < raw.length; y++) {
    for (let x = 0; x < (raw[y]?.length ?? 0); x++) {
      const ch = raw[y]?.[x] as string;
      const at = [{ x, y }];
      if (ch === "p" || ch === "B") {
        counters[ch] = (counters[ch] ?? 0) + 1;
        add(`${ch}${counters[ch]}`, ch === "p" ? "plate" : "crate", at);
      } else if (ch === "1" || ch === "2" || ch === "3") {
        add(`s${ch}`, "spawn", at);
      } else if (NUMBERED[ch]) {
        const [kind, prefix] = NUMBERED[ch] as [RoomObject["kind"], string];
        counters[ch] = (counters[ch] ?? 0) + 1;
        add(`${prefix}${counters[ch]}`, kind, at);
      }
    }
  }
  for (const [i, tiles] of components(raw, "D").entries()) add(`D${i + 1}`, "door", tiles);
  for (const [i, tiles] of components(raw, "E").entries()) add(`E${i + 1}`, "exit", tiles);

  const grid = raw.map((row) => row.replace(/[^#D=%H]/g, "."));
  const doorObjects = objects.filter((o) => o.kind === "door");
  for (const o of objects) {
    const cache = o.kind === "station" ? o.params?.cache : undefined;
    if (isRecord(cache)) checkChamber(o.id, cache, grid, doorObjects);
  }
  return {
    id: meta.id,
    name: meta.name,
    version,
    width: Math.max(0, ...raw.map((r) => r.length)),
    height: raw.length,
    grid,
    objects,
    beats: parseBeats(meta.beats),
    meta,
  };
}
