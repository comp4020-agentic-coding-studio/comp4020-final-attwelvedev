import type { APIRoute } from "astro";
import { db } from "../../../lib/db.ts";
import { json, withSession } from "../../../lib/http.ts";
import { updatedEvents } from "../../../lib/itemEvents.ts";
import { parseMeasure, setMeasure } from "../../../lib/itemValues.ts";
import { publishAll } from "../../../lib/live.ts";
import { logDetail } from "../../../lib/log.ts";
import { offerEvents } from "../../../lib/offerEvents.ts";

export const POST: APIRoute = (context) =>
  withSession(context, async (session, asJson) => {
    const measure = parseMeasure(await context.request.formData());
    const update = setMeasure(db, session, context.params.id ?? "", measure);
    publishAll([
      ...updatedEvents(update.item, { id: session.member.id, name: session.member.name }),
      ...update.offerChanges.flatMap(offerEvents),
    ]);
    logDetail({ kind: measure });
    return asJson ? json({ item: update.item }) : context.redirect("/", 303);
  });
