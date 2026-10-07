import { localToday } from "../src/components/pantryView.ts";
import { addDays } from "../src/lib/expiry.ts";
import type { Client } from "./http.ts";

// Items made over HTTP, so a browser spec starts from a known pantry without
// typing each one. Dates are the browser's own "today" plus an offset.
const JSON_ACCEPT = { accept: "application/json" };

export const daysFromToday = (days: number): string => addDays(localToday(), days);

export async function makeItem(
  http: Client,
  name: string,
  opts: { days?: number } = {},
): Promise<string> {
  const res = await http.post("/items", { name }, JSON_ACCEPT);
  if (res.status !== 201) throw new Error(`adding ${name} gave ${res.status}`);
  const { item } = (await res.json()) as { item: { id: string } };
  if (opts.days !== undefined) {
    const set = await http.post(
      `/items/${item.id}/expiry`,
      { date: daysFromToday(opts.days) },
      JSON_ACCEPT,
    );
    if (set.status !== 200) throw new Error(`dating ${name} gave ${set.status}`);
  }
  return item.id;
}

// Many at once, a few requests at a time
export async function makeMany(http: Client, names: string[]): Promise<void> {
  for (let i = 0; i < names.length; i += 8) {
    await Promise.all(names.slice(i, i + 8).map((name) => makeItem(http, name)));
  }
}
