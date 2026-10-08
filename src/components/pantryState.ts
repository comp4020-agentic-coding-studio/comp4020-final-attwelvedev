import { addDays, estimateFor, type SettableBucket } from "../lib/expiry.ts";
import type { Guess, Measure } from "../lib/guess.ts";
import type { Item, Outcome, Unit } from "../lib/items.ts";
import type { MyOffer } from "../lib/offers.ts";

// The pantry island's state as a pure reducer, so the awkward cases (an echo
// arriving before its own response, a snapshot landing mid-change) are
// unit-tested without a browser. Every action is idempotent: applying one
// twice, or in the other order, leaves the same rows.

// What a row shows of its item's open offer: the offer's own note, which this
// household may read and edit, and no claimer household beyond the name this
// household sees.
export interface RowOffer {
  id: string;
  status: "offered" | "claimed";
  claimedBy: string | null;
  note: string;
}

// The fields of one group (value, or expiry) as they were before an optimistic
// write, kept so a failed write can put them back.
export type Patch = Partial<Item>;

export type ValueWrite =
  | { kind: "fill"; stop: number }
  | { kind: "count"; count: number }
  | { kind: "exact"; amount: number; unit: Unit }
  | { kind: "clearExact" }
  | { kind: "measure"; measure: Measure };
export type ExpiryWrite =
  | { kind: "bucket"; bucket: SettableBucket; today: string }
  | { kind: "date"; date: string }
  | { kind: "clearDate" };

const valueFields = (i: Item): Patch => ({
  measure: i.measure,
  fillStop: i.fillStop,
  count: i.count,
  exactAmount: i.exactAmount,
  exactUnit: i.exactUnit,
  valueSetBy: i.valueSetBy,
  valueSetAt: i.valueSetAt,
});
const expiryFields = (i: Item): Patch => ({
  estimatedExpiry: i.estimatedExpiry,
  exactExpiry: i.exactExpiry,
  expirySetBy: i.expirySetBy,
  expirySetAt: i.expirySetAt,
});

// What a write will change, as the server will, before the server answers. Who
// and when are left alone: the clock that decides who wins is the server's.
export function applyValue(item: Item, write: ValueWrite): Item {
  switch (write.kind) {
    case "fill":
      return { ...item, fillStop: write.stop, exactAmount: null, exactUnit: null };
    case "count":
      return { ...item, count: write.count };
    case "exact":
      return { ...item, exactAmount: write.amount, exactUnit: write.unit };
    case "clearExact":
      return { ...item, exactAmount: null, exactUnit: null };
    case "measure":
      return { ...item, measure: write.measure };
  }
}

export function applyExpiry(item: Item, write: ExpiryWrite): Item {
  switch (write.kind) {
    case "bucket":
      return {
        ...item,
        estimatedExpiry: estimateFor(write.bucket, write.today),
        exactExpiry: null,
      };
    case "date":
      return { ...item, exactExpiry: write.date };
    case "clearDate":
      return { ...item, exactExpiry: null };
  }
}

export interface Row {
  item: Item; // a pending row carries a temporary item with id `pending:<rid>`
  pending?: { rid: string }; // added here, waiting for the server
  hidden?: boolean; // removed here, waiting for the server
  note?: string; // removed by someone else: "Used by Alex", until `forget`
  offer?: RowOffer; // the item's open offer
  offering?: true; // an offer posted here, waiting for the server
  withdrawing?: true; // the offer's withdraw, waiting for the server
  // writes to a group waiting for the server; the patch is that group as it was
  saving?: { value?: Patch; expiry?: Patch };
}

export type RetryAction =
  | { kind: "add"; name: string }
  | { kind: "outcome"; itemId: string; name: string; outcome: "used" | "binned" }
  | { kind: "undo"; historyId: string; name: string }
  | {
      kind: "offer";
      itemId: string;
      name: string;
      note?: string;
      communityIds?: string[];
      portion?: number;
    }
  | { kind: "withdraw"; offerId: string; itemId: string; name: string }
  | { kind: "note"; offerId: string; itemId: string; name: string; note: string; previous: string }
  | { kind: "value"; itemId: string; name: string; change: ValueWrite; label: string }
  | { kind: "expiry"; itemId: string; name: string; change: ExpiryWrite; label: string };

export interface Failure {
  id: string;
  message: string;
  retry: RetryAction;
}

export interface PantryState {
  rows: Row[];
  failures: Failure[];
}

export type Action =
  | { type: "snapshot"; items: Item[] }
  | { type: "add.pending"; rid: string; name: string; at: number; guess: Guess; today: string }
  | { type: "add.confirmed"; rid: string; item: Item }
  | { type: "add.rolledBack"; rid: string }
  | { type: "remove.pending"; itemId: string }
  | { type: "remove.rolledBack"; itemId: string }
  | { type: "remove.confirmed"; itemId: string }
  | { type: "event.added"; item: Item; rid?: string }
  | { type: "event.removed"; itemId: string; outcome: Outcome; byName: string; mine: boolean }
  | { type: "event.restored"; item: Item }
  | { type: "event.updated"; item: Item }
  | { type: "event.merged"; itemId: string; item: Item }
  | { type: "value.pending"; itemId: string; write: ValueWrite }
  | { type: "value.confirmed"; itemId: string; item: Item }
  | { type: "value.rolledBack"; itemId: string }
  | { type: "expiry.pending"; itemId: string; write: ExpiryWrite }
  | { type: "expiry.confirmed"; itemId: string; item: Item }
  | { type: "expiry.rolledBack"; itemId: string }
  | { type: "offers.snapshot"; open: MyOffer[] }
  | { type: "offer.mine"; offer: MyOffer }
  | { type: "offer.noted"; itemId: string; note: string }
  | { type: "offer.pending"; itemId: string }
  | { type: "offer.rolledBack"; itemId: string }
  | { type: "withdraw.pending"; itemId: string }
  | { type: "withdraw.rolledBack"; itemId: string }
  | { type: "withdraw.confirmed"; itemId: string }
  | { type: "forget"; itemId: string }
  | { type: "failed"; failure: Failure }
  | { type: "dismiss"; failureId: string };

export function initialState(items: Item[]): PantryState {
  return { rows: items.map((item) => ({ item })), failures: [] };
}

export const visibleRows = (state: PantryState): Row[] => state.rows.filter((r) => !r.hidden);

const OUTCOME_LABEL: Record<Outcome, string> = { used: "Used", binned: "Binned", given: "Given" };

// A neighbour's collection reads the same whoever tapped Collected, so it never
// names the neighbour.
const removalNote = (outcome: Outcome, byName: string) =>
  outcome === "given" ? "Given to a neighbour" : `${OUTCOME_LABEL[outcome]} by ${byName}`;

const mapRow = (rows: Row[], itemId: string, change: (row: Row) => Row): Row[] =>
  rows.map((r) => (r.item.id === itemId ? change(r) : r));

const asRowOffer = (offer: MyOffer): RowOffer | undefined =>
  offer.status === "offered" || offer.status === "claimed"
    ? { id: offer.id, status: offer.status, claimedBy: offer.claimedBy, note: offer.note }
    : undefined;

// The offer a row shows: none while its withdraw is in flight.
export const shownOffer = (row: Row): RowOffer | undefined =>
  row.withdrawing ? undefined : row.offer;

// Newest first among the real rows, after any pending ones.
function insertByCreatedAt(rows: Row[], row: Row): Row[] {
  const firstReal = rows.findIndex((r) => !r.pending);
  const start = firstReal === -1 ? rows.length : firstReal;
  let at = rows.length;
  for (let i = start; i < rows.length; i++) {
    if (rows[i].item.createdAt <= row.item.createdAt) {
      at = i;
      break;
    }
  }
  return [...rows.slice(0, at), row, ...rows.slice(at)];
}

const dropped = (saving: Row["saving"], group: "value" | "expiry"): Row["saving"] => {
  const { [group]: _gone, ...rest } = saving ?? {};
  return Object.keys(rest).length ? rest : undefined;
};

const has = (rows: Row[], itemId: string) => rows.some((r) => r.item.id === itemId);

function swapPending(rows: Row[], rid: string, item: Item): Row[] | null {
  const index = rows.findIndex((r) => r.pending?.rid === rid);
  if (index === -1) return null;
  // a real row for this item can already exist (the echo beat the response)
  const without = rows.filter((r, i) => i === index || r.item.id !== item.id);
  return without.map((r) => (r.pending?.rid === rid ? { item } : r));
}

// Each group of an item (value, expiry) carries the time it was last set. An
// echo of an earlier write must not undo a later one, so a group is only taken
// when its stamp is not older than the row's (never set counts as 0).
function mergeUpdated(current: Item, incoming: Item): Item {
  const value = (incoming.valueSetAt ?? 0) >= (current.valueSetAt ?? 0);
  const expiry = (incoming.expirySetAt ?? 0) >= (current.expirySetAt ?? 0);
  return {
    ...incoming,
    ...(value
      ? {}
      : {
          measure: current.measure,
          fillStop: current.fillStop,
          count: current.count,
          exactAmount: current.exactAmount,
          exactUnit: current.exactUnit,
          valueSetBy: current.valueSetBy,
          valueSetAt: current.valueSetAt,
        }),
    ...(expiry
      ? {}
      : {
          estimatedExpiry: current.estimatedExpiry,
          exactExpiry: current.exactExpiry,
          expirySetBy: current.expirySetBy,
          expirySetAt: current.expirySetAt,
        }),
  };
}

export function pantryReducer(state: PantryState, action: Action): PantryState {
  const { rows } = state;
  switch (action.type) {
    case "snapshot": {
      const old = new Map(rows.map((r) => [r.item.id, r]));
      const incoming = new Set(action.items.map((i) => i.id));
      const real = action.items.map((item) => ({ ...old.get(item.id), item }));
      let merged = [...rows.filter((r) => r.pending), ...real];
      // a noted row isn't in the snapshot on purpose; it stays until forgotten
      for (const noted of rows.filter((r) => r.note && !incoming.has(r.item.id))) {
        merged = insertByCreatedAt(merged, noted);
      }
      return { ...state, rows: merged };
    }

    case "add.pending": {
      const item: Item = {
        id: `pending:${action.rid}`,
        householdId: "",
        name: action.name,
        createdBy: "",
        createdAt: action.at,
        // what the server will guess from the same name, so the row doesn't jump
        category: action.guess.category,
        iconKey: action.guess.iconKey,
        measure: action.guess.measure,
        fillStop: 4,
        count: 1,
        exactAmount: null,
        exactUnit: null,
        estimatedExpiry:
          action.guess.shelfDays === null ? null : addDays(action.today, action.guess.shelfDays),
        exactExpiry: null,
        valueSetBy: null,
        valueSetAt: null,
        expirySetBy: null,
        expirySetAt: null,
      };
      return { ...state, rows: [{ item, pending: { rid: action.rid } }, ...rows] };
    }

    case "add.confirmed":
    case "event.added": {
      // the response and the echo both carry the rid; whichever comes first swaps
      const swapped = action.rid ? swapPending(rows, action.rid, action.item) : null;
      if (swapped) return { ...state, rows: swapped };
      if (has(rows, action.item.id)) return state;
      return { ...state, rows: insertByCreatedAt(rows, { item: action.item }) };
    }

    case "add.rolledBack":
      return { ...state, rows: rows.filter((r) => r.pending?.rid !== action.rid) };

    case "remove.pending":
      return {
        ...state,
        rows: rows.map((r) => (r.item.id === action.itemId ? { ...r, hidden: true } : r)),
      };

    case "remove.rolledBack":
      return {
        ...state,
        rows: rows.map((r) => (r.item.id === action.itemId ? { ...r, hidden: undefined } : r)),
      };

    case "remove.confirmed":
      return { ...state, rows: rows.filter((r) => r.item.id !== action.itemId) };

    case "event.removed": {
      if (!has(rows, action.itemId)) return state;
      if (action.mine) return { ...state, rows: rows.filter((r) => r.item.id !== action.itemId) };
      const note = removalNote(action.outcome, action.byName);
      return {
        ...state,
        rows: rows.map((r) =>
          r.item.id === action.itemId
            ? { item: r.item, pending: r.pending, hidden: undefined, note }
            : r,
        ),
      };
    }

    case "event.restored": {
      if (has(rows, action.item.id)) {
        return {
          ...state,
          rows: rows.map((r) =>
            r.item.id === action.item.id ? { item: r.item, pending: r.pending } : r,
          ),
        };
      }
      return { ...state, rows: insertByCreatedAt(rows, { item: action.item }) };
    }

    case "event.updated":
      return {
        ...state,
        rows: mapRow(rows, action.item.id, (r) => ({
          ...r,
          item: mergeUpdated(r.item, action.item),
        })),
      };

    case "event.merged": {
      if (!has(rows, action.itemId)) return state;
      return {
        ...state,
        rows: mapRow(
          rows.filter((r) => r.item.id !== action.itemId),
          action.item.id,
          (r) => ({ ...r, item: mergeUpdated(r.item, action.item) }),
        ),
      };
    }

    case "value.pending":
      return {
        ...state,
        rows: mapRow(rows, action.itemId, (r) => ({
          ...r,
          item: applyValue(r.item, action.write),
          saving: { ...r.saving, value: r.saving?.value ?? valueFields(r.item) },
        })),
      };

    // the server's account of the group (its stamp decides if it is newer than
    // what the row has) replaces my optimistic fields
    case "value.confirmed":
      return {
        ...state,
        rows: mapRow(rows, action.itemId, (r) => ({
          ...r,
          item: { ...r.item, ...valueFields(mergeUpdated(r.item, action.item)) },
          saving: dropped(r.saving, "value"),
        })),
      };

    case "value.rolledBack":
      return {
        ...state,
        rows: mapRow(rows, action.itemId, (r) => ({
          ...r,
          item: { ...r.item, ...r.saving?.value },
          saving: dropped(r.saving, "value"),
        })),
      };

    case "expiry.pending":
      return {
        ...state,
        rows: mapRow(rows, action.itemId, (r) => ({
          ...r,
          item: applyExpiry(r.item, action.write),
          saving: { ...r.saving, expiry: r.saving?.expiry ?? expiryFields(r.item) },
        })),
      };

    case "expiry.confirmed":
      return {
        ...state,
        rows: mapRow(rows, action.itemId, (r) => ({
          ...r,
          item: { ...r.item, ...expiryFields(mergeUpdated(r.item, action.item)) },
          saving: dropped(r.saving, "expiry"),
        })),
      };

    case "expiry.rolledBack":
      return {
        ...state,
        rows: mapRow(rows, action.itemId, (r) => ({
          ...r,
          item: { ...r.item, ...r.saving?.expiry },
          saving: dropped(r.saving, "expiry"),
        })),
      };

    case "offers.snapshot": {
      const open = new Map(action.open.map((o) => [o.itemId, asRowOffer(o)]));
      return {
        ...state,
        rows: rows.map((r) => {
          const offer = open.get(r.item.id);
          if (offer) return { ...r, offer, offering: undefined };
          return r.offer ? { ...r, offer: undefined } : r;
        }),
      };
    }

    case "offer.mine": {
      if (!has(rows, action.offer.itemId)) return state;
      const offer = asRowOffer(action.offer);
      return {
        ...state,
        rows: mapRow(rows, action.offer.itemId, (r) =>
          offer
            ? { ...r, offer, offering: undefined }
            : { ...r, offer: undefined, offering: undefined, withdrawing: undefined },
        ),
      };
    }

    // an edited note shows at once; the same action with the old note rolls it back
    case "offer.noted":
      return {
        ...state,
        rows: mapRow(rows, action.itemId, (r) =>
          r.offer ? { ...r, offer: { ...r.offer, note: action.note } } : r,
        ),
      };

    case "offer.pending":
      return {
        ...state,
        rows: mapRow(rows, action.itemId, (r) =>
          r.pending || r.note ? r : { ...r, offering: true },
        ),
      };

    case "offer.rolledBack":
      return {
        ...state,
        rows: mapRow(rows, action.itemId, (r) => ({ ...r, offering: undefined })),
      };

    case "withdraw.pending":
      return {
        ...state,
        rows: mapRow(rows, action.itemId, (r) => (r.offer ? { ...r, withdrawing: true } : r)),
      };

    case "withdraw.rolledBack":
      return {
        ...state,
        rows: mapRow(rows, action.itemId, (r) => ({ ...r, withdrawing: undefined })),
      };

    case "withdraw.confirmed":
      return {
        ...state,
        rows: mapRow(rows, action.itemId, (r) => ({
          ...r,
          offer: undefined,
          withdrawing: undefined,
        })),
      };

    case "forget":
      return { ...state, rows: rows.filter((r) => !(r.item.id === action.itemId && r.note)) };

    case "failed":
      return {
        ...state,
        failures: [...state.failures.filter((f) => f.id !== action.failure.id), action.failure],
      };

    case "dismiss":
      return { ...state, failures: state.failures.filter((f) => f.id !== action.failureId) };
  }
}
