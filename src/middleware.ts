import { defineMiddleware } from "astro:middleware";
import { deviceCookieOptions } from "./lib/cookie.ts";
import { inRequest, newRequestContext, stdoutSink, withRequestContext } from "./lib/log.ts";
import { sharedPresence } from "./lib/presence.ts";
import { anon, describeRequest, isLogged } from "./lib/requestLog.ts";
import { DEVICE_COOKIE, newDeviceToken } from "./lib/session.ts";
import { sharedStats } from "./lib/stats.ts";

// Gives every visitor an anonymous device cookie on their first page view (ADR
// 0008), then writes one redacted line per request (who, what, when) and feeds
// the stats view. The cookie holds the raw token; only its hash is ever logged.
export const onRequest = defineMiddleware(async (context, next) => {
  // read before next(): a rewrite changes it, and the line names what was asked for
  const route = context.routePattern;
  const started = performance.now();
  let token = context.cookies.get(DEVICE_COOKIE)?.value;
  if (!token && context.request.method === "GET") {
    token = newDeviceToken();
    context.cookies.set(
      DEVICE_COOKIE,
      token,
      deviceCookieOptions(context.url, context.request.headers.get("x-forwarded-proto")),
    );
  }
  context.locals.who = token ? anon(token) : null;
  // A page of the site was asked for: the socket server learns this device may be going to read
  // something else, or to another lobby (a lobby's own page says which). It is only a hint; the
  // server also checks that the device really has no game page open, and that it is not its own
  // lobby's page being reloaded.
  const isPage =
    context.request.method === "GET" &&
    (context.request.headers.get("accept") ?? "").includes("text/html");
  if (isPage && context.locals.who) {
    const lobby = route?.startsWith("/lobby") ? context.params.code : undefined;
    sharedPresence().pageViewed(context.locals.who, lobby);
  }
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
      detail: ctx.detail,
      error,
    });
    sharedStats().record(line);
    stdoutSink(line);
  }
});
