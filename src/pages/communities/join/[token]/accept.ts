import type { APIRoute } from "astro";
import { joinCommunityByLink } from "../../../../lib/communities.ts";
import { joinedEvents } from "../../../../lib/communityEvents.ts";
import { db } from "../../../../lib/db.ts";
import { NotFoundError } from "../../../../lib/errors.ts";
import { publishAll } from "../../../../lib/live.ts";
import { joinThrottle, throttleKey } from "../../../../lib/throttle.ts";

export const POST: APIRoute = (context) => {
  const { session } = context.locals;
  if (!session) return context.redirect("/", 303);
  const token = context.params.token ?? "";

  const key = throttleKey(context.request.headers, context.clientAddress);
  if (joinThrottle.blocked(key)) {
    context.locals.communityError = {
      message: "Too many failed attempts. Try again in a minute.",
      status: 429,
    };
    return context.rewrite(`/communities/join/${encodeURIComponent(token)}`);
  }

  try {
    const join = joinCommunityByLink(db, session, token);
    publishAll(joinedEvents(join));
    return context.redirect(`/communities/${join.community.id}`, 303);
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
    joinThrottle.fail(key);
    // the page answers 404 itself, since the link is what's wrong
    return context.rewrite(`/communities/join/${encodeURIComponent(token)}`);
  }
};
