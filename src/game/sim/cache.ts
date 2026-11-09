import { cacheOf, inRect, type RoomObject, secretDoors } from "../rooms/format.ts";
import type { Seat, Vec } from "../types.ts";
import type { World } from "./world.ts";

// A cache's two secret doors follow its state: the chamber's is open once the cache is uncovered, the
// vault's once it is solved. The flag is set directly, so `updateDoors` sees no change and pushes no
// `door` event (no ordinary door click); the `cache` events carry the moment instead.
export function syncCacheDoors(world: World): void {
  for (const d of secretDoors(world.room)) {
    world.doorOpen[d.chamber.id] = world.cacheUncovered.includes(d.id);
    world.doorOpen[d.vault.id] = world.cacheBy[d.id] !== undefined;
  }
}

const tileOf = (t: Vec): Vec => ({ x: Math.floor(t.x), y: Math.floor(t.y) });

// The floor tile a cache's keepsake stands on, or null for an ordinary station.
export function keepsakeTile(o: RoomObject): Vec | null {
  return cacheOf(o)?.chamber.vault.item ?? null;
}

// Whether a tile lies inside any cache's chamber (a checkpoint never respawns anyone there).
export const inChamber = (world: World, t: Vec): boolean =>
  world.room.objects.some((o) => {
    const c = cacheOf(o);
    return c !== null && inRect(c.chamber.rect, t);
  });

// The keepsake stands once its cache is solved and waits until its owner takes it: Act on its tile by
// the owner puts it in the owner's own slot (no gear is touched) and counts the loot (caches FR7).
// True if the Act was the take.
export function takeKeepsake(world: World, seat: Seat): boolean {
  const here = tileOf(world.players[seat].pos);
  for (const o of world.room.objects) {
    const cache = cacheOf(o);
    const item = keepsakeTile(o);
    if (!cache || !item || item.x !== here.x || item.y !== here.y) continue;
    if (world.cacheBy[o.id] === undefined || world.cacheTaken[o.id] !== undefined) continue;
    if (seat !== cache.owner - 1) continue;
    world.cacheTaken[o.id] = seat;
    world.loot += 1;
    world.events.push({
      kind: "cache",
      id: o.id,
      result: "taken",
      seat,
      at: { x: item.x + 0.5, y: item.y + 0.5 },
    });
    return true;
  }
  return false;
}
