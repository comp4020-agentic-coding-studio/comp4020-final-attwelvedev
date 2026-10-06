import type { APIRoute } from "astro";
import { db } from "../../../lib/db.ts";
import { NotFoundError, recordOutcome } from "../../../lib/items.ts";

export const POST: APIRoute = async (context) => {
  const { session } = context.locals;
  if (!session) return context.redirect("/", 303);

  const outcome = String((await context.request.formData()).get("outcome") ?? "");
  if (outcome !== "used" && outcome !== "binned") {
    return new Response("Outcome must be used or binned.", { status: 400 });
  }
  try {
    const entry = recordOutcome(db, session, context.params.id ?? "", outcome);
    return context.redirect(`/?undo=${encodeURIComponent(entry.id)}`, 303);
  } catch (error) {
    if (error instanceof NotFoundError) return new Response("No such item.", { status: 404 });
    throw error;
  }
};
