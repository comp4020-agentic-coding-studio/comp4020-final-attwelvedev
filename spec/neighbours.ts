import { randomInt } from "node:crypto";
import type { Browser, Page } from "playwright";
import { DESKTOP, type Viewport } from "./browser.ts";
import { type Client, client } from "./http.ts";
import { type Person, startHousehold, streamOpen } from "./people.ts";
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
  fields: { note?: string; communityIds?: string[]; portion?: string } = {},
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

// Browser helpers: people from spec/people.ts doing the community steps through
// the real forms. Offers are made over HTTP as the same person (`httpFor`), since
// the Offer button belongs to Task 20.

export async function startCommunity(
  person: Person,
  baseUrl: string,
  name = "Elm Street",
): Promise<{ id: string; code: string }> {
  await person.page.goto(new URL("/communities", baseUrl).href);
  await person.page.getByLabel("Community name").fill(name);
  await person.page.getByLabel("Community name").press("Enter");
  await person.page.waitForURL(/\/communities\/[^/]+$/);
  const id = person.page.url().split("/").pop() ?? "";
  const code = (await person.page.locator("#community-code").textContent()) ?? "";
  return { id, code };
}

export async function joinCommunityVia(
  person: Person,
  baseUrl: string,
  code: string,
): Promise<string> {
  await person.page.goto(new URL("/communities", baseUrl).href);
  await person.page.getByLabel("Community code").fill(code);
  await person.page.getByLabel("Community code").press("Enter");
  await person.page.waitForURL(/\/communities\/[^/]+$/);
  return person.page.url().split("/").pop() ?? "";
}

// An HTTP client signed in as this browser person.
export async function httpFor(person: Person, baseUrl: string): Promise<Client> {
  const cookies = await person.context.cookies(baseUrl);
  const device = cookies.find((c) => c.name === "pantry_device")?.value ?? "";
  return client(baseUrl, { headers: { cookie: `pantry_device=${device}`, ...ownAddress() } });
}

export async function openOffers(person: Person, baseUrl: string): Promise<void> {
  await person.page.goto(new URL("/offers", baseUrl).href);
  await streamOpen(person.page);
}

// Three households in one community, each looking at /offers: the offerer
// (with an HTTP client for making offers), a claimer and a bystander.
export async function trio(browser: Browser, baseUrl: string, viewport: Viewport = DESKTOP) {
  const offerer = await startHousehold(browser, baseUrl, {
    name: "Sam",
    household: "Unit 4",
    viewport,
  });
  const claimer = await startHousehold(browser, baseUrl, {
    name: "Quinn",
    household: "House 9",
    viewport,
  });
  const other = await startHousehold(browser, baseUrl, {
    name: "Priya",
    household: "Flat 2",
    viewport,
  });
  const { code } = await startCommunity(offerer, baseUrl);
  await joinCommunityVia(claimer, baseUrl, code);
  await joinCommunityVia(other, baseUrl, code);
  for (const person of [offerer, claimer, other]) await openOffers(person, baseUrl);
  return { offerer, claimer, other, http: await httpFor(offerer, baseUrl) };
}

// A pantry row on `/`, not the same item's row in the offers rail beside it.
export const pantryRow = (page: Page, name: string) =>
  page.locator("ul.pantry li").filter({ hasText: name });

// An offer row in the feed or rail.
export const feedRow = (page: Page, name: string) =>
  page.locator(".offers-feed .offer").filter({ hasText: name });

// An offerer and a claimer in one community. The offerer sits on `/`; the
// claimer watches `/offers`. With `primed` the offerer's household already has
// a default pickup note (an offer made over HTTP before the page loads), so the
// next Offer is one tap.
export async function offerPair(
  browser: Browser,
  baseUrl: string,
  opts: { viewport?: Viewport; primed?: boolean } = {},
) {
  const { viewport = DESKTOP, primed = false } = opts;
  const offerer = await startHousehold(browser, baseUrl, {
    name: "Sam",
    household: "Unit 4",
    viewport,
  });
  const claimer = await startHousehold(browser, baseUrl, {
    name: "Quinn",
    household: "House 9",
    viewport,
  });
  const { code } = await startCommunity(offerer, baseUrl);
  await joinCommunityVia(claimer, baseUrl, code);
  await openOffers(claimer, baseUrl);
  const http = await httpFor(offerer, baseUrl);
  if (primed) await offerNamed(http, "starter", "Porch, after 5");
  await offerer.page.goto(baseUrl);
  await streamOpen(offerer.page);
  return { offerer, claimer, http };
}
