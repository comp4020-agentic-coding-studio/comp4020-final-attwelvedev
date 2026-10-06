import type { APIRoute } from "astro";
import { deviceCookieOptions } from "../../lib/cookie.ts";
import { db } from "../../lib/db.ts";
import { joinByCode, ValidationError } from "../../lib/households.ts";
import { NotFoundError } from "../../lib/items.ts";
import { DEVICE_COOKIE } from "../../lib/session.ts";
import { joinThrottle, throttleKey } from "../../lib/throttle.ts";

export const POST: APIRoute = async (context) => {
  // a clone, so the body is still unread if the page has to be rewritten below
  const form = await context.request.clone().formData();
  const code = String(form.get("code") ?? "");
  const memberName = String(form.get("memberName") ?? "");
  const fail = (message: string, status: number) => {
    context.locals.joinError = { message, status, code, memberName };
    return context.rewrite("/join");
  };

  const key = throttleKey(context.request.headers, context.clientAddress);
  if (joinThrottle.blocked(key)) return fail("Too many wrong codes. Try again in a minute.", 429);
  if (context.locals.session) return fail("You're already in a household.", 409);

  try {
    const { deviceToken } = joinByCode(db, { code, memberName });
    context.cookies.set(
      DEVICE_COOKIE,
      deviceToken,
      deviceCookieOptions(context.url, context.request.headers.get("x-forwarded-proto")),
    );
    return context.redirect("/", 303);
  } catch (error) {
    if (error instanceof NotFoundError) {
      joinThrottle.fail(key);
      return fail("No household has that code. Check it and try again.", 400);
    }
    if (error instanceof ValidationError) return fail(error.message, 400);
    throw error;
  }
};
