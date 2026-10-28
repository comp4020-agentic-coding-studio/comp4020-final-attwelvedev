import type { GearItem } from "../game/sim/world.ts";
import { GEAR_NAME, GearGlyph } from "./GearGlyph.tsx";

// Your own gear slot: what you carry, and how to give or drop it. On a phone it is a 48 px button
// (createInput wires data-gear: held, it gives or drops); on a keyboard it names the G key.
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
        disabled={disabled || !gear}
        aria-label={gear ? `${name}: give or drop` : "Gear: none"}
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
    <section class="gear-slot" aria-label={`Gear: ${name}`}>
      <span class="gear-name">
        {gear ? <GearGlyph item={gear} /> : <span class="gear-empty" aria-hidden="true" />}
        {name}
      </span>
      {gear && <span class="gear-key">G give or drop</span>}
    </section>
  );
}
