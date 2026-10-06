import type { APIRoute } from "astro";
import { db } from "../../lib/db.ts";
import { leaveHousehold } from "../../lib/households.ts";
import { DEVICE_COOKIE } from "../../lib/session.ts";

export const POST: APIRoute = (context) => {
  const { session } = context.locals;
  if (!session) return context.redirect("/", 303);
  leaveHousehold(db, session);
  context.cookies.delete(DEVICE_COOKIE, { path: "/" });
  return context.redirect("/", 303);
};
