import { describe, expect, inject, it } from "vitest";
import type { RoleView } from "../src/game/perception.ts";
import { byRole, closeAll, nextView, type Player, ready, startedGame } from "./play.ts";

const baseUrl = inject("baseUrl");

interface RevealMsg {
  crew: { seat: number; bot: boolean }[];
}
interface LobbyMsg {
  lobby: { phase: string; seats: { bot: boolean; who: string | null }[] };
  you: { seat: number | null; host: boolean };
}

// A person who presses Leave in the middle of a game must not leave their seat empty:
// a bot takes it at once, and the game goes on.
describe("a person leaves a running game", () => {
  it("a bot takes their seat and walks it: a non-host leaving", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, , mute] = players as [Player, Player, Player];
    const deaf = byRole(players, "deaf");
    const at = (view: RoleView) =>
      view.entities.find((e) => e.kind === "player" && e.seat === 2)?.pos;
    const start = at(await nextView(deaf, 3000));
    expect(start).toBeDefined();

    mute.socket.send({ t: "lobby.leave" });
    // the crew is sent again with a bot in the mute's seat
    let reveal = await deaf.socket.next<RevealMsg>("reveal", 4000);
    while (!reveal.crew.some((c) => c.seat === 2 && c.bot)) {
      reveal = await deaf.socket.next<RevealMsg>("reveal", 4000);
    }
    // and it plays: in room 1 the Can't-speak bot goes to push the crate
    const until = Date.now() + 6000;
    let moved = false;
    while (!moved && Date.now() < until) {
      const view = await nextView(deaf, 1000).catch(() => null);
      const now = view ? at(view) : undefined;
      moved = now !== undefined && start !== undefined && (now.x !== start.x || now.y !== start.y);
    }
    expect(moved).toBe(true);
    await closeAll([host, deaf]);
  });

  it("the host leaving hands the host role on and puts a bot in their seat", async () => {
    const { players } = await startedGame(baseUrl);
    ready(players);
    const [host, guest] = players as [Player, Player, Player];
    await nextView(guest, 3000);
    host.socket.send({ t: "lobby.leave" });
    let lobby = await guest.socket.next<LobbyMsg>("lobby", 4000);
    while (!lobby.lobby.seats[0]?.bot) lobby = await guest.socket.next<LobbyMsg>("lobby", 4000);
    expect(lobby.lobby.phase).toBe("playing");
    expect(lobby.lobby.seats[0]?.who).toBeNull();
    // someone is host now, and the game has not stopped
    let latest = lobby;
    while (!latest.you.host && players.length) {
      latest = await guest.socket.next<LobbyMsg>("lobby", 3000).catch(() => latest);
      if (latest === lobby) break;
    }
    expect((await nextView(guest, 3000)).tick).toBeGreaterThan(0);
    await closeAll(players.slice(1));
  });
});
