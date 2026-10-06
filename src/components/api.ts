// Small helpers for islands that post forms and read JSON back.

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const formBody = (fields: Record<string, string>) => new URLSearchParams(fields).toString();

// A signed-out device is sent home. Any other failure throws an HttpError
// carrying the server's `{ error }` message when there is one.
export async function postJson<T>(path: string, fields: Record<string, string> = {}): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody(fields),
  });
  if (res.status === 401) {
    window.location.assign("/");
    throw new HttpError(401, "signed out");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new HttpError(res.status, body?.error ?? `${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function getJson<T>(path: string): Promise<T | null> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (res.status === 401) {
    window.location.assign("/");
    return null;
  }
  return res.ok ? ((await res.json()) as T) : null;
}
