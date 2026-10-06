import type { APIRoute } from "astro";
import { db } from "../../lib/db.ts";
import { ValidationError } from "../../lib/errors.ts";
import { json, withSession } from "../../lib/http.ts";
import { publishAll } from "../../lib/live.ts";
import { logDetail } from "../../lib/log.ts";
import { offerEvents } from "../../lib/offerEvents.ts";
import { createOffer } from "../../lib/offers.ts";

// An empty or missing field is the whole item; anything else must be a whole number.
function portionOf(raw: FormDataEntryValue | null): number | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  if (!/^\d{1,6}$/.test(raw.trim()))
    throw new ValidationError("That isn't an amount you can split off.");
  return Number(raw.trim());
}

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
      portion: portionOf(form.get("portion")),
    });
    publishAll(offerEvents(change));
    if (change.split) logDetail({ kind: "some" });
    const split = change.split
      ? { remainder: change.split.remainder, portion: change.split.portion }
      : null;
    return asJson ? json({ offer: change.offer, split }, 201) : context.redirect("/", 303);
  });
