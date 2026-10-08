import { useState } from "preact/hooks";

// Nearly out (left) to Full (right), like a gauge filling. A native range input,
// so arrows, drag and assistive tech work as they do everywhere; the value is
// previewed while moving and posted when it settles.
const STOPS = ["Nearly out", "¼", "½", "¾", "Full"];

export function FillSlider({
  value,
  onCommit,
  onDrag,
}: {
  value: number;
  onCommit(stop: number): void;
  onDrag(down: boolean): void;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const shown = preview ?? value;
  return (
    <div class="slider">
      <input
        type="range"
        min={0}
        max={4}
        step={1}
        value={shown}
        aria-label="Amount left"
        aria-valuetext={STOPS[shown]}
        onInput={(event) => setPreview(Number(event.currentTarget.value))}
        onChange={(event) => {
          const stop = Number(event.currentTarget.value);
          setPreview(null);
          if (stop !== value) onCommit(stop);
        }}
        onPointerDown={() => onDrag(true)}
        onPointerUp={() => onDrag(false)}
        onPointerCancel={() => onDrag(false)}
      />
      <div class="ticks" aria-hidden="true">
        {STOPS.map((stop) => (
          <span key={stop}>{stop}</span>
        ))}
      </div>
    </div>
  );
}
