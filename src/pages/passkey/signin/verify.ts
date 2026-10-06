import type { APIRoute } from "astro";
import { deviceCookieOptions } from "../../../lib/cookie.ts";
import { db } from "../../../lib/db.ts";
import { ValidationError } from "../../../lib/errors.ts";
import { failure, json } from "../../../lib/http.ts";
import { PASSKEY_COOKIE, rpFor, verifySignin } from "../../../lib/passkeys.ts";
import { DEVICE_COOKIE } from "../../../lib/session.ts";
import { passkeyThrottle, throttleKey } from "../../../lib/throttle.ts";

export const POST: APIRoute = async (context) => {
  if (context.locals.session) return failure(true, 409, "This device is already signed in.");
  const key = throttleKey(context.request.headers, context.clientAddress);
  if (passkeyThrottle.blocked(key)) {
    const res = failure(true, 429, "Too many failed attempts. Try again in a minute.");
    res.headers.set("Retry-After", "60");
    return res;
  }

  const challengeId = context.cookies.get(PASSKEY_COOKIE)?.value ?? "";
  context.cookies.delete(PASSKEY_COOKIE, { path: "/passkey" });
  const response = await context.request.json().catch(() => null);
  try {
    const { deviceToken } = await verifySignin(db, rpFor(context.url), challengeId, response);
    context.cookies.set(
      DEVICE_COOKIE,
      deviceToken,
      deviceCookieOptions(context.url, context.request.headers.get("x-forwarded-proto")),
    );
    return json({ ok: true });
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    passkeyThrottle.fail(key);
    return failure(true, 400, error.message);
  }
};
