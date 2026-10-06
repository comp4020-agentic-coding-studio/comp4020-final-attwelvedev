import type { APIRoute } from "astro";
import { db } from "../../../../lib/db.ts";
import { removeMember } from "../../../../lib/households.ts";
import { NotFoundError } from "../../../../lib/items.ts";
import { DEVICE_COOKIE } from "../../../../lib/session.ts";

export const POST: APIRoute = (context) => {
  const { session } = context.locals;
  if (!session) return context.redirect("/", 303);

  try {
    const { member } = removeMember(db, session, context.params.id ?? "");
    // removing yourself is leaving: your own tokens are gone too
    if (member.id === session.member.id) {
      context.cookies.delete(DEVICE_COOKIE, { path: "/" });
      return context.redirect("/", 303);
    }
    return context.redirect("/household", 303);
  } catch (error) {
    if (error instanceof NotFoundError) return new Response("No such member.", { status: 404 });
    throw error;
  }
};
