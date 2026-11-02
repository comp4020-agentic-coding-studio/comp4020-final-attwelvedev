import { secretDoors } from "../rooms/format.ts";
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
