import { BRAILLE_KEY } from "../game/sim/braille.ts";
import { BrailleCell } from "./BrailleCell.tsx";

// Can't see's open plate, "felt, not lit" (spec §4.1 A): a thin outline on black, the plate's cells
// left to right, then the fixed key to match them against. Screen readers get the dot numbers only,
// never the number they spell: decoding is the player's (DESIGN.md: BrailleCard). A fieldset is a
// group (its role) with nothing to fill in.
export function BrailleCard({ cells, teach }: { cells: number[][]; teach?: boolean }) {
  const said = cells.map((c, i) => `Cell ${i + 1}: dots ${c.join(" ")}.`).join(" ");
  return (
    <fieldset class="braille-card" aria-label="Braille plate">
      <p class="braille-title">Plate under your hand</p>
      {teach && (
        <p class="braille-teach">Raised dots, read left to right. Match each to the key.</p>
      )}
      <p class="sr-only" role="status" aria-live="polite">
        Plate: {cells.length} cells
      </p>
      <div class="braille-body">
        <div class="braille-cells">
          {cells.map((dots, i) => (
            <span class="braille-at" style={{ "--i": i }} key={`${i}:${dots.join("")}`}>
              <BrailleCell dots={dots} size={12} />
            </span>
          ))}
          <span class="sr-only">{said}</span>
        </div>
        <ul class="braille-key" aria-label="Key">
          {BRAILLE_KEY.map((k) => (
            <li key={k.label}>
              <BrailleCell dots={k.dots} size={7} />
              <span class="braille-label">
                {k.label === "#" ? "#" : k.label}
                <span class="sr-only">: dots {k.dots.join(" ")}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </fieldset>
  );
}
