import type { EntityView } from "../game/perception.ts";
import { inReach } from "../game/sim/gear.ts";
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
  cratePlate: "Crate plate: only a crate's weight holds it",
  crate: "Crate: lean on it to push it, and it can sit on a plate",
  door: "Door: opens while its plates are held",
  stationdoor: "Door: opens once its stations are solved",
  sequencedoor: "Door: opens when its plates are pressed in order",
  secretdoor: "Secret door: it slid open from a hidden catch",
  loot: "Loot: walk over it to take it",
  camera: "Camera: stay out of its cone while it watches",
  laser: "Laser: a beam that catches you while it's on",
  guard: "Guard: keep out of its sight",
  exit: "Exit: everyone on it ends the room",
  checkpoint: "Checkpoint: caught after this, you start here",
  dark: "Dark: you can't see here, but you can hear",
  // stations, gear and signals (spec §4.1 labels; the keys' line is ours: the spec named none)
  safe: "Safe: stand on an arrow and press Act to turn the dial",
  wires: "Wires: stand under one and press Act to cut it",
  plaque: "Plaque: a rule or a number for another room. Some are only in UV ink",
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
  lever: "Lever: while on, keys and bells only play",
  hands: "Hold hands: press Act next to a teammate",
  canhold: "Space: hold hands", // a free teammate in reach (FR6); "Hold hands" on a phone (HOLD_PHONE)
};
const HOLD_PHONE = "Hold hands"; // a phone has no Space key: its Act button does it

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
  "lever",
  "gear",
  "hands",
  "canhold",
  "stationdoor",
  "sequencedoor",
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

// A chip is only for what is this close (tiles between centres): further off is not what you are
// looking at, and a far chip only crowds a near one.
export const LABEL_RANGE = 9;
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
  checkpoint: "checkpoint",
  gear: "gear",
  hatch: "hatch",
  bell: "bell",
  lamp: "lamp",
  lever: "lever",
  ink: "plaque",
};

// What a thing is, for its label: most by their kind, a station by its type, a sign that carries a
// rule as a plaque, and a figure holding a hand as the hold-hands chip.
function kindOf(e: EntityView): string | undefined {
  if (e.kind === "station" && e.station) return STATION_KIND[e.station.type];
  if (e.kind === "door" && e.secret) return "secretdoor";
  // how a door opens decides what its chip says: held plates, a solved station, or a sequence
  if (e.kind === "door" && e.opens === "stations") return "stationdoor";
  if (e.kind === "door" && e.opens === "sequence") return "sequencedoor";
  if (e.kind === "sign" && e.text) return "plaque";
  if (e.kind === "plate" && e.crateOnly) return "cratePlate";
  if (e.kind === "player")
    return e.holding !== undefined || e.heldBy !== undefined ? "hands" : undefined;
  return KIND_OF[e.kind];
}

// The chips for what is in sight right now: one per kind, on the nearest one to `near`, within
// LABEL_RANGE. A kind whose every instance is out of sight has none; it comes back when one is in
// sight again. `met` is the kinds already shown in an earlier room: a kind not in it is new, so it
// passes `only` and is ranked ahead of the nearer, known ones (without `met` no kind is new).
export function labelsFor(
  entities: readonly EntityView[],
  tiles: readonly string[] | undefined,
  near: Vec,
  enabled = true,
  visible: (at: Vec) => boolean = () => true,
  only?: ReadonlySet<string>, // label just these kinds (past the first room: the new objects)
  max = Number.POSITIVE_INFINITY, // keep only this many chips: new kinds first, then the nearest
  met?: ReadonlySet<string>,
  // your seat, for the hold-hands chip on a free teammate in reach (FR6), and whether this is a phone
  me?: { seat: number; phone: boolean },
): Label[] {
  if (!enabled) return [];
  const nearest = new Map<string, { at: Vec; d: number }>();
  const offer = (kind: string, at: Vec) => {
    const d = Math.hypot(at.x - near.x, at.y - near.y);
    if (d > LABEL_RANGE) return;
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
  // a free teammate in hand reach, while you are free too: Space would take their hand
  const self = me && entities.find((e) => e.kind === "player" && e.seat === me.seat);
  const paired = (e: EntityView) => e.holding !== undefined || e.heldBy !== undefined;
  if (self && !paired(self)) {
    for (const e of entities) {
      if (e.kind !== "player" || e.seat === me.seat || paired(e)) continue;
      if (inReach(near, e.pos) && visible(e.pos)) offer("canhold", e.pos); // `near`: where you are
    }
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
  const isNew = (kind: string) => met !== undefined && !met.has(kind);
  return [...nearest]
    .filter(([kind]) => !only || only.has(kind) || isNew(kind))
    .sort((a, b) => Number(isNew(b[0])) - Number(isNew(a[0])) || a[1].d - b[1].d)
    .slice(0, max)
    .map(([kind, { at }]) => ({
      kind,
      text: kind === "canhold" && me?.phone ? HOLD_PHONE : (LABEL_COPY[kind] ?? kind),
      at,
    }));
}
