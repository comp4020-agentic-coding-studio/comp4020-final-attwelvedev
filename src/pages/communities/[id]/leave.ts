import type { APIRoute } from "astro";
import { leaveCommunity } from "../../../lib/communities.ts";
import { leftEvents } from "../../../lib/communityEvents.ts";
import { db } from "../../../lib/db.ts";
import { NotFoundError } from "../../../lib/errors.ts";
import { publishAll } from "../../../lib/live.ts";

export const POST: APIRoute = (context) => {
  const { session } = context.locals;
  if (!session) return context.redirect("/", 303);
  try {
    publishAll(leftEvents(leaveCommunity(db, session, context.params.id ?? "")));
  } catch (error) {
    if (error instanceof NotFoundError) return new Response("No such community.", { status: 404 });
    throw error;
  }
  return context.redirect("/communities", 303);
};
