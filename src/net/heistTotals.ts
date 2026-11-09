import type { ItemId } from "../game/rooms/format.ts";

// What the heist has banked so far, one entry per room in the order the rooms were first cleared. A
// room the team restarts and clears again is the same room: its latest clear replaces the earlier
// one in its place, so the totals and the shelf never count a room twice.
export interface RoomClear {
  room: string;
  version: string;
  ms: number;
  loot: number;
  lootTotal: number;
  cache?: { name: string; found: boolean; item: ItemId };
}
export type Heist = RoomClear[];

export const emptyHeist = (): Heist => [];

export function addClear(heist: Heist, clear: RoomClear): Heist {
  const at = heist.findIndex((c) => c.room === clear.room);
  if (at < 0) return [...heist, clear];
  return heist.map((c, i) => (i === at ? clear : c));
}

export function totalsOf(heist: Heist) {
  return {
    ms: heist.reduce((a, c) => a + c.ms, 0),
    loot: heist.reduce((a, c) => a + c.loot, 0),
    lootTotal: heist.reduce((a, c) => a + c.lootTotal, 0),
    versions: heist.map((c) => c.version),
    caches: heist.flatMap((c) =>
      c.cache
        ? [{ room: c.room, name: c.cache.name, found: c.cache.found, item: c.cache.item }]
        : [],
    ),
  };
}
