import type { APIRoute } from "astro";
import { communityIdsFor } from "../lib/communities.ts";
import { db } from "../lib/db.ts";
import { json } from "../lib/http.ts";
import { communityChannel, householdChannel } from "../lib/live.ts";
import { eventStream } from "../lib/sse.ts";

// One stream per open page, on the household's channel and its communities'.
// It follows the household as it joins and leaves communities. It ends when the
// client goes away, or after telling this member they've been removed.
export const GET: APIRoute = ({ locals, request }) => {
  const { session } = locals;
  if (!session) return json({ error: "Sign in first." }, 401);

  const body = eventStream({
    channels: [
      householdChannel(session.household.id),
      ...communityIdsFor(db, session.household.id).map(communityChannel),
    ],
    signal: request.signal,
    closeWhen: (e) => e.type === "member.removed" && e.member.id === session.member.id,
    follow: (e) =>
      e.type === "membership.joined"
        ? { add: [communityChannel(e.community.id)] }
        : e.type === "membership.left"
          ? { remove: [communityChannel(e.communityId)] }
          : undefined,
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      // Fly's proxy and nginx-alikes: don't hold the stream back to batch it
      "X-Accel-Buffering": "no",
    },
  });
};
