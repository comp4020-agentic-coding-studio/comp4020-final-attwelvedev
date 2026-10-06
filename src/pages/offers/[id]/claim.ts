import type { APIRoute } from "astro";
import { db } from "../../../lib/db.ts";
import { json, withSession } from "../../../lib/http.ts";
import { publishAll } from "../../../lib/live.ts";
import { offerEvents } from "../../../lib/offerEvents.ts";
import { claimOffer } from "../../../lib/offers.ts";

export const POST: APIRoute = (context) =>
  withSession(context, (session, asJson) => {
    const change = claimOffer(db, session, context.params.id ?? "");
    publishAll(offerEvents(change));
    return asJson ? json({ offer: change.claim?.offer }) : context.redirect("/offers", 303);
  });
