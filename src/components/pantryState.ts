import type { Item, Outcome } from "../lib/items.ts";
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

export interface Row {
  item: Item; // a pending row carries a temporary item with id `pending:<rid>`
  pending?: { rid: string }; // added here, waiting for the server
  hidden?: boolean; // removed here, waiting for the server
  note?: string; // removed by someone else: "Used by Alex", until `forget`
  offer?: RowOffer; // the item's open offer
  offering?: true; // an offer posted here, waiting for the server
  withdrawing?: true; // the offer's withdraw, waiting for the server
}

export type RetryAction =
  | { kind: "add"; name: string }
  | { kind: "outcome"; itemId: string; name: string; outcome: "used" | "binned" }
  | { kind: "undo"; historyId: string; name: string }
  | { kind: "offer"; itemId: string; name: string; note?: string; communityIds?: string[] }
  | { kind: "withdraw"; offerId: string; itemId: string; name: string }
  | { kind: "note"; offerId: string; itemId: string; name: string; note: string; previous: string };

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
  | { type: "add.pending"; rid: string; name: string; at: number }
  | { type: "add.confirmed"; rid: string; item: Item }
  | { type: "add.rolledBack"; rid: string }
  | { type: "remove.pending"; itemId: string }
  | { type: "remove.rolledBack"; itemId: string }
  | { type: "remove.confirmed"; itemId: string }
  | { type: "event.added"; item: Item; rid?: string }
  | { type: "event.removed"; itemId: string; outcome: Outcome; byName: string; mine: boolean }
  | { type: "event.restored"; item: Item }
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

const has = (rows: Row[], itemId: string) => rows.some((r) => r.item.id === itemId);

function swapPending(rows: Row[], rid: string, item: Item): Row[] | null {
  const index = rows.findIndex((r) => r.pending?.rid === rid);
  if (index === -1) return null;
  // a real row for this item can already exist (the echo beat the response)
  const without = rows.filter((r, i) => i === index || r.item.id !== item.id);
  return without.map((r) => (r.pending?.rid === rid ? { item } : r));
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
