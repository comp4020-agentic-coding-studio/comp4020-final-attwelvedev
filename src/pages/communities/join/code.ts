import type { APIRoute } from "astro";
import { joinCommunityByCode } from "../../../lib/communities.ts";
import { joinedEvents } from "../../../lib/communityEvents.ts";
import { db } from "../../../lib/db.ts";
import { NotFoundError } from "../../../lib/errors.ts";
import { publishAll } from "../../../lib/live.ts";
import { joinThrottle, throttleKey } from "../../../lib/throttle.ts";

export const POST: APIRoute = async (context) => {
  const { session } = context.locals;
  if (!session) return context.redirect("/", 303);

  // a clone, so the body is still unread if the page has to be rewritten below
  const form = await context.request.clone().formData();
  const code = String(form.get("code") ?? "");
  const fail = (message: string, status: number) => {
    context.locals.communityError = { message, status, code };
    return context.rewrite("/communities");
  };

  const key = throttleKey(context.request.headers, context.clientAddress);
  if (joinThrottle.blocked(key)) return fail("Too many wrong codes. Try again in a minute.", 429);

  try {
    const join = joinCommunityByCode(db, session, code);
    publishAll(joinedEvents(join));
    return context.redirect(`/communities/${join.community.id}`, 303);
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
    joinThrottle.fail(key);
    return fail("No community has that code. Check it and try again.", 400);
  }
};
