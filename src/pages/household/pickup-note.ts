import type { APIRoute } from "astro";
import { db } from "../../lib/db.ts";
import { json, withSession } from "../../lib/http.ts";
import { setDefaultPickupNote } from "../../lib/offers.ts";

export const POST: APIRoute = (context) =>
  withSession(context, async (session, asJson) => {
    const form = await context.request.formData();
    const note = setDefaultPickupNote(db, session, String(form.get("note") ?? ""));
    return asJson ? json({ note }) : context.redirect("/household", 303);
  });
