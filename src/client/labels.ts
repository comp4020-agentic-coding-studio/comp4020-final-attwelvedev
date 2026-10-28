import type { EntityView } from "../game/perception.ts";
import type { Vec } from "../game/types.ts";

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
};

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
};

// The chips for what is in sight right now: one per kind, on the nearest one to `near`. A kind
// whose every instance is out of sight has none; it comes back when one is in sight again.
export function labelsFor(
  entities: readonly EntityView[],
  tiles: readonly string[] | undefined,
  near: Vec,
  enabled = true,
  visible: (at: Vec) => boolean = () => true,
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
    const kind = KIND_OF[e.kind];
    if (!kind || !visible(e.pos)) continue;
    const group = groups.get(e.id) ?? { kind, tiles: [] };
    group.tiles.push(e.pos);
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
  return [...nearest].map(([kind, { at }]) => ({ kind, text: LABEL_COPY[kind] ?? kind, at }));
}
