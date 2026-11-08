import type { Page, WebSocket } from "playwright";
import type { RoleView } from "../../src/game/perception.ts";
import type { ClientMsg, ServerMsg } from "../../src/net/protocol.ts";

// Every socket frame of a page, text frames only, parsed (binary frames are voice). Attach before
// the page's first navigation: a socket opened earlier is not seen. Views are kept for a minute.
export interface Wire {
  latest(): RoleView | null;
  tiles(): string[] | null; // the room's tiles: only a full view carries them, so the last one that did
  views(sinceMs: number): { at: number; view: RoleView }[]; // from `sinceMs` (a Date.now() value) on
  messages<T extends ServerMsg["t"]>(t: T): { at: number; msg: Extract<ServerMsg, { t: T }> }[];
  sent(): { at: number; msg: ClientMsg }[];
}

const KEEP_VIEWS_MS = 60_000;

export function wireOf(page: Page): Wire {
  const views: { at: number; view: RoleView }[] = [];
  const received: { at: number; msg: ServerMsg }[] = [];
  const sent: { at: number; msg: ClientMsg }[] = [];
  let tiles: string[] | null = null;
  const parse = (payload: string | Buffer): unknown => {
    if (typeof payload !== "string") return null;
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  };
  page.on("websocket", (ws: WebSocket) => {
    ws.on("framereceived", ({ payload }) => {
      const msg = parse(payload) as ServerMsg | null;
      if (!msg || typeof msg !== "object") return;
      const at = Date.now();
      if (msg.t === "view") {
        if (msg.view.tiles) tiles = msg.view.tiles;
        views.push({ at, view: msg.view });
        while (views.length > 0 && (views[0] as { at: number }).at < at - KEEP_VIEWS_MS)
          views.shift();
      } else received.push({ at, msg });
    });
    ws.on("framesent", ({ payload }) => {
      const msg = parse(payload) as ClientMsg | null;
      if (msg && typeof msg === "object") sent.push({ at: Date.now(), msg });
    });
  });
  return {
    latest: () => views.at(-1)?.view ?? null,
    tiles: () => tiles,
    views: (sinceMs) => views.filter((v) => v.at >= sinceMs),
    messages: <T extends ServerMsg["t"]>(t: T) =>
      received.filter((r) => r.msg.t === t) as { at: number; msg: Extract<ServerMsg, { t: T }> }[],
    sent: () => sent,
  };
}
