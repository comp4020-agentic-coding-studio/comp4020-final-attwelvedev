import type { APIRoute } from "astro";
import { db } from "../../lib/db.ts";
import { addItem, ValidationError } from "../../lib/items.ts";

export const POST: APIRoute = async (context) => {
  const { session } = context.locals;
  if (!session) return context.redirect("/", 303);

  // a clone, so the body is still unread if the page has to be rewritten below
  const form = await context.request.clone().formData();
  try {
    addItem(db, session, String(form.get("name") ?? ""));
    return context.redirect("/", 303);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    context.locals.addError = error.message;
    return context.rewrite("/");
  }
};
