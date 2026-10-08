// Shared setup for the game specs: three sockets in a started game.
import type { RoleView } from "../src/game/perception.ts";
import type { Role, Seat } from "../src/game/types.ts";
import { connect, type Socket } from "./ws.ts";

export interface Player {
  socket: Socket;
  seat: Seat;
  role: Role;
}

interface LobbyMsg {
  lobby: { code: string };
  you: { seat: number | null; host: boolean };
}
interface RevealMsg {
  role: Role;
  index: number;
  room: string;
  crew: { seat: Seat; role: Role; nickname: string }[];
}

// Creates a lobby, seats three sockets, starts it and returns them by seat
// with their roles. `ready` is left to the caller.
export async function startedGame(baseUrl: string): Promise<{ players: Player[]; code: string }> {
  const sockets = await Promise.all([connect(baseUrl), connect(baseUrl), connect(baseUrl)]);
  const [host, b, c] = sockets as [Socket, Socket, Socket];
  host.send({ t: "lobby.create", nickname: "Ana" });
  const { lobby } = await host.next<LobbyMsg>("lobby");
  for (const [s, name] of [
    [b, "Bo"],
    [c, "Cy"],
  ] as const) {
    s.send({ t: "lobby.join", code: lobby.code, nickname: name, as: "player" });
    await s.next("lobby");
  }
  host.send({ t: "lobby.start" });
  const players: Player[] = [];
  for (const [i, socket] of sockets.entries()) {
    const reveal = await socket.next<RevealMsg>("reveal");
    players.push({ socket, seat: i as Seat, role: reveal.role });
  }
  return { players, code: lobby.code };
}

export const ready = (players: Player[]) => {
  for (const p of players) p.socket.send({ t: "ready" });
};

export const byRole = (players: Player[], role: Role): Player => {
  const found = players.find((p) => p.role === role);
  if (!found) throw new Error(`no ${role} player`);
  return found;
};

export const nextView = async (p: Player, timeoutMs = 2000): Promise<RoleView> =>
  (await p.socket.next<{ t: "view"; view: RoleView }>("view", timeoutMs)).view;

export const closeAll = (players: Player[]) => Promise.all(players.map((p) => p.socket.close()));
