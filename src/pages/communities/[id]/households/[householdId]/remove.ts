import type { APIRoute } from "astro";
import { removeHouseholdFromCommunity } from "../../../../../lib/communities.ts";
import { leftEvents } from "../../../../../lib/communityEvents.ts";
import { db } from "../../../../../lib/db.ts";
import { ForbiddenError, NotFoundError, ValidationError } from "../../../../../lib/errors.ts";
import { publishAll } from "../../../../../lib/live.ts";

export const POST: APIRoute = (context) => {
  const { session } = context.locals;
  if (!session) return context.redirect("/", 303);
  const id = context.params.id ?? "";
  try {
    const leave = removeHouseholdFromCommunity(db, session, id, context.params.householdId ?? "");
    publishAll(leftEvents(leave));
  } catch (error) {
    if (error instanceof NotFoundError) return new Response("Not found.", { status: 404 });
    if (error instanceof ForbiddenError) return new Response(error.message, { status: 403 });
    if (error instanceof ValidationError) return new Response(error.message, { status: 400 });
    throw error;
  }
  return context.redirect(`/communities/${id}`, 303);
};
