import type { APIRoute } from "astro";
import { deviceCookieOptions } from "../../../lib/cookie.ts";
import { db } from "../../../lib/db.ts";
import { joinByLink, ValidationError } from "../../../lib/households.ts";
import { NotFoundError } from "../../../lib/items.ts";
import { DEVICE_COOKIE } from "../../../lib/session.ts";
import { joinThrottle, throttleKey } from "../../../lib/throttle.ts";

export const POST: APIRoute = async (context) => {
  const token = context.params.token ?? "";
  // a clone, so the body is still unread if the page has to be rewritten below
  const form = await context.request.clone().formData();
  const memberName = String(form.get("memberName") ?? "");
  const fail = (message: string, status: number) => {
    context.locals.joinError = { message, status, memberName };
    return context.rewrite(`/join/${encodeURIComponent(token)}`);
  };

  const key = throttleKey(context.request.headers, context.clientAddress);
  if (joinThrottle.blocked(key))
    return fail("Too many failed attempts. Try again in a minute.", 429);
  if (context.locals.session) return fail("You're already in a household.", 409);

  try {
    const { deviceToken } = joinByLink(db, { token, memberName });
    context.cookies.set(
      DEVICE_COOKIE,
      deviceToken,
      deviceCookieOptions(context.url, context.request.headers.get("x-forwarded-proto")),
    );
    return context.redirect("/", 303);
  } catch (error) {
    if (error instanceof NotFoundError) {
      joinThrottle.fail(key);
      // the page answers 404 itself, since the link is what's wrong
      return context.rewrite(`/join/${encodeURIComponent(token)}`);
    }
    if (error instanceof ValidationError) return fail(error.message, 400);
    throw error;
  }
};
