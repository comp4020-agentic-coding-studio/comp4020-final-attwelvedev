import { JSDOM } from "jsdom";

// A black-box client with its own cookie jar, so each test can be its own
// person (and device) against the one shared running app.

export interface Client {
  get(path: string, headers?: Record<string, string>): Promise<Response>; // follows no redirects
  post(
    path: string,
    fields?: Record<string, string | string[]>,
    headers?: Record<string, string>,
  ): Promise<Response>; // form-encoded, Origin = baseUrl
  postJson(path: string, body?: unknown, headers?: Record<string, string>): Promise<Response>; // JSON body, Origin = baseUrl
  cookie(name: string): string | undefined;
}

// `options.headers` go on every request, e.g. a `fly-client-ip` to be its own
// visitor as far as the join throttle is concerned.
export function client(
  baseUrl: string,
  options: { headers?: Record<string, string> } = {},
): Client {
  const jar = new Map<string, string>();
  const origin = new URL(baseUrl).origin;

  const send = async (path: string, init: RequestInit): Promise<Response> => {
    const cookies = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    const res = await fetch(new URL(path, baseUrl), {
      ...init,
      redirect: "manual",
      headers: { ...(cookies ? { cookie: cookies } : {}), ...options.headers, ...init.headers },
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(";").map((part) => part.trim());
      const at = pair.indexOf("=");
      const name = pair.slice(0, at);
      // a cookie is deleted by Max-Age=0 or by an Expires in the past
      const expired = attributes.some(
        (a) =>
          /^max-age=0$/i.test(a) ||
          (/^expires=/i.test(a) && Date.parse(a.slice("expires=".length)) <= Date.now()),
      );
      if (expired || at === pair.length - 1) jar.delete(name);
      else jar.set(name, pair.slice(at + 1));
    }
    return res;
  };

  return {
    get: (path, headers) => send(path, { headers }),
    post: (path, fields = {}, headers) =>
      send(path, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin,
          ...headers,
        },
        // an array repeats its field, as a form with several ticked boxes does
        body: new URLSearchParams(
          Object.entries(fields).flatMap(([name, value]) =>
            [value].flat().map((v) => [name, v] as [string, string]),
          ),
        ).toString(),
      }),
    postJson: (path, body = {}, headers) =>
      send(path, {
        method: "POST",
        headers: { "content-type": "application/json", origin, ...headers },
        body: JSON.stringify(body),
      }),
    cookie: (name) => jar.get(name),
  };
}

export function text(html: string): string {
  return new JSDOM(html).window.document.body.textContent ?? "";
}

// A page's markup without its inline scripts: Astro's island bootstrap is a
// minified script that happens to spell "Sam" (in isSameNode), so a check that
// a name is absent from a page reads the markup and attributes, not that code.
export function withoutScripts(html: string): string {
  return html.replace(/<script\b[\s\S]*?<\/script>/g, "");
}
