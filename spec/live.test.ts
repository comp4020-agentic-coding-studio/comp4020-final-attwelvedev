import { randomInt } from "node:crypto";
import { describe, expect, inject, it } from "vitest";
import { type Client, client } from "./http.ts";
import { type Frame, openStream } from "./sse.ts";

const baseUrl = inject("baseUrl");
const JSON_HEADERS = { accept: "application/json" };
const ownAddress = () => ({
  "fly-client-ip": `10.${randomInt(256)}.${randomInt(256)}.${randomInt(256)}`,
});

async function household(memberName = "Sam"): Promise<Client> {
  const me = client(baseUrl, { headers: ownAddress() });
  await me.post("/households", { householdName: "Unit 4", memberName });
  return me;
}

async function inviteInto(host: Client, memberName: string): Promise<Client> {
  const html = await (await host.post("/household/invite-link")).text();
  const path = html.match(/\/join\/[A-Za-z0-9_-]{22}/)?.[0] ?? "";
  const guest = client(baseUrl, { headers: ownAddress() });
  await guest.post(`${path}/accept`, { memberName });
  return guest;
}

// a frame that must have arrived: a timeout fails the spec here, not later on a null
function got(frame: Frame | null): Frame {
  if (!frame) throw new Error("expected an event, but none arrived in time");
  return frame;
}

const open = (me: Client) => openStream(baseUrl, me.cookie("pantry_device"));
const idOf = async (me: Client, name: string) => {
  const html = await (await me.get("/")).text();
  const row = html.split("<li").find((chunk) => chunk.includes(`>${name}`));
  return row?.match(/\/items\/([^/"]+)\/outcome/)?.[1] ?? "";
};

describe("GET /events", () => {
  it("is 401 without a session and with a garbage cookie", async () => {
    expect((await fetch(new URL("/events", baseUrl))).status).toBe(401);
    const res = await fetch(new URL("/events", baseUrl), {
      headers: { cookie: "pantry_device=garbage" },
    });
    expect(res.status).toBe(401);
  });

  it("is an event stream that proxies must not buffer", async () => {
    const me = await household();
    const stream = await open(me);
    expect(stream.response.status).toBe(200);
    expect(stream.response.headers.get("content-type")).toContain("text/event-stream");
    expect(stream.response.headers.get("cache-control")).toContain("no-cache");
    expect(stream.response.headers.get("x-accel-buffering")).toBe("no");
    stream.close();
  });
});

describe("live updates", () => {
  it("delivers a housemate's add within 1000 ms, named, and nothing to another household", async () => {
    const sam = await household("Sam");
    const alex = await inviteInto(sam, "Alex");
    const stranger = await household("Zed");
    const samStream = await open(sam);
    const zedStream = await open(stranger);

    const started = Date.now();
    await alex.post("/items", { name: "milk" });
    const frame = await samStream.nextOfType("item.added", 1000);
    expect(frame).not.toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
    expect((got(frame).data.by as { name: string }).name).toBe("Alex");
    expect((got(frame).data.item as { name: string }).name).toBe("milk");

    // A has heard it, so the stranger's silence means something
    expect(await zedStream.next(300)).toBeNull();
    samStream.close();
    zedStream.close();
  });

  it("publishes Used as item.removed and undo as item.restored (form requests too)", async () => {
    const sam = await household("Sam");
    const alex = await inviteInto(sam, "Alex");
    await alex.post("/items", { name: "milk" });
    const id = await idOf(alex, "milk");
    const stream = await open(sam);

    const used = await alex.post(`/items/${id}/outcome`, { outcome: "binned" });
    const historyId = new URL(used.headers.get("location") ?? "", baseUrl).searchParams.get("undo");
    const removed = await stream.nextOfType("item.removed", 1000);
    expect(got(removed).data).toMatchObject({
      itemId: id,
      itemName: "milk",
      outcome: "binned",
      historyId,
      by: { name: "Alex" },
    });

    await alex.post(`/history/${historyId}/undo`);
    const restored = await stream.nextOfType("item.restored", 1000);
    expect((got(restored).data.item as { id: string }).id).toBe(id);
    stream.close();
  });

  it("puts a valid rid in the event and drops an invalid one", async () => {
    const sam = await household("Sam");
    const alex = await inviteInto(sam, "Alex");
    const stream = await open(sam);
    await alex.post("/items", { name: "milk", rid: "rid-1" }, JSON_HEADERS);
    expect((await stream.nextOfType("item.added", 1000))?.data.rid).toBe("rid-1");
    await alex.post("/items", { name: "eggs", rid: "bad rid" }, JSON_HEADERS);
    const second = await stream.nextOfType("item.added", 1000);
    expect(second?.data.rid).toBeUndefined();
    stream.close();
  });

  it("announces a join to the household only", async () => {
    const sam = await household("Sam");
    const stranger = await household("Zed");
    const samStream = await open(sam);
    const zedStream = await open(stranger);
    await inviteInto(sam, "Alex");
    const joined = await samStream.nextOfType("member.joined", 1000);
    expect((got(joined).data.member as { name: string }).name).toBe("Alex");
    expect(await zedStream.next(300)).toBeNull();
    samStream.close();
    zedStream.close();
  });

  it("announces a removal, and ends the removed member's own stream", async () => {
    const sam = await household("Sam");
    const alex = await inviteInto(sam, "Alex");
    const samStream = await open(sam);
    const alexStream = await open(alex);
    const page = await (await sam.get("/household")).text();
    const alexId = page.match(/\/household\/members\/([^/"]+)\/remove/)?.[1] ?? "";

    await sam.post(`/household/members/${alexId}/remove`);
    const removed = await samStream.nextOfType("member.removed", 1000);
    expect(got(removed).data).toMatchObject({
      member: { id: alexId, name: "Alex" },
      by: { name: "Sam" },
    });
    expect((await alexStream.nextOfType("member.removed", 1000))?.event).toBe("member.removed");
    expect(await alexStream.ended(1000)).toBe(true);

    // and Alex can't come back in on the old cookie
    expect(
      (
        await fetch(new URL("/events", baseUrl), {
          headers: { cookie: `pantry_device=${alex.cookie("pantry_device")}` },
        })
      ).status,
    ).toBe(401);
    samStream.close();
  });

  it("announces a leave the same way", async () => {
    const sam = await household("Sam");
    const alex = await inviteInto(sam, "Alex");
    const samStream = await open(sam);
    await alex.post("/household/leave");
    const left = await samStream.nextOfType("member.removed", 1000);
    expect(left?.data).toMatchObject({ member: { name: "Alex" }, by: { name: "Alex" } });
    samStream.close();
  });

  it("keeps working after a client aborts its stream", async () => {
    const sam = await household("Sam");
    const stream = await open(sam);
    stream.close();
    const res = await sam.post("/items", { name: "milk" }, JSON_HEADERS);
    expect(res.status).toBe(201);
    const again = await open(sam);
    await sam.post("/items", { name: "eggs" }, JSON_HEADERS);
    expect((await again.nextOfType("item.added", 1000))?.data.item).toMatchObject({ name: "eggs" });
    again.close();
  });
});
