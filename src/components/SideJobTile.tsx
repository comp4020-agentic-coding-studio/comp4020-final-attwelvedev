import { ITEM_NAMES } from "../client/items.ts";
import type { ItemId } from "../game/rooms/format.ts";
import { KeepsakePlate } from "./KeepsakePlate.tsx";

export interface TileCache {
  room: string;
  found: boolean; // the owner took the item
  opened: boolean; // the vault door opened
  item: ItemId;
  owner: number;
  by?: number; // who solved it
  riddle: string;
}

// The cleared card's side-job tile, in three states that share one box: taken (solid, plate, tick),
// opened but left behind (dashed, empty plate, item named: it was seen) and not found (dashed, the
// riddle, no item name: nobody saw it). Names come from the crew, never the server.
export function SideJobTile({ cache, names }: { cache: TileCache; names: string[] }) {
  const who = (seat: number): string => names[seat] || "A teammate";
  const item = ITEM_NAMES[cache.item];
  let text: string;
  let state: string;
  if (cache.found) {
    state = "is-taken";
    text =
      cache.by === undefined || cache.by === cache.owner
        ? `${who(cache.owner)} opened the vault and took the ${item}. Worth 1 loot.`
        : `${who(cache.owner)} took the ${item}. ${who(cache.by)} opened the way. Worth 1 loot.`;
  } else if (cache.opened) {
    state = "is-left";
    text = `Side job opened, but the ${item} was left behind.`;
  } else {
    state = "is-unfound";
    text = `Side job not found: ${cache.riddle}`;
  }
  return (
    <div class={`side-job-tile ${state}`}>
      <KeepsakePlate item={cache.item} missed={!cache.found} size={32} />
      <p class="side-job-tile-text">
        {cache.found && (
          <svg
            class="side-job-tick"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M2.5 8.5l4 4 7-9"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        )}
        {text}
      </p>
    </div>
  );
}
