import type { APIRoute } from "astro";
import { db } from "../../lib/db.ts";
import { leaveHousehold } from "../../lib/households.ts";
import { householdChannel, publish } from "../../lib/live.ts";
import { DEVICE_COOKIE } from "../../lib/session.ts";

export const POST: APIRoute = (context) => {
  const { session } = context.locals;
  if (!session) return context.redirect("/", 303);
  const { member } = leaveHousehold(db, session);
  const by = { id: member.id, name: member.name };
  publish(householdChannel(session.household.id), { type: "member.removed", member: by, by });
  context.cookies.delete(DEVICE_COOKIE, { path: "/" });
  return context.redirect("/", 303);
};
