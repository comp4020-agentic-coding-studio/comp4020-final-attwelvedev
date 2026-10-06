import type { APIRoute } from "astro";
import { db } from "../../../lib/db.ts";
import { cleanToday } from "../../../lib/expiry.ts";
import { json, withSession } from "../../../lib/http.ts";
import { updatedEvents } from "../../../lib/itemEvents.ts";
import { parseExpiryChange, setExpiry } from "../../../lib/itemValues.ts";
import { publishAll } from "../../../lib/live.ts";
import { logDetail } from "../../../lib/log.ts";
import { offerEvents } from "../../../lib/offerEvents.ts";

export const POST: APIRoute = (context) =>
  withSession(context, async (session, asJson) => {
    const form = await context.request.formData();
    const change = parseExpiryChange(form);
    const update = setExpiry(
      db,
      session,
      context.params.id ?? "",
      change,
      cleanToday(form.get("today")),
    );
    publishAll([
      ...updatedEvents(update.item, { id: session.member.id, name: session.member.name }),
      ...update.offerChanges.flatMap(offerEvents),
    ]);
    logDetail({ kind: change.kind === "clearDate" ? "clear" : change.kind });
    return asJson ? json({ item: update.item }) : context.redirect("/", 303);
  });
