import { describe, expect, it } from "vitest";
import type { ClaimedOffer, MyOffer, PublicOffer } from "../lib/offers.ts";
import { testValue } from "../lib/testItem.ts";
import {
  initialOffersState,
  type OffersAction,
  type OffersState,
  offersReducer,
  visibleOffers,
} from "./offersState.ts";

const pub = (
  id: string,
  fromName: string,
  createdAt: number,
  communityIds = ["x"],
): PublicOffer => ({
  id,
  itemName: `item ${id}`,
  fromName,
  communityIds,
  createdAt,
  value: testValue(),
});
const mine = (
  id: string,
  status: MyOffer["status"] = "offered",
  claimedBy: string | null = null,
): MyOffer => ({
  id,
  itemId: `i-${id}`,
  itemName: `item ${id}`,
  note: `note ${id}`,
  status,
  claimedBy,
  claimedAt: claimedBy ? 5 : null,
  communityIds: ["x"],
  createdAt: 1,
});
const claimed = (id: string, status: ClaimedOffer["status"] = "claimed"): ClaimedOffer => ({
  id,
  itemName: `item ${id}`,
  fromName: "Unit 4",
  note: "Porch",
  status,
  claimedAt: 9,
  value: testValue(),
});

const communities = [{ id: "x", name: "Elm" }];
const empty = (): OffersState =>
  initialOffersState({ communities, incoming: [], mine: [], claimed: [] });
const run = (state: OffersState, ...actions: OffersAction[]) =>
  actions.reduce(offersReducer, state);
const ids = (state: OffersState) => visibleOffers(state).incoming.map((r) => r.offer.id);

describe("snapshot", () => {
  it("replaces incoming, mine and claimed", () => {
    const s = run(
      initialOffersState({
        communities,
        incoming: [pub("a", "A", 1)],
        mine: [mine("m")],
        claimed: [claimed("c")],
      }),
      {
        type: "snapshot",
        snapshot: { communities, incoming: [pub("b", "B", 2)], mine: [], claimed: [] },
      },
    );
    expect(ids(s)).toEqual(["b"]);
    expect(visibleOffers(s).mine).toEqual([]);
    expect(visibleOffers(s).claimed).toEqual([]);
  });

  it("keeps a row marked taken, which the snapshot no longer lists", () => {
    const s = run(
      initialOffersState({ communities, incoming: [pub("a", "A", 1)], mine: [], claimed: [] }),
      { type: "offer.taken", offerId: "a" },
      { type: "snapshot", snapshot: { communities, incoming: [], mine: [], claimed: [] } },
    );
    expect(ids(s)).toEqual(["a"]);
    expect(visibleOffers(s).incoming[0].taken).toBe(true);
  });

  it("takes the communities from the snapshot", () => {
    const s = run(empty(), {
      type: "snapshot",
      snapshot: { communities: [], incoming: [], mine: [], claimed: [] },
    });
    expect(s.communities).toEqual([]);
  });
});

describe("offer.posted", () => {
  it("upserts, newest first, and is idempotent", () => {
    const a = pub("a", "A", 1);
    const b = pub("b", "B", 2);
    const once = run(
      empty(),
      { type: "offer.posted", offer: a },
      { type: "offer.posted", offer: b },
    );
    expect(ids(once)).toEqual(["b", "a"]);
    expect(run(once, { type: "offer.posted", offer: a })).toEqual(once);
  });

  it("unions communityIds", () => {
    const s = run(
      empty(),
      { type: "offer.posted", offer: pub("a", "A", 1, ["x"]) },
      { type: "offer.posted", offer: pub("a", "A", 1, ["y"]) },
    );
    expect(visibleOffers(s).incoming[0].offer.communityIds).toEqual(["x", "y"]);
  });

  it("keeps the fromName of an existing row: the first wins", () => {
    const s = run(
      empty(),
      { type: "offer.posted", offer: pub("a", "Unit 4", 1, ["x"]) },
      { type: "offer.posted", offer: pub("a", "Unit 4 · 2", 1, ["y"]) },
    );
    expect(visibleOffers(s).incoming[0].offer.fromName).toBe("Unit 4");
  });

  it("is ignored for an offer that is already mine", () => {
    const s = run(
      empty(),
      { type: "offer.mine", offer: mine("a") },
      { type: "offer.posted", offer: pub("a", "Me", 1) },
    );
    expect(ids(s)).toEqual([]);
  });

  it("brings back a taken row that was released and offered again", () => {
    const s = run(
      empty(),
      { type: "offer.posted", offer: pub("a", "A", 1) },
      { type: "offer.taken", offerId: "a" },
      { type: "offer.posted", offer: pub("a", "A", 1) },
    );
    expect(visibleOffers(s).incoming[0].taken).toBeUndefined();
  });
});

describe("offer.taken, forget and offer.closed", () => {
  const withA = () => run(empty(), { type: "offer.posted", offer: pub("a", "A", 1) });

  it("marks a row taken and forget removes it", () => {
    const taken = run(withA(), { type: "offer.taken", offerId: "a" });
    expect(visibleOffers(taken).incoming[0].taken).toBe(true);
    expect(ids(run(taken, { type: "forget", offerId: "a" }))).toEqual([]);
  });

  it("forget leaves a row that is not taken", () => {
    expect(ids(run(withA(), { type: "forget", offerId: "a" }))).toEqual(["a"]);
  });

  it("taken for an unknown offer changes nothing", () => {
    expect(run(empty(), { type: "offer.taken", offerId: "zzz" })).toEqual(empty());
  });

  it("closed removes the row", () => {
    expect(ids(run(withA(), { type: "offer.closed", communityId: "x", offerId: "a" }))).toEqual([]);
  });

  it("closed on one community keeps an offer that is still open on another", () => {
    const s = run(
      empty(),
      { type: "offer.posted", offer: pub("a", "A", 1, ["x", "y"]) },
      { type: "offer.closed", communityId: "x", offerId: "a" },
    );
    expect(visibleOffers(s).incoming[0].offer.communityIds).toEqual(["y"]);
  });
});

describe("offer.mine", () => {
  it("upserts, in either order", () => {
    const first = run(empty(), { type: "offer.mine", offer: mine("a") });
    const claimedNow = run(first, { type: "offer.mine", offer: mine("a", "claimed", "Flat 2") });
    expect(visibleOffers(claimedNow).mine).toEqual([mine("a", "claimed", "Flat 2")]);
    expect(run(claimedNow, { type: "offer.mine", offer: mine("a", "claimed", "Flat 2") })).toEqual(
      claimedNow,
    );
  });

  it("drops the row on a terminal status", () => {
    for (const status of ["collected", "withdrawn"] as const) {
      const s = run(
        empty(),
        { type: "offer.mine", offer: mine("a") },
        { type: "offer.mine", offer: mine("a", status) },
      );
      expect(visibleOffers(s).mine).toEqual([]);
    }
  });
});

describe("offer.claim", () => {
  it("upserts, and drops the offer from incoming", () => {
    const s = run(
      empty(),
      { type: "offer.posted", offer: pub("a", "A", 1) },
      { type: "offer.claim", offer: claimed("a") },
    );
    expect(visibleOffers(s).claimed).toEqual([claimed("a")]);
    expect(ids(s)).toEqual([]);
  });

  it("drops the row when the status is not claimed", () => {
    for (const status of ["released", "collected", "withdrawn"] as const) {
      const s = run(
        empty(),
        { type: "offer.claim", offer: claimed("a") },
        { type: "offer.claim", offer: claimed("a", status) },
      );
      expect(visibleOffers(s).claimed).toEqual([]);
    }
  });
});

describe("claiming", () => {
  const withA = () => run(empty(), { type: "offer.posted", offer: pub("a", "A", 1) });

  it("pending marks the row busy", () => {
    const s = run(withA(), { type: "claim.pending", offerId: "a" });
    expect(visibleOffers(s).incoming[0].busy).toBe(true);
  });

  it("lost marks the row taken with a message and is not an error", () => {
    const s = run(
      withA(),
      { type: "claim.pending", offerId: "a" },
      { type: "claim.lost", offerId: "a", message: "Someone claimed this first." },
    );
    const row = visibleOffers(s).incoming[0];
    expect(row.busy).toBeUndefined();
    expect(row.taken).toBe(true);
    expect(row.message).toBe("Someone claimed this first.");
  });

  it("won moves the offer to claimed, with the note", () => {
    const s = run(
      withA(),
      { type: "claim.pending", offerId: "a" },
      { type: "claim.won", offer: claimed("a") },
    );
    expect(ids(s)).toEqual([]);
    expect(visibleOffers(s).claimed).toEqual([claimed("a")]);
  });

  it("won after the live stream already released the claim does not bring it back", () => {
    // the stream can deliver claimed, released and the re-post before the claim's own response is handled
    const s = run(
      withA(),
      { type: "claim.pending", offerId: "a" },
      { type: "offer.claim", offer: claimed("a") },
      { type: "offer.claim", offer: claimed("a", "released") },
      { type: "offer.posted", offer: pub("a", "A", 1) },
      { type: "claim.won", offer: claimed("a") },
    );
    expect(visibleOffers(s).claimed).toEqual([]);
    expect(ids(s)).toEqual(["a"]);
  });

  it("won while the stream is silent still moves the offer to claimed", () => {
    // the row is still busy: nothing newer has been heard
    const s = run(
      withA(),
      { type: "claim.pending", offerId: "a" },
      { type: "claim.won", offer: claimed("a") },
    );
    expect(visibleOffers(s).claimed).toEqual([claimed("a")]);
  });

  it("failed clears busy and keeps the offer claimable, with a message", () => {
    const s = run(
      withA(),
      { type: "claim.pending", offerId: "a" },
      { type: "claim.failed", offerId: "a", message: "Couldn't claim." },
    );
    const row = visibleOffers(s).incoming[0];
    expect(row.busy).toBeUndefined();
    expect(row.taken).toBeUndefined();
    expect(row.message).toBe("Couldn't claim.");
  });

  it("the winner's own taken event arriving before the response does no harm", () => {
    const s = run(
      withA(),
      { type: "claim.pending", offerId: "a" },
      { type: "offer.taken", offerId: "a" },
      { type: "claim.won", offer: claimed("a") },
    );
    expect(ids(s)).toEqual([]);
    expect(visibleOffers(s).claimed).toEqual([claimed("a")]);
  });
});

describe("taps with rollback", () => {
  it("collected hides a claimed row until confirmed, and rolls back", () => {
    const base = run(empty(), { type: "offer.claim", offer: claimed("a") });
    const pending = run(base, { type: "tap.pending", offerId: "a", kind: "collected" });
    expect(visibleOffers(pending).claimed).toEqual([]);
    expect(visibleOffers(run(pending, { type: "tap.rolledBack", offerId: "a" })).claimed).toEqual([
      claimed("a"),
    ]);
    expect(visibleOffers(run(pending, { type: "tap.confirmed", offerId: "a" })).claimed).toEqual(
      [],
    );
  });

  it("withdraw hides my offer, and rolls back", () => {
    const base = run(empty(), { type: "offer.mine", offer: mine("a") });
    const pending = run(base, { type: "tap.pending", offerId: "a", kind: "withdraw" });
    expect(visibleOffers(pending).mine).toEqual([]);
    expect(visibleOffers(run(pending, { type: "tap.rolledBack", offerId: "a" })).mine).toEqual([
      mine("a"),
    ]);
  });

  it("release by the offerer shows the offer as offered again, and rolls back", () => {
    const base = run(empty(), { type: "offer.mine", offer: mine("a", "claimed", "Flat 2") });
    const pending = run(base, { type: "tap.pending", offerId: "a", kind: "release" });
    expect(visibleOffers(pending).mine[0]).toMatchObject({ status: "offered", claimedBy: null });
    expect(
      visibleOffers(run(pending, { type: "tap.rolledBack", offerId: "a" })).mine[0],
    ).toMatchObject({
      status: "claimed",
      claimedBy: "Flat 2",
    });
  });

  it("release by the claimer hides the claim", () => {
    const base = run(empty(), { type: "offer.claim", offer: claimed("a") });
    const pending = run(base, { type: "tap.pending", offerId: "a", kind: "release" });
    expect(visibleOffers(pending).claimed).toEqual([]);
  });

  it("a second tap on the same offer while one is pending is ignored", () => {
    const base = run(empty(), { type: "offer.mine", offer: mine("a", "claimed", "Flat 2") });
    const once = run(base, { type: "tap.pending", offerId: "a", kind: "release" });
    expect(run(once, { type: "tap.pending", offerId: "a", kind: "withdraw" })).toEqual(once);
  });
});

describe("offer values", () => {
  it("offer.updated replaces an incoming row's value and keeps taken and busy", () => {
    let s = run(empty(), { type: "offer.posted", offer: pub("o1", "Unit 4", 5) });
    s = run(s, { type: "claim.pending", offerId: "o1" }, { type: "offer.taken", offerId: "o1" });
    const value = testValue({ measure: "count", count: 4 });
    s = run(s, { type: "offer.updated", offer: { ...pub("o1", "Unit 4", 5), value } });
    expect(s.incoming[0].offer.value).toEqual(value);
    expect(s.incoming[0]).toMatchObject({ taken: true });
    expect(s.incoming[0].offer.fromName).toBe("Unit 4");
  });

  it("offer.updated for an unknown offer is a no-op", () => {
    const s = empty();
    expect(run(s, { type: "offer.updated", offer: pub("nope", "Unit 4", 5) })).toEqual(s);
  });

  it("offer.claim with a new value replaces the claimed row's value", () => {
    let s = run(empty(), { type: "offer.claim", offer: claimed("o1") });
    const value = testValue({ measure: "fill", fillStop: 1 });
    s = run(s, { type: "offer.claim", offer: { ...claimed("o1"), value } });
    expect(s.claimed).toHaveLength(1);
    expect(s.claimed[0].value).toEqual(value);
  });
});
