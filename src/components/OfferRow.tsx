import type { ClaimedOffer, MyOffer } from "../lib/offers.ts";
import { ago } from "./ago.ts";
import type { IncomingRow, TapKind } from "./offersState.ts";

// One tap is one form, so each button also works with scripts off (the
// endpoints answer a form post with a redirect to /offers).
function TapForm({
  action,
  label,
  itemName,
  disabled,
  onTap,
}: {
  action: string;
  label: string;
  itemName: string;
  disabled?: boolean;
  onTap: () => void;
}) {
  return (
    <form
      method="post"
      action={action}
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) onTap();
      }}
    >
      <button type="submit" disabled={disabled}>
        {label}
        <span class="sr-only"> {itemName}</span>
      </button>
    </form>
  );
}

// An offer from a neighbour. The state is words as well as style: struck name
// and "Taken", never colour alone. Claim waits for the server, which decides
// the winner, so the button is busy for the round trip.
export function IncomingOfferRow({
  row,
  now,
  onClaim,
}: {
  row: IncomingRow;
  now: number;
  onClaim: (offerId: string) => void;
}) {
  const { offer } = row;
  return (
    <li class={row.taken ? "offer gone" : "offer"} aria-busy={row.busy ? "true" : undefined}>
      <div class="offer-body">
        <span class="name">{offer.itemName}</span>
        <span class="meta">
          from {offer.fromName}, {ago(offer.createdAt, now)}
        </span>
        {row.taken && <span class="state">Taken</span>}
        <span class="msg" role="status">
          {row.message}
        </span>
      </div>
      {!row.taken && (
        <div class="offer-actions">
          <TapForm
            action={`/offers/${offer.id}/claim`}
            label={row.busy ? "Claiming…" : "Claim"}
            itemName={offer.itemName}
            disabled={row.busy}
            onTap={() => onClaim(offer.id)}
          />
        </div>
      )}
    </li>
  );
}

export function MyOfferRow({
  offer,
  now,
  onTap,
}: {
  offer: MyOffer;
  now: number;
  onTap: (offerId: string, kind: TapKind, itemName: string) => void;
}) {
  const claimed = offer.status === "claimed";
  return (
    <li class="offer">
      <div class="offer-body">
        <span class="name">{offer.itemName}</span>
        <span class="state">
          {claimed
            ? `Claimed by ${offer.claimedBy ?? "a neighbour"}, ${ago(offer.claimedAt ?? offer.createdAt, now)}`
            : "Offered"}
        </span>
      </div>
      <div class="offer-actions">
        {claimed && (
          <>
            <TapForm
              action={`/offers/${offer.id}/collected`}
              label="Collected"
              itemName={offer.itemName}
              onTap={() => onTap(offer.id, "collected", offer.itemName)}
            />
            <TapForm
              action={`/offers/${offer.id}/release`}
              label="Release"
              itemName={offer.itemName}
              onTap={() => onTap(offer.id, "release", offer.itemName)}
            />
          </>
        )}
        <TapForm
          action={`/offers/${offer.id}/withdraw`}
          label="Withdraw"
          itemName={offer.itemName}
          onTap={() => onTap(offer.id, "withdraw", offer.itemName)}
        />
      </div>
    </li>
  );
}

// An offer this household claimed: the only row that carries the pickup note.
export function ClaimedOfferRow({
  offer,
  now,
  onTap,
}: {
  offer: ClaimedOffer;
  now: number;
  onTap: (offerId: string, kind: TapKind, itemName: string) => void;
}) {
  return (
    <li class="offer">
      <div class="offer-body">
        <span class="name">{offer.itemName}</span>
        <span class="meta">
          from {offer.fromName}, claimed {ago(offer.claimedAt, now)}
        </span>
        <span class="pickup">Pickup: {offer.note}</span>
      </div>
      <div class="offer-actions">
        <TapForm
          action={`/offers/${offer.id}/collected`}
          label="Collected"
          itemName={offer.itemName}
          onTap={() => onTap(offer.id, "collected", offer.itemName)}
        />
        <TapForm
          action={`/offers/${offer.id}/release`}
          label="Release"
          itemName={offer.itemName}
          onTap={() => onTap(offer.id, "release", offer.itemName)}
        />
      </div>
    </li>
  );
}
