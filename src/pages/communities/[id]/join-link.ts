import type { APIRoute } from "astro";
import { createCommunityLink } from "../../../lib/communities.ts";
import { db } from "../../../lib/db.ts";
import { NotFoundError } from "../../../lib/errors.ts";

export const POST: APIRoute = (context) => {
  const { session } = context.locals;
  if (!session) return context.redirect("/", 303);
  const id = context.params.id ?? "";
  try {
    context.locals.newCommunityLink = createCommunityLink(db, session, id);
  } catch (error) {
    if (error instanceof NotFoundError) return new Response("No such community.", { status: 404 });
    throw error;
  }
  return context.rewrite(`/communities/${encodeURIComponent(id)}`);
};
