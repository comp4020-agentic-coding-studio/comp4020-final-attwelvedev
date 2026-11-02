import { ITEM_NAMES } from "../client/items.ts";
import type { ItemId } from "../game/rooms/format.ts";
import { ItemGlyph } from "./ItemGlyph.tsx";

// The plate a keepsake sits on: a card face in a brass rim. A missed one is the same plate empty and
// dashed, so found and missed are told apart by shape and line, never colour alone, and it never
// names the item. The name is for screen readers; the page puts the visible one beside the plate.
export function KeepsakePlate({
  item,
  missed = false,
  size = 48,
}: {
  item: ItemId;
  missed?: boolean;
  size?: number;
}) {
  return (
    <span class={missed ? "keepsake is-missed" : "keepsake"} style={{ "--keep": `${size}px` }}>
      {missed ? (
        <svg class="item-glyph" width={size} height={size} aria-hidden="true" focusable="false" />
      ) : (
        <>
          <ItemGlyph item={item} size={size} />
          <span class="sr-only">{ITEM_NAMES[item]}</span>
        </>
      )}
    </span>
  );
}
