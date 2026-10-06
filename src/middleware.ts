import { defineMiddleware } from "astro:middleware";
import { db } from "./lib/db.ts";
import { sessionForToken } from "./lib/households.ts";
import { DEVICE_COOKIE } from "./lib/session.ts";

// Resolves the device cookie into who is asking. A cookie that doesn't match
// anything leaves the session null; it never errors.
export const onRequest = defineMiddleware((context, next) => {
  const token = context.cookies.get(DEVICE_COOKIE)?.value;
  context.locals.session = token ? sessionForToken(db, token) : null;
  return next();
});
