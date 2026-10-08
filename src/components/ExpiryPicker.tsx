import type { Bucket, SettableBucket } from "../lib/expiry.ts";
import { BUCKET_LABEL } from "./pantryView.ts";

const CHOICES: SettableBucket[] = [
  "use-soon",
  "this-week",
  "this-month",
  "long-lasting",
  "unknown",
];

// Use by: a bucket in one tap, or an exact date. A past estimate is only ever read
// off a date, so no chip is pressed for it.
export function ExpiryPicker({
  bucket,
  exactExpiry,
  onBucket,
  onDate,
  onClearDate,
}: {
  bucket: Bucket;
  exactExpiry: string | null;
  onBucket(next: SettableBucket): void;
  onDate(date: string): void;
  onClearDate(): void;
}) {
  return (
    <div class="expiry">
      <fieldset class="chips">
        <legend class="chips-label">Use by</legend>
        {CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            class="chip"
            aria-pressed={choice === bucket}
            onClick={() => choice !== bucket && onBucket(choice)}
          >
            {choice === "unknown" ? "Not sure" : BUCKET_LABEL[choice]}
          </button>
        ))}
      </fieldset>
      <div class="date-row">
        <label>
          Exact date{" "}
          <input
            type="date"
            value={exactExpiry ?? ""}
            onChange={(event) => {
              const date = event.currentTarget.value;
              if (date) onDate(date);
            }}
          />
        </label>
        {exactExpiry && (
          <button type="button" onClick={onClearDate}>
            Clear date
          </button>
        )}
      </div>
    </div>
  );
}
