import type { APIRoute } from "astro";
import { db } from "../../lib/db.ts";
import { cleanRid, failure, json, wantsJson } from "../../lib/http.ts";
import { addItem, ValidationError } from "../../lib/items.ts";
import { householdChannel, publish } from "../../lib/live.ts";

export const POST: APIRoute = async (context) => {
  const { session } = context.locals;
  const asJson = wantsJson(context.request.headers);
  if (!session) return asJson ? failure(true, 401, "Sign in first.") : context.redirect("/", 303);

  // a clone, so the body is still unread if the page has to be rewritten below
  const form = await context.request.clone().formData();
  try {
    const item = addItem(db, session, String(form.get("name") ?? ""));
    const rid = cleanRid(form.get("rid"));
    publish(householdChannel(session.household.id), {
      type: "item.added",
      item,
      by: { id: session.member.id, name: session.member.name },
      rid,
    });
    return asJson ? json({ item, rid }, 201) : context.redirect("/", 303);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    if (asJson) return failure(true, 400, error.message);
    context.locals.addError = error.message;
    return context.rewrite("/");
  }
};
