import type { APIRoute } from "astro";
import { json } from "../lib/http.ts";
import { stats } from "../lib/stats.ts";

// Counts only: no names, no items, no links. Public on purpose (Task 11).
export const GET: APIRoute = () => {
  const res = json(stats.snapshot());
  res.headers.set("Cache-Control", "no-store");
  return res;
};
