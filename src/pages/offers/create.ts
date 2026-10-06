import type { APIRoute } from "astro";
import { db } from "../../lib/db.ts";
import { json, withSession } from "../../lib/http.ts";
import { publishAll } from "../../lib/live.ts";
import { offerEvents } from "../../lib/offerEvents.ts";
import { createOffer } from "../../lib/offers.ts";

// `/offers` itself is the feed page, and a page and an endpoint at one path
// would shadow each other, so offers are posted here.
export const POST: APIRoute = (context) =>
  withSession(context, async (session, asJson) => {
    const form = await context.request.formData();
    const note = form.get("note");
    const change = createOffer(db, session, {
      itemId: String(form.get("itemId") ?? ""),
      note: typeof note === "string" ? note : undefined,
      communityIds: form.getAll("communityIds").map(String),
    });
    publishAll(offerEvents(change));
    return asJson ? json({ offer: change.offer }, 201) : context.redirect("/", 303);
  });
