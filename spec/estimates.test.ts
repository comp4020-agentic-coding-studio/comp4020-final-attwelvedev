import { describe, expect, inject, it } from "vitest";
import { newHousehold } from "./neighbours.ts";

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
