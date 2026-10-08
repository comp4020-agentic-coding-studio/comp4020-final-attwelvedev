// [ − ] 6 [ + ] with 48 px buttons. The ends are disabled rather than refused.
export function CountStepper({
  value,
  min = 1,
  max = 999,
  label,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  label: string;
  onChange(next: number): void;
}) {
  return (
    <fieldset class="stepper">
      <legend class="sr-only">{label}</legend>
      <button
        type="button"
        aria-label="One fewer"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button
        type="button"
        aria-label="One more"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </fieldset>
  );
}
