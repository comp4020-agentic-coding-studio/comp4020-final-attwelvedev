import type { APIRoute } from "astro";
import { createCommunity } from "../../lib/communities.ts";
import { db } from "../../lib/db.ts";
import { ValidationError } from "../../lib/errors.ts";

export const POST: APIRoute = async (context) => {
  const { session } = context.locals;
  if (!session) return context.redirect("/", 303);

  // a clone, so the body is still unread if the page has to be rewritten below
  const form = await context.request.clone().formData();
  const name = String(form.get("name") ?? "");
  try {
    const community = createCommunity(db, session, name);
    return context.redirect(`/communities/${community.id}`, 303);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    context.locals.communityError = { message: error.message, status: 400, name };
    return context.rewrite("/communities");
  }
};
