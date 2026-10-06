import type { APIRoute } from "astro";
import { db } from "../../../lib/db.ts";
import { json, withSession } from "../../../lib/http.ts";
import { removePasskey } from "../../../lib/passkeys.ts";

export const POST: APIRoute = (context) =>
  withSession(context, (session, asJson) => {
    removePasskey(db, session, context.params.id ?? "");
    return asJson ? json({ ok: true }) : context.redirect("/household", 303);
  });
