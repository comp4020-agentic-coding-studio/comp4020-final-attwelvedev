import { describe, expect, inject, it } from "vitest";
import { type Client, client } from "./http.ts";
import { newHousehold, openStreamFor, ownAddress } from "./neighbours.ts";

const baseUrl = inject("baseUrl");
const JSON_HEADERS = { accept: "application/json" };
const DAY_MS = 24 * 60 * 60 * 1000;

interface PantryItem {
  id: string;
  measure: string;
  category: string;
  iconKey: string | null;
  fillStop: number;
  count: number;
  estimatedExpiry: string | null;
  exactExpiry: string | null;
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS);
const utcDate = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);

describe("an item added with a guess", () => {
  it("is guessed from its name, counted from the viewer's today, and listed with its fields", async () => {
    const me = await newHousehold(baseUrl);
    const today = utcDate();
    const res = await me.post("/items", { name: "milk", today }, JSON_HEADERS);
    expect(res.status).toBe(201);
    const { item } = (await res.json()) as { item: PantryItem };
    expect(item.measure).toBe("fill");
    expect(item.fillStop).toBe(4);
    expect(item.estimatedExpiry).not.toBeNull();
    expect(daysBetween(item.estimatedExpiry as string, today)).toBeGreaterThan(0);

    const api = (await (await me.get("/api/pantry", JSON_HEADERS)).json()) as {
      items: PantryItem[];
    };
    expect(api.items.find((i) => i.id === item.id)).toEqual(item);
  });

  it("ignores a today that is nowhere near the server's date", async () => {
    const me = await newHousehold(baseUrl);
    const withToday = await (
      await me.post("/items", { name: "milk", today: "1999-01-01" }, JSON_HEADERS)
    ).json();
    const reference = await (await me.post("/items", { name: "milk" }, JSON_HEADERS)).json();
    const estimate = (withToday as { item: PantryItem }).item.estimatedExpiry as string;
    const baseline = (reference as { item: PantryItem }).item.estimatedExpiry as string;
    expect(Math.abs(daysBetween(estimate, baseline))).toBeLessThanOrEqual(1);
    expect(estimate > "2000-01-01").toBe(true); // 1999 + shelf life would not be
  });

  it("treats an unknown food as Have with no estimate", async () => {
    const me = await newHousehold(baseUrl);
    const { item } = (await (
      await me.post("/items", { name: "mystery thing" }, JSON_HEADERS)
    ).json()) as { item: PantryItem };
    expect(item.measure).toBe("have");
    expect(item.estimatedExpiry).toBeNull();
  });
});

interface WrittenItem extends PantryItem {
  valueSetBy: string | null;
  valueSetAt: number | null;
  expirySetBy: string | null;
  exactAmount: number | null;
}

async function addNamed(me: Client, name: string): Promise<string> {
  const res = await me.post("/items", { name }, JSON_HEADERS);
  return ((await res.json()) as { item: { id: string } }).item.id;
}

async function meId(me: Client): Promise<string> {
  const snap = (await (await me.get("/api/pantry", JSON_HEADERS)).json()) as { me: { id: string } };
  return snap.me.id;
}

async function pantryItem(me: Client, id: string): Promise<WrittenItem> {
  const api = (await (await me.get("/api/pantry", JSON_HEADERS)).json()) as {
    items: WrittenItem[];
  };
  return api.items.find((i) => i.id === id) as WrittenItem;
}

async function inviteInto(host: Client, memberName: string): Promise<Client> {
  const html = await (await host.post("/household/invite-link")).text();
  const path = html.match(/\/join\/[A-Za-z0-9_-]{22}/)?.[0] ?? "";
  const guest = client(baseUrl, { headers: ownAddress() });
  await guest.post(`${path}/accept`, { memberName });
  return guest;
}

describe("writing an item's value, measure and expiry", () => {
  it("sets a fill stop, stamped with the caller, and /api/pantry agrees", async () => {
    const me = await newHousehold(baseUrl);
    const id = await addNamed(me, "milk");
    const res = await me.post(`/items/${id}/value`, { fillStop: "2" }, JSON_HEADERS);
    expect(res.status).toBe(200);
    const { item } = (await res.json()) as { item: WrittenItem };
    expect(item.fillStop).toBe(2);
    expect(item.valueSetBy).toBe(await meId(me));
    expect(await pantryItem(me, id)).toEqual(item);
  });

  it("refuses the wrong measure, a bad stop, an unknown id and another household's item", async () => {
    const me = await newHousehold(baseUrl);
    const milk = await addNamed(me, "milk");
    const odd = await addNamed(me, "mystery thing");
    expect((await me.post(`/items/${milk}/value`, { count: "3" }, JSON_HEADERS)).status).toBe(400);
    expect((await me.post(`/items/${odd}/value`, { fillStop: "1" }, JSON_HEADERS)).status).toBe(
      400,
    );
    expect((await me.post(`/items/${milk}/value`, { fillStop: "9" }, JSON_HEADERS)).status).toBe(
      400,
    );
    expect((await me.post("/items/nope/value", { fillStop: "1" }, JSON_HEADERS)).status).toBe(404);
    const stranger = await newHousehold(baseUrl);
    expect(
      (await stranger.post(`/items/${milk}/value`, { fillStop: "1" }, JSON_HEADERS)).status,
    ).toBe(404);
    const nobody = client(baseUrl, { headers: ownAddress() });
    const res = await nobody.post(`/items/${milk}/value`, { fillStop: "1" }, JSON_HEADERS);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: expect.any(String) });
  });

  it("sets a bucket from the viewer's today, an exact date, and clears the date", async () => {
    const me = await newHousehold(baseUrl);
    const id = await addNamed(me, "milk");
    const today = utcDate();
    const bucket = (await (
      await me.post(`/items/${id}/expiry`, { bucket: "use-soon", today }, JSON_HEADERS)
    ).json()) as { item: WrittenItem };
    expect(bucket.item.estimatedExpiry).toBe(utcDate(2));
    const dated = (await (
      await me.post(`/items/${id}/expiry`, { date: "2026-12-25" }, JSON_HEADERS)
    ).json()) as { item: WrittenItem };
    expect(dated.item.exactExpiry).toBe("2026-12-25");
    expect(dated.item.estimatedExpiry).toBe(utcDate(2));
    const cleared = (await (
      await me.post(`/items/${id}/expiry`, { clearDate: "1" }, JSON_HEADERS)
    ).json()) as { item: WrittenItem };
    expect(cleared.item.exactExpiry).toBeNull();
    expect((await me.post(`/items/${id}/expiry`, { bucket: "past" }, JSON_HEADERS)).status).toBe(
      400,
    );
  });

  it("changes the measure and stamps it", async () => {
    const me = await newHousehold(baseUrl);
    const id = await addNamed(me, "milk");
    const { item } = (await (
      await me.post(`/items/${id}/measure`, { measure: "count" }, JSON_HEADERS)
    ).json()) as { item: WrittenItem };
    expect(item.measure).toBe("count");
    expect(item.valueSetBy).toBe(await meId(me));
  });

  it("tells a housemate within a second, by name, and a stranger nothing", async () => {
    const sam = await newHousehold(baseUrl, "Unit 4", "Sam");
    const alex = await inviteInto(sam, "Alex");
    const id = await addNamed(sam, "milk");
    const stranger = await newHousehold(baseUrl);
    const samStream = await openStreamFor(baseUrl, sam);
    const strangerStream = await openStreamFor(baseUrl, stranger);
    try {
      const started = Date.now();
      await alex.post(`/items/${id}/value`, { fillStop: "1" }, JSON_HEADERS);
      const frame = await samStream.nextOfType("item.updated", 1000);
      expect(frame).not.toBeNull();
      expect(Date.now() - started).toBeLessThan(1000);
      const data = frame?.data as { by: { name: string }; item: WrittenItem };
      expect(data.by.name).toBe("Alex");
      expect(data.item).toMatchObject({ id, fillStop: 1 });
      expect(await strangerStream.nextOfType("item.updated", 300)).toBeNull();
    } finally {
      samStream.close();
      strangerStream.close();
    }
  });

  it("lets the latest write win over HTTP", async () => {
    const sam = await newHousehold(baseUrl, "Unit 4", "Sam");
    const alex = await inviteInto(sam, "Alex");
    const id = await addNamed(sam, "milk");
    await alex.post(`/items/${id}/value`, { fillStop: "3" }, JSON_HEADERS);
    await sam.post(`/items/${id}/value`, { fillStop: "1" }, JSON_HEADERS);
    const item = await pantryItem(sam, id);
    expect(item.fillStop).toBe(1);
    expect(item.valueSetBy).toBe(await meId(sam));
  });

  it("refuses writes to an item that has been used", async () => {
    const me = await newHousehold(baseUrl);
    const id = await addNamed(me, "milk");
    await me.post(`/items/${id}/outcome`, { outcome: "used" }, JSON_HEADERS);
    expect((await me.post(`/items/${id}/value`, { fillStop: "1" }, JSON_HEADERS)).status).toBe(404);
    expect((await me.post(`/items/${id}/measure`, { measure: "have" }, JSON_HEADERS)).status).toBe(
      404,
    );
  });
});
