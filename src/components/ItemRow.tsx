import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";
import { MeasureGlyph } from "./MeasureGlyph.tsx";
import { type Row, shownOffer } from "./pantryState.ts";
import { bucketOf, dateText, rowLabel, tapeFraction } from "./pantryView.ts";
import { ShelfLifeTape } from "./ShelfLifeTape.tsx";

// A pointer that travelled this far between going down and coming up was a
// scroll, not a tap on Used.
const SCROLL_PX = 10;

export interface ItemRowProps {
  row: Row;
  today: string;
  open: boolean;
  canOffer: boolean;
  // an icon or photo for the dish; null leaves the dish empty
  image: ComponentChildren | null;
  onToggle(): void;
  onUsed(): void;
  onBinned(): void;
  onOffer(from: HTMLElement): void;
  onNote(from: HTMLElement): void;
  onWithdraw(): void;
}

const Name = ({ name }: { name: string }) => <span class="sr-only"> {name}</span>;

export function ItemRow(props: ItemRowProps) {
  const { row, today, open, canOffer, image } = props;
  const { item } = row;
  const mine = shownOffer(row);
  const offered = Boolean(mine || row.offering);
  const bucket = bucketOf(item, today);
  const down = useRef<{ x: number; y: number } | null>(null);
  const scrolled = useRef(false);

  // Used is the one outcome a thumb hits by accident while scrolling.
  const guard = {
    onPointerDown: (e: PointerEvent) => {
      down.current = { x: e.clientX, y: e.clientY };
      scrolled.current = false;
    },
    onPointerUp: (e: PointerEvent) => {
      const start = down.current;
      scrolled.current = Boolean(
        start && Math.hypot(e.clientX - start.x, e.clientY - start.y) >= SCROLL_PX,
      );
    },
    onClick: (e: MouseEvent) => {
      if (scrolled.current) e.preventDefault();
      scrolled.current = false;
    },
  };

  const outcome = (kind: "used" | "binned", label: string, fire: () => void, extra?: object) => (
    <form
      method="post"
      action={`/items/${item.id}/outcome`}
      class={kind === "used" ? "used" : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (!row.pending) fire();
      }}
    >
      <input type="hidden" name="outcome" value={kind} />
      <button type="submit" disabled={Boolean(row.pending)} {...extra}>
        {label}
        <Name name={item.name} />
      </button>
    </form>
  );

  return (
    <li
      data-item-id={item.id}
      data-bucket={bucket}
      data-open={open ? "true" : undefined}
      data-offered={offered ? "true" : undefined}
      aria-busy={row.pending ? "true" : undefined}
      class={row.note ? "row gone" : "row"}
    >
      <div class="dish" aria-hidden="true">
        {image}
      </div>
      {row.note ? (
        <div class="row-main">
          <span class="name">{item.name}</span>
          <span class="note">{row.note}</span>
        </div>
      ) : (
        <>
          <button
            type="button"
            class="row-main"
            aria-expanded={open}
            aria-label={rowLabel(item, today)}
            onClick={props.onToggle}
          >
            <span class="name">{item.name}</span>
            {(offered || item.exactExpiry || bucket === "past") && (
              <span class="meta">
                {offered && (
                  <span class="offer-state">
                    {mine?.status === "claimed"
                      ? `Claimed by ${mine.claimedBy ?? "a neighbour"}`
                      : "Offered"}
                  </span>
                )}
                {item.exactExpiry && <span>{dateText(item.exactExpiry)}</span>}
                {bucket === "past" && <span class="past-flag">past estimate</span>}
              </span>
            )}
          </button>
          <MeasureGlyph item={item} />
          {outcome("used", "Used", props.onUsed, guard)}
          <div class="row-actions">
            {canOffer && mine && (
              <button type="button" onClick={(e) => props.onNote(e.currentTarget)}>
                Note
                <Name name={item.name} />
              </button>
            )}
            {canOffer && offered && (
              <form
                method="post"
                action={`/offers/${mine?.id ?? ""}/withdraw`}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (mine) props.onWithdraw();
                }}
              >
                <button type="submit" disabled={!mine}>
                  Withdraw
                  <Name name={item.name} />
                </button>
              </form>
            )}
            {canOffer && !offered && (
              <button type="button" onClick={(e) => props.onOffer(e.currentTarget)}>
                Offer
                <Name name={item.name} />
              </button>
            )}
            {outcome("binned", "Binned", props.onBinned)}
          </div>
          <ShelfLifeTape bucket={bucket} fraction={tapeFraction(item, today)} />
        </>
      )}
    </li>
  );
}
