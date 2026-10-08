// The socket's wire format: JSON text frames `{ t: string, ... }` (binary
// frames are voice only, from phase 08). Widened by later tasks; the table of
// every message is in plans/2026-10-08-sensory-heist-00-overview.md §4.3.
import type { EntityView, RoleView, SoundCue } from "../game/perception.ts";
import type { PlayerInput, Role, Seat } from "../game/types.ts";
import type { CrewMember } from "./game.ts";
import type { ErrorCode, LobbyState, LobbySummary } from "./lobbies.ts";

// Clients import their types from here only (they never reach into lobbies.ts).
export type { CrewMember, EntityView, ErrorCode, LobbyState, LobbySummary, RoleView, SoundCue };

export type ClientMsg =
  | { t: "ping"; at: number }
  | { t: "lobbies.watch" }
  | { t: "lobby.create"; nickname: string }
  | { t: "lobby.join"; code: string; nickname: string; as: "player" | "spectator" }
  | { t: "lobby.leave" }
  | { t: "lobby.team"; name: string }
  | { t: "lobby.start" } // host
  | { t: "ready" }
  | { t: "room.restart" } // host: everyone back to spawn, doors and crates reset
  | ({ t: "input" } & PlayerInput);

export type ServerMsg =
  | { t: "welcome"; who: string }
  | { t: "pong"; at: number }
  | { t: "lobbies"; list: LobbySummary[] }
  | { t: "lobby"; lobby: LobbyState; you: { seat: Seat | null; host: boolean } }
  | { t: "left" } // answers lobby.leave, so the page can navigate once the server has acted
  | { t: "error"; code: ErrorCode; message: string }
  | { t: "reveal"; room: string; index: number; role: Role; crew: CrewMember[] }
  | { t: "view"; view: RoleView };

const MAX_FRAME = 8 * 1024;

// Anything malformed, unknown or oversized is null: the caller drops it and
// keeps the socket open, so one bad frame never ends a game.
export function parseClientMsg(raw: string): ClientMsg | null {
  if (raw.length > MAX_FRAME) return null;
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const m = body as Record<string, unknown>;
  switch (m.t) {
    case "ping":
      return typeof m.at === "number" && Number.isFinite(m.at) ? { t: "ping", at: m.at } : null;
    case "lobbies.watch":
      return { t: "lobbies.watch" };
    case "lobby.create":
      return typeof m.nickname === "string" ? { t: "lobby.create", nickname: m.nickname } : null;
    case "lobby.join":
      return typeof m.code === "string" &&
        typeof m.nickname === "string" &&
        (m.as === "player" || m.as === "spectator")
        ? { t: "lobby.join", code: m.code, nickname: m.nickname, as: m.as }
        : null;
    case "lobby.leave":
      return { t: "lobby.leave" };
    case "lobby.team":
      return typeof m.name === "string" ? { t: "lobby.team", name: m.name } : null;
    case "lobby.start":
      return { t: "lobby.start" };
    case "ready":
      return { t: "ready" };
    case "room.restart":
      return { t: "room.restart" };
    case "input": {
      const move = m.move;
      if (typeof move !== "object" || move === null) return null;
      const { x, y } = move as Record<string, unknown>;
      if (!Number.isInteger(m.seq) || (m.seq as number) < 0) return null;
      if (typeof x !== "number" || typeof y !== "number") return null;
      if (!Number.isFinite(x) || !Number.isFinite(y) || typeof m.act !== "boolean") return null;
      const clamp = (n: number) => Math.max(-1, Math.min(1, n));
      return { t: "input", seq: m.seq as number, move: { x: clamp(x), y: clamp(y) }, act: m.act };
    }
    default:
      return null;
  }
}
