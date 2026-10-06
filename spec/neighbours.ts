import { randomInt } from "node:crypto";
import { type Client, client } from "./http.ts";
import { openStream, type Stream } from "./sse.ts";

// HTTP helpers for the community and offer specs: each client is its own
// household, from its own address as far as the join throttle is concerned.

export const ownAddress = () => ({
  "fly-client-ip": `10.${randomInt(256)}.${randomInt(256)}.${randomInt(256)}`,
});

export async function newHousehold(
  baseUrl: string,
  householdName = "Unit 4",
  memberName = "Sam",
): Promise<Client> {
  const me = client(baseUrl, { headers: ownAddress() });
  await me.post("/households", { householdName, memberName });
  return me;
}

export async function createCommunity(
  me: Client,
  name = "Elm Street",
): Promise<{ id: string; code: string }> {
  const res = await me.post("/communities/create", { name });
  const id = res.headers.get("location")?.match(/\/communities\/([^/]+)$/)?.[1] ?? "";
  const html = await (await me.get(`/communities/${id}`)).text();
  const code = html.match(/id="community-code"[^>]*>([^<]+)</)?.[1] ?? "";
  return { id, code };
}

export function joinCommunityByCode(me: Client, code: string): Promise<Response> {
  return me.post("/communities/join/code", { code });
}

const asJson = { accept: "application/json" };

// Three households in one community, each with its own member: the offerer,
// a neighbour and a second neighbour who will claim.
export async function neighbourhood(baseUrl: string) {
  const offerer = await newHousehold(baseUrl, "Unit 4", "Sam");
  const community = await createCommunity(offerer);
  const neighbour = await newHousehold(baseUrl, "Flat 2", "Priya");
  const claimer = await newHousehold(baseUrl, "House 9", "Quinn");
  await joinCommunityByCode(neighbour, community.code);
  await joinCommunityByCode(claimer, community.code);
  return { offerer, neighbour, claimer, communityId: community.id, code: community.code };
}

export async function addPantryItem(me: Client, name: string): Promise<string> {
  const res = await me.post("/items", { name }, asJson);
  return ((await res.json()) as { item: { id: string } }).item.id;
}

export function offerItem(
  me: Client,
  itemId: string,
  fields: { note?: string; communityIds?: string[] } = {},
): Promise<Response> {
  return me.post("/offers/create", { itemId, ...fields }, asJson);
}

// Adds an item and offers it: the offer's id and its item's id.
export async function offerNamed(
  me: Client,
  name: string,
  note = "Porch, after 5",
): Promise<{ offerId: string; itemId: string }> {
  const itemId = await addPantryItem(me, name);
  const res = await offerItem(me, itemId, { note });
  return { offerId: ((await res.json()) as { offer: { id: string } }).offer.id, itemId };
}

export const claim = (me: Client, offerId: string): Promise<Response> =>
  me.post(`/offers/${offerId}/claim`, {}, asJson);

export const act = (me: Client, offerId: string, action: string): Promise<Response> =>
  me.post(`/offers/${offerId}/${action}`, {}, asJson);

export async function apiOffers(me: Client) {
  const res = await me.get("/api/offers", asJson);
  return (await res.json()) as {
    communities: { id: string; name: string }[];
    incoming: { id: string; itemName: string; fromName: string; communityIds: string[] }[];
    mine: { id: string; itemName: string; status: string; claimedBy: string | null }[];
    claimed: { id: string; itemName: string; note: string; fromName: string }[];
  };
}

export async function apiPantry(me: Client) {
  return (await (await me.get("/api/pantry", asJson)).json()) as {
    items: { id: string; name: string }[];
    offering: { communities: { id: string }[]; defaultPickupNote: string | null; open: unknown[] };
  };
}

export const openStreamFor = (baseUrl: string, me: Client): Promise<Stream> =>
  openStream(baseUrl, me.cookie("pantry_device"));
