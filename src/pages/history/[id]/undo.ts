import type { APIRoute } from "astro";
import { db } from "../../../lib/db.ts";
import { failure, json, wantsJson } from "../../../lib/http.ts";
import { NotFoundError, undoOutcome } from "../../../lib/items.ts";
import { householdChannel, publish } from "../../../lib/live.ts";

export const POST: APIRoute = (context) => {
  const { session } = context.locals;
  const asJson = wantsJson(context.request.headers);
  if (!session) return asJson ? failure(true, 401, "Sign in first.") : context.redirect("/", 303);

  try {
    const item = undoOutcome(db, session, context.params.id ?? "");
    publish(householdChannel(session.household.id), {
      type: "item.restored",
      item,
      by: { id: session.member.id, name: session.member.name },
    });
    return asJson ? json({ item }) : context.redirect("/", 303);
  } catch (error) {
    if (error instanceof NotFoundError) return failure(asJson, 404, "No such record.");
    throw error;
  }
};
