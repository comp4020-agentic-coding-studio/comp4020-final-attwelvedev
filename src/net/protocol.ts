// The socket's wire format: JSON text frames `{ t: string, ... }` (binary
// frames are voice only, from phase 08). Widened by later tasks; the table of
// every message is in plans/2026-10-08-sensory-heist-00-overview.md §4.3.
import {
  CALLOUTS,
  type Callout,
  type ChannelMessage,
  CLIPS,
  FACES,
  STAMPS,
  type Stamp,
} from "../game/channels.ts";
import type { EntityView, RoleView, SoundCue } from "../game/perception.ts";
import type { Method, PlayerInput, Role, Seat, Vec } from "../game/types.ts";
import type { CrewMember, SendRequest } from "./game.ts";
import type { ErrorCode, LobbySettings, LobbyState, LobbySummary } from "./lobbies.ts";

// Clients import their types from here only (they never reach into lobbies.ts
// at runtime: it pulls in ./codes.ts for node:crypto, which has no business
// in the browser bundle).
export type {
  Callout,
  ChannelMessage,
  CrewMember,
  EntityView,
  ErrorCode,
  LobbySettings,
  LobbyState,
  LobbySummary,
  RoleView,
  SendRequest,
  SoundCue,
  Stamp,
};

export type ClientMsg =
  | { t: "ping"; at: number }
  | { t: "bye" } // a page is going away: said before closing, since a close can take seconds to arrive
  | { t: "lobbies.watch" }
  | { t: "lobby.create"; nickname: string }
  | { t: "lobby.join"; code: string; nickname: string; as: "player" | "spectator" }
  | { t: "lobby.leave" }
  | { t: "lobby.team"; name: string }
  | { t: "lobby.nickname"; nickname: string } // your own name, in the lobby
  | { t: "lobby.private"; on: boolean } // host
  | { t: "lobby.order"; order: number[] } // host: a permutation of the person indexes
  | { t: "lobby.settings"; settings: LobbySettings } // host
  | { t: "lobby.start" } // host
  | { t: "ready" }
  | { t: "room.restart" } // host: everyone back to spawn, doors and crates reset
  | { t: "next" } // host, once a room is cleared: on to the next room
  | { t: "host.choice"; choice: "bot" | "lobby" } // host, once a dropped seat's time is up
  | ({ t: "input" } & PlayerInput)
  | { t: "send"; msg: SendRequest }
  | { t: "spectate"; seat: Seat } // a spectator: follow this seat instead
  | { t: "voice.stats"; p50: number; p95: number; dropped: number }; // a receiver's voice latency, ms

export type ServerMsg =
  | { t: "welcome"; who: string }
  | { t: "pong"; at: number; serverAt: number } // serverAt: the server's clock, for the voice clock offset
  | { t: "lobbies"; list: LobbySummary[] }
  | {
      t: "lobby";
      lobby: LobbyState;
      you: { seat: Seat | null; host: boolean; person: number | null }; // person: your index in lobby.people
    }
  | { t: "left" } // answers lobby.leave, so the page can navigate once the server has acted
  | { t: "error"; code: ErrorCode; message: string }
  | { t: "reveal"; room: string; name: string; index: number; role: Role; crew: CrewMember[] }
  | { t: "view"; view: RoleView }
  | { t: "cleared"; room: string; ms: number; loot: number; lootTotal: number }
  | ({ t: "msg" } & ChannelMessage) // only ever sent to a seat whose role receives the method
  | { t: "cooldown"; method: Method; until: number }
  // The game is paused for a dropped seat. `left` is the ms to go as the server counts them
  // (a page's clock may not agree with the server's); `choosing` once the time is up.
  | { t: "pause"; waitingFor: string; deadline: number; left: number; choosing: boolean }
  | { t: "caught"; hazard: "guard" | "camera" | "laser"; seat: Seat; checkpoint: number } // the team was sent back
  | { t: "resume"; back: string | null } // the person is back, or null when a bot took the seat
  | { t: "heist"; ms: number; loot: number; lootTotal: number; rank: number }; // the whole heist is done

const MAX_FRAME = 8 * 1024;

// A lobby code: 4 letters, no I, L or O (they read as 1 and 0 across a room).
// Here, not in ./codes.ts, so the home page can check what is typed: codes.ts
// pulls in node:crypto.
export const LOBBY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
export const LOBBY_CODE_LENGTH = 4;

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
    case "voice.stats": {
      const { p50, p95, dropped } = m;
      return [p50, p95, dropped].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0)
        ? { t: "voice.stats", p50: p50 as number, p95: p95 as number, dropped: dropped as number }
        : null;
    }
    case "bye":
      return { t: "bye" };
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
    case "lobby.nickname":
      return typeof m.nickname === "string" ? { t: "lobby.nickname", nickname: m.nickname } : null;
    case "lobby.private":
      return typeof m.on === "boolean" ? { t: "lobby.private", on: m.on } : null;
    case "lobby.order":
      return Array.isArray(m.order) && m.order.length <= 6 && m.order.every(Number.isInteger)
        ? { t: "lobby.order", order: m.order as number[] }
        : null;
    case "lobby.settings": {
      const s = m.settings;
      if (typeof s !== "object" || s === null) return null;
      const { inPerson, maskNoise, othersSoundOff, voice } = s as Record<string, unknown>;
      return typeof inPerson === "boolean" &&
        typeof maskNoise === "boolean" &&
        typeof othersSoundOff === "boolean" &&
        typeof voice === "boolean"
        ? { t: "lobby.settings", settings: { inPerson, maskNoise, othersSoundOff, voice } }
        : null;
    }
    case "lobby.start":
      return { t: "lobby.start" };
    case "ready":
      return { t: "ready" };
    case "room.restart":
      return { t: "room.restart" };
    case "next":
      return { t: "next" };
    case "host.choice":
      return m.choice === "bot" || m.choice === "lobby"
        ? { t: "host.choice", choice: m.choice }
        : null;
    case "spectate":
      return m.seat === 0 || m.seat === 1 || m.seat === 2 ? { t: "spectate", seat: m.seat } : null;
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
    case "send": {
      const msg = parseSendRequest(m.msg);
      return msg ? { t: "send", msg } : null;
    }
    default:
      return null;
  }
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

// A send the server may act on: ids are checked against the bundled sets, and a
// mark's tile must be two finite numbers (whether it is in sight is the sim's call).
function parseSendRequest(raw: unknown): SendRequest | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  switch (m.method) {
    case "callout":
      return (CALLOUTS as readonly unknown[]).includes(m.callout)
        ? { method: "callout", callout: m.callout as Callout }
        : null;
    case "text":
      return typeof m.text === "string" ? { method: "text", text: m.text } : null;
    case "clip":
      // only a clip on the soundboard: an id that is not one is dropped
      return CLIPS.some((c) => c.id === m.clip) ? { method: "clip", clip: m.clip as string } : null;
    case "face":
      return FACES.some((f) => f.id === m.id) ? { method: "face", id: m.id as string } : null;
    case "mark": {
      if (!(STAMPS as readonly unknown[]).includes(m.id)) return null;
      const at = m.at as Partial<Vec> | null | undefined;
      if (!at || !finite(at.x) || !finite(at.y)) return null;
      return { method: "mark", id: m.id as Stamp, at: { x: at.x, y: at.y } };
    }
    default:
      return null;
  }
}
