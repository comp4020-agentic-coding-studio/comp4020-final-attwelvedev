import type { APIRoute } from "astro";
import { deviceCookieOptions } from "../../../lib/cookie.ts";
import { db } from "../../../lib/db.ts";
import { failure, json } from "../../../lib/http.ts";
import {
  CHALLENGE_COOKIE_MAX_AGE_S,
  PASSKEY_COOKIE,
  registrationOptions,
  rpFor,
} from "../../../lib/passkeys.ts";

export const POST: APIRoute = async (context) => {
  const { session } = context.locals;
  if (!session) return failure(true, 401, "Sign in first.");
  const { challengeId, options } = await registrationOptions(db, session, rpFor(context.url));
  context.cookies.set(PASSKEY_COOKIE, challengeId, {
    ...deviceCookieOptions(context.url, context.request.headers.get("x-forwarded-proto")),
    path: "/passkey",
    maxAge: CHALLENGE_COOKIE_MAX_AGE_S,
  });
  return json(options);
};
