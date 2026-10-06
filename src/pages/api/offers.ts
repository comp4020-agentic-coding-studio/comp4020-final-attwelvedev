import type { APIRoute } from "astro";
import { db } from "../../lib/db.ts";
import { json } from "../../lib/http.ts";
import { offersSnapshotFor } from "../../lib/offers.ts";

export const GET: APIRoute = ({ locals }) => {
  const { session } = locals;
  if (!session) return json({ error: "Sign in first." }, 401);
  return json(offersSnapshotFor(db, session));
};
