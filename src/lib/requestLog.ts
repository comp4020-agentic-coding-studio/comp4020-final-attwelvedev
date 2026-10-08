import type { Detail } from "./log.ts";
import { redact } from "./log.ts";
import { hashToken } from "./session.ts";

// One line per request: who, what, when. `route` is Astro's route pattern,
// never the raw path, because invite and device links carry tokens in it.
export interface RequestLine {
  ts: string;
  kind: "request";
  method: string;
  route: string;
  action: string;
  status: number;
  ms: number;
  who: string | null; // a device: 8 hex of its token hash
  detail?: Detail;
  err?: string; // the error's class name, never its message
}

// Every endpoint a user can reach, by "<METHOD> <route pattern>". A test fails
// when a POST endpoint is missing, so a new one can't ship unnamed. Entries for
// routes that don't exist yet are fine.
export const ACTIONS: Record<string, string> = {
  "GET /": "view.home",
  "GET /readme": "view.readme",
  "GET /lobby/[code]": "view.lobby",
  "GET /leaderboard": "view.leaderboard",
};

// The stats view and static assets are not user actions: logging them would
// make the view count itself.
export function isLogged(route: string): boolean {
  return route !== "/stats" && route !== "/stats.json" && !route.startsWith("/_astro");
}

// 8 hex characters of a hash: enough to tell devices apart in a log, and
// useless for getting anything back.
export const anon = (value: string): string => hashToken(value).slice(0, 8);

export function describeRequest(input: {
  method: string;
  route: string;
  status: number;
  ms: number;
  token: string | null | undefined;
  detail?: Record<string, unknown>;
  error?: unknown;
  now?: number;
}): RequestLine {
  const detail = redact(input.detail ?? {});
  const line: RequestLine = {
    ts: new Date(input.now ?? Date.now()).toISOString(),
    kind: "request",
    method: input.method,
    route: input.route,
    action: ACTIONS[`${input.method} ${input.route}`] ?? `${input.method} ${input.route}`,
    status: input.error === undefined ? input.status : 500,
    ms: Math.round(input.ms),
    who: input.token ? anon(input.token) : null,
  };
  if (Object.keys(detail).length) line.detail = detail;
  if (input.error !== undefined) {
    line.err = input.error instanceof Error ? input.error.constructor.name : "Error";
  }
  return line;
}
