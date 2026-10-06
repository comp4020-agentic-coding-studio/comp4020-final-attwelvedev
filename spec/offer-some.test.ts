import { describe, expect, inject, it } from "vitest";
import type { Client } from "./http.ts";
import {
  act,
  addPantryItem,
  apiOffers,
  claim,
  neighbourhood,
  offerItem,
  openStreamFor,
} from "./neighbours.ts";
import type { Frame } from "./sse.ts";

const baseUrl = inject("baseUrl");
const asJson = { accept: "application/json" };

interface Row {
  id: string;
  name: string;
  count: number;
  measure: string;
}
interface OfferValue {
  measure: string;
  count: number;
}

const pantry = async (me: Client) =>
  (await (await me.get("/api/pantry", asJson)).json()) as {
    items: Row[];
    offering: { open: { id: string; itemId: string }[] };
  };

// Sam adds eggs, counts them, and sets six.
async function sixEggs(me: Client): Promise<string> {
  const id = await addPantryItem(me, "eggs");
  await me.post(`/items/${id}/measure`, { measure: "count" }, asJson);
  await me.post(`/items/${id}/value`, { count: "6" }, asJson);
  return id;
}

const got = (frame: Frame | null): Frame => {
  if (!frame) throw new Error("expected an event, but none arrived in time");
  return frame;
};

describe("Offer some", () => {
  it("splits a count into a second item that carries the offer, and a neighbour sees the portion", async () => {
    const { offerer, neighbour } = await neighbourhood(baseUrl);
    const eggs = await sixEggs(offerer);
    const res = await offerItem(offerer, eggs, { note: "Porch", portion: "3" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      offer: { id: string; itemId?: string };
      split: { remainder: Row; portion: Row } | null;
    };
    expect(body.split?.portion.count).toBe(3);
    expect(body.split?.remainder.count).toBe(3);

    const mine = await pantry(offerer);
    expect(mine.items.filter((i) => i.name === "eggs").map((i) => i.count)).toEqual([3, 3]);
    expect(mine.offering.open).toHaveLength(1);
    expect(mine.offering.open[0].itemId).toBe(body.split?.portion.id);

    const seen = (await apiOffers(neighbour)).incoming as unknown as { value: OfferValue }[];
    expect(seen).toHaveLength(1);
    expect(seen[0].value).toMatchObject({ measure: "count", count: 3 });
  });

  it("folds the portion back when the offer is withdrawn", async () => {
    const { offerer } = await neighbourhood(baseUrl);
    const eggs = await sixEggs(offerer);
    const res = await offerItem(offerer, eggs, { note: "Porch", portion: "3" });
    const { offer } = (await res.json()) as { offer: { id: string } };
    await act(offerer, offer.id, "withdraw");
    const rows = (await pantry(offerer)).items.filter((i) => i.name === "eggs");
    expect(rows.map((i) => i.count)).toEqual([6]);
  });

  it("refuses a bad portion with 400 and leaves the pantry as it was", async () => {
    const { offerer } = await neighbourhood(baseUrl);
    const eggs = await sixEggs(offerer);
    const before = await pantry(offerer);
    for (const portion of ["0", "6", "9", "x", "2.5"]) {
      expect((await offerItem(offerer, eggs, { note: "Porch", portion })).status).toBe(400);
    }
    expect(await pantry(offerer)).toEqual(before);
  });

  it("tells the household of a split in order: item.updated, item.added, offer.mine", async () => {
    const { offerer } = await neighbourhood(baseUrl);
    const eggs = await sixEggs(offerer);
    const stream = await openStreamFor(baseUrl, offerer);
    try {
      await offerItem(offerer, eggs, { note: "Porch", portion: "2" });
      const types = [];
      for (let i = 0; i < 3; i++) types.push(got(await stream.next(1000)).event);
      expect(types).toEqual(["item.updated", "item.added", "offer.mine"]);
    } finally {
      stream.close();
    }
  });
});

describe("values on a live offer", () => {
  it("reaches a neighbour as offer.updated, a housemate as item.updated, then only the claimer", async () => {
    const { offerer, neighbour, claimer } = await neighbourhood(baseUrl);
    const eggs = await sixEggs(offerer);
    const { split } = (await (
      await offerItem(offerer, eggs, { note: "Porch", portion: "3" })
    ).json()) as { split: { portion: Row } };
    const offerId = (await pantry(offerer)).offering.open[0].id;
    const portionId = split.portion.id;

    const priya = await openStreamFor(baseUrl, neighbour);
    const sam = await openStreamFor(baseUrl, offerer);
    const quinn = await openStreamFor(baseUrl, claimer);
    try {
      const started = Date.now();
      await offerer.post(`/items/${portionId}/value`, { count: "2" }, asJson);
      const updated = got(await priya.nextOfType("offer.updated", 1000));
      expect(Date.now() - started).toBeLessThan(1000);
      expect((updated.data.offer as { value: OfferValue }).value.count).toBe(2);
      const own = got(await sam.nextOfType("item.updated", 1000));
      expect((own.data.item as Row).count).toBe(2);

      await claim(claimer, offerId);
      await quinn.nextOfType("offer.claim", 1000);
      await offerer.post(`/items/${portionId}/value`, { count: "1" }, asJson);
      const told = got(await quinn.nextOfType("offer.claim", 1000));
      expect((told.data.offer as { value: OfferValue }).value.count).toBe(1);
      // the neighbour hears the claim but no further edit
      expect(await priya.nextOfType("offer.updated", 400)).toBeNull();
    } finally {
      for (const s of [priya, sam, quinn]) s.close();
    }
  });
});
