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
