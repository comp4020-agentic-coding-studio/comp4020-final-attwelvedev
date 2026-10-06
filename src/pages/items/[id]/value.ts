import type { APIRoute } from "astro";
import { db } from "../../../lib/db.ts";
import { json, withSession } from "../../../lib/http.ts";
import { updatedEvents } from "../../../lib/itemEvents.ts";
import { parseValueChange, setValue } from "../../../lib/itemValues.ts";
import { publishAll } from "../../../lib/live.ts";
import { logDetail } from "../../../lib/log.ts";
import { offerEvents } from "../../../lib/offerEvents.ts";

export const POST: APIRoute = (context) =>
  withSession(context, async (session, asJson) => {
    const change = parseValueChange(await context.request.formData());
    const update = setValue(db, session, context.params.id ?? "", change);
    publishAll([
      ...updatedEvents(update.item, { id: session.member.id, name: session.member.name }),
      ...update.offerChanges.flatMap(offerEvents),
    ]);
    logDetail({ kind: change.kind === "clearExact" ? "clear" : change.kind });
    return asJson ? json({ item: update.item }) : context.redirect("/", 303);
  });
