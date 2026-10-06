import type { APIRoute } from "astro";
import { db } from "../../../lib/db.ts";
import { json, withSession } from "../../../lib/http.ts";
import { publishAll } from "../../../lib/live.ts";
import { collectedEvents, offerEvents } from "../../../lib/offerEvents.ts";
import { collectOffer } from "../../../lib/offers.ts";

export const POST: APIRoute = (context) =>
  withSession(context, (session, asJson) => {
    const offerId = context.params.id ?? "";
    const { change, entry, byOfferer } = collectOffer(db, session, offerId);
    publishAll(offerEvents(change));
    publishAll(collectedEvents(entry, byOfferer));
    return asJson ? json({ offerId }) : context.redirect("/offers", 303);
  });
