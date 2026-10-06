import type { APIRoute } from "astro";
import { db } from "../../../lib/db.ts";
import { json, withSession } from "../../../lib/http.ts";
import { publishAll } from "../../../lib/live.ts";
import { offerEvents } from "../../../lib/offerEvents.ts";
import { releaseOffer } from "../../../lib/offers.ts";

export const POST: APIRoute = (context) =>
  withSession(context, (session, asJson) => {
    const offerId = context.params.id ?? "";
    publishAll(offerEvents(releaseOffer(db, session, offerId)));
    return asJson ? json({ offerId }) : context.redirect("/offers", 303);
  });
