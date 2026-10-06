import { JSDOM } from "jsdom";

// A black-box client with its own cookie jar, so each test can be its own
// person (and household) against the one shared running app.

export interface Client {
  get(path: string): Promise<Response>; // follows no redirects
  post(path: string, fields?: Record<string, string>): Promise<Response>; // form-encoded, Origin = baseUrl
  cookie(name: string): string | undefined;
}

export function client(baseUrl: string): Client {
  const jar = new Map<string, string>();
  const origin = new URL(baseUrl).origin;

  const send = async (path: string, init: RequestInit): Promise<Response> => {
    const cookies = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    const res = await fetch(new URL(path, baseUrl), {
      ...init,
      redirect: "manual",
      headers: { ...(cookies ? { cookie: cookies } : {}), ...init.headers },
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(";").map((part) => part.trim());
      const at = pair.indexOf("=");
      const name = pair.slice(0, at);
      const expired = attributes.some((a) => /^max-age=0$/i.test(a));
      if (expired || at === pair.length - 1) jar.delete(name);
      else jar.set(name, pair.slice(at + 1));
    }
    return res;
  };

  return {
    get: (path) => send(path, {}),
    post: (path, fields = {}) =>
      send(path, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", origin },
        body: new URLSearchParams(fields).toString(),
      }),
    cookie: (name) => jar.get(name),
  };
}

export function text(html: string): string {
  return new JSDOM(html).window.document.body.textContent ?? "";
}
