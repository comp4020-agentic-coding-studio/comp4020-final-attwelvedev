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
  | "S";

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
    | "sign";
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
  grid: string[]; // rows; object letters replaced by "." except "#" and "D"
  objects: RoomObject[];
  beats: Beat[];
  meta: Record<string, unknown>; // the raw JSON, for later phases' keys
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
};
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
      visibleTo: isRoleList(ov.visible_to) ? ov.visible_to : [...DEFAULT_VISIBLE_TO],
      audibleTo: isRoleList(ov.audible_to) ? ov.audible_to : [],
    };
    if (kind === "door") {
      if (Array.isArray(ov.opensWhen)) {
        object.opensWhen = ov.opensWhen.filter((v): v is string => typeof v === "string");
      }
      object.mode = ov.mode === "sequence" ? "sequence" : "all";
    }
    if (kind in PARAMS) object.params = { ...ov };
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

  const grid = raw.map((row) => row.replace(/[^#D]/g, "."));
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
