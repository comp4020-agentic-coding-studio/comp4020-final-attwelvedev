import { randomInt } from "node:crypto";
import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { type Client, client, text } from "./http.ts";

const baseUrl = inject("baseUrl");

async function household(memberName = "Sam", householdName = "Unit 4"): Promise<Client> {
  const me = client(baseUrl);
  await me.post("/households", { householdName, memberName });
  return me;
}

const location = (res: Response): URL => new URL(res.headers.get("location") ?? "", baseUrl);
const doc = (html: string) => new JSDOM(html).window.document;

async function inviteLink(me: Client): Promise<string> {
  const res = await me.post("/household/invite-link");
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toContain("no-store");
  const path = (await res.text()).match(/\/join\/([A-Za-z0-9_-]{22})/)?.[0];
  if (!path) throw new Error("no invite link on the page");
  return path;
}

async function inviteCode(me: Client): Promise<string> {
  const code = doc(await (await me.get("/household")).text()).querySelector("#invite-code");
  return code?.textContent?.trim() ?? "";
}

async function memberListOf(me: Client): Promise<string> {
  return text(await (await me.get("/household")).text());
}

// Each throttle test is its own visitor as far as the join throttle is
// concerned: the suite shares one app and one IP, so it never counts failures
// against the default key.
const ownAddress = () => ({
  "fly-client-ip": `10.${randomInt(256)}.${randomInt(256)}.${randomInt(256)}`,
});

describe("joining by invite link", () => {
  it("lets a second person join through a link and see the household", async () => {
    const sam = await household("Sam", "Link house");
    await sam.post("/items", { name: "milk" });
    const path = await inviteLink(sam);

    const alex = client(baseUrl, { headers: ownAddress() });
    const preview = await alex.get(path);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("cache-control")).toContain("no-store");
    expect(text(await preview.text())).toContain("Link house");

    const joined = await alex.post(`${path}/accept`, { memberName: "Alex" });
    expect(joined.status).toBe(303);
    expect(location(joined).pathname).toBe("/");
    expect(alex.cookie("pantry_device")).toBeTruthy();

    expect(await (await alex.get("/")).text()).toContain("milk");
    expect(await memberListOf(sam)).toContain("Alex");
  });

  it("answers 404 to an unknown or malformed link, on GET and on accept", async () => {
    const stranger = client(baseUrl, { headers: ownAddress() });
    for (const path of ["/join/AAAAAAAAAAAAAAAAAAAAAA", "/join/short", "/join/%00%00"]) {
      expect((await stranger.get(path)).status).toBe(404);
      expect((await stranger.post(`${path}/accept`, { memberName: "Alex" })).status).toBe(404);
    }
    expect(stranger.cookie("pantry_device")).toBeUndefined();
  });

  it("re-renders the form with 400 for a blank name, and joins nobody", async () => {
    const sam = await household();
    const path = await inviteLink(sam);
    const alex = client(baseUrl);
    const res = await alex.post(`${path}/accept`, { memberName: "   " });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('role="alert"');
    expect(html).toContain('name="memberName"');
    expect(alex.cookie("pantry_device")).toBeUndefined();
    expect(await memberListOf(sam)).not.toMatch(/Members\s*\(2\)/);
  });

  it("tells a signed-in device it is already in a household, without a form or a join", async () => {
    const sam = await household("Sam", "Home one");
    const other = await household("Zed", "Home two");
    const path = await inviteLink(other);

    const res = await sam.get(path);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(text(html)).toContain("You're already in Home one");
    expect(html).not.toContain('name="memberName"');

    expect((await sam.post(`${path}/accept`, { memberName: "Sam again" })).status).toBe(409);
    expect(await memberListOf(other)).not.toContain("Sam again");
  });
});

describe("joining by code", () => {
  it("joins through the code on /join, in any case", async () => {
    const sam = await household("Sam", "Code house");
    const code = await inviteCode(sam);
    expect(code).toMatch(/^[A-Z]+-\d{2}$/);

    const alex = client(baseUrl, { headers: ownAddress() });
    expect((await alex.get("/join")).status).toBe(200);
    const res = await alex.post("/join/code", { code: code.toLowerCase(), memberName: "Alex" });
    expect(res.status).toBe(303);
    expect(location(res).pathname).toBe("/");
    expect(await memberListOf(sam)).toContain("Alex");
  });

  it("rejects a wrong code with 400 and an alert, setting no cookie", async () => {
    const alex = client(baseUrl, { headers: ownAddress() });
    const res = await alex.post("/join/code", { code: "NOPE-00", memberName: "Alex" });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('role="alert"');
    expect(alex.cookie("pantry_device")).toBeUndefined();
  });

  it("rejects a blank name with 400 and the form again", async () => {
    const sam = await household();
    const alex = client(baseUrl);
    const res = await alex.post("/join/code", { code: await inviteCode(sam), memberName: " " });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('name="code"');
  });

  it("refuses a signed-in device with 409", async () => {
    const sam = await household();
    const other = await household("Zed");
    const res = await sam.post("/join/code", { code: await inviteCode(other), memberName: "Sam" });
    expect(res.status).toBe(409);
  });

  it("throttles failed joins per client: the 11th is 429 even with the right code", async () => {
    const sam = await household();
    const code = await inviteCode(sam);
    const guesser = client(baseUrl, { headers: ownAddress() });
    for (let i = 0; i < 10; i++) {
      expect(
        (await guesser.post("/join/code", { code: `NOPE-${i}`, memberName: "X" })).status,
      ).toBe(400);
    }
    const blocked = await guesser.post("/join/code", { code, memberName: "X" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("60");

    const honest = client(baseUrl, { headers: ownAddress() });
    expect((await honest.post("/join/code", { code, memberName: "Honest" })).status).toBe(303);
  });
});

describe("the household page", () => {
  it("lists members, the invite code and the way to add a device", async () => {
    const sam = await household("Sam", "Page house");
    const res = await sam.get("/household");
    expect(res.status).toBe(200);
    const page = text(await res.text());
    expect(page).toContain("Page house");
    expect(page).toContain("Sam");
    expect(page).toMatch(/Leave/);
    expect((await sam.get("/household")).headers.get("content-type")).toContain("text/html");
  });

  it("is for members only: no session goes to /", async () => {
    for (const path of ["/household", "/household/devices"]) {
      const res = await client(baseUrl).get(path);
      expect(res.status).toBe(303);
      expect(location(res).pathname).toBe("/");
    }
  });
});

describe("removing and leaving", () => {
  async function pair() {
    const sam = await household("Sam", "Pair house");
    const path = await inviteLink(sam);
    const alex = client(baseUrl, { headers: ownAddress() });
    await alex.post(`${path}/accept`, { memberName: "Alex" });
    return { sam, alex, path };
  }

  const removeActions = (html: string) =>
    [...html.matchAll(/\/household\/members\/([^/"]+)\/remove/g)].map((m) => m[1]);

  it("signs a removed member out at once, and keeps their history as a former member", async () => {
    const { sam, alex } = await pair();
    await alex.post("/items", { name: "milk" });
    const html = await (await alex.get("/")).text();
    const id = html.match(/\/items\/([^/"]+)\/outcome/)?.[1] ?? "";
    await alex.post(`/items/${id}/outcome`, { outcome: "used" });

    const page = await (await sam.get("/household")).text();
    expect(removeActions(page)).toHaveLength(1);
    expect(page).toContain('action="/household/leave"');
    const res = await sam.post(`/household/members/${removeActions(page)[0]}/remove`);
    expect(res.status).toBe(303);
    expect(location(res).pathname).toBe("/household");

    expect(await (await alex.get("/")).text()).toMatch(/<form[^>]*action="\/households"/);
    await alex.post("/items", { name: "ghost" });
    expect(await (await sam.get("/")).text()).not.toContain("ghost");
    expect(await memberListOf(sam)).not.toContain("Alex");
    expect(text(await (await sam.get("/history")).text())).toContain("by a former member");
  });

  it("answers 404 to an unknown member id, or one from another household", async () => {
    const { sam } = await pair();
    const { sam: samElsewhere, alex: alexElsewhere } = await pair();
    const elsewhereId = removeActions(await (await samElsewhere.get("/household")).text())[0];

    expect((await sam.post("/household/members/nope/remove")).status).toBe(404);
    expect((await sam.post(`/household/members/${elsewhereId}/remove`)).status).toBe(404);
    expect(await memberListOf(samElsewhere)).toContain("Alex");
    expect((await alexElsewhere.get("/")).status).toBe(200);
    expect(await (await alexElsewhere.get("/")).text()).not.toMatch(
      /<form[^>]*action="\/households"/,
    );
  });

  it("lets a member leave: cookie cleared, the others keep the items", async () => {
    const { sam, alex } = await pair();
    await sam.post("/items", { name: "eggs" });
    const res = await alex.post("/household/leave");
    expect(res.status).toBe(303);
    expect(location(res).pathname).toBe("/");
    expect(alex.cookie("pantry_device")).toBeUndefined();
    expect(await memberListOf(sam)).not.toContain("Alex");
    expect(await (await sam.get("/")).text()).toContain("eggs");
  });

  it("deletes the household when its last member leaves", async () => {
    const sam = await household("Sam", "Doomed house");
    const code = await inviteCode(sam);
    const path = await inviteLink(sam);
    const oldCookie = sam.cookie("pantry_device") ?? "";
    expect((await sam.post("/household/leave")).status).toBe(303);

    const later = client(baseUrl, { headers: ownAddress() });
    expect((await later.post("/join/code", { code, memberName: "Late" })).status).toBe(400);
    expect((await later.get(path)).status).toBe(404);
    const res = await fetch(new URL("/", baseUrl), {
      headers: { cookie: `pantry_device=${oldCookie}` },
    });
    expect(await res.text()).toMatch(/<form[^>]*action="\/households"/);
  });
});

describe("adding a device", () => {
  it("signs a second device in as the same member, once", async () => {
    const sam = await household("Sam", "Device house");
    const res = await sam.post("/household/device-link");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const html = await res.text();
    const path = html.match(/\/device\/([A-Za-z0-9_-]{22,})/)?.[0] ?? "";
    expect(path).not.toBe("");
    expect(html).toContain("<svg");

    const phone = client(baseUrl, { headers: ownAddress() });
    const preview = await phone.get(path);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("cache-control")).toContain("no-store");
    expect(await (await phone.get("/")).text()).toMatch(/<form[^>]*action="\/households"/); // GET signs nobody in

    const accepted = await phone.post(`${path}/accept`);
    expect(accepted.status).toBe(303);
    expect(phone.cookie("pantry_device")).toBeTruthy();
    expect(await (await phone.get("/")).text()).toContain("Device house");
    const members = doc(await (await sam.get("/household")).text()).querySelectorAll("#members li");
    expect(members).toHaveLength(1);

    const again = client(baseUrl, { headers: ownAddress() });
    expect((await again.post(`${path}/accept`)).status).toBe(404);
  });

  it("refuses a signed-in device with 409, and shows the devices page", async () => {
    const sam = await household();
    const other = await household("Zed");
    const path = (await (await other.post("/household/device-link")).text()).match(
      /\/device\/[A-Za-z0-9_-]{22,}/,
    )?.[0];
    expect((await sam.post(`${path}/accept`)).status).toBe(409);
    expect((await sam.get("/household/devices")).status).toBe(200);
    expect((await client(baseUrl).get("/device/AAAAAAAAAAAAAAAAAAAAAA")).status).toBe(404);
  });
});
