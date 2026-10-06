import { defineMiddleware } from "astro:middleware";
import { db } from "./lib/db.ts";
import { sessionForToken } from "./lib/households.ts";
import { inRequest, newRequestContext, stdoutSink, withRequestContext } from "./lib/log.ts";
import { describeRequest, isLogged } from "./lib/requestLog.ts";
import { DEVICE_COOKIE } from "./lib/session.ts";
import { stats } from "./lib/stats.ts";

// Resolves the device cookie into who is asking. A cookie that doesn't match
// anything leaves the session null; it never errors. Then it writes one
// redacted line per request (who, what, when) and feeds the stats view.
export const onRequest = defineMiddleware(async (context, next) => {
  // read before next(): a rewrite changes it, and the line names what was asked for
  const route = context.routePattern;
  const started = performance.now();
  const token = context.cookies.get(DEVICE_COOKIE)?.value;
  context.locals.session = token ? sessionForToken(db, token) : null;
  // a rewrite re-enters here: the outer run already owns the line for this request
  if (!isLogged(route) || inRequest()) return next();

  const ctx = newRequestContext();
  let status = 500;
  let error: unknown;
  try {
    const response = await withRequestContext(ctx, next);
    status = response.status;
    return response;
  } catch (thrown) {
    error = thrown ?? new Error("thrown");
    throw thrown;
  } finally {
    const line = describeRequest({
      method: context.request.method,
      route,
      status,
      ms: performance.now() - started,
      token,
      session: context.locals.session,
      detail: ctx.detail,
      error,
    });
    stats.record(line);
    stdoutSink(line);
  }
});
