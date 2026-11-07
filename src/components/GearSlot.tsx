import type { GearItem } from "../game/sim/world.ts";
import { GEAR_NAME, GearGlyph } from "./GearGlyph.tsx";

// Your own gear slot: what you carry, and what G does with it. On a phone it is a 48 px button
// (createInput wires data-gear: held, it gives, swaps or drops, and it is off while the slot is empty);
// on a keyboard it names the G key (take, give, swap or drop).
export function GearSlot({
  gear,
  touch,
  disabled = false,
}: {
  gear: GearItem | null;
  touch: boolean;
  disabled?: boolean;
}) {
  const name = gear ? GEAR_NAME[gear] : "Empty";
  if (touch) {
    return (
      <button
        type="button"
        class="gear-slot gear-btn"
        data-gear
        data-no-ui-sound
        disabled={disabled || !gear}
        aria-label={gear ? `${name}: give, swap or drop` : "Gear: none"}
        onContextMenu={(e) => e.preventDefault()}
      >
        {gear ? (
          <GearGlyph item={gear} size={24} />
        ) : (
          <span class="gear-empty" aria-hidden="true" />
        )}
      </button>
    );
  }
  return (
    <section class="gear-slot" aria-label={`Gear: ${name}`} data-no-ui-sound>
      <span class="gear-name">
        {gear ? <GearGlyph item={gear} /> : <span class="gear-empty" aria-hidden="true" />}
        {name}
      </span>
      {gear && <span class="gear-key">G take, give, swap or drop</span>}
    </section>
  );
}
