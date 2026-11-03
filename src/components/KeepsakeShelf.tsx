import { ITEM_NAMES } from "../client/items.ts";
import type { ItemId } from "../game/rooms/format.ts";
import { KeepsakePlate } from "./KeepsakePlate.tsx";

// A room id is "04-the-safe": its number is the room's place in the heist.
const roomNumber = (room: string): string => String(Number.parseInt(room, 10) || room);

// The heist-complete shelf: one plate per room that had a side job, in room order. A taken item
// has the same three lines as a missed one (title, room number, then the item or "Not found"), so no
// slot wraps differently from its neighbours; a missed plate is empty and dashed and names no item.
export function KeepsakeShelf({
  caches,
}: {
  caches: { room: string; name: string; found: boolean; item: ItemId }[];
}) {
  if (caches.length === 0) return null;
  const taken = caches.filter((c) => c.found).length;
  return (
    <section class="keepsake-shelf" aria-label="Side jobs">
      <h3>
        Side jobs {taken} of {caches.length}
      </h3>
      <ul>
        {caches.map((c) => {
          return (
            <li key={c.room} class={c.found ? "" : "is-missed"}>
              <span aria-hidden="true">
                <KeepsakePlate item={c.item} missed={!c.found} size={32} />
              </span>
              <span class="keepsake-label">
                <span class="keepsake-room">{c.name}</span>
                <span class="keepsake-num">Room {roomNumber(c.room)}</span>
                <span class="keepsake-what">{c.found ? ITEM_NAMES[c.item] : "Not found"}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
