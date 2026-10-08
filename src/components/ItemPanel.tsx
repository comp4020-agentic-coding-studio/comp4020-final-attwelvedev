import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { SettableBucket } from "../lib/expiry.ts";
import type { Measure } from "../lib/guess.ts";
import type { Item } from "../lib/items.ts";
import { CountStepper } from "./CountStepper.tsx";
import { EstimateAttribution } from "./EstimateAttribution.tsx";
import { ExpiryPicker } from "./ExpiryPicker.tsx";
import { parseExact } from "./exactAmount.ts";
import { FillSlider } from "./FillSlider.tsx";
import { MeasureTypeSwitch } from "./MeasureTypeSwitch.tsx";
import type { ExpiryWrite, Row, ValueWrite } from "./pantryState.ts";
import { attribution, bucketOf, valueText } from "./pantryView.ts";

// Quick adjustments in place: how much is left, how it is measured, when to use it
// by, and who said so. Every control is one tap and shows at once; a failure puts
// the value back with a Retry line (the island's), never a dialog.
export function ItemPanel({
  item,
  saving,
  today,
  members,
  now,
  changed,
  photoSlot,
  onValue,
  onExpiry,
  onDrag,
}: {
  item: Item;
  saving: Row["saving"];
  today: string;
  members: { id: string; name: string }[];
  now: number;
  // "Alex just changed this to ¼" while the panel is open
  changed?: string;
  // phase 05b: the photo picker, beside the image dish at the panel's top
  photoSlot?: ComponentChildren;
  onValue(write: ValueWrite): void;
  onExpiry(write: ExpiryWrite): void;
  onDrag(down: boolean): void;
}) {
  const [problem, setProblem] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const exactText = item.exactAmount === null ? "" : valueText(item).replace(/^~/, "");

  const submitExact = (event: Event) => {
    event.preventDefault();
    const text = (draft ?? exactText).trim();
    if (text === "") {
      if (item.exactAmount !== null) onValue({ kind: "clearExact" });
      setProblem("");
      setDraft(null);
      return;
    }
    const parsed = parseExact(text);
    if (!parsed) {
      setProblem("Try 400 g, 1.5 L or 2.");
      return;
    }
    setProblem("");
    setDraft(null);
    onValue({ kind: "exact", amount: parsed.amount, unit: parsed.unit });
  };

  return (
    <div class="panel">
      {changed && (
        <p class="just-changed" role="status">
          {changed}
        </p>
      )}
      {photoSlot && <div class="panel-top">{photoSlot}</div>}

      {item.measure === "fill" && (
        <>
          <FillSlider
            value={item.fillStop}
            onCommit={(stop) => onValue({ kind: "fill", stop })}
            onDrag={onDrag}
          />
          <form class="exact" onSubmit={submitExact}>
            <label>
              Exact amount{" "}
              <input
                name="exact"
                value={draft ?? exactText}
                placeholder="e.g. 400 g"
                autoComplete="off"
                inputMode="decimal"
                aria-describedby={problem ? `exact-problem-${item.id}` : undefined}
                onInput={(event) => setDraft(event.currentTarget.value)}
              />
            </label>
            {problem && (
              <span class="problem" id={`exact-problem-${item.id}`}>
                {problem}
              </span>
            )}
          </form>
        </>
      )}
      {item.measure === "count" && (
        <CountStepper
          value={item.count}
          label="How many"
          onChange={(count) => onValue({ kind: "count", count })}
        />
      )}
      {item.measure !== "have" && (
        <EstimateAttribution
          text={attribution("value", item, members, now)}
          saving={Boolean(saving?.value)}
        />
      )}

      <MeasureTypeSwitch
        measure={item.measure}
        onChange={(measure: Measure) => onValue({ kind: "measure", measure })}
      />

      <ExpiryPicker
        bucket={bucketOf(item, today)}
        exactExpiry={item.exactExpiry}
        onBucket={(bucket: SettableBucket) => onExpiry({ kind: "bucket", bucket, today })}
        onDate={(date) => onExpiry({ kind: "date", date })}
        onClearDate={() => onExpiry({ kind: "clearDate" })}
      />
      <EstimateAttribution
        text={attribution("expiry", item, members, now)}
        saving={Boolean(saving?.expiry)}
      />
    </div>
  );
}
