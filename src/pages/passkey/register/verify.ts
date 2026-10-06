import type { APIRoute } from "astro";
import { db } from "../../../lib/db.ts";
import { ValidationError } from "../../../lib/errors.ts";
import { failure, json } from "../../../lib/http.ts";
import { PASSKEY_COOKIE, rpFor, verifyRegistration } from "../../../lib/passkeys.ts";

export const POST: APIRoute = async (context) => {
  const { session } = context.locals;
  if (!session) return failure(true, 401, "Sign in first.");
  const challengeId = context.cookies.get(PASSKEY_COOKIE)?.value ?? "";
  context.cookies.delete(PASSKEY_COOKIE, { path: "/passkey" });
  const response = await context.request.json().catch(() => null);
  try {
    const passkey = await verifyRegistration(
      db,
      session,
      rpFor(context.url),
      challengeId,
      response,
    );
    return json({ id: passkey.id }, 201);
  } catch (error) {
    if (error instanceof ValidationError) return failure(true, 400, error.message);
    throw error;
  }
};
