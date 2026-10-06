import { randomInt } from "node:crypto";
import { type Client, client } from "./http.ts";

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
