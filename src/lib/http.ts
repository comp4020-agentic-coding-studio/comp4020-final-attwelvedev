import type { APIContext } from "astro";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors.ts";
import type { Session } from "./households.ts";

// What the item endpoints share, so the form and JSON answers are decided in
// one place and the three endpoints don't each copy the branching.

export function wantsJson(headers: Headers): boolean {
  return (headers.get("accept") ?? "").includes("application/json");
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

// A failure the way this caller asked for it: `{ error }` for JSON, the
// plain message otherwise.
export function failure(asJson: boolean, status: number, message: string): Response {
  return asJson ? json({ error: message }, status) : new Response(message, { status });
}

// A client request id is echoed back so the island can match its own add.
export function cleanRid(raw: unknown): string | undefined {
  return typeof raw === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : undefined;
}

const statusOf = (error: unknown): number | null =>
  error instanceof ValidationError
    ? 400
    : error instanceof ForbiddenError
      ? 403
      : error instanceof NotFoundError
        ? 404
        : error instanceof ConflictError
          ? 409
          : null;

// The sign-in check and the domain errors the offer endpoints share: no
// session is a 401 for JSON and a redirect home otherwise, and a service's
// own errors become their status. Anything else is a bug and propagates.
export async function withSession(
  context: APIContext,
  run: (session: Session, asJson: boolean) => Response | Promise<Response>,
): Promise<Response> {
  const { session } = context.locals;
  const asJson = wantsJson(context.request.headers);
  if (!session) return asJson ? failure(true, 401, "Sign in first.") : context.redirect("/", 303);
  try {
    return await run(session, asJson);
  } catch (error) {
    const status = statusOf(error);
    if (status === null) throw error;
    return failure(asJson, status, (error as Error).message);
  }
}
