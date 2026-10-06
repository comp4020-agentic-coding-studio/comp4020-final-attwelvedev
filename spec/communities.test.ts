import { describe, expect, inject, it } from "vitest";
import { client, text, withoutScripts } from "./http.ts";
import { createCommunity, joinCommunityByCode, newHousehold, ownAddress } from "./neighbours.ts";
import { type Frame, openStream } from "./sse.ts";

const baseUrl = inject("baseUrl");
const open = (me: { cookie(name: string): string | undefined }) =>
  openStream(baseUrl, me.cookie("pantry_device"));

// a frame that must have arrived: a timeout fails the spec here, not later on a null
function got(frame: Frame | null): Frame {
  if (!frame) throw new Error("expected an event, but none arrived in time");
  return frame;
}

describe("creating and joining by code", () => {
  it("creates a community, shows its code, and lists households by name only", async () => {
    const sam = await newHousehold(baseUrl, "Unit 4", "Sam");
    const res = await sam.post("/communities/create", { name: "Elm Street" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/^\/communities\/[^/]+$/);

    const { id, code } = await createCommunity(sam, "Elm Street");
    expect(code).toMatch(/^[A-Z]+-\d{2}$/);

    const priya = await newHousehold(baseUrl, "Flat 2", "Priya");
    const join = await joinCommunityByCode(priya, code.toLowerCase());
    expect(join.status).toBe(303);
    expect(join.headers.get("location")).toBe(`/communities/${id}`);

    for (const me of [sam, priya]) {
      const page = await (await me.get(`/communities/${id}`)).text();
      const body = text(page);
      expect(body).toContain("Unit 4");
      expect(body).toContain("Flat 2");
      const markup = withoutScripts(page); // text and island props, not the bootstrap code
      expect(markup).not.toContain("Sam");
      expect(markup).not.toContain("Priya");
    }
  });

  it("shows a clash with a suffix", async () => {
    const first = await newHousehold(baseUrl, "Unit 4");
    const { id, code } = await createCommunity(first);
    const second = await newHousehold(baseUrl, "Unit 4");
    await joinCommunityByCode(second, code);
    expect(text(await (await first.get(`/communities/${id}`)).text())).toContain("Unit 4 · 2");
  });
});

describe("joining by link", () => {
  it("mints a link shown once, works twice, and a bogus token is 404", async () => {
    const sam = await newHousehold(baseUrl, "Unit 4");
    const { id } = await createCommunity(sam);

    const minted = await sam.post(`/communities/${id}/join-link`);
    expect(minted.status).toBe(200);
    expect(minted.headers.get("cache-control")).toContain("no-store");
    const path = (await minted.text()).match(/\/communities\/join\/[A-Za-z0-9_-]{22}/)?.[0] ?? "";
    expect(path).not.toBe("");
    expect((await (await sam.get(`/communities/${id}`)).text()).includes(path)).toBe(false);

    for (const name of ["Flat 2", "Flat 3"]) {
      const guest = await newHousehold(baseUrl, name);
      const confirm = await guest.get(path);
      expect(confirm.status).toBe(200);
      expect(text(await confirm.text())).toContain("Elm Street");
      const accepted = await guest.post(`${path}/accept`);
      expect(accepted.status).toBe(303);
      expect(accepted.headers.get("location")).toBe(`/communities/${id}`);
    }

    const stranger = await newHousehold(baseUrl, "Flat 4");
    expect((await stranger.get("/communities/join/bogus-token")).status).toBe(404);
    expect((await stranger.post("/communities/join/bogus-token/accept")).status).toBe(404);
  });

  it("asks a visitor with no household to start one first", async () => {
    const sam = await newHousehold(baseUrl);
    const { id } = await createCommunity(sam);
    const path =
      (await (await sam.post(`/communities/${id}/join-link`)).text()).match(
        /\/communities\/join\/[A-Za-z0-9_-]{22}/,
      )?.[0] ?? "";
    const visitor = client(baseUrl, { headers: ownAddress() });
    const res = await visitor.get(path);
    expect(res.status).toBe(200);
    expect(text(await res.text())).toContain("Start a household first");
  });
});

describe("creator controls and succession", () => {
  async function pair() {
    const sam = await newHousehold(baseUrl, "Unit 4");
    const { id, code } = await createCommunity(sam);
    const priya = await newHousehold(baseUrl, "Flat 2");
    await joinCommunityByCode(priya, code);
    return { sam, priya, id, code };
  }
  const removePath = (html: string) =>
    html.match(/\/communities\/[^/"]+\/households\/[^/"]+\/remove/)?.[0] ?? "";

  it("lets the creator remove a household and refuses a non-creator", async () => {
    const { sam, priya, id } = await pair();
    expect(removePath(await (await priya.get(`/communities/${id}`)).text())).toBe("");
    const path = removePath(await (await sam.get(`/communities/${id}`)).text());
    expect(path).not.toBe("");

    // the page's own Remove path, posted by the household it would remove
    expect((await priya.post(path)).status).toBe(403);

    expect((await sam.post(path)).status).toBe(303);
    expect((await priya.get(`/communities/${id}`)).status).toBe(404);
  });

  it("offers Remove to the other household once the creator leaves", async () => {
    const { sam, priya, id } = await pair();
    expect(removePath(await (await priya.get(`/communities/${id}`)).text())).toBe("");
    const left = await sam.post(`/communities/${id}/leave`);
    expect(left.status).toBe(303);
    expect(left.headers.get("location")).toBe("/communities");
    // Priya is now the only household, so add a third for her to remove
    const flat3 = await newHousehold(baseUrl, "Flat 3");
    const html = await (await priya.get(`/communities/${id}`)).text();
    const code = html.match(/id="community-code"[^>]*>([^<]+)</)?.[1] ?? "";
    await joinCommunityByCode(flat3, code);
    expect(removePath(await (await priya.get(`/communities/${id}`)).text())).not.toBe("");
  });

  it("keeps one community when a household leaves the other", async () => {
    const sam = await newHousehold(baseUrl, "Unit 4");
    const elm = await createCommunity(sam, "Elm Street");
    const oak = await createCommunity(sam, "Oak Lane");
    await sam.post(`/communities/${elm.id}/leave`);
    const list = text(await (await sam.get("/communities")).text());
    expect(list).toContain("Oak Lane");
    expect(list).not.toContain("Elm Street");
    expect((await sam.get(`/communities/${oak.id}`)).status).toBe(200);
  });
});

describe("without a session", () => {
  it("sends pages and endpoints back to /", async () => {
    const visitor = client(baseUrl, { headers: ownAddress() });
    for (const path of ["/communities", "/communities/x"]) {
      const res = await visitor.get(path);
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe("/");
    }
    for (const path of [
      "/communities/create",
      "/communities/join/code",
      "/communities/x/join-link",
      "/communities/x/leave",
      "/communities/x/households/y/remove",
    ]) {
      const res = await visitor.post(path);
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe("/");
    }
  });
});

describe("the event stream follows communities", () => {
  it("tells a member of a join, and tells a joiner about a later leave, on one stream", async () => {
    const sam = await newHousehold(baseUrl, "Unit 4");
    const { id, code } = await createCommunity(sam);
    const priya = await newHousehold(baseUrl, "Flat 2");
    const [samStream, priyaStream] = await Promise.all([open(sam), open(priya)]);

    const started = Date.now();
    await joinCommunityByCode(priya, code);
    const heard = got(await samStream.nextOfType("community.householdJoined", 1000));
    expect(Date.now() - started).toBeLessThan(1000);
    expect(heard.data).toMatchObject({ communityId: id, household: { displayName: "Flat 2" } });
    expect(got(await priyaStream.nextOfType("membership.joined", 1000)).data).toMatchObject({
      community: { id, name: "Elm Street" },
    });

    await sam.post(`/communities/${id}/leave`);
    const left = got(await priyaStream.nextOfType("community.householdLeft", 1000));
    expect(left.data).toMatchObject({ communityId: id });
    expect((left.data as { creatorHouseholdId: string }).creatorHouseholdId).toBeTruthy();
    samStream.close();
    priyaStream.close();
  });

  it("stops telling a household about a community it was removed from", async () => {
    const sam = await newHousehold(baseUrl, "Unit 4");
    const { id, code } = await createCommunity(sam);
    const priya = await newHousehold(baseUrl, "Flat 2");
    await joinCommunityByCode(priya, code);
    const priyaStream = await open(priya);

    const path = (await (await sam.get(`/communities/${id}`)).text()).match(
      /\/communities\/[^/"]+\/households\/[^/"]+\/remove/,
    )?.[0];
    await sam.post(path ?? "");
    got(await priyaStream.nextOfType("membership.left", 1000));

    const flat3 = await newHousehold(baseUrl, "Flat 3");
    await joinCommunityByCode(flat3, code);
    expect(await priyaStream.nextOfType("community.householdJoined", 700)).toBeNull();
    priyaStream.close();
  });
});
