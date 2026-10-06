import { describe, expect, inject, it } from "vitest";
import { type Client, withoutScripts } from "./http.ts";
import { act, claim, neighbourhood, offerNamed, openStreamFor } from "./neighbours.ts";
import type { Frame, Stream } from "./sse.ts";

const baseUrl = inject("baseUrl");
const NOTE = "SECRET-PICKUP-NOTE-7731";
const asJson = { accept: "application/json" };

async function drain(stream: Stream): Promise<Frame[]> {
  const frames: Frame[] = [];
  for (let f = await stream.next(400); f; f = await stream.next(400)) frames.push(f);
  return frames;
}

// Everything a household can read about the others: its pages, its JSON, its stream.
const PAGES = (communityId: string) => [
  "/",
  "/household",
  "/history",
  "/history?outcome=given",
  `/communities/${communityId}`,
  "/communities",
  "/offers",
];
const API = ["/api/pantry", "/api/offers"];

async function everythingSeenBy(me: Client, communityId: string): Promise<string[]> {
  const pages = await Promise.all(PAGES(communityId).map(async (p) => (await me.get(p)).text()));
  const apis = await Promise.all(API.map(async (p) => (await me.get(p, asJson)).text()));
  return [...pages, ...apis];
}

// Offerer Sam (Unit 4), neighbour Priya (Flat 2), claimer Quinn (House 9),
// each with an open stream, and an offer note that differs from the household default.
async function scene() {
  const { offerer, neighbour, claimer, communityId } = await neighbourhood(baseUrl);
  await offerer.post("/household/pickup-note", { note: "Default porch note" }, asJson);
  const streams = {
    offerer: await openStreamFor(baseUrl, offerer),
    neighbour: await openStreamFor(baseUrl, neighbour),
    claimer: await openStreamFor(baseUrl, claimer),
  };
  const { offerId } = await offerNamed(offerer, "milk", NOTE);
  const claimRes = await claim(claimer, offerId);
  const claimBody = await claimRes.text();
  await act(claimer, offerId, "collected");
  const frames = {
    offerer: await drain(streams.offerer),
    neighbour: await drain(streams.neighbour),
    claimer: await drain(streams.claimer),
  };
  for (const s of Object.values(streams)) s.close();
  return { offerer, neighbour, claimer, communityId, offerId, claimBody, frames };
}

// The offering household reads its own note (so it can view and edit it per
// item) and the claiming household reads it to collect. Nobody else does.
describe("Pickup notes go only to the claiming household", () => {
  it("shows the note to the offerer and the claimer, and to no one else, in any response, page or frame", async () => {
    const s = await scene();
    const seen = JSON.stringify;
    // the claimer: the claim response, an offer.claim frame
    expect(s.claimBody).toContain(NOTE);
    const claimFrame = s.frames.claimer.find((f) => f.event === "offer.claim");
    expect(seen(claimFrame)).toContain(NOTE);
    // the offerer: its own offer.mine frame
    expect(seen(s.frames.offerer.filter((f) => f.event === "offer.mine"))).toContain(NOTE);

    // the neighbour's responses, pages and frames never carry it
    for (const body of await everythingSeenBy(s.neighbour, s.communityId)) {
      expect(body, "the neighbour's pages and JSON").not.toContain(NOTE);
    }
    expect(seen(s.frames.neighbour), "the neighbour's stream").not.toContain(NOTE);

    // no community channel carries it, whoever is listening
    for (const frames of Object.values(s.frames)) {
      for (const f of frames.filter((f) => f.data.communityId !== undefined)) {
        expect(seen(f)).not.toContain(NOTE);
      }
    }
    // on the claimer's own stream, only offer.claim carries it
    for (const f of s.frames.claimer.filter((f) => f.event !== "offer.claim")) {
      expect(seen(f)).not.toContain(NOTE);
    }
    // on the offerer's, only its own offer.mine
    for (const f of s.frames.offerer.filter((f) => f.event !== "offer.mine")) {
      expect(seen(f)).not.toContain(NOTE);
    }
  });

  it("shows the note in the offerer's and claimer's /api/offers and /api/pantry, never the neighbour's", async () => {
    const { offerer, neighbour, claimer } = await neighbourhood(baseUrl);
    const { offerId } = await offerNamed(offerer, "milk", NOTE);
    expect(await (await offerer.get("/api/offers", asJson)).text()).toContain(NOTE);
    expect(await (await offerer.get("/api/pantry", asJson)).text()).toContain(NOTE);
    await claim(claimer, offerId);
    expect(await (await claimer.get("/api/offers", asJson)).text()).toContain(NOTE);
    expect(await (await offerer.get("/api/offers", asJson)).text()).toContain(NOTE);
    expect(await (await neighbour.get("/api/offers", asJson)).text()).not.toContain(NOTE);
    expect(await (await neighbour.get("/api/pantry", asJson)).text()).not.toContain(NOTE);
    // collected: it is gone from both
    await act(claimer, offerId, "collected");
    expect(await (await claimer.get("/api/offers", asJson)).text()).not.toContain(NOTE);
    expect(await (await offerer.get("/api/offers", asJson)).text()).not.toContain(NOTE);
  });
});

describe("Member names stay in the household", () => {
  it("names no member on a community page, in /api/offers or on a community channel", async () => {
    const s = await scene();
    const names = ["Sam", "Priya", "Quinn"];
    for (const me of [s.offerer, s.neighbour, s.claimer]) {
      const page = withoutScripts(await (await me.get(`/communities/${s.communityId}`)).text());
      const api = await (await me.get("/api/offers", asJson)).text();
      for (const name of names) {
        expect(page).not.toContain(name);
        expect(api).not.toContain(name);
      }
    }
    for (const frames of Object.values(s.frames)) {
      for (const f of frames.filter((f) => f.data.communityId !== undefined)) {
        for (const name of names) expect(JSON.stringify(f)).not.toContain(name);
      }
    }
  });

  it("never puts the collecting neighbour's name in the offerer's item.removed or history", async () => {
    const s = await scene();
    const removed = s.frames.offerer.find((f) => f.event === "item.removed");
    expect(removed?.data).toMatchObject({ outcome: "given", by: { name: "a neighbour" } });
    const history = await (await s.offerer.get("/history")).text();
    // the claimer's household is named in the offerer's own offer.mine; their member never is
    expect(JSON.stringify(s.frames.offerer)).not.toContain("Quinn");
    expect(history).not.toContain("Quinn");
    expect(history).not.toContain("House 9");
  });
});

describe("A neighbour never learns who claimed", () => {
  it("shows the third household offer.taken and nothing naming the claimer", async () => {
    const { offerer, neighbour, claimer } = await neighbourhood(baseUrl);
    const stream = await openStreamFor(baseUrl, neighbour);
    const { offerId } = await offerNamed(offerer, "milk", NOTE);
    await claim(claimer, offerId);
    const frames = await drain(stream);
    stream.close();
    const types = frames.map((f) => f.event);
    expect(types).toContain("offer.taken");
    const claimerHousehold = (await (await claimer.get("/api/pantry", asJson)).json()) as {
      household: { id: string };
    };
    const text =
      JSON.stringify(frames) + (await (await neighbour.get("/api/offers", asJson)).text());
    for (const clue of ["House 9", "Quinn", claimerHousehold.household.id]) {
      expect(text).not.toContain(clue);
    }
  });
});
