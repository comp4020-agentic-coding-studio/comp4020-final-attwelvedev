// The socket's wire format: JSON text frames `{ t: string, ... }` (binary
// frames are voice only, from phase 08). Widened by later tasks; the table of
// every message is in plans/2026-10-08-sensory-heist-00-overview.md §4.3.
import {
  CALLOUTS,
  type Callout,
  type ChannelMessage,
  STAMPS,
  type Stamp,
} from "../game/channels.ts";
import type { EntityView, RoleView, SoundCue } from "../game/perception.ts";
import type { Family, PlayerInput, Role, Seat } from "../game/types.ts";
import type { CrewMember } from "./game.ts";
import type { ErrorCode, LobbyState, LobbySummary } from "./lobbies.ts";

// Clients import their types from here only (they never reach into lobbies.ts).
export type {
  Callout,
  ChannelMessage,
  CrewMember,
  EntityView,
  ErrorCode,
  LobbyState,
  LobbySummary,
  RoleView,
  SoundCue,
  Stamp,
};

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
  | ({ t: "input" } & PlayerInput)
  | { t: "say"; kind: "callout"; callout: Callout }
  | { t: "say"; kind: "text"; text: string }
  | { t: "sound"; clip: string }
  | { t: "show"; kind: "face"; id: string }
  | { t: "show"; kind: "stamp"; id: Stamp }; // the server places it at the sender's tile

export type ServerMsg =
  | { t: "welcome"; who: string }
  | { t: "pong"; at: number }
  | { t: "lobbies"; list: LobbySummary[] }
  | { t: "lobby"; lobby: LobbyState; you: { seat: Seat | null; host: boolean } }
  | { t: "left" } // answers lobby.leave, so the page can navigate once the server has acted
  | { t: "error"; code: ErrorCode; message: string }
  | { t: "reveal"; room: string; index: number; role: Role; crew: CrewMember[] }
  | { t: "view"; view: RoleView }
  | ({ t: "msg" } & ChannelMessage) // only ever sent to a seat whose role receives the family
  | { t: "cooldown"; family: Family; until: number; stamp?: true }; // stamp: the 1 s stamp clock, not the face clock

const MAX_FRAME = 8 * 1024;
const CLIP_ID = /^[a-z0-9-]{1,24}$/;
const FACE_ID = /^f(0[1-9]|1[0-2])$/;

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
    case "say":
      if (m.kind === "callout") {
        return (CALLOUTS as readonly unknown[]).includes(m.callout)
          ? { t: "say", kind: "callout", callout: m.callout as Callout }
          : null;
      }
      return m.kind === "text" && typeof m.text === "string"
        ? { t: "say", kind: "text", text: m.text }
        : null;
    case "sound":
      return typeof m.clip === "string" && CLIP_ID.test(m.clip)
        ? { t: "sound", clip: m.clip }
        : null;
    case "show":
      if (m.kind === "face") {
        return typeof m.id === "string" && FACE_ID.test(m.id)
          ? { t: "show", kind: "face", id: m.id }
          : null;
      }
      return m.kind === "stamp" && (STAMPS as readonly unknown[]).includes(m.id)
        ? { t: "show", kind: "stamp", id: m.id as Stamp }
        : null;
    default:
      return null;
  }
}
