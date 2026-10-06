import type { APIRoute } from "astro";
import { db } from "../../../lib/db.ts";
import { failure, json, wantsJson } from "../../../lib/http.ts";
import { NotFoundError, recordOutcome } from "../../../lib/items.ts";
import { householdChannel, publish, publishAll } from "../../../lib/live.ts";
import { logDetail } from "../../../lib/log.ts";
import { offerEvents } from "../../../lib/offerEvents.ts";

export const POST: APIRoute = async (context) => {
  const { session } = context.locals;
  const asJson = wantsJson(context.request.headers);
  if (!session) return asJson ? failure(true, 401, "Sign in first.") : context.redirect("/", 303);

  const outcome = String((await context.request.formData()).get("outcome") ?? "");
  if (outcome !== "used" && outcome !== "binned") {
    return failure(asJson, 400, "Outcome must be used or binned.");
  }
  try {
    const entry = recordOutcome(db, session, context.params.id ?? "", outcome);
    logDetail({ outcome });
    publish(householdChannel(session.household.id), {
      type: "item.removed",
      itemId: entry.itemId,
      itemName: entry.itemName,
      outcome,
      historyId: entry.id,
      by: { id: session.member.id, name: session.member.name },
    });
    publishAll(entry.offerChanges.flatMap(offerEvents));
    return asJson
      ? json({ historyId: entry.id, itemId: entry.itemId, itemName: entry.itemName, outcome })
      : context.redirect(`/?undo=${encodeURIComponent(entry.id)}`, 303);
  } catch (error) {
    if (error instanceof NotFoundError) return failure(asJson, 404, "No such item.");
    throw error;
  }
};
