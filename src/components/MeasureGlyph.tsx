import type { Item } from "../lib/items.ts";
import { glyphLevel, valueText } from "./pantryView.ts";

// How much is left, at a glance: a small jar at five levels for a fill, then the
// words ("½", "~400 g"); a count is its number; a have is the word.
export function MeasureGlyph({ item }: { item: Item }) {
  const level = glyphLevel(item);
  return (
    <span class="value" data-measure={item.measure}>
      {level !== null && (
        <svg class="jar" viewBox="0 0 16 20" width="16" height="20" aria-hidden="true">
          <rect
            class="jar-fill"
            x="3"
            y={18 - (level / 4) * 12}
            width="10"
            height={(level / 4) * 12}
          />
          <path class="jar-rim" d="M5 2h6M4 4h8v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
        </svg>
      )}
      <span class="value-text">{valueText(item)}</span>
    </span>
  );
}
