import { AsyncLocalStorage } from "node:async_hooks";

// What a log line may say beyond who, what and when. Anything else is dropped,
// so a field has to be added here on purpose before it can reach a log.
const ALLOWED = new Set([
  "outcome",
  "via",
  "kind",
  "count",
  "reason",
  "role", // which handicap acted (blind/deaf/mute): never who they are
  "family", // which channel (say/sound/show): never what was sent
  "room", // a room's id, e.g. loading-dock: a level, not a person
  "seat", // 0-2: a place in a crew, not a person
  "ms", // a duration, e.g. how long a room took
  "bots", // how many seats bots filled
]);
const MAX_VALUE = 40;

export type Detail = Record<string, string | number | boolean>;

export function redact(fields: Record<string, unknown>): Detail {
  const kept: Detail = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED.has(key)) continue;
    if (typeof value === "string") kept[key] = value.slice(0, MAX_VALUE);
    else if (typeof value === "number" || typeof value === "boolean") kept[key] = value;
  }
  return kept;
}

export interface RequestContext {
  detail: Detail;
}

export const newRequestContext = (): RequestContext => ({ detail: {} });

const storage = new AsyncLocalStorage<RequestContext>();

export function withRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

// True while a request is being served. A rewrite runs the middleware again
// inside the first run, and that inner run must not write a second line.
export const inRequest = (): boolean => storage.getStore() !== undefined;

// Adds redacted detail to the line of the request being served, from anywhere
// in it. Outside a request there is no line, so it does nothing.
export function logDetail(fields: Record<string, unknown>): void {
  const ctx = storage.getStore();
  if (ctx) Object.assign(ctx.detail, redact(fields));
}

// A broken stdout must never fail the request being logged.
export function stdoutSink(
  line: unknown,
  write: (text: string) => unknown = (text) => process.stdout.write(text),
): void {
  try {
    write(`${JSON.stringify(line)}\n`);
  } catch {
    // nothing to do: the request goes on
  }
}
