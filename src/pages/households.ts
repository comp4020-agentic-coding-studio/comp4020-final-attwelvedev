import type { APIRoute } from "astro";
import { deviceCookieOptions } from "../lib/cookie.ts";
import { db } from "../lib/db.ts";
import { createHousehold, ValidationError } from "../lib/households.ts";
import { DEVICE_COOKIE } from "../lib/session.ts";

export const POST: APIRoute = async (context) => {
  // a clone, so the body is still unread if the page has to be rewritten below
  const form = await context.request.clone().formData();
  const householdName = String(form.get("householdName") ?? "");
  const memberName = String(form.get("memberName") ?? "");

  try {
    const { deviceToken } = createHousehold(db, { householdName, memberName });
    context.cookies.set(
      DEVICE_COOKIE,
      deviceToken,
      deviceCookieOptions(context.url, context.request.headers.get("x-forwarded-proto")),
    );
    return context.redirect("/", 303);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    // the page renders the form again, with what was typed and the reason
    context.locals.firstRunError = { message: error.message, householdName, memberName };
    return context.rewrite("/");
  }
};
