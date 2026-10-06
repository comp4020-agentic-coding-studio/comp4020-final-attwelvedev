import type { APIRoute } from "astro";
import { db } from "../../lib/db.ts";
import { createDeviceLink } from "../../lib/households.ts";

export const POST: APIRoute = (context) => {
  const { session } = context.locals;
  if (!session) return context.redirect("/", 303);
  context.locals.newDeviceLink = createDeviceLink(db, session);
  return context.rewrite("/household/devices");
};
