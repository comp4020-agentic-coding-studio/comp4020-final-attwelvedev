import type { Session } from "./households.ts";
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
  who: string | null; // a device: 8 hex of its stored token hash
  hh: string | null; // a household: 8 hex of a hash of its id
  detail?: Detail;
  err?: string; // the error's class name, never its message
}

// Every endpoint a user can reach, by "<METHOD> <route pattern>". A test fails
// when a POST endpoint is missing, so a new one can't ship unnamed. Entries for
// routes that don't exist yet are fine.
export const ACTIONS: Record<string, string> = {
  "GET /": "view.pantry",
  "GET /history": "view.history",
  "GET /household": "view.household",
  "GET /household/devices": "view.devices",
  "GET /join": "view.join",
  "GET /join/[token]": "view.join-link",
  "GET /device/[token]": "view.device-link",
  "GET /readme": "view.readme",
  "GET /events": "stream.open",
  "GET /api/pantry": "api.pantry",
  "GET /api/offers": "api.offers",
  "GET /offers": "view.offers",
  "GET /passkey/signin": "view.passkey-signin",
  "GET /communities": "view.communities",
  "GET /communities/[id]": "view.community",
  "GET /communities/join/[token]": "view.community-link",
  "POST /households": "household.create",
  "POST /items": "item.add",
  "POST /items/[id]/outcome": "item.outcome",
  "POST /items/[id]/value": "item.value",
  "POST /items/[id]/measure": "item.measure",
  "POST /items/[id]/expiry": "item.expiry",
  "POST /history/[id]/undo": "item.undo",
  "POST /join/code": "household.join",
  "POST /join/[token]/accept": "household.join",
  "POST /device/[token]/accept": "device.link",
  "POST /household/invite-link": "household.invite-link",
  "POST /household/device-link": "household.device-link",
  "POST /household/leave": "household.leave",
  "POST /household/members/[id]/remove": "household.remove-member",
  "POST /household/pickup-note": "household.pickup-note",
  "POST /communities/create": "community.create",
  "POST /communities/join/code": "community.join",
  "POST /communities/join/[token]/accept": "community.join",
  "POST /communities/[id]/join-link": "community.join-link",
  "POST /communities/[id]/leave": "community.leave",
  "POST /communities/[id]/households/[householdId]/remove": "community.remove-household",
  "POST /passkey/register/options": "passkey.register-options",
  "POST /passkey/register/verify": "passkey.register",
  "POST /passkey/signin/options": "passkey.signin-options",
  "POST /passkey/signin/verify": "passkey.signin",
  "POST /passkey/[id]/remove": "passkey.remove",
  "POST /offers/create": "offer.create",
  "POST /offers/[id]/claim": "offer.claim",
  "POST /offers/[id]/collected": "offer.collected",
  "POST /offers/[id]/release": "offer.release",
  "POST /offers/[id]/withdraw": "offer.withdraw",
  "POST /offers/[id]/note": "offer.note",
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
  session: Session | null;
  detail?: Record<string, unknown>;
  error?: unknown;
  now?: number;
}): RequestLine {
  const { session } = input;
  const detail = redact(input.detail ?? {});
  const line: RequestLine = {
    ts: new Date(input.now ?? Date.now()).toISOString(),
    kind: "request",
    method: input.method,
    route: input.route,
    action: ACTIONS[`${input.method} ${input.route}`] ?? `${input.method} ${input.route}`,
    status: input.error === undefined ? input.status : 500,
    ms: Math.round(input.ms),
    who: session && input.token ? anon(input.token) : null,
    hh: session ? anon(`hh:${session.household.id}`) : null,
  };
  if (Object.keys(detail).length) line.detail = detail;
  if (input.error !== undefined) {
    line.err = input.error instanceof Error ? input.error.constructor.name : "Error";
  }
  return line;
}
