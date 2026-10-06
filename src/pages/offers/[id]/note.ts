import type { APIRoute } from "astro";
import { db } from "../../../lib/db.ts";
import { json, withSession } from "../../../lib/http.ts";
import { publishAll } from "../../../lib/live.ts";
import { offerEvents } from "../../../lib/offerEvents.ts";
import { updateOfferNote } from "../../../lib/offers.ts";

export const POST: APIRoute = (context) =>
  withSession(context, async (session, asJson) => {
    const offerId = context.params.id ?? "";
    const form = await context.request.formData();
    publishAll(offerEvents(updateOfferNote(db, session, offerId, String(form.get("note") ?? ""))));
    return asJson ? json({ offerId }) : context.redirect("/", 303);
  });
