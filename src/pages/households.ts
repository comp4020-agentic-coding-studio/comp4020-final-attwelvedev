import type { APIRoute } from "astro";
import { db } from "../lib/db.ts";
import { createHousehold, ValidationError } from "../lib/households.ts";
import { DEVICE_COOKIE } from "../lib/session.ts";

const FOUR_HUNDRED_DAYS = 400 * 24 * 60 * 60;

export const POST: APIRoute = async (context) => {
  // a clone, so the body is still unread if the page has to be rewritten below
  const form = await context.request.clone().formData();
  const householdName = String(form.get("householdName") ?? "");
  const memberName = String(form.get("memberName") ?? "");

  try {
    const { deviceToken } = createHousehold(db, { householdName, memberName });
    const secure =
      context.url.protocol === "https:" ||
      context.request.headers.get("x-forwarded-proto") === "https";
    context.cookies.set(DEVICE_COOKIE, deviceToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: FOUR_HUNDRED_DAYS,
    });
    return context.redirect("/", 303);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    // the page renders the form again, with what was typed and the reason
    context.locals.firstRunError = { message: error.message, householdName, memberName };
    return context.rewrite("/");
  }
};
