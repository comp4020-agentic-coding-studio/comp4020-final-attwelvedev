import type { APIRoute } from "astro";
import { deviceCookieOptions } from "../../../lib/cookie.ts";
import { failure, json } from "../../../lib/http.ts";
import {
  CHALLENGE_COOKIE_MAX_AGE_S,
  PASSKEY_COOKIE,
  rpFor,
  signinOptions,
} from "../../../lib/passkeys.ts";

export const POST: APIRoute = async (context) => {
  if (context.locals.session) return failure(true, 409, "This device is already signed in.");
  const { challengeId, options } = await signinOptions(rpFor(context.url));
  context.cookies.set(PASSKEY_COOKIE, challengeId, {
    ...deviceCookieOptions(context.url, context.request.headers.get("x-forwarded-proto")),
    path: "/passkey",
    maxAge: CHALLENGE_COOKIE_MAX_AGE_S,
  });
  return json(options);
};
