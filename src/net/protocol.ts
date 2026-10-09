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
import type { Family, PlayerInput, Role, Seat } from "../game/types.ts";
import type { CrewMember } from "./game.ts";
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
  | { t: "lobby.settings"; settings: LobbySettings } // host
  | { t: "lobby.start" } // host
  | { t: "ready" }
  | { t: "room.restart" } // host: everyone back to spawn, doors and crates reset
  | { t: "next" } // host, once a room is cleared: on to the next room
  | { t: "host.choice"; choice: "bot" | "lobby" } // host, once a dropped seat's time is up
  | ({ t: "input" } & PlayerInput)
  | { t: "say"; kind: "callout"; callout: Callout }
  | { t: "say"; kind: "text"; text: string }
  | { t: "sound"; clip: string }
  | { t: "show"; kind: "face"; id: string }
  | { t: "show"; kind: "stamp"; id: Stamp } // the server places it at the sender's tile
  | { t: "spectate"; seat: Seat }; // a spectator: follow this seat instead

export type ServerMsg =
  | { t: "welcome"; who: string }
  | { t: "pong"; at: number }
  | { t: "lobbies"; list: LobbySummary[] }
  | { t: "lobby"; lobby: LobbyState; you: { seat: Seat | null; host: boolean } }
  | { t: "left" } // answers lobby.leave, so the page can navigate once the server has acted
  | { t: "error"; code: ErrorCode; message: string }
  | { t: "reveal"; room: string; name: string; index: number; role: Role; crew: CrewMember[] }
  | { t: "view"; view: RoleView }
  | { t: "cleared"; room: string; ms: number; loot: number; lootTotal: number }
  | ({ t: "msg" } & ChannelMessage) // only ever sent to a seat whose role receives the family
  | { t: "cooldown"; family: Family; until: number; stamp?: true } // stamp: the 1 s stamp clock, not the face clock
  // The game is paused for a dropped seat. `left` is the ms to go as the server counts them
  // (a page's clock may not agree with the server's); `choosing` once the time is up.
  | { t: "pause"; waitingFor: string; deadline: number; left: number; choosing: boolean }
  | { t: "caught"; hazard: "guard" | "camera" | "laser"; seat: Seat; checkpoint: number } // the team was sent back
  | { t: "resume"; back: string | null } // the person is back, or null when a bot took the seat
  | { t: "heist"; ms: number; loot: number; lootTotal: number; rank: number }; // the whole heist is done

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
      // only a clip on the soundboard: an id that is not one is dropped
      return CLIPS.some((c) => c.id === m.clip) ? { t: "sound", clip: m.clip as string } : null;
    case "show":
      if (m.kind === "face") {
        return FACES.some((f) => f.id === m.id)
          ? { t: "show", kind: "face", id: m.id as string }
          : null;
      }
      return m.kind === "stamp" && (STAMPS as readonly unknown[]).includes(m.id)
        ? { t: "show", kind: "stamp", id: m.id as Stamp }
        : null;
    default:
      return null;
  }
}
