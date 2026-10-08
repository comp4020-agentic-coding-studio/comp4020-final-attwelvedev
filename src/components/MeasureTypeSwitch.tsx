import type { Measure } from "../lib/guess.ts";

const MEASURES: { measure: Measure; label: string }[] = [
  { measure: "fill", label: "Fill" },
  { measure: "count", label: "Count" },
  { measure: "have", label: "Have" },
];

// The guess is only a guess: one tap changes how this item is measured.
export function MeasureTypeSwitch({
  measure,
  onChange,
}: {
  measure: Measure;
  onChange(next: Measure): void;
}) {
  return (
    <fieldset class="chips">
      <legend class="chips-label">Measured by</legend>
      {MEASURES.map((m) => (
        <button
          key={m.measure}
          type="button"
          class="chip"
          aria-pressed={m.measure === measure}
          onClick={() => m.measure !== measure && onChange(m.measure)}
        >
          {m.label}
        </button>
      ))}
    </fieldset>
  );
}
