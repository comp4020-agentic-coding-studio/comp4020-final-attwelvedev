import { cacheOf, type ItemId, type RoomObject } from "../rooms/format.ts";
import type { Seat } from "../types.ts";
import type { World } from "./world.ts";

// What each seat did in a room, in fixed words (spec FR30). Nicknames are never put in here: a
// line names a teammate by a `{seat}` token the page fills in from the crew, so a name never
// reaches the server's log or this module. One line per seat.
export interface Credit {
  seat: Seat;
  lines: string[];
}

// [one, many] for the same job done more than once ("cracked 2 safes")
const SOLVED: Record<string, [string, (n: number) => string]> = {
  dial: ["cracked the safe", (n) => `cracked ${n} safes`],
  wires: ["cut the wires", (n) => `cut ${n} sets of wires`],
  keypad: ["punched in the code", (n) => `punched in ${n} codes`],
  radio: ["tuned the radio", (n) => `tuned ${n} radios`],
  switches: ["set the switches", (n) => `set ${n} sets of switches`],
  bells: ["rang the tune", (n) => `rang ${n} tunes`],
  vault: ["opened the vault", (n) => `opened ${n} vaults`],
  sync: ["turned the key in time", (n) => `turned ${n} keys in time`],
};

// A stash's item as a credit names it. A fixed table: never read from the room file (caches FR15).
export const ITEM_NAME: Record<ItemId, string> = {
  watch: "the gold watch",
  ledger: "the ledger",
  ring: "the signet ring",
  goblet: "the silver goblet",
  pen: "the fountain pen",
  necklace: "the pearl necklace",
};

const objectOf = (world: World, id: string): RoomObject | undefined =>
  world.room.objects.find((o) => o.id === id);

// The room's cache and whether it was found, for the cleared card; undefined for a room with none.
// `owner` and `by` are seats (0 to 2), as everywhere on the wire.
export interface CacheResult {
  room: string;
  found: boolean;
  item: ItemId;
  owner: Seat;
  by?: Seat;
  riddle: string;
}

export function cacheResultOf(world: World): CacheResult | undefined {
  for (const o of world.room.objects) {
    const cache = cacheOf(o);
    if (!cache) continue;
    const by = world.cacheBy[o.id];
    return {
      room: world.room.id,
      found: by !== undefined,
      item: cache.item,
      owner: (cache.owner - 1) as Seat,
      ...(by !== undefined ? { by } : {}),
      riddle: cache.riddle,
    };
  }
  return undefined;
}

export function creditsOf(world: World): Credit[] {
  return ([0, 1, 2] as const).map((seat) => {
    const solved: Record<string, number> = {};
    const cacheLines: string[] = [];
    for (const [id, by] of Object.entries(world.solvedBy)) {
      const type = world.stations[id]?.type;
      if (by !== seat || !type) continue;
      // a cache is a side job, not "a safe": it gets its own line and stays out of the fold
      const cache = cacheOf(objectOf(world, id) as RoomObject);
      if (cache) {
        const item = ITEM_NAME[cache.item];
        cacheLines.push(
          cache.owner - 1 === seat
            ? `side job found: ${item}`
            : `found {${cache.owner - 1}}'s side job: ${item}`,
        );
        continue;
      }
      solved[type] = (solved[type] ?? 0) + 1;
    }
    const lines = [
      ...Object.entries(solved).map(([type, n]) => {
        const words = SOLVED[type];
        return !words ? "solved a puzzle" : n === 1 ? words[0] : words[1](n);
      }),
      ...cacheLines,
    ];
    return { seat, lines: lines.length > 0 ? lines : ["kept the crew moving"] };
  });
}
