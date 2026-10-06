import type { APIRoute } from "astro";
import { deviceCookieOptions } from "../../../lib/cookie.ts";
import { db } from "../../../lib/db.ts";
import { redeemDeviceLink } from "../../../lib/households.ts";
import { NotFoundError } from "../../../lib/items.ts";
import { DEVICE_COOKIE } from "../../../lib/session.ts";

export const POST: APIRoute = (context) => {
  if (context.locals.session) {
    return new Response("This device is already signed in.", { status: 409 });
  }
  try {
    const { deviceToken } = redeemDeviceLink(db, context.params.token ?? "");
    context.cookies.set(
      DEVICE_COOKIE,
      deviceToken,
      deviceCookieOptions(context.url, context.request.headers.get("x-forwarded-proto")),
    );
    return context.redirect("/", 303);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return new Response("That device link is unknown, expired or already used.", { status: 404 });
    }
    throw error;
  }
};
