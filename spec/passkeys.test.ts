import { randomInt } from "node:crypto";
import { describe, expect, inject, it } from "vitest";
import { type Client, client } from "./http.ts";

const baseUrl = inject("baseUrl");
const ownAddress = () => ({
  "fly-client-ip": `10.${randomInt(256)}.${randomInt(256)}.${randomInt(256)}`,
});

const visitor = () => client(baseUrl, { headers: ownAddress() });

async function member(): Promise<Client> {
  const me = visitor();
  await me.post("/households", { householdName: "Unit 4", memberName: "Sam" });
  return me;
}

const garbage = { id: "not-a-credential", rawId: "not-a-credential", type: "public-key" };

describe("passkey endpoints without a session", () => {
  it.each([
    "/passkey/register/options",
    "/passkey/register/verify",
    "/passkey/some-credential/remove",
  ])("answer 401 to POST %s", async (path) => {
    const res = await visitor().postJson(path, {}, { accept: "application/json" });
    expect(res.status).toBe(401);
  });
});

describe("POST /passkey/signin/options", () => {
  it("names no credential, member or household", async () => {
    const res = await visitor().postJson("/passkey/signin/options");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(JSON.parse(body).allowCredentials ?? []).toEqual([]);
    expect(body).not.toMatch(/Sam|Unit 4/);
  });

  it("is 409 once this device is signed in", async () => {
    const me = await member();
    expect((await me.postJson("/passkey/signin/options")).status).toBe(409);
  });
});

describe("POST /passkey/signin/verify", () => {
  it("answers garbage and an unknown credential with the same 400", async () => {
    const a = visitor();
    await a.postJson("/passkey/signin/options");
    const unknown = await a.postJson("/passkey/signin/verify", garbage);
    const b = visitor();
    const noChallenge = await b.postJson("/passkey/signin/verify", { nonsense: true });
    expect(unknown.status).toBe(400);
    expect(noChallenge.status).toBe(400);
    expect(await unknown.text()).toBe(await noChallenge.text());
  });

  it("is 409 once this device is signed in", async () => {
    const me = await member();
    expect((await me.postJson("/passkey/signin/verify", garbage)).status).toBe(409);
  });

  it("answers 429 with Retry-After after ten failures from one address", async () => {
    const guesser = visitor();
    for (let i = 0; i < 10; i++) {
      expect((await guesser.postJson("/passkey/signin/verify", garbage)).status).toBe(400);
    }
    const blocked = await guesser.postJson("/passkey/signin/verify", garbage);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("60");
  });
});

describe("POST /passkey/register/verify", () => {
  it("is 400 with no challenge in hand", async () => {
    const me = await member();
    expect((await me.postJson("/passkey/register/verify", garbage)).status).toBe(400);
  });

  it("is 400 for a challenge that was already used", async () => {
    const me = await member();
    expect((await me.postJson("/passkey/register/options")).status).toBe(200);
    expect((await me.postJson("/passkey/register/verify", garbage)).status).toBe(400);
    expect((await me.postJson("/passkey/register/verify", garbage)).status).toBe(400);
  });
});
