import type { EntityView } from "../game/perception.ts";
import type { Vec } from "../game/types.ts";
import { plateAt } from "./render/stations.ts";

// In-world labels for the first room (FR15): the first time a kind of object is in sight, a small
// chip says what it is for. Pure: the renderer draws what this returns.
export interface Label {
  kind: string;
  text: string;
  at: Vec; // tile-space centre of the object the chip points at
}

export const LABEL_COPY: Record<string, string> = {
  plate: "Plate: one person on each opens the door",
  glass: "Glass: see through it, sound doesn't pass",
  vent: "Vent: sound passes, you can't see through",
  crate: "Crate: lean on it to push it, and it can sit on a plate",
  door: "Door: opens while its plates are held",
  loot: "Loot: walk over it to take it",
  camera: "Camera: stay out of its cone while it watches",
  laser: "Laser: a beam that catches you while it's on",
  guard: "Guard: keep out of its sight",
  exit: "Exit: everyone on it ends the room",
  dark: "Dark: you can't see here, but you can hear",
  // stations, gear and signals (spec §4.1 labels; the keys' line is ours: the spec named none)
  safe: "Safe: stand on an arrow and press Act to turn the dial",
  wires: "Wires: stand under one and press Act to cut it",
  plaque: "Plaque: a rule for another room. Some are only in UV ink",
  keypad: "Keypad: each key has its own note and light",
  radio: "Radio: turn until the static clears, then count the pips",
  switches: "Switches: each one flips lamps in another room",
  musicbox: "Music box: strike the bells in the tune's order",
  vault: "Vault: one symbol from each wing",
  keys: "Keys: two of you turn them at the same moment",
  hatch: "Hatch: gear and crates go through, people don't",
  bell: "Bell: pull the rope; everyone who can hear, hears it",
  lamp: "Lamp: flips a light on every sighted teammate's screen",
  gear: "Gear: walk over it and press Act to pick it up",
  hands: "Hold hands: press Act next to a teammate",
};

// The kinds that are new with the escape-room rooms: labelled in whichever room they first appear,
// not only the first room (they first appear in room 2).
export const ESCAPE_KINDS = new Set([
  "safe",
  "wires",
  "plaque",
  "keypad",
  "radio",
  "switches",
  "musicbox",
  "vault",
  "keys",
  "hatch",
  "bell",
  "lamp",
  "gear",
  "hands",
]);
const STATION_KIND: Record<NonNullable<EntityView["station"]>["type"], string> = {
  dial: "safe",
  wires: "wires",
  keypad: "keypad",
  radio: "radio",
  switches: "switches",
  bells: "musicbox",
  vault: "vault",
  sync: "keys",
};

// At most this many chips at once, the nearest first (clues FR12); a phone is a canvas narrower
// than 720 px, the camera's phone split.
export const LABEL_CAP = { desktop: 3, phone: 2 } as const;

const TILE_RADIUS = 7; // glass and vents are labelled when one is this close to the seat
const KIND_OF: Partial<Record<EntityView["kind"], string>> = {
  plate: "plate",
  crate: "crate",
  door: "door",
  loot: "loot",
  camera: "camera",
  laser: "laser",
  guard: "guard",
  exit: "exit",
  gear: "gear",
  hatch: "hatch",
  bell: "bell",
  lamp: "lamp",
  ink: "plaque",
};

// What a thing is, for its label: most by their kind, a station by its type, a sign that carries a
// rule as a plaque, and a figure holding a hand as the hold-hands chip.
function kindOf(e: EntityView): string | undefined {
  if (e.kind === "station" && e.station) return STATION_KIND[e.station.type];
  if (e.kind === "sign" && e.text) return "plaque";
  if (e.kind === "player")
    return e.holding !== undefined || e.heldBy !== undefined ? "hands" : undefined;
  return KIND_OF[e.kind];
}

// The chips for what is in sight right now: one per kind, on the nearest one to `near`. A kind
// whose every instance is out of sight has none; it comes back when one is in sight again.
export function labelsFor(
  entities: readonly EntityView[],
  tiles: readonly string[] | undefined,
  near: Vec,
  enabled = true,
  visible: (at: Vec) => boolean = () => true,
  only?: ReadonlySet<string>, // label just these kinds (past the first room: the new objects)
  max = Number.POSITIVE_INFINITY, // keep only this many chips, the nearest
): Label[] {
  if (!enabled) return [];
  const nearest = new Map<string, { at: Vec; d: number }>();
  const offer = (kind: string, at: Vec) => {
    const d = Math.hypot(at.x - near.x, at.y - near.y);
    const best = nearest.get(kind);
    if (!best || d < best.d) nearest.set(kind, { at, d });
  };
  // A door or an exit is one object over several tiles: the chip points at the middle of the
  // tiles in sight, so it names the object rather than whichever tile is nearest.
  const groups = new Map<string, { kind: string; tiles: Vec[] }>();
  for (const e of entities) {
    const kind = kindOf(e);
    if (!kind) continue;
    // a station points where its plate stands (its main piece), which may not be its anchor
    const st = e.station;
    const anchor = st?.parts.find((p) => p.key === "anchor")?.at[0];
    const pos = st && anchor ? (plateAt(st, anchor)[0]?.at ?? e.pos) : e.pos;
    if (!visible(pos)) continue;
    const group = groups.get(e.id) ?? { kind, tiles: [] };
    group.tiles.push(pos);
    groups.set(e.id, group);
  }
  for (const { kind, tiles: spots } of groups.values()) {
    const mid = {
      x: spots.reduce((n, t) => n + t.x, 0) / spots.length,
      y: spots.reduce((n, t) => n + t.y, 0) / spots.length,
    };
    offer(kind, mid);
  }
  if (tiles) {
    const x0 = Math.max(0, Math.floor(near.x) - TILE_RADIUS);
    const x1 = Math.floor(near.x) + TILE_RADIUS;
    const y0 = Math.max(0, Math.floor(near.y) - TILE_RADIUS);
    const y1 = Math.min(tiles.length - 1, Math.floor(near.y) + TILE_RADIUS);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const ch = tiles[y]?.[x];
        if (ch !== "=" && ch !== "%") continue;
        const at = { x: x + 0.5, y: y + 0.5 };
        if (visible(at)) offer(ch === "=" ? "glass" : "vent", at);
      }
    }
  }
  return [...nearest]
    .filter(([kind]) => !only || only.has(kind))
    .sort((a, b) => a[1].d - b[1].d)
    .slice(0, max)
    .map(([kind, { at }]) => ({ kind, text: LABEL_COPY[kind] ?? kind, at }));
}
