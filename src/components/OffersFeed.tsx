import { useCallback, useEffect, useReducer, useRef, useState } from "preact/hooks";
import "../styles/offers.css";
import type { LiveEvent } from "../lib/live.ts";
import type { ClaimedOffer, OffersSnapshot, PublicOffer } from "../lib/offers.ts";
import { getJson, HttpError, postJson } from "./api.ts";
import { ConnectionStatus } from "./ConnectionStatus.tsx";
import { ClaimedOfferRow, IncomingOfferRow, MyOfferRow } from "./OfferRow.tsx";
import { initialOffersState, offersReducer, type TapKind, visibleOffers } from "./offersState.ts";
import { useLiveStream } from "./useLiveStream.ts";

const TAKEN_LINGER_MS = 6000;
const SCROLLED_PX = 120;
const CLOCK_MS = 30_000;
const TAP_PATH: Record<TapKind, string> = {
  collected: "collected",
  release: "release",
  withdraw: "withdraw",
};

interface Failure {
  id: string;
  message: string;
  retry: () => void;
}

// Offers in my communities, mine, and the ones I've claimed. It is the Offers
// page on a phone and a rail beside the pantry on a desktop.
export function OffersFeed({
  initial,
  showConnection = true,
}: {
  initial: OffersSnapshot;
  // the rail sits beside the pantry, whose island already says when the shared stream is down
  showConnection?: boolean;
}) {
  const [state, dispatch] = useReducer(offersReducer, initial, initialOffersState);
  const [failures, setFailures] = useState<Failure[]>([]);
  // offers that arrived while the page was scrolled down, held back so the list doesn't jump
  const [held, setHeld] = useState<Map<string, PublicOffer>>(new Map());
  const [now, setNow] = useState(() => Date.now());
  const latest = useRef(state);
  latest.current = state;
  const counter = useRef(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const forgetSoon = useCallback((offerId: string) => {
    window.setTimeout(() => dispatch({ type: "forget", offerId }), TAKEN_LINGER_MS);
  }, []);
  const unhold = (offerId: string) =>
    setHeld((all) => {
      if (!all.has(offerId)) return all;
      const next = new Map(all);
      next.delete(offerId);
      return next;
    });

  const claim = useCallback(
    async (offerId: string) => {
      dispatch({ type: "claim.pending", offerId });
      try {
        const { offer } = await postJson<{ offer: ClaimedOffer }>(`/offers/${offerId}/claim`);
        dispatch({ type: "claim.won", offer });
      } catch (error) {
        if (error instanceof HttpError && error.status === 409) {
          dispatch({ type: "claim.lost", offerId, message: error.message });
          forgetSoon(offerId);
        } else if (error instanceof HttpError && error.status === 404) {
          dispatch({
            type: "claim.failed",
            offerId,
            message: "That offer is no longer available.",
          });
        } else {
          dispatch({ type: "claim.failed", offerId, message: "Couldn't claim that. Try again." });
        }
      }
    },
    [forgetSoon],
  );

  const tap = useCallback(async (offerId: string, kind: TapKind, itemName: string) => {
    dispatch({ type: "tap.pending", offerId, kind });
    try {
      await postJson(`/offers/${offerId}/${TAP_PATH[kind]}`);
      dispatch({ type: "tap.confirmed", offerId });
    } catch {
      dispatch({ type: "tap.rolledBack", offerId });
      counter.current += 1;
      const failure: Failure = {
        id: `f${counter.current}`,
        message: `Couldn't ${kind === "collected" ? "mark" : kind} “${itemName}”${kind === "collected" ? " collected" : ""}.`,
        retry: () => {
          setFailures((all) => all.filter((f) => f.id !== failure.id));
          void tap(offerId, kind, itemName);
        },
      };
      setFailures((all) => [...all, failure]);
    }
  }, []);

  const refetch = useCallback(() => {
    getJson<OffersSnapshot>("/api/offers")
      .then((snapshot) => {
        if (!snapshot) return;
        dispatch({ type: "snapshot", snapshot });
        setHeld(new Map());
      })
      .catch(() => {});
  }, []);

  const { connected, reconnecting } = useLiveStream({
    onEvent(e: LiveEvent) {
      switch (e.type) {
        case "offer.posted": {
          const known = latest.current.incoming.some((r) => r.offer.id === e.offer.id);
          const isMine = latest.current.mine.some((o) => o.id === e.offer.id);
          if (!known && !isMine && window.scrollY > SCROLLED_PX) {
            setHeld((all) => new Map(all).set(e.offer.id, e.offer));
          } else dispatch({ type: "offer.posted", offer: e.offer });
          break;
        }
        case "offer.taken":
          unhold(e.offerId);
          dispatch({ type: "offer.taken", offerId: e.offerId });
          forgetSoon(e.offerId);
          break;
        case "offer.closed":
          unhold(e.offerId);
          dispatch({ type: "offer.closed", communityId: e.communityId, offerId: e.offerId });
          break;
        case "offer.mine":
          dispatch({ type: "offer.mine", offer: e.offer });
          break;
        case "offer.claim":
          dispatch({ type: "offer.claim", offer: e.offer });
          break;
        case "membership.joined":
        case "membership.left":
          refetch();
          break;
        case "member.removed":
          // handled by the pantry island and the household page
          break;
        default:
          break;
      }
    },
    onOpen: refetch,
    onUnauthorised: () => window.location.assign("/"),
  });

  const showHeld = () => {
    for (const offer of held.values()) dispatch({ type: "offer.posted", offer });
    setHeld(new Map());
    window.scrollTo({ top: 0 });
  };

  const { incoming, mine, claimed } = visibleOffers(state);

  return (
    <div class="offers-feed" data-stream={connected ? "open" : "connecting"}>
      {showConnection && <ConnectionStatus reconnecting={reconnecting} />}

      <p class="new-offers" role="status">
        {held.size > 0 && (
          <button type="button" onClick={showHeld}>
            {held.size} new {held.size === 1 ? "offer" : "offers"}
          </button>
        )}
      </p>

      {failures.map((failure) => (
        <div class="failure" role="alert" key={failure.id}>
          <span>{failure.message}</span>
          <button type="button" onClick={failure.retry}>
            Retry
          </button>
          <button
            type="button"
            onClick={() => setFailures((all) => all.filter((f) => f.id !== failure.id))}
          >
            Dismiss
          </button>
        </div>
      ))}

      {state.communities.length === 0 ? (
        <p>
          <a href="/communities">Join a community</a> to see and share offers.
        </p>
      ) : (
        <>
          <section aria-labelledby="offers-nearby">
            <h2 id="offers-nearby">Offers from neighbours</h2>
            {incoming.length === 0 ? (
              <p class="muted">No offers in your communities right now.</p>
            ) : (
              <ul class="offer-list">
                {incoming.map((row) => (
                  <IncomingOfferRow key={row.offer.id} row={row} now={now} onClaim={claim} />
                ))}
              </ul>
            )}
          </section>

          {claimed.length > 0 && (
            <section aria-labelledby="offers-claimed">
              <h2 id="offers-claimed">Offers you've claimed</h2>
              <ul class="offer-list">
                {claimed.map((offer) => (
                  <ClaimedOfferRow key={offer.id} offer={offer} now={now} onTap={tap} />
                ))}
              </ul>
            </section>
          )}

          {mine.length > 0 && (
            <section aria-labelledby="offers-mine">
              <h2 id="offers-mine">Your offers</h2>
              <ul class="offer-list">
                {mine.map((offer) => (
                  <MyOfferRow key={offer.id} offer={offer} now={now} onTap={tap} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
