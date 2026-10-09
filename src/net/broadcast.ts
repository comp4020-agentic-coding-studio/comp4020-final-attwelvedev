import { WebSocket } from "ws";
import type { Seat } from "../game/types.ts";
import { DEFAULT_SETTINGS, type LobbyState, openLobbies, type Registry } from "./lobbies.ts";
import type { ServerMsg } from "./protocol.ts";

// Who is connected and who needs telling. The registry decides what changed;
// this decides who hears about it.
export function createHub(registry: Registry) {
  const socketsOf = new Map<string, Set<WebSocket>>(); // device hash → its open sockets
  const watchers = new Set<WebSocket>(); // sockets showing the open-lobby list
  const lastMembers = new Map<string, string[]>(); // lobby code → devices told about it last

  function send(socket: WebSocket, msg: ServerMsg): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  }

  function sendTo(who: string, msg: ServerMsg): void {
    for (const socket of socketsOf.get(who) ?? []) send(socket, msg);
  }

  function broadcastList(): void {
    const msg: ServerMsg = { t: "lobbies", list: openLobbies(registry) };
    for (const socket of watchers) send(socket, msg);
  }

  const membersOf = (lobby: LobbyState): string[] => [
    ...lobby.seats.flatMap((s) => (s.who && !s.bot ? [s.who] : [])),
    ...lobby.spectators.map((s) => s.who),
  ];

  // Every member and spectator gets the lobby as they see it, and anyone
  // watching the open list gets the list.
  function broadcast(lobby: LobbyState): void {
    if (registry.lobbies.has(lobby.code)) {
      const members = membersOf(lobby);
      lastMembers.set(lobby.code, members);
      for (const who of members) {
        const seat = lobby.seats.findIndex((s) => s.who === who);
        sendTo(who, {
          t: "lobby",
          lobby,
          you: { seat: seat >= 0 ? (seat as Seat) : null, host: lobby.host === who },
        });
      }
    } else {
      // gone (last human left, or idle): tell whoever we last told, then forget
      for (const who of lastMembers.get(lobby.code) ?? []) {
        if (registry.byDevice.has(who)) continue; // already somewhere else
        sendTo(who, {
          t: "error",
          code: "lobby-not-found",
          message: `Lobby ${lobby.code} has closed.`,
        });
      }
      lastMembers.delete(lobby.code);
    }
    broadcastList();
  }

  // Run a lobby change for this device, then tell everyone it touched: the
  // lobby it ended up in and the one it left, if different.
  function change(who: string, run: () => LobbyState | null): void {
    const before = registry.byDevice.get(who);
    const after = run();
    if (before && before !== after?.code) {
      const left = registry.lobbies.get(before);
      if (left) broadcast(left);
      else broadcast(closed(before));
    }
    if (after) broadcast(after);
  }

  return { socketsOf, watchers, send, sendTo, broadcast, broadcastList, change };
}

// A lobby that vanished still needs its code to tell its people.
function closed(code: string): LobbyState {
  const empty = () => ({ who: null, nickname: null, connected: false, bot: false });
  return {
    code,
    teamName: "",
    host: "",
    phase: "done",
    seats: [empty(), empty(), empty()],
    spectators: [],
    createdAt: 0,
    settings: DEFAULT_SETTINGS,
  };
}
