import { describe, expect, inject, it } from "vitest";
import { text } from "./http.ts";
import {
  act,
  addPantryItem,
  apiOffers,
  apiPantry,
  claim,
  createCommunity,
  joinCommunityByCode,
  neighbourhood,
  newHousehold,
  offerItem,
  offerNamed,
  openStreamFor,
} from "./neighbours.ts";
import type { Frame } from "./sse.ts";

const baseUrl = inject("baseUrl");

function got(frame: Frame | null): Frame {
  if (!frame) throw new Error("expected an event, but none arrived in time");
  return frame;
}

describe("claiming", () => {
  it("lets exactly one of two simultaneous claims win, and tells the other why", async () => {
    const { offerer, neighbour, claimer } = await neighbourhood(baseUrl);
    const { offerId } = await offerNamed(offerer, "milk");
    const results = await Promise.all([claim(neighbour, offerId), claim(claimer, offerId)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const loser = results.find((r) => r.status === 409);
    expect(await loser?.json()).toEqual({ error: "Someone claimed this first." });
    const winner = results.find((r) => r.status === 200);
    expect(await winner?.json()).toMatchObject({
      offer: { id: offerId, itemName: "milk", fromName: "Unit 4", status: "claimed" },
    });
  });

  it("refuses to claim your own offer with a 403", async () => {
    const { offerer } = await neighbourhood(baseUrl);
    const { offerId } = await offerNamed(offerer, "milk");
    expect((await claim(offerer, offerId)).status).toBe(403);
  });

  it("answers 404 for an offer in a community the household is not in", async () => {
    const { offerer } = await neighbourhood(baseUrl);
    const { offerId } = await offerNamed(offerer, "milk");
    const outsider = await newHousehold(baseUrl, "Outside", "Olly");
    await createCommunity(outsider, "Elsewhere");
    expect((await claim(outsider, offerId)).status).toBe(404);
  });
});

describe("offer, collect, release, withdraw", () => {
  it("drops a collected item from the pantry and lists it under Given, to a neighbour", async () => {
    const { offerer, neighbour } = await neighbourhood(baseUrl);
    const { offerId, itemId } = await offerNamed(offerer, "milk");
    await claim(neighbour, offerId);
    expect((await act(neighbour, offerId, "collected")).status).toBe(200);
    expect((await apiPantry(offerer)).items.map((i) => i.id)).not.toContain(itemId);
    const page = text(await (await offerer.get("/history?outcome=given")).text());
    expect(page).toContain("milk");
    expect(page).toContain("to a neighbour");
    expect(page).not.toContain("Priya");
    expect(page).not.toContain("Flat 2");
  });

  it("returns a released offer to the neighbours' feed", async () => {
    const { offerer, neighbour, claimer } = await neighbourhood(baseUrl);
    const { offerId } = await offerNamed(offerer, "milk");
    await claim(claimer, offerId);
    expect((await apiOffers(neighbour)).incoming).toEqual([]);
    expect((await act(claimer, offerId, "release")).status).toBe(200);
    expect((await apiOffers(neighbour)).incoming.map((o) => o.id)).toEqual([offerId]);
    expect((await apiOffers(claimer)).claimed).toEqual([]);
  });

  it("removes a withdrawn offer, which only the offerer may do", async () => {
    const { offerer, neighbour, claimer } = await neighbourhood(baseUrl);
    const { offerId } = await offerNamed(offerer, "milk");
    await claim(claimer, offerId);
    expect((await act(claimer, offerId, "withdraw")).status).toBe(403);
    expect((await act(neighbour, offerId, "withdraw")).status).toBe(404);
    expect((await act(offerer, offerId, "withdraw")).status).toBe(200);
    expect((await apiOffers(offerer)).mine).toEqual([]);
    expect((await act(offerer, offerId, "withdraw")).status).toBe(409);
  });

  it("offers to the communities ticked and no others", async () => {
    const { offerer, neighbour, communityId } = await neighbourhood(baseUrl);
    const other = await createCommunity(offerer, "Oak Lane");
    const itemId = await addPantryItem(offerer, "rice");
    const res = await offerItem(offerer, itemId, { note: "Gate", communityIds: [other.id] });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ offer: { communityIds: [other.id] } });
    expect((await apiOffers(neighbour)).incoming).toEqual([]);
    await joinCommunityByCode(neighbour, other.code);
    expect((await apiOffers(neighbour)).incoming).toHaveLength(1);
    expect(communityId).not.toBe(other.id);
  });

  it("withdraws an offered item when it is marked Used", async () => {
    const { offerer, neighbour } = await neighbourhood(baseUrl);
    const { itemId } = await offerNamed(offerer, "milk");
    expect((await apiOffers(neighbour)).incoming).toHaveLength(1);
    await offerer.post(`/items/${itemId}/outcome`, { outcome: "used" });
    expect((await apiOffers(neighbour)).incoming).toEqual([]);
  });

  it("answers 400 for a missing note and 409 for an item already offered", async () => {
    const { offerer } = await neighbourhood(baseUrl);
    const itemId = await addPantryItem(offerer, "rice");
    expect((await offerItem(offerer, itemId, { note: " " })).status).toBe(400);
    expect((await offerItem(offerer, itemId, { note: "Gate" })).status).toBe(201);
    expect((await offerItem(offerer, itemId, { note: "Gate" })).status).toBe(409);
  });

  it("changes a note for the claimer to see", async () => {
    const { offerer, claimer } = await neighbourhood(baseUrl);
    const { offerId } = await offerNamed(offerer, "milk", "Old note");
    await claim(claimer, offerId);
    const res = await offerer.post(
      `/offers/${offerId}/note`,
      { note: "New note" },
      {
        accept: "application/json",
      },
    );
    expect(res.status).toBe(200);
    expect((await apiOffers(claimer)).claimed[0].note).toBe("New note");
  });
});

describe("leaving and deleting", () => {
  it("withdraws a household's offers and releases its claims when it leaves the community", async () => {
    const { offerer, neighbour, claimer, communityId } = await neighbourhood(baseUrl);
    const mine = await offerNamed(offerer, "milk");
    const theirs = await offerNamed(neighbour, "eggs");
    await claim(claimer, mine.offerId);
    await claim(offerer, theirs.offerId);

    await offerer.post(`/communities/${communityId}/leave`);
    // the offerer's own offer is withdrawn, so the claimer no longer holds it
    expect((await apiOffers(claimer)).claimed).toEqual([]);
    expect((await apiOffers(claimer)).incoming.map((o) => o.itemName)).toEqual(["eggs"]);
    // its claim on the neighbour's eggs is released: the eggs are on offer again
    expect((await apiOffers(neighbour)).mine).toMatchObject([
      { itemName: "eggs", status: "offered", claimedBy: null },
    ]);
  });

  it("closes a deleted household's offers on the neighbours' open streams", async () => {
    const { offerer, neighbour } = await neighbourhood(baseUrl);
    const { offerId } = await offerNamed(offerer, "milk");
    const stream = await openStreamFor(baseUrl, neighbour);
    await offerer.post("/household/leave");
    const frame = got(await stream.nextOfType("offer.closed", 1000));
    expect(frame.data).toMatchObject({ offerId });
    expect((await apiOffers(neighbour)).incoming).toEqual([]);
    stream.close();
  });
});

describe("history of a given item", () => {
  it("cannot be undone", async () => {
    const { offerer, claimer } = await neighbourhood(baseUrl);
    const stream = await openStreamFor(baseUrl, offerer);
    const { offerId } = await offerNamed(offerer, "milk");
    await claim(claimer, offerId);
    await act(offerer, offerId, "collected");
    const removed = got(await stream.nextOfType("item.removed", 1000));
    expect(removed.data).toMatchObject({ outcome: "given" });
    const undo = await offerer.post(
      `/history/${removed.data.historyId}/undo`,
      {},
      {
        accept: "application/json",
      },
    );
    expect(undo.status).toBe(404);
    stream.close();
  });
});

describe("shapes, sessions and the default note", () => {
  it("answers 401 to JSON requests without a session", async () => {
    const { client } = await import("./http.ts");
    const anon = client(baseUrl);
    const json = { accept: "application/json" };
    expect((await anon.get("/api/offers", json)).status).toBe(401);
    expect((await anon.post("/offers/create", { itemId: "x" }, json)).status).toBe(401);
    expect((await anon.post("/offers/x/claim", {}, json)).status).toBe(401);
    expect((await anon.post("/household/pickup-note", { note: "x" }, json)).status).toBe(401);
    expect((await anon.post("/offers/x/claim")).status).toBe(303);
  });

  it("serves the offers snapshot and the offering slice of the pantry", async () => {
    const { offerer, neighbour, communityId } = await neighbourhood(baseUrl);
    const { offerId } = await offerNamed(offerer, "milk", "Porch");
    expect(await apiOffers(neighbour)).toMatchObject({
      communities: [{ id: communityId, name: "Elm Street" }],
      incoming: [
        { id: offerId, itemName: "milk", fromName: "Unit 4", communityIds: [communityId] },
      ],
      mine: [],
      claimed: [],
    });
    const pantry = await apiPantry(offerer);
    expect(pantry.offering.defaultPickupNote).toBe("Porch");
    expect(pantry.offering.communities).toEqual([{ id: communityId, name: "Elm Street" }]);
    expect(pantry.offering.open).toHaveLength(1);
  });

  it("saves the default pickup note, rejecting blank and over 280", async () => {
    const { offerer } = await neighbourhood(baseUrl);
    const json = { accept: "application/json" };
    const ok = await offerer.post("/household/pickup-note", { note: " Gate 3 " }, json);
    expect(await ok.json()).toEqual({ note: "Gate 3" });
    expect((await offerer.post("/household/pickup-note", { note: "  " }, json)).status).toBe(400);
    expect(
      (await offerer.post("/household/pickup-note", { note: "x".repeat(281) }, json)).status,
    ).toBe(400);
    expect((await apiPantry(offerer)).offering.defaultPickupNote).toBe("Gate 3");
  });
});
