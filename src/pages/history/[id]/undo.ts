import type { APIRoute } from "astro";
import { db } from "../../../lib/db.ts";
import { NotFoundError, undoOutcome } from "../../../lib/items.ts";

export const POST: APIRoute = (context) => {
  const { session } = context.locals;
  if (!session) return context.redirect("/", 303);

  try {
    undoOutcome(db, session, context.params.id ?? "");
    return context.redirect("/", 303);
  } catch (error) {
    if (error instanceof NotFoundError) return new Response("No such record.", { status: 404 });
    throw error;
  }
};
