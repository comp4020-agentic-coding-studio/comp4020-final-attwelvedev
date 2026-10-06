import type { APIRoute } from "astro";
import { db } from "../../lib/db.ts";
import { createInviteLink } from "../../lib/households.ts";

export const POST: APIRoute = (context) => {
  const { session } = context.locals;
  if (!session) return context.redirect("/", 303);
  context.locals.newInviteLink = createInviteLink(db, session);
  return context.rewrite("/household");
};
