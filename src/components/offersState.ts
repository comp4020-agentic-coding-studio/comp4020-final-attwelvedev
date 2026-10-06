import type { ClaimedOffer, MyOffer, OffersSnapshot, PublicOffer } from "../lib/offers.ts";

// The offers feed's state as a pure reducer, like pantryState: every action is
// idempotent and safe in either order, so an event arriving before its own
// response, or a snapshot landing mid-change, leaves the same rows.

export interface IncomingRow {
  offer: PublicOffer;
  busy?: boolean; // a claim is on its way to the server
  taken?: boolean; // someone has it; the row stays briefly, then `forget`
  message?: string; // "Someone claimed this first." or a failure, shown in place
}

export type TapKind = "collected" | "release" | "withdraw";

export interface OffersState {
  communities: { id: string; name: string }[];
  incoming: IncomingRow[]; // newest first
  mine: MyOffer[]; // newest first
  claimed: ClaimedOffer[]; // most recently claimed first
  // taps waiting for the server; `prev` is what a release by the offerer overwrote
  taps: Record<string, { kind: TapKind; prev?: MyOffer }>;
}

export type OffersAction =
  | { type: "snapshot"; snapshot: OffersSnapshot }
  | { type: "offer.posted"; offer: PublicOffer }
  | { type: "offer.taken"; offerId: string }
  | { type: "offer.closed"; communityId: string; offerId: string }
  | { type: "offer.mine"; offer: MyOffer }
  | { type: "offer.claim"; offer: ClaimedOffer }
  | { type: "forget"; offerId: string }
  | { type: "claim.pending"; offerId: string }
  | { type: "claim.lost"; offerId: string; message: string }
  | { type: "claim.won"; offer: ClaimedOffer }
  | { type: "claim.failed"; offerId: string; message: string }
  | { type: "tap.pending"; offerId: string; kind: TapKind }
  | { type: "tap.rolledBack"; offerId: string }
  | { type: "tap.confirmed"; offerId: string };

export function initialOffersState(snapshot: OffersSnapshot): OffersState {
  return {
    communities: snapshot.communities,
    incoming: snapshot.incoming.map((offer) => ({ offer })),
    mine: snapshot.mine,
    claimed: snapshot.claimed,
    taps: {},
  };
}

// What the feed shows: rows hidden by a pending tap are left out, and a
// release by the offerer already reads as offered.
export function visibleOffers(state: OffersState): {
  incoming: IncomingRow[];
  mine: MyOffer[];
  claimed: ClaimedOffer[];
} {
  const hidden = (id: string) => {
    const kind = state.taps[id]?.kind;
    return kind === "collected" || kind === "withdraw";
  };
  return {
    incoming: state.incoming,
    mine: state.mine
      .filter((o) => !hidden(o.id))
      .map((o) =>
        state.taps[o.id]?.kind === "release"
          ? { ...o, status: "offered" as const, claimedBy: null, claimedAt: null }
          : o,
      ),
    claimed: state.claimed.filter((c) => !state.taps[c.id]),
  };
}

const union = (a: string[], b: string[]) => [...a, ...b.filter((id) => !a.includes(id))];

function insertNewestFirst<T>(list: T[], item: T, at: (t: T) => number): T[] {
  const index = list.findIndex((existing) => at(existing) <= at(item));
  return index === -1 ? [...list, item] : [...list.slice(0, index), item, ...list.slice(index)];
}

const without = (taps: OffersState["taps"], id: string) => {
  const { [id]: _gone, ...rest } = taps;
  return rest;
};

const patchIncoming = (
  state: OffersState,
  offerId: string,
  patch: (row: IncomingRow) => IncomingRow,
) => ({
  ...state,
  incoming: state.incoming.map((row) => (row.offer.id === offerId ? patch(row) : row)),
});

export function offersReducer(state: OffersState, action: OffersAction): OffersState {
  switch (action.type) {
    case "snapshot": {
      const { snapshot } = action;
      const listed = new Set(snapshot.incoming.map((o) => o.id));
      const old = new Map(state.incoming.map((r) => [r.offer.id, r]));
      let incoming: IncomingRow[] = snapshot.incoming.map((offer) => ({
        ...old.get(offer.id),
        offer,
      }));
      // a taken row isn't in the snapshot on purpose; it stays until forgotten
      for (const row of state.incoming.filter((r) => r.taken && !listed.has(r.offer.id))) {
        incoming = insertNewestFirst(incoming, row, (r) => r.offer.createdAt);
      }
      return {
        ...state,
        communities: snapshot.communities,
        incoming,
        mine: snapshot.mine,
        claimed: snapshot.claimed,
      };
    }

    case "offer.posted": {
      // the offerer's own offer arrives as offer.mine first and is never shown as someone else's
      if (state.mine.some((o) => o.id === action.offer.id)) return state;
      const existing = state.incoming.find((r) => r.offer.id === action.offer.id);
      if (!existing) {
        return {
          ...state,
          incoming: insertNewestFirst(
            state.incoming,
            { offer: action.offer },
            (r) => r.offer.createdAt,
          ),
        };
      }
      // first wins for the name; posted again means open again, so not taken
      return patchIncoming(state, action.offer.id, (row) => ({
        offer: {
          ...row.offer,
          communityIds: union(row.offer.communityIds, action.offer.communityIds),
        },
      }));
    }

    case "offer.taken":
      return patchIncoming(state, action.offerId, (row) => ({
        ...row,
        taken: true,
        busy: undefined,
      }));

    case "offer.closed": {
      const row = state.incoming.find((r) => r.offer.id === action.offerId);
      if (!row) return state;
      const left = row.offer.communityIds.filter((id) => id !== action.communityId);
      if (left.length === 0) {
        return { ...state, incoming: state.incoming.filter((r) => r.offer.id !== action.offerId) };
      }
      return patchIncoming(state, action.offerId, (r) => ({
        ...r,
        offer: { ...r.offer, communityIds: left },
      }));
    }

    case "offer.mine": {
      const others = state.mine.filter((o) => o.id !== action.offer.id);
      const incoming = state.incoming.filter((r) => r.offer.id !== action.offer.id);
      if (action.offer.status === "collected" || action.offer.status === "withdrawn") {
        return { ...state, incoming, mine: others };
      }
      return {
        ...state,
        incoming,
        mine: insertNewestFirst(others, action.offer, (o) => o.createdAt),
      };
    }

    case "offer.claim":
    case "claim.won": {
      const others = state.claimed.filter((c) => c.id !== action.offer.id);
      const incoming = state.incoming.filter((r) => r.offer.id !== action.offer.id);
      if (action.offer.status !== "claimed") return { ...state, incoming, claimed: others };
      return {
        ...state,
        incoming,
        claimed: insertNewestFirst(others, action.offer, (c) => c.claimedAt),
      };
    }

    case "forget":
      return {
        ...state,
        incoming: state.incoming.filter((r) => !(r.offer.id === action.offerId && r.taken)),
      };

    case "claim.pending":
      return patchIncoming(state, action.offerId, (row) => ({
        ...row,
        busy: true,
        message: undefined,
      }));

    case "claim.lost":
      return patchIncoming(state, action.offerId, (row) => ({
        ...row,
        busy: undefined,
        taken: true,
        message: action.message,
      }));

    case "claim.failed":
      return patchIncoming(state, action.offerId, (row) => ({
        ...row,
        busy: undefined,
        message: action.message,
      }));

    case "tap.pending": {
      if (state.taps[action.offerId]) return state;
      const prev = state.mine.find((o) => o.id === action.offerId);
      return {
        ...state,
        taps: { ...state.taps, [action.offerId]: { kind: action.kind, prev } },
      };
    }

    case "tap.rolledBack":
      return { ...state, taps: without(state.taps, action.offerId) };

    case "tap.confirmed": {
      const tap = state.taps[action.offerId];
      if (!tap) return state;
      const taps = without(state.taps, action.offerId);
      if (tap.kind === "release" && tap.prev) {
        // the offer is open again; the offer.mine event will say the same
        return {
          ...state,
          taps,
          mine: state.mine.map((o) =>
            o.id === action.offerId
              ? { ...o, status: "offered", claimedBy: null, claimedAt: null }
              : o,
          ),
        };
      }
      return {
        ...state,
        taps,
        mine: state.mine.filter((o) => o.id !== action.offerId),
        claimed: state.claimed.filter((c) => c.id !== action.offerId),
      };
    }
  }
}
